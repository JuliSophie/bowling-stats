import json
import os
import tempfile
import copy
import subprocess
import sys
import unittest
from types import SimpleNamespace
from pydantic import SecretStr
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers.trash_talk import router
from app.services.trash_talk_catalog import batch_view, disable, enabled_catalog, import_candidates, read_catalog, read_snapshot, validate_catalog
from app.services.trash_talk_generation import generate, generation_plan
from app.services.trash_talk_repository import TrashTalkRepository, new_batch


class TrashTalkJsonTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.path = Path(self.folder.name) / "generated.json"
        self.path.write_text(json.dumps({"version": "3.0.0", "batches": [], "disabledIds": []}), encoding="utf-8")
        self.repo = TrashTalkRepository(self.path)

    def tearDown(self):
        self.folder.cleanup()

    def test_base_catalog_and_projection(self):
        self.assertEqual([], validate_catalog(read_catalog()))
        core = [item for item in enabled_catalog(self.repo)["scenarios"] if item.get("kind") is None]
        self.assertEqual(57, len(core))
        self.assertEqual(198, sum(len(item["templates"]) for item in core))
        self.assertTrue(all(len(item["templates"]) >= 2 for item in core))

    def test_legacy_projection_preserves_source_order_ids_and_metadata(self):
        source = read_catalog()
        projected = enabled_catalog(self.repo)
        actual = {item["id"]: item for item in projected["scenarios"]}
        legacy = [item for item in source["scenarios"] if item.get("kind")]
        self.assertEqual(447, len(legacy))
        self.assertEqual(160, sum(item["kind"] == "legacy-v1" for item in legacy))
        self.assertEqual(909, sum(len(item["templates"]) for item in legacy if item["kind"] == "legacy-v1"))
        self.assertEqual(1331, sum(len(item["templates"]) for item in legacy if item["kind"] in (
            "legacy-v2-opener", "legacy-v2-core", "legacy-v2-suffix",
        )))
        for item in legacy:
            self.assertEqual(item["templates"], actual[item["id"]]["templates"])
            self.assertEqual(item["templateIds"], actual[item["id"]]["templateIds"])
        self.assertEqual(source["legacyV2"], projected["legacyV2"])
        self.assertEqual(15, len(source["legacyV2"]["messages"]))
        self.assertEqual(88, len(source["legacyV2"]["fragments"]))

    def test_legacy_import_and_disable_share_the_common_registry(self):
        source = next(item for item in read_catalog()["scenarios"] if item.get("kind") == "legacy-v1")
        extra = "Ein zusätzlicher synthetischer Testtext im gemeinsamen Katalog."
        result = import_candidates(self.repo, {"candidates": [{"scenario_id": source["id"], "text": extra}]})
        self.assertEqual("active", result["status"])
        projected = next(item for item in enabled_catalog(self.repo)["scenarios"] if item["id"] == source["id"])
        self.assertEqual(source["templates"], projected["templates"][:-1])
        self.assertEqual(extra, projected["templates"][-1])
        disable(self.repo, source["templateIds"][0])
        projected = next(item for item in enabled_catalog(self.repo)["scenarios"] if item["id"] == source["id"])
        self.assertEqual(source["templates"][1:] + [extra], projected["templates"])
        disable(self.repo, result["candidates"][0]["id"])
        projected = next(item for item in enabled_catalog(self.repo)["scenarios"] if item["id"] == source["id"])
        self.assertEqual(source["templates"][1:], projected["templates"])

    def test_fragment_generation_is_component_aware_and_metadata_references_are_checked(self):
        source = read_catalog()
        opener = next(item for item in source["scenarios"] if item.get("kind") == "legacy-v2-opener")
        plan = generation_plan(opener["id"], "dummy", 1, 256, 1, 1, 1)
        self.assertIn("sentence-opening fragments", plan["body"]["input"])
        self.assertIn("not complete independent sayings", plan["body"]["input"])
        broken = copy.deepcopy(source)
        broken["legacyV2"]["fragments"][0]["openersPoolId"] = source["scenarios"][0]["id"]
        self.assertTrue(validate_catalog(broken))

    def test_legacy_duplicate_occurrences_remain_distinct(self):
        source = read_catalog()
        pool = next(item for item in source["scenarios"] if item.get("kind") == "legacy-v1")
        pool["templates"].append(pool["templates"][0])
        pool["templateIds"].append("legacy:synthetic-duplicate-occurrence")
        self.assertEqual([], validate_catalog(source))

    def test_import_invalid_history_reimport_and_disable(self):
        first = import_candidates(self.repo, {"candidates": [
            {"scenario_id": "live.strike", "text": "Strike. Der ganze Pin-Verein liegt auf der Matte."},
            {"scenario_id": "live.strike", "text": "Hallo {unbekannt}, erfundene Fakten."}]})
        self.assertEqual("partial", first["status"])
        fixed = import_candidates(self.repo, {"candidates": [
            {"scenario_id": "live.strike", "text": "Strike. Heute liegen die Argumente auf der Bahn."}]})
        self.assertEqual("active", fixed["status"])
        candidate_id = fixed["candidates"][0]["id"]
        disable(self.repo, candidate_id)
        self.assertNotIn(fixed["candidates"][0]["text"],
                         next(x for x in enabled_catalog(self.repo)["scenarios"] if x["id"] == "live.strike")["templates"])
        self.assertEqual("invalid", import_candidates(self.repo, {"candidates": [
            {"scenario_id": "live.strike", "text": "Strike. Heute liegen die Argumente auf der Bahn."} ]})["status"])

    def test_routes_are_read_only_and_missing_is_404(self):
        app = FastAPI(); app.include_router(router, prefix="/api")
        before = self.path.read_bytes()
        with patch("app.services.trash_talk_catalog.TrashTalkRepository", return_value=self.repo), \
             patch("sqlite3.connect", side_effect=AssertionError("GET must not open SQL")), TestClient(app) as client:
            self.assertEqual(200, client.get("/api/trash-talk/catalog").status_code)
            self.assertEqual(200, client.get("/api/trash-talk/batches").status_code)
            self.assertEqual(404, client.get("/api/trash-talk/batches/missing").status_code)
            self.assertEqual(422, client.get("/api/trash-talk/batches?limit=101").status_code)
            self.assertEqual(405, client.post("/api/trash-talk/catalog").status_code)
        self.assertEqual(before, self.path.read_bytes())

    def test_generation_dry_run_and_failure_are_file_backed(self):
        plan = generation_plan("live.strike", "dummy", 1, 256, 1, 1, 1)
        self.assertTrue(generate(plan, repository=self.repo)["dry_run"])
        with self.assertRaises(ValueError):
            generate(plan, execute=True, repository=self.repo, settings=SimpleNamespace(openai_api_key=SecretStr("dummy-key")),
                     transport=lambda *_: (_ for _ in ()).throw(TimeoutError()))
        batch = self.repo.read()["batches"][0]
        self.assertEqual("failed", batch["status"])
        self.assertGreater(batch["cost"]["reserved_usd"], 0)

    def test_malformed_store_is_explicit(self):
        self.path.write_text("{", encoding="utf-8")
        with self.assertRaises(ValueError):
            self.repo.read()

    def test_malformed_tone_is_a_catalog_error_not_a_type_error(self):
        catalog = copy.deepcopy(read_catalog())
        record = catalog["legacyV2"]["messages"][0]
        for tone in ([], {}, None, False):
            record["tone"] = tone
            errors = validate_catalog(catalog)
            self.assertTrue(errors)

    def test_consolidated_contract_rejects_malformed_metadata(self):
        source = read_catalog()
        mutations = [
            lambda c: c.pop("legacyV2"),
            lambda c: c.update(version="3.0.0"),
            lambda c: c["scenarios"][0].update(kind=[]),
            lambda c: c["legacyV2"].update(messages={}),
            lambda c: c["legacyV2"]["messages"][0].update(conditions={"minimumScoreTypo": 999}),
            lambda c: c["legacyV2"]["messages"][0].update(scenario=""),
            lambda c: c["legacyV2"]["messages"][1].update(id=c["legacyV2"]["messages"][0]["id"]),
            lambda c: c["legacyV2"]["messages"][0].update(poolId=c["scenarios"][0]["id"]),
            lambda c: c["legacyV2"]["messages"].pop(),
            lambda c: next(s for s in c["scenarios"] if s.get("kind") == "legacy-v1").update(legacyParameters={}),
            lambda c: next(s for s in c["scenarios"] if s.get("kind") == "legacy-v2-message").update(legacyMetadata=[]),
        ]
        for index, mutate in enumerate(mutations):
            with self.subTest(index=index):
                catalog = copy.deepcopy(source)
                mutate(catalog)
                self.assertTrue(validate_catalog(catalog))
        source["legacyV2"]["messages"][0].pop("conditions", None)
        self.assertEqual([], validate_catalog(source))

    def test_live_projection_preserves_original_selection_keys_after_disable(self):
        pools = [s for s in read_catalog()["scenarios"] if s.get("kind") == "legacy-live"]
        self.assertEqual(8, len(pools))
        snapshot = self.repo.read()
        snapshot["disabledIds"] = [pool["templateIds"][0] for pool in pools]
        self.path.write_text(json.dumps(snapshot), encoding="utf-8")
        projected = {s["id"]: s for s in enabled_catalog(self.repo)["scenarios"]}
        for pool in pools:
            current = projected[pool["id"]]
            self.assertEqual(pool["templateIds"][1:], current["templateIds"])
            self.assertEqual([f"{pool['legacyLiveScenario']}.{i + 1}" for i in range(1, len(pool["templates"]))],
                             current["templateSelectionIds"])
        pool = pools[0]
        batch = import_candidates(self.repo, {"candidates": [
            {"scenario_id": pool["id"], "text": "Synthetischer neuer Live-Kommentar."},
        ]})
        current = next(s for s in enabled_catalog(self.repo)["scenarios"] if s["id"] == pool["id"])
        self.assertEqual(batch["candidates"][0]["id"], current["templateSelectionIds"][-1])

    def test_exhausted_core_and_message_pools_project_empty_without_disabling_catalog(self):
        source = enabled_catalog(self.repo)
        pools = [next(s for s in source["scenarios"] if not s.get("kind")),
                 next(s for s in source["scenarios"] if s.get("kind") == "legacy-v2-message")]
        snapshot = self.repo.read()
        snapshot["disabledIds"] = [identifier for pool in pools for identifier in pool["templateIds"]]
        self.path.write_text(json.dumps(snapshot), encoding="utf-8")
        projected = {s["id"]: s for s in enabled_catalog(self.repo)["scenarios"]}
        for pool in pools:
            self.assertTrue(projected[pool["id"]]["enabled"])
            self.assertEqual([], projected[pool["id"]]["templates"])
            self.assertEqual([], projected[pool["id"]]["templateIds"])

    def test_store_shape_errors_are_value_errors(self):
        for value in ({}, {"version": "3.0.0", "batches": {}, "disabledIds": []},
                      {"version": "3.0.0", "batches": [], "disabledIds": [[]]}):
            self.path.write_text(json.dumps(value), encoding="utf-8")
            with self.assertRaises(ValueError):
                self.repo.read()

    def test_invalid_candidate_shapes_are_partial_and_oversized_raw_text_is_inactive(self):
        result = import_candidates(self.repo, {"candidates": [
            {"scenario_id": [], "text": "not a valid scenario"},
            {"scenario_id": "live.strike", "text": "a" * 361},
            {"scenario_id": "live.strike", "text": "Strike. Die Pins gehen heute heim."},
        ]})
        self.assertEqual("partial", result["status"])
        self.assertEqual([False, False, True], [c["enabled"] for c in result["candidates"]])
        self.assertTrue(all(c["errors"] for c in result["candidates"][:2]))

    def test_unknown_scenario_and_invalid_placeholder_never_project(self):
        batch = import_candidates(self.repo, {"candidates": [
            {"scenario_id": "invented.scenario", "text": "Das ist kein freigegebenes Szenario."},
            {"scenario_id": "live.strike", "text": "Strike {unknown} und keine freie Bindung."},
        ]})
        self.assertEqual("invalid", batch["status"])
        projected = enabled_catalog(self.repo)
        self.assertFalse(any(s["id"] == "invented.scenario" for s in projected["scenarios"]))
        self.assertFalse(any(c["text"] in s["templates"] for s in projected["scenarios"] for c in batch["candidates"]))

    def test_rejected_text_can_be_retried_in_a_later_batch(self):
        text = "Strike. Die Pins machen heute geschlossen Feierabend."
        first = import_candidates(self.repo, {"candidates": [{"scenario_id": "live.strike", "text": text, "extra": 1}]})
        self.assertEqual("invalid", first["status"])
        second = import_candidates(self.repo, {"candidates": [{"scenario_id": "live.strike", "text": text}]})
        self.assertEqual("active", second["status"])

    def test_disabled_scenario_is_inactive_in_projection(self):
        disable(self.repo, "live.strike")
        scenario = next(s for s in enabled_catalog(self.repo)["scenarios"] if s["id"] == "live.strike")
        self.assertFalse(scenario["enabled"])
        self.assertEqual([], scenario["templates"])
        self.assertEqual([], scenario["templateIds"])

    def test_generation_dry_run_does_not_load_key_or_create_lock(self):
        plan = generation_plan("live.strike", "dummy", 1, 256, 1, 1, 1)
        settings = SimpleNamespace(openai_api_key=None)
        before = self.path.read_bytes()
        result = generate(plan, repository=self.repo, settings=settings)
        self.assertTrue(result["dry_run"])
        self.assertEqual(before, self.path.read_bytes())
        self.assertFalse(self.repo.lock_path.exists())

    def test_generation_success_has_requesting_then_one_final_save(self):
        plan = generation_plan("live.strike", "dummy", 1, 256, 1, 1, 1)
        settings = SimpleNamespace(openai_api_key=SecretStr("synthetic-key"))
        saves = []
        original_save = self.repo.save
        def save(value):
            saves.append(json.loads(json.dumps(value)))
            original_save(value)
        def transport(body, key):
            self.assertEqual("synthetic-key", key)
            return {"status": "completed", "usage": {"input_tokens": 2, "output_tokens": 3},
                    "output": [{"type": "message", "content": [{"type": "output_text", "text":
                        '{"candidates":[{"scenario_id":"live.strike","text":"Strike. Die Pins verabschieden sich."}]}'}]}]}
        with patch.object(self.repo, "save", side_effect=save):
            result = generate(plan, execute=True, repository=self.repo, settings=settings, transport=transport)
        self.assertEqual(2, len(saves))
        self.assertEqual("requesting", saves[0]["batches"][0]["status"])
        self.assertEqual(1, len(saves[1]["batches"]))
        self.assertEqual(saves[0]["batches"][0]["id"], saves[1]["batches"][0]["id"])
        self.assertEqual("active", saves[1]["batches"][0]["status"])
        self.assertEqual(result["id"], saves[1]["batches"][0]["id"])
        self.assertEqual({"input_tokens": 2, "output_tokens": 3}, result["usage"])
        self.assertIn("actual_usd", result["cost"])

    def test_authorization_header_uses_real_bearer_value_with_mocked_urlopen(self):
        from app.services import trash_talk_generation as generation
        captured = {}
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, size): return b'{"ok": true}'
        def fake_open(request, timeout):
            captured["authorization"] = request.get_header("Authorization")
            return Response()
        with patch.object(generation, "urlopen", fake_open):
            generation.request_openai({}, "synthetic-key")
        self.assertEqual("Bearer synthetic-key", captured["authorization"])

    def test_lock_rejects_second_writer_and_atomic_failure_keeps_old_file(self):
        with self.repo.lock():
            with self.assertRaises(RuntimeError):
                with self.repo.lock():
                    pass
        original = self.path.read_bytes()
        with self.repo.lock():
            with patch("app.services.trash_talk_repository.os.replace", side_effect=OSError("replace")):
                with self.assertRaises(OSError):
                    self.repo.save({"version": "3.0.0", "batches": [], "disabledIds": []})
        self.assertEqual(original, self.path.read_bytes())
        self.assertEqual([], list(Path(self.folder.name).glob("generated.json.*.tmp")))

    def test_disabled_candidate_state_matches_history_list_and_detail(self):
        batch = import_candidates(self.repo, {"candidates": [
            {"scenario_id": "live.strike", "text": "Strike. Alle Pins haben heute Feierabend."},
        ]})
        app = FastAPI()
        app.include_router(router, prefix="/api")
        for identifier in (batch["candidates"][0]["id"], "live.strike"):
            disable(self.repo, identifier)
            with patch("app.services.trash_talk_catalog.TrashTalkRepository", return_value=self.repo), TestClient(app) as client:
                listed = client.get("/api/trash-talk/batches").json()["batches"][0]
                detail = client.get("/api/trash-talk/batches/" + batch["id"]).json()
                self.assertFalse(listed["candidates"][0]["enabled"])
                self.assertFalse(detail["candidates"][0]["enabled"])

    def test_cli_validate_rejects_broken_generated_file_without_resetting(self):
        from app.trash_talk_cli import main
        self.path.write_text("{", encoding="utf-8")
        with patch("app.trash_talk_cli.TrashTalkRepository", return_value=self.repo), \
             patch.object(sys, "argv", ["trash-talk", "validate"]):
            with self.assertRaises(SystemExit) as failure:
                main()
        self.assertEqual(1, failure.exception.code)
        self.assertEqual("{", self.path.read_text(encoding="utf-8"))

    def test_arbitrary_store_field_shapes_are_explicit_errors(self):
        template = new_batch("import", status="invalid")
        for field, bad in (("id", []), ("created_at", None), ("usage", []), ("cost", []), ("status", [])):
            candidate = copy.deepcopy(template)
            candidate[field] = bad
            self.path.write_text(json.dumps({"version": "3.0.0", "batches": [candidate], "disabledIds": []}), encoding="utf-8")
            with self.assertRaises(ValueError):
                self.repo.read()
        for field in template:
            candidate = {key: value for key, value in template.items() if key != field}
            self.path.write_text(json.dumps({"version": "3.0.0", "batches": [candidate], "disabledIds": []}), encoding="utf-8")
            with self.assertRaises(ValueError):
                self.repo.read()

    def test_corrupt_candidate_semantics_and_missing_accounting_are_rejected(self):
        batch = import_candidates(self.repo, {"candidates": [
            {"scenario_id": "live.strike", "text": "Strike. Hier liegen die Pins gesammelt."},
        ]})
        original = self.repo.read()
        for field, value in (("scenario_id", "invented.scenario"), ("text", "Ein {invalid} Platzhalter."),
                             ("errors", ["Fehler"])):
            corrupted = copy.deepcopy(original)
            corrupted["batches"][0]["candidates"][0][field] = value
            self.path.write_text(json.dumps(corrupted), encoding="utf-8")
            with self.assertRaises(ValueError):
                read_snapshot(self.repo)
        unaccounted = new_batch("openai", "dummy", "requesting")
        self.path.write_text(json.dumps({"version": "3.0.0", "batches": [unaccounted], "disabledIds": []}), encoding="utf-8")
        with self.assertRaises(ValueError):
            self.repo.read()

    def test_failed_final_save_never_publishes_active_candidates(self):
        plan = generation_plan("live.strike", "dummy", 1, 256, 1, 1, 1)
        settings = SimpleNamespace(openai_api_key=SecretStr("synthetic-key"))
        original_save = self.repo.save
        calls = 0
        def save(value):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise OSError("simulated final replace failure")
            original_save(value)
        def transport(*_):
            return {"status": "completed", "usage": {"input_tokens": 2, "output_tokens": 3},
                    "output": [{"type": "message", "content": [{"type": "output_text", "text":
                        '{"candidates":[{"scenario_id":"live.strike","text":"Strike. Heute liegen die Pins beisammen."}]}'}]}]}
        with patch.object(self.repo, "save", side_effect=save), self.assertRaises(ValueError):
            generate(plan, execute=True, repository=self.repo, settings=settings, transport=transport)
        stored = self.repo.read()["batches"]
        self.assertEqual(1, len(stored))
        self.assertEqual("failed", stored[0]["status"])
        self.assertEqual([], stored[0]["candidates"])
        self.assertIn("actual_usd", stored[0]["cost"])

    def test_interruption_retains_single_reservation_with_no_published_candidate(self):
        plan = generation_plan("live.strike", "dummy", 1, 256, 1, 1, 1)
        settings = SimpleNamespace(openai_api_key=SecretStr("synthetic-key"))
        original_save = self.repo.save
        calls = 0
        def save(value):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise KeyboardInterrupt()
            original_save(value)
        def transport(*_):
            return {"status": "completed", "usage": {"input_tokens": 2, "output_tokens": 3},
                    "output": [{"type": "message", "content": [{"type": "output_text", "text":
                        '{"candidates":[{"scenario_id":"live.strike","text":"Strike. Die Pins liegen auf der Bahn."}]}'}]}]}
        with patch.object(self.repo, "save", side_effect=save), self.assertRaises(KeyboardInterrupt):
            generate(plan, execute=True, repository=self.repo, settings=settings, transport=transport)
        stored = self.repo.read()["batches"]
        self.assertEqual(1, len(stored))
        self.assertEqual("requesting", stored[0]["status"])
        self.assertEqual([], stored[0]["candidates"])
        self.assertGreater(stored[0]["cost"]["reserved_usd"], 0)
        with self.assertRaisesRegex(ValueError, "Gesamtbudget"):
            generate({**plan, "total_budget_usd": plan["reserved_usd"]}, execute=True, repository=self.repo,
                     settings=settings, transport=lambda *_: self.fail("Budget must block before provider"))

    def test_cross_process_writer_lock(self):
        script = (
            "from pathlib import Path; from app.services.trash_talk_repository import TrashTalkRepository\n"
            f"repo=TrashTalkRepository(Path({str(self.path)!r}))\n"
            "try:\n"
            " with repo.lock(): pass\n"
            "except RuntimeError:\n"
            " raise SystemExit(7)\n"
        )
        with self.repo.lock():
            child = subprocess.run([sys.executable, "-c", script], capture_output=True, timeout=15)
        self.assertEqual(7, child.returncode, child.stderr.decode(errors="replace"))


if __name__ == "__main__":
    unittest.main()
