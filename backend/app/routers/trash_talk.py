from fastapi import APIRouter, HTTPException, Query
from datetime import datetime, timezone

from app.services.trash_talk_catalog import batch_view, coverage, enabled_catalog, read_snapshot

router = APIRouter(prefix="/trash-talk", tags=["trash-talk"])


@router.get("/catalog")
def get_catalog() -> dict:
    return {"status": "ok", "catalog": enabled_catalog(), "validation": {"errors": []}}


@router.get("/coverage")
def get_coverage() -> dict:
    return coverage()


@router.get("/batches")
def get_batches(limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0, le=1_000_000),
                ) -> dict:
    snapshot = read_snapshot()
    def created_at(batch: dict) -> float:
        value = datetime.fromisoformat(batch["created_at"])
        return value.replace(tzinfo=value.tzinfo or timezone.utc).timestamp()
    batches = sorted(sorted(snapshot["batches"], key=lambda item: item["id"]), key=created_at, reverse=True)
    return {"batches": [batch_view(batch, snapshot) for batch in batches[offset:offset + limit]]}


@router.get("/batches/{batch_id}")
def get_batch(batch_id: str) -> dict:
    snapshot = read_snapshot()
    batch = next((x for x in snapshot["batches"] if x["id"] == batch_id), None)
    if batch is None:
        raise HTTPException(status_code=404, detail="Generierungsbatch nicht gefunden.")
    return batch_view(batch, snapshot)
