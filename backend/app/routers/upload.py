from fastapi import APIRouter, File, HTTPException, UploadFile

from app.schemas import UploadResult
from app.services.ocr import extract_scorecard


router = APIRouter(tags=["upload"])


@router.post("/upload", response_model=UploadResult)
async def upload_scorecard(file: UploadFile = File(...)) -> UploadResult:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Dateiname fehlt.")

    if not file.filename.lower().endswith((".png", ".jpg", ".jpeg")):
        raise HTTPException(status_code=400, detail="Es werden nur PNG- und JPG-Dateien unterstützt.")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Die hochgeladene Datei ist leer.")

    try:
        return extract_scorecard(file_bytes=file_bytes, filename=file.filename)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="OCR-Verarbeitung fehlgeschlagen.") from exc
