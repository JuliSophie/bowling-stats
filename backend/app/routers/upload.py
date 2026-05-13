import json
import logging

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import TypeAdapter, ValidationError

from app.schemas import CornerGuessResult, ExtractionResult, ManualCorner, RectifiedPreview
from app.services.ocr import build_rectified_preview, extract_scorecard, guess_scorecard_corners


router = APIRouter(tags=["upload"])
logger = logging.getLogger(__name__)


manual_corners_adapter = TypeAdapter(list[ManualCorner])


def _validate_file(file: UploadFile, file_bytes: bytes) -> None:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Dateiname fehlt.")

    if not file.filename.lower().endswith((".png", ".jpg", ".jpeg")):
        raise HTTPException(status_code=400, detail="Es werden nur PNG- und JPG-Dateien unterstützt.")

    if not file_bytes:
        raise HTTPException(status_code=400, detail="Die hochgeladene Datei ist leer.")


def _parse_manual_corners(corners: str | None, required: bool) -> list[ManualCorner] | None:
    if not corners:
        if required:
            raise HTTPException(status_code=400, detail="Es müssen genau vier Monitor-Eckpunkte übergeben werden.")
        return None

    try:
        manual_corners = manual_corners_adapter.validate_python(json.loads(corners))
    except (json.JSONDecodeError, ValidationError) as exc:
        raise HTTPException(status_code=400, detail="Die Monitor-Eckpunkte sind ungültig.") from exc

    if len(manual_corners) != 4:
        raise HTTPException(status_code=400, detail="Es müssen genau vier Monitor-Eckpunkte übergeben werden.")

    return manual_corners


@router.post("/upload/corners", response_model=CornerGuessResult)
async def upload_scorecard_corners(file: UploadFile = File(...)) -> CornerGuessResult:
    file_bytes = await file.read()
    _validate_file(file, file_bytes)

    try:
        return guess_scorecard_corners(file_bytes=file_bytes, filename=file.filename or "upload")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Corner detection failed for %s", file.filename or "upload")
        raise HTTPException(status_code=500, detail=f"Monitor-Erkennung fehlgeschlagen: {exc}") from exc


@router.post("/upload/rectify", response_model=RectifiedPreview)
async def upload_scorecard_rectified(
    file: UploadFile = File(...),
    corners: str | None = Form(default=None),
    bw_threshold: int | None = Form(default=None),
) -> RectifiedPreview:
    file_bytes = await file.read()
    _validate_file(file, file_bytes)

    manual_corners = _parse_manual_corners(corners, required=True)

    try:
        return build_rectified_preview(
            file_bytes=file_bytes,
            filename=file.filename or "upload",
            manual_corners=manual_corners or [],
            bw_threshold=bw_threshold,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Rectify failed for %s", file.filename or "upload")
        raise HTTPException(status_code=500, detail=f"Entzerrung fehlgeschlagen: {exc}") from exc


@router.post("/upload/extract", response_model=ExtractionResult)
async def upload_scorecard_extract(
    file: UploadFile = File(...),
    corners: str | None = Form(default=None),
    bw_threshold: int | None = Form(default=None),
) -> ExtractionResult:
    file_bytes = await file.read()
    _validate_file(file, file_bytes)

    manual_corners = _parse_manual_corners(corners, required=True)

    try:
        return extract_scorecard(
            file_bytes=file_bytes,
            filename=file.filename or "upload",
            manual_corners=manual_corners or [],
            bw_threshold=bw_threshold,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("OCR extract failed for %s", file.filename or "upload")
        raise HTTPException(status_code=500, detail=f"OCR-Extraktion fehlgeschlagen: {exc}") from exc
