"""Validated, atomic JSON storage for generated trash-talk history."""
from __future__ import annotations

import contextlib
import json
import math
import os
import stat
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path


class TrashTalkRepository:
    def __init__(self, file_path: str | Path | None = None):
        self.path = Path(file_path) if file_path else Path(__file__).parents[1] / "data" / "trash-talk" / "generated.json"
        self.lock_path = self.path.with_name(self.path.name + ".lock")
        self._lock_handle = None

    def read(self) -> dict:
        try:
            with self.path.open(encoding="utf-8") as stream:
                value = json.load(stream)
        except FileNotFoundError as exc:
            raise ValueError(f"Generierter Katalog fehlt: {self.path}") from exc
        except (OSError, json.JSONDecodeError) as exc:
            raise ValueError(f"Generierter Katalog ist beschädigt: {self.path}") from exc
        errors = self.validate(value)
        if errors:
            raise ValueError("Ungültiger generierter Katalog: " + "; ".join(errors))
        return value

    @staticmethod
    def validate(value: object) -> list[str]:
        errors: list[str] = []
        if not isinstance(value, dict) or set(value) != {"version", "batches", "disabledIds"} or value.get("version") != "3.0.0" or not isinstance(value.get("batches"), list):
            return ["Version 3.0.0 und batches fehlen."]
        def identifier(item: object) -> bool:
            return isinstance(item, str) and 0 < len(item) <= 160 and not any(ord(c) < 32 for c in item)

        def amount(item: object) -> bool:
            if type(item) not in (int, float) or item < 0:
                return False
            try:
                return math.isfinite(item)
            except OverflowError:
                return False

        if not isinstance(value["disabledIds"], list) or any(not identifier(item) for item in value["disabledIds"]):
            errors.append("disabledIds muss eine Liste von IDs sein.")
        elif len(set(value["disabledIds"])) != len(value["disabledIds"]):
            errors.append("Deaktivierte IDs müssen eindeutig sein.")
        ids: set[str] = set()
        batch_ids: set[str] = set()
        for batch in value["batches"]:
            if not isinstance(batch, dict):
                errors.append("Batch muss ein Objekt sein.")
                continue
            required = {"id", "created_at", "source", "status", "model", "usage", "cost", "error", "candidates"}
            if set(batch) != required:
                errors.append("Batchfelder ungültig.")
                continue
            if not identifier(batch["id"]) or batch["id"] in batch_ids:
                errors.append("Batchfelder oder Batch-ID ungültig.")
            else:
                batch_ids.add(batch["id"])
            try:
                if not isinstance(batch["created_at"], str):
                    raise ValueError
                datetime.fromisoformat(batch["created_at"])
            except (TypeError, ValueError):
                errors.append("Batchdatum ungültig.")
            if batch["source"] not in ("import", "openai") or (batch["model"] is not None and (not isinstance(batch["model"], str) or len(batch["model"]) > 120)):
                errors.append("Batchquelle oder Modell ungültig.")
            if batch["error"] is not None and (not isinstance(batch["error"], str) or len(batch["error"]) > 2000):
                errors.append("Batchfehler ungültig.")
            if not isinstance(batch["status"], str) or batch["status"] not in {"requesting", "validating", "active", "partial", "invalid", "failed"}:
                errors.append("Batchstatus ungültig.")
            for name in ("usage", "cost"):
                if not isinstance(batch[name], dict):
                    errors.append(f"{name} muss ein Objekt sein.")
                elif any(not isinstance(key, str) or not amount(item)
                         for key, item in batch[name].items()):
                    errors.append("Nutzungs- und Kostenwerte müssen endlich und nichtnegativ sein.")
            if batch["source"] == "openai":
                cost = batch["cost"]
                if not isinstance(cost, dict) or not ({"reserved_usd", "actual_usd"} & cost.keys()):
                    errors.append("OpenAI-Batch benötigt Kosten oder eine Budgetreservierung.")
                if batch["status"] == "requesting" and (not isinstance(cost, dict) or "reserved_usd" not in cost):
                    errors.append("Laufende Anfrage benötigt eine Budgetreservierung.")
                if not isinstance(batch["model"], str) or not batch["model"].strip():
                    errors.append("OpenAI-Modell fehlt.")
            if not isinstance(batch["candidates"], list) or len(batch["candidates"]) > 200:
                errors.append("Kandidatenliste ungültig.")
                continue
            enabled_count = 0
            for candidate in batch["candidates"]:
                if not isinstance(candidate, dict) or set(candidate) != {"id", "scenario_id", "text", "enabled", "errors"}:
                    errors.append("Kandidatenfelder ungültig.")
                    continue
                if not identifier(candidate["id"]) or candidate["id"] in ids:
                    errors.append("Doppelte Kandidaten-ID.")
                else:
                    ids.add(candidate["id"])
                if not isinstance(candidate["scenario_id"], str) or len(candidate["scenario_id"]) > 120 or not isinstance(candidate["text"], str) or len(candidate["text"]) > 2000:
                    errors.append("Kandidat-ID, Szenario oder Text ungültig.")
                if type(candidate["enabled"]) is not bool or not isinstance(candidate["errors"], list) or any(not isinstance(e, str) for e in candidate["errors"]):
                    errors.append("Kandidatenstatus ungültig.")
                if candidate["enabled"] is True:
                    enabled_count += 1
                    if candidate["errors"]:
                        errors.append("Aktiver Kandidat darf keine Validierungsfehler enthalten.")
            count = len(batch["candidates"])
            if batch["status"] == "active" and (not count or enabled_count != count):
                errors.append("Aktiver Batch benötigt ausschließlich gültige Kandidaten.")
            if batch["status"] == "partial" and not 0 < enabled_count < count:
                errors.append("Teilweiser Batch benötigt gültige und ungültige Kandidaten.")
            if batch["status"] in ("failed", "requesting", "validating", "invalid") and enabled_count:
                errors.append("Unfertiger oder ungültiger Batch darf keine aktiven Kandidaten enthalten.")
        return errors

    @contextlib.contextmanager
    def lock(self):
        if self._lock_handle is not None:
            raise RuntimeError("Verschachtelte Schreibsperre ist nicht erlaubt.")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        handle = self.lock_path.open("a+", encoding="ascii")
        try:
            try:
                import msvcrt
                handle.seek(0); msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            except ImportError:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except (OSError, IOError) as exc:
            handle.close()
            raise RuntimeError("Ein anderer Trash-Talk-Schreiber ist aktiv.") from exc
        self._lock_handle = handle
        try:
            yield self
        finally:
            try:
                if os.name == "nt":
                    import msvcrt
                    handle.seek(0); msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
            finally:
                handle.close(); self._lock_handle = None

    def save(self, value: dict) -> None:
        if self._lock_handle is None:
            raise RuntimeError("Katalogänderungen benötigen die Schreibsperre.")
        errors = self.validate(value)
        if errors:
            raise ValueError("Ungültiger generierter Katalog: " + "; ".join(errors))
        fd, name = tempfile.mkstemp(prefix=self.path.name + ".", suffix=".tmp", dir=self.path.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as stream:
                json.dump(value, stream, ensure_ascii=False, sort_keys=True, indent=2); stream.write("\n")
                stream.flush(); os.fsync(stream.fileno())
            os.chmod(name, stat.S_IMODE(self.path.stat().st_mode))
            os.replace(name, self.path)
        except Exception:
            with contextlib.suppress(FileNotFoundError):
                os.unlink(name)
            raise


def new_batch(source: str, model: str | None = None, status: str = "validating") -> dict:
    return {"id": str(uuid.uuid4()), "created_at": datetime.now(timezone.utc).isoformat(),
            "source": source, "status": status, "model": model, "usage": {}, "cost": {},
            "error": None, "candidates": []}
