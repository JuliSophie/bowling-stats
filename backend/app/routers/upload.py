import json
import logging

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import TypeAdapter, ValidationError

from app.schemas import (
    CornerGuessResult,
    ExtractionResult,
    LineSegment,
    ManualCorner,
    RectifiedPreview,
    TableBuildResult,
)
from app.services.ocr import build_rectified_preview, build_table, extract_scorecard, guess_scorecard_corners


router = APIRouter(tags=["upload"])
logger = logging.getLogger(__name__)

manual_corners_adapter = TypeAdapter(list[ManualCorner])
line_segments_adapter = TypeAdapter(list[LineSegment])


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


def _parse_line_segments(raw: str | None) -> list[LineSegment]:
    if not raw:
        return []
    try:
        return line_segments_adapter.validate_python(json.loads(raw))
    except (json.JSONDecodeError, ValidationError) as exc:
        raise HTTPException(status_code=400, detail="Die Liniensegmente sind ungültig.") from exc


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
) -> RectifiedPreview:
    file_bytes = await file.read()
    _validate_file(file, file_bytes)
    manual_corners = _parse_manual_corners(corners, required=True)
    try:
        return build_rectified_preview(
            file_bytes=file_bytes,
            filename=file.filename or "upload",
            manual_corners=manual_corners or [],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Rectify failed for %s", file.filename or "upload")
        raise HTTPException(status_code=500, detail=f"Entzerrung fehlgeschlagen: {exc}") from exc


@router.post("/upload/build-table", response_model=TableBuildResult)
async def upload_build_table(
    file: UploadFile = File(...),
    corners: str | None = Form(default=None),
    selected_h_lines: str | None = Form(default=None),
    selected_v_lines: str | None = Form(default=None),
) -> TableBuildResult:
    file_bytes = await file.read()
    _validate_file(file, file_bytes)
    manual_corners = _parse_manual_corners(corners, required=True)
    h_lines = _parse_line_segments(selected_h_lines)
    v_lines = _parse_line_segments(selected_v_lines)
    try:
        return build_table(
            file_bytes=file_bytes,
            filename=file.filename or "upload",
            manual_corners=manual_corners or [],
            selected_h=h_lines,
            selected_v=v_lines,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Build table failed for %s", file.filename or "upload")
        raise HTTPException(status_code=500, detail=f"Tabellenerstellung fehlgeschlagen: {exc}") from exc


@router.post("/upload/extract", response_model=ExtractionResult)
async def upload_scorecard_extract(
    file: UploadFile = File(...),
    corners: str | None = Form(default=None),
    selected_h_lines: str | None = Form(default=None),
    selected_v_lines: str | None = Form(default=None),
    bw_threshold: int | None = Form(default=None),
) -> ExtractionResult:
    file_bytes = await file.read()
    _validate_file(file, file_bytes)
    manual_corners = _parse_manual_corners(corners, required=True)
    h_lines = _parse_line_segments(selected_h_lines)
    v_lines = _parse_line_segments(selected_v_lines)
    try:
        return extract_scorecard(
            file_bytes=file_bytes,
            filename=file.filename or "upload",
            manual_corners=manual_corners or [],
            selected_h=h_lines,
            selected_v=v_lines,
            bw_threshold=bw_threshold or 128,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("OCR extract failed for %s", file.filename or "upload")
        raise HTTPException(status_code=500, detail=f"OCR-Extraktion fehlgeschlagen: {exc}") from exc
