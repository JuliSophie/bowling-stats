"""Built-in catalog plus generated JSON snapshot; runtime is read-only."""
from __future__ import annotations
import hashlib
import json
import math
import re
from pathlib import Path
from typing import Any
from app.services.trash_talk_repository import TrashTalkRepository, new_batch

CATALOG_PATH = Path(__file__).parents[1] / "data" / "trash-talk" / "catalog.json"
PLACEHOLDER = re.compile(r"\{([A-Za-z][A-Za-z0-9_]*)\}")
IDENTIFIER = re.compile(r"[a-z][a-z0-9_.-]{0,119}")
LEGACY_KINDS = frozenset({
    "legacy-v1", "legacy-v2-message", "legacy-v2-opener", "legacy-v2-core",
    "legacy-v2-suffix", "legacy-live",
})
CATALOG_VERSION = "3.1.0"
V2_CONDITION_KEYS = frozenset({
    "requiresAverage", "minScore", "maxScore", "minAverage", "maxAverage",
    "minDeltaToAverage", "maxDeltaToAverage", "minOpenFrameRate", "maxOpenFrameRate",
    "minRate", "maxRate", "minValue", "maxValue", "minSecondaryValue",
    "maxSecondaryValue", "minMargin", "maxMargin", "minFrame", "maxFrame",
    "minTensionIndex", "maxTensionIndex", "won", "lost",
})
V2_TONES = frozenset({"playful", "dry", "savage", "coach", "absurd"})


def _finite_number(value: object) -> bool:
    if type(value) not in (int, float):
        return False
    try:
        return math.isfinite(value)
    except OverflowError:
        return False

def template_id(scenario: str, text: str) -> str:
    return f"base:{hashlib.sha256((scenario + chr(0) + text).encode()).hexdigest()[:24]}"

def validate_template(text: object, bindings: list[str], kind: str | None = None) -> list[str]:
    legacy = kind in LEGACY_KINDS
    minimum, maximum = (0, 2000) if legacy else (5, 360)
    if not isinstance(text, str) or len(text.strip()) < minimum or len(text) > maximum:
        return [f"Text muss zwischen {minimum} und {maximum} Zeichen enthalten."]
    errors = []
    if any(ord(c) < 32 and not (legacy and c in "\n\r\t") for c in text):
        errors.append("Steuerzeichen sind nicht erlaubt.")
    residual = PLACEHOLDER.sub("", text)
    if "{" in residual or "}" in residual: errors.append("Ungültiger Platzhalter.")
    if set(PLACEHOLDER.findall(text)) - set(bindings): errors.append("Unbekannter Platzhalter.")
    return errors


def base_templates(scenario: dict) -> list[tuple[str, str]]:
    """Legacy occurrence IDs preserve duplicates and the original pool order."""
    if scenario.get("kind") in LEGACY_KINDS:
        return list(zip(scenario["templateIds"], scenario["templates"]))
    return [(template_id(scenario["id"], text), text) for text in scenario["templates"]]


def validate_legacy_metadata(catalog: dict, scenarios: dict[str, dict]) -> list[str]:
    legacy_pools = {identifier for identifier, entry in scenarios.items()
                    if str(entry.get("kind", "")).startswith("legacy-v2-")}
    metadata = catalog.get("legacyV2")
    if metadata is None:
        return ["Konsolidierte V2-Metadaten fehlen."]
    if not isinstance(metadata, dict) or set(metadata) != {"messages", "fragments"}:
        return ["Ungültige V2-Metadaten."]
    errors = []
    referenced = set()
    for section, references in (
        ("messages", {"poolId": "legacy-v2-message"}),
        ("fragments", {"openersPoolId": "legacy-v2-opener", "coresPoolId": "legacy-v2-core", "suffixesPoolId": "legacy-v2-suffix"}),
    ):
        records = metadata.get(section)
        if not isinstance(records, list):
            errors.append(f"V2-{section} muss eine Liste sein.")
            continue
        seen = set()
        for record in records:
            if not isinstance(record, dict):
                errors.append("Ungültiger V2-Metadatensatz.")
                continue
            identifier = record.get("id")
            if not isinstance(identifier, str) or not identifier or identifier in seen:
                errors.append("Ungültige oder doppelte V2-ID.")
            else:
                seen.add(identifier)
            required = {"id", "scenario", "language", "tone", "intensity", "weight", "cooldownGroup"}
            if section == "messages": required |= {"mode", "poolId"}
            else: required |= {"openersPoolId", "coresPoolId", "suffixesPoolId"}
            allowed = required | {"conditions", "tags"}
            if set(record) - allowed or not required <= set(record):
                errors.append("Unvollständige oder unbekannte V2-Metadatenfelder.")
            if record.get("language") != "de" or not isinstance(record.get("scenario"), str) or not record["scenario"]:
                errors.append("V2-Sprache oder Szenario fehlt.")
            if (not isinstance(record.get("tone"), str) or record["tone"] not in V2_TONES
                    or type(record.get("intensity")) is not int or not 1 <= record["intensity"] <= 5):
                errors.append("Ungültige V2-Ton-/Intensitätsmetadaten.")
            if section == "messages" and record.get("mode") != "template":
                errors.append("Ungültiger V2-Nachrichtenmodus.")
            weight = record.get("weight")
            if not _finite_number(weight) or weight < 0:
                errors.append("Ungültiges V2-Gewicht.")
            conditions = record.get("conditions", {})
            if not isinstance(conditions, dict):
                errors.append("Ungültige V2-Bedingungen.")
            else:
                for name, value in conditions.items():
                    if name not in V2_CONDITION_KEYS:
                        errors.append("Unbekannter V2-Bedingungsschlüssel.")
                        continue
                    if name in ("requiresAverage", "won", "lost"):
                        valid = type(value) is bool
                    else:
                        valid = _finite_number(value)
                    if not valid:
                        errors.append("Ungültiger V2-Bedingungswert.")
            if "tags" in record and (not isinstance(record["tags"], list) or any(not isinstance(value, str) for value in record["tags"])):
                    errors.append("Ungültige V2-Tags.")
            if not isinstance(record.get("cooldownGroup"), str) or not record["cooldownGroup"]:
                errors.append("Ungültige V2-Cooldown-Gruppe.")
            if any(key in record for key in ("template", "openers", "cores", "suffixes")):
                errors.append("V2-Texte dürfen nicht zusätzlich in Metadaten liegen.")
            for field, kind in references.items():
                target = record.get(field)
                entry = scenarios.get(target) if isinstance(target, str) else None
                if not entry or entry.get("kind") != kind or target in referenced:
                    errors.append(f"Ungültige oder doppelte V2-Poolreferenz: {field}")
                else:
                    referenced.add(target)
    if referenced != legacy_pools:
        errors.append("V2-Pools und Metadatenreferenzen sind nicht vollständig zugeordnet.")
    return errors

def validate_catalog(catalog: object) -> list[str]:
    if not isinstance(catalog, dict): return ["Katalog muss ein Objekt sein."]
    errors = []
    if catalog.get("version") != CATALOG_VERSION or catalog.get("language") != "de": errors.append(f"Kompatible Version {CATALOG_VERSION}/de fehlt.")
    scenarios = catalog.get("scenarios")
    if not isinstance(scenarios, list) or not scenarios: return errors + ["Szenarien fehlen."]
    seen = set()
    all_template_ids = set()
    scenario_map = {}
    for item in scenarios:
        if not isinstance(item, dict): errors.append("Szenario muss ein Objekt sein."); continue
        identifier = item.get("id")
        if not isinstance(identifier, str) or not IDENTIFIER.fullmatch(identifier) or identifier in seen:
            errors.append("Ungültige oder doppelte Szenario-ID."); continue
        seen.add(identifier)
        scenario_map[identifier] = item
        kind = item.get("kind")
        if "kind" in item and (not isinstance(kind, str) or kind not in LEGACY_KINDS):
            errors.append(f"{identifier}: unbekannte Inhaltsart.")
            continue
        bindings = item.get("bindings", [])
        if not isinstance(bindings, list) or any(not isinstance(k, str) or not k.isidentifier() for k in bindings):
            errors.append(f"{identifier}: ungültige Bindings.")
            continue
        if type(item.get("priority")) is not int or type(item.get("enabled")) is not bool: errors.append(f"{identifier}: Priorität/Status ungültig.")
        templates = item.get("templates")
        if not isinstance(templates, list) or not templates: errors.append(f"{identifier}: Texte fehlen."); continue
        if kind in LEGACY_KINDS:
            occurrence_ids = item.get("templateIds")
            if not isinstance(occurrence_ids, list) or len(occurrence_ids) != len(templates) or any(
                not isinstance(value, str) or not 1 <= len(value) <= 160 for value in occurrence_ids
            ):
                errors.append(f"{identifier}: ungültige Legacy-Vorkommens-IDs.")
                continue
            if kind == "legacy-v1":
                if (not isinstance(item.get("legacyExport"), str) or not isinstance(item.get("legacyPool"), str)
                        or not isinstance(item.get("legacyParameters"), list)
                        or any(not isinstance(value, str) for value in item["legacyParameters"])):
                    errors.append(f"{identifier}: unvollständige Legacy-v1-Metadaten.")
            elif kind == "legacy-live" and not isinstance(item.get("legacyLiveScenario"), str):
                errors.append(f"{identifier}: Legacy-Live-Szenario fehlt.")
            elif kind != "legacy-live" and not isinstance(item.get("legacyMetadata"), dict):
                errors.append(f"{identifier}: Legacy-Metadaten fehlen.")
        else:
            occurrence_ids = [template_id(identifier, text) for text in templates if isinstance(text, str)]
        for occurrence_id in occurrence_ids:
            if occurrence_id in all_template_ids:
                errors.append(f"{identifier}: doppelte Template-ID.")
            all_template_ids.add(occurrence_id)
        normalized = set()
        for text in templates:
            errors.extend(f"{identifier}: {e}" for e in validate_template(text, bindings, kind))
            if isinstance(text, str):
                key = " ".join(text.casefold().split())
                if kind is None and key in normalized: errors.append(f"{identifier}: doppelter Text.")
                normalized.add(key)
    errors.extend(validate_legacy_metadata(catalog, scenario_map))
    return errors

def read_catalog() -> dict[str, Any]:
    with CATALOG_PATH.open(encoding="utf-8") as stream: catalog = json.load(stream)
    errors = validate_catalog(catalog)
    if errors: raise ValueError("Ungültiger Basiskatalog: " + "; ".join(errors))
    return catalog

def read_snapshot(repository: TrashTalkRepository | None = None, base: dict | None = None) -> dict:
    repo = repository or TrashTalkRepository()
    snapshot = repo.read()
    known = {scenario["id"]: scenario for scenario in (base or read_catalog())["scenarios"]}
    for batch in snapshot["batches"]:
        for candidate in batch["candidates"]:
            if candidate["errors"]:
                continue
            scenario = known.get(candidate["scenario_id"])
            if scenario is None or validate_template(candidate["text"], scenario["bindings"], scenario.get("kind")):
                raise ValueError(f"Ungültiger gespeicherter Kandidat: {candidate['id']}")
    return snapshot

def enabled_catalog(repository: TrashTalkRepository | None = None) -> dict:
    base = read_catalog(); snapshot = read_snapshot(repository, base)
    disabled = set(snapshot["disabledIds"]); generated = []
    for batch in snapshot["batches"]:
        for item in batch["candidates"]:
            scenario = next((s for s in base["scenarios"] if s["id"] == item["scenario_id"]), None)
            if scenario and item["enabled"] and not item["errors"]:
                generated.append((item["id"], item["scenario_id"], item["text"]))
    result = []
    for source in base["scenarios"]:
        texts = base_templates(source)
        texts += sorted((i, t) for i, sid, t in generated if sid == source["id"])
        active = [(i, t) for i, t in texts if i not in disabled]
        if source.get("kind") is None:
            active.sort()
        on = source["enabled"] and source["id"] not in disabled
        projected = {**source, "enabled": on, "templates": [t for _, t in active] if on else [], "templateIds": [i for i, _ in active] if on else []}
        if source.get("kind") == "legacy-live":
            selection_ids = {identifier: f"{source['legacyLiveScenario']}.{index + 1}"
                             for index, identifier in enumerate(source["templateIds"])}
            projected["templateSelectionIds"] = [selection_ids.get(identifier, identifier)
                                                 for identifier, _ in active] if on else []
        result.append(projected)
    result = {**base, "scenarios": sorted(result, key=lambda x: x["id"])}
    result["release"] = hashlib.sha256(json.dumps(result, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:24]
    return result

def coverage(repository=None) -> dict:
    catalog = enabled_catalog(repository)
    rows = [{"id": s["id"], "enabled": s["enabled"], "variants": len(s["templates"]), "bindings": s["bindings"],
             "status": "empty" if not s["templates"] else "thin" if len(s["templates"]) < 3 else "covered"} for s in catalog["scenarios"]]
    return {"version": catalog["version"], "scenarios": rows, "warnings": [f"{x['id']}: {x['status']}" for x in rows if x["status"] != "covered"]}

def batch_view(batch: dict, snapshot: dict | None = None) -> dict:
    disabled = set(snapshot["disabledIds"]) if snapshot else set()
    return {**batch, "candidates": [
        {**candidate, "enabled": candidate["enabled"] and candidate["id"] not in disabled
         and candidate["scenario_id"] not in disabled}
        for candidate in batch["candidates"]
    ]}

def prepare_candidates(snapshot: dict, payload: object, batch: dict) -> dict:
    """Validate candidates into an existing batch without publishing intermediate state."""
    if not isinstance(payload, dict) or set(payload) != {"candidates"}: raise ValueError('Import erwartet {"candidates": [...]} ohne zusätzliche Felder.')
    values = payload["candidates"]
    if not isinstance(values, list) or not 1 <= len(values) <= 200: raise ValueError("Ein Batch muss 1 bis 200 Kandidaten enthalten.")
    base = read_catalog(); known = {s["id"]: s for s in base["scenarios"]}
    existing = {(s["id"], " ".join(t.casefold().split())) for s in base["scenarios"] for t in s["templates"]}
    for b in snapshot["batches"]:
        for c in b["candidates"]:
            if not c["errors"]: existing.add((c["scenario_id"], " ".join(c["text"].casefold().split())))
    valid = 0
    candidates = []
    for n, item in enumerate(values):
        errors = []
        if not isinstance(item, dict) or set(item) != {"scenario_id", "text"}: errors.append("Kandidat benötigt genau scenario_id und text.")
        sid = item.get("scenario_id") if isinstance(item, dict) else ""; text = item.get("text") if isinstance(item, dict) else ""
        scenario = known.get(sid) if isinstance(sid, str) else None
        if scenario is None: errors.append("Unbekanntes Szenario.")
        errors += validate_template(text, scenario["bindings"] if scenario else [], scenario.get("kind") if scenario else None)
        key = (sid if isinstance(sid, str) else "", " ".join(text.casefold().split()) if isinstance(text, str) else "")
        if key in existing: errors.append("Doppelter Text.")
        if not errors: existing.add(key); valid += 1
        candidate = {"id": f"gen:{batch['id']}:{n:03d}", "scenario_id": sid[:120] if isinstance(sid, str) else "",
                     "text": text[:2000] if isinstance(text, str) else "", "enabled": not errors, "errors": errors}
        candidates.append(candidate)
    batch["candidates"] = candidates
    batch["status"] = "active" if valid == len(values) else "partial" if valid else "invalid"
    return batch


def import_candidates(repository: TrashTalkRepository, payload: object, *, source="import", model=None) -> dict:
    if source != "import":
        raise ValueError("Provider-Batches müssen über die budgetierte Generierung angelegt werden.")
    with repository.lock():
        snapshot = read_snapshot(repository)
        batch = prepare_candidates(snapshot, payload, new_batch(source, model))
        snapshot["batches"].append(batch)
        repository.save(snapshot)
        return batch_view(batch, snapshot)


def disable(repository: TrashTalkRepository, identifier: str) -> None:
    base = read_catalog()
    known = {scenario["id"] for scenario in base["scenarios"]}
    known.update(identifier for scenario in base["scenarios"] for identifier, _ in base_templates(scenario))
    with repository.lock():
        snapshot = read_snapshot(repository, base)
        known |= {c["id"] for b in snapshot["batches"] for c in b["candidates"]}
        if identifier not in known: raise ValueError("Unbekannte Template- oder Szenario-ID.")
        if identifier not in snapshot["disabledIds"]:
            snapshot["disabledIds"].append(identifier)
            repository.save(snapshot)
