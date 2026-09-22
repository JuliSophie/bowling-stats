"""Explicit local generation; history and budget are versioned JSON."""
from __future__ import annotations

import json
import math
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.config import Settings
from app.services.trash_talk_catalog import LEGACY_KINDS, batch_view, prepare_candidates, read_catalog, read_snapshot
from app.services.trash_talk_repository import TrashTalkRepository, new_batch


def generation_plan(scenario_id, model, count, max_output_tokens, input_price, output_price, budget):
    if not isinstance(model, str) or not model.strip() or len(model) > 120:
        raise ValueError("Ein gültiges Modell muss angegeben werden.")
    if type(count) is not int or not 1 <= count <= 30 or type(max_output_tokens) is not int or not 256 <= max_output_tokens <= 8192:
        raise ValueError("Kandidatenzahl (1–30) oder Tokenlimit (256–8192) ungültig.")
    if any(not math.isfinite(value) or value <= 0 for value in (input_price, output_price, budget)):
        raise ValueError("Aktuelle Preise und Gesamtbudget müssen endlich und positiv sein.")
    scenario = next((item for item in read_catalog()["scenarios"] if item["id"] == scenario_id), None)
    if not scenario or not scenario.get("generationBrief"):
        raise ValueError("Unbekanntes Szenario oder kein Schreibauftrag.")
    kind = scenario.get("kind")
    component = {
        "legacy-v2-opener": "sentence-opening fragments",
        "legacy-v2-core": "core sentence fragments",
        "legacy-v2-suffix": "sentence-ending fragments",
    }.get(kind)
    minimum, maximum = (0, 2000) if kind in LEGACY_KINDS else (5, 360)
    prompt = (
        f"Write {count} distinct short German bowling {component or 'commentary templates'}.\n"
        f"Situation: {scenario['generationBrief']}\nScenario ID: {scenario_id}\n"
        f"Allowed placeholders: {', '.join('{' + key + '}' for key in scenario['bindings'])}.\n"
        "Use only these established facts. Do not invent causes, identities, chronology, "
        "probabilities or additional statistics. Tease sporting performance, not personal traits. "
        f"Each text: {minimum}–{maximum} characters, one line. "
        + ("These are composable fragments, not complete independent sayings. " if component else "")
        +
        'Return JSON {"candidates":[{"scenario_id":"...", "text":"..."}]}.'
    )
    body = {
        "model": model, "input": prompt, "max_output_tokens": max_output_tokens,
        "text": {"format": {"type": "json_schema", "name": "bowling_sayings", "strict": True,
                           "schema": {
                               "type": "object", "additionalProperties": False,
                               "properties": {"candidates": {"type": "array", "items": {
                                   "type": "object", "additionalProperties": False,
                                   "properties": {"scenario_id": {"type": "string", "enum": [scenario_id]},
                                                  "text": {"type": "string"}},
                                   "required": ["scenario_id", "text"]}}},
                               "required": ["candidates"],
                           }}},
    }
    reserved_input = len(json.dumps(body, ensure_ascii=False).encode()) + 4096
    reserved_usd = (reserved_input * input_price + max_output_tokens * output_price) / 1_000_000
    if reserved_usd > budget:
        raise ValueError("Das maximale Anfragebudget überschreitet das Gesamtbudget.")
    return {
        "body": body, "scenario_id": scenario_id, "count": count,
        "reserved_input_tokens": reserved_input, "reserved_usd": reserved_usd,
        "input_price_per_million": input_price, "output_price_per_million": output_price,
        "total_budget_usd": budget,
    }


def request_openai(body, key):
    request = Request(
        "https://api.openai.com/v1/responses", data=json.dumps(body).encode(), method="POST",
        headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"},
    )
    with urlopen(request, timeout=60) as response:
        raw = response.read(1_048_577)
    if len(raw) > 1_048_576:
        raise ValueError("Provider-Antwort überschreitet das Größenlimit.")
    result = json.loads(raw)
    if not isinstance(result, dict):
        raise ValueError("Provider-Antwort ist kein Objekt.")
    return result


def _extract(response, count, scenario_id):
    if not isinstance(response, dict) or response.get("status") != "completed":
        raise ValueError("Provider hat die Ausgabe nicht vollständig abgeschlossen.")
    output = response.get("output")
    if not isinstance(output, list) or any(not isinstance(item, dict) for item in output):
        raise ValueError("Ungültige Provider-Ausgabestruktur.")
    fragments = []
    for item in output:
        if item.get("type") != "message":
            continue
        contents = item.get("content")
        if not isinstance(contents, list) or any(not isinstance(content, dict) for content in contents):
            raise ValueError("Ungültige Provider-Nachrichtenstruktur.")
        for content in contents:
            if content.get("type") == "output_text":
                if not isinstance(content.get("text"), str):
                    raise ValueError("Provider-Text fehlt.")
                fragments.append(content["text"])
    payload = json.loads("".join(fragments))
    candidates = payload.get("candidates") if isinstance(payload, dict) else None
    if not isinstance(candidates, list) or len(candidates) != count or any(
        not isinstance(item, dict) or item.get("scenario_id") != scenario_id for item in candidates
    ):
        raise ValueError("Provider lieferte eine ungültige Kandidatenantwort.")
    return {"candidates": candidates}


def generate(plan, *, execute=False, transport=request_openai, repository=None, settings=None):
    if not execute:
        return {"dry_run": True, **{key: value for key, value in plan.items() if key != "body"}, "request": plan["body"]}
    settings = settings or Settings()
    key = settings.openai_api_key.get_secret_value() if settings.openai_api_key else ""
    if not key.strip():
        raise ValueError("OPENAI_API_KEY fehlt in backend/.env oder der Prozessumgebung.")
    repo = repository or TrashTalkRepository()
    with repo.lock():
        snapshot = read_snapshot(repo)
        spent = sum(batch["cost"].get("actual_usd", batch["cost"].get("reserved_usd"))
                    for batch in snapshot["batches"] if batch["source"] == "openai")
        if spent + plan["reserved_usd"] > plan["total_budget_usd"]:
            raise ValueError("Gemeinsames Gesamtbudget erreicht.")
        batch = new_batch("openai", plan["body"]["model"], "requesting")
        batch["cost"] = {field: plan[field] for field in (
            "reserved_usd", "input_price_per_million", "output_price_per_million", "total_budget_usd",
        )}
        snapshot["batches"].append(batch)
        repo.save(snapshot)
        try:
            response = transport(plan["body"], key)
            usage = response.get("usage") if isinstance(response, dict) else None
            if isinstance(usage, dict):
                incoming, outgoing = usage.get("input_tokens"), usage.get("output_tokens")
                if type(incoming) is int and incoming >= 0 and type(outgoing) is int and outgoing >= 0:
                    batch["usage"] = {"input_tokens": incoming, "output_tokens": outgoing}
                    batch["cost"]["actual_usd"] = (
                        incoming * plan["input_price_per_million"] + outgoing * plan["output_price_per_million"]
                    ) / 1_000_000
            payload = _extract(response, plan["count"], plan["scenario_id"])
            prepare_candidates(snapshot, payload, batch)
            repo.save(snapshot)
            return batch_view(batch, snapshot)
        except (HTTPError, URLError, TimeoutError, OSError, ValueError, TypeError, KeyError) as exc:
            batch["status"] = "failed"
            batch["candidates"] = []
            batch["error"] = f"Generierung fehlgeschlagen ({type(exc).__name__}); kein automatischer Wiederholungsversuch."
            try:
                repo.save(snapshot)
            except (OSError, ValueError) as save_error:
                raise ValueError(
                    f"Fehlerzustand konnte nicht gespeichert werden ({type(save_error).__name__}). "
                    f"Die letzte gespeicherte Budgetreservierung bleibt bestehen. Batch: {batch['id']}"
                ) from None
            raise ValueError(f"{batch['error']} Batch: {batch['id']}") from None
