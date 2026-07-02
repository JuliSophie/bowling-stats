"""Lane-calibration training samples + model distribution.

The companion app uploads one sample per accepted lane calibration: the camera
frame plus the (possibly hand-corrected) lane quad. Corrections after accept
re-post the same sample_id with updated corners (no image needed). The training
script (backend/scripts/train_lane_corners.py) consumes the sample directory and
writes an ONNX model, which the app fetches back via /lane-model.
"""

import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.config import DEFAULT_DATA_DIR
from app.services import lane_training

router = APIRouter(tags=["lane-samples"])
logger = logging.getLogger(__name__)

SAMPLES_DIR = DEFAULT_DATA_DIR / "lane_samples"
MODEL_PATH = DEFAULT_DATA_DIR / "lane_model" / "lane_corners.onnx"

_SAMPLE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def _sample_paths(sample_id: str) -> tuple[Path, Path]:
    return SAMPLES_DIR / f"{sample_id}.jpg", SAMPLES_DIR / f"{sample_id}.json"


def _parse_corners(raw: str) -> list[list[float]]:
    try:
        corners = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="corners is not valid JSON.") from exc
    if (
        not isinstance(corners, list)
        or len(corners) != 4
        or not all(isinstance(p, list) and len(p) == 2 for p in corners)
    ):
        raise HTTPException(status_code=400, detail="corners must be 4 [x, y] pairs (TL, TR, BR, BL).")
    return [[float(p[0]), float(p[1])] for p in corners]


@router.post("/lane-samples")
async def upload_lane_sample(
    sample_id: str = Form(...),
    corners: str = Form(...),
    meta: str = Form("{}"),
    image: UploadFile | None = File(None),
) -> dict:
    """Create or update a lane sample. First post carries the frame; corner
    corrections re-post the same sample_id without an image."""
    if not _SAMPLE_ID_RE.match(sample_id):
        raise HTTPException(status_code=400, detail="Invalid sample_id.")
    parsed_corners = _parse_corners(corners)
    try:
        parsed_meta = json.loads(meta)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="meta is not valid JSON.") from exc

    SAMPLES_DIR.mkdir(parents=True, exist_ok=True)
    image_path, label_path = _sample_paths(sample_id)

    if image is not None:
        image_bytes = await image.read()
        if not image_bytes:
            raise HTTPException(status_code=400, detail="Uploaded image is empty.")
        image_path.write_bytes(image_bytes)
    elif not image_path.exists():
        raise HTTPException(status_code=404, detail="Unknown sample_id and no image attached.")

    label_path.write_text(
        json.dumps(
            {
                "sampleId": sample_id,
                "corners": parsed_corners,
                "meta": parsed_meta,
                "updatedAt": datetime.now(timezone.utc).isoformat(),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    total = len(list(SAMPLES_DIR.glob("*.json")))
    logger.info("Lane sample %s saved (%d total).", sample_id, total)
    # Server-side background training: starts once uploads have been quiet for the delay window.
    lane_training.notify_sample_uploaded()
    return {"sampleId": sample_id, "totalSamples": total, "training": lane_training.status()}


@router.get("/lane-samples")
def list_lane_samples() -> dict:
    if not SAMPLES_DIR.exists():
        return {"totalSamples": 0, "samples": []}
    samples = []
    for label_path in sorted(SAMPLES_DIR.glob("*.json")):
        try:
            samples.append(json.loads(label_path.read_text(encoding="utf-8")))
        except (json.JSONDecodeError, OSError):
            logger.warning("Skipping unreadable lane sample %s", label_path.name)
    return {"totalSamples": len(samples), "samples": samples}


@router.get("/lane-model/info")
def lane_model_info() -> dict:
    if not MODEL_PATH.exists():
        return {"exists": False, "training": lane_training.status()}
    stat = MODEL_PATH.stat()
    return {
        "exists": True,
        "sizeBytes": stat.st_size,
        "modifiedAt": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
        "training": lane_training.status(),
    }


@router.get("/lane-model")
def download_lane_model() -> FileResponse:
    if not MODEL_PATH.exists():
        raise HTTPException(status_code=404, detail="No trained lane model yet.")
    return FileResponse(MODEL_PATH, media_type="application/octet-stream", filename="lane_corners.onnx")
