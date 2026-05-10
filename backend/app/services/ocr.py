import re

import cv2
import numpy as np
import pytesseract

from app.config import get_settings
from app.schemas import DetectedScore, UploadResult


SCORE_PATTERN = re.compile(r"^(?P<name>[A-Za-z0-9 ._\-]{2,})\s+(?P<score>\d{1,3})$")


def _preprocess_image(file_bytes: bytes) -> np.ndarray:
    image_array = np.frombuffer(file_bytes, dtype=np.uint8)
    image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Das Bild konnte nicht verarbeitet werden.")

    grayscale = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(grayscale, (5, 5), 0)
    _, thresholded = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return thresholded


def _parse_score_lines(raw_text: str) -> list[DetectedScore]:
    detections: list[DetectedScore] = []
    for line in raw_text.splitlines():
        candidate = " ".join(line.split())
        if not candidate:
            continue

        match = SCORE_PATTERN.match(candidate)
        if not match:
            continue

        total_score = int(match.group("score"))
        if total_score > 300:
            continue

        detections.append(
            DetectedScore(
                player_name=match.group("name").strip(),
                total_score=total_score,
                frames=[],
            )
        )
    return detections


def extract_scorecard(file_bytes: bytes, filename: str) -> UploadResult:
    settings = get_settings()
    if settings.tesseract_cmd:
        pytesseract.pytesseract.tesseract_cmd = settings.tesseract_cmd

    processed_image = _preprocess_image(file_bytes)
    raw_text = pytesseract.image_to_string(processed_image, config="--psm 6")
    detections = _parse_score_lines(raw_text)

    warnings: list[str] = []
    if not detections:
        warnings.append(
            "Keine eindeutigen Namens-/Score-Zeilen erkannt. Bitte Daten im Frontend kontrollieren oder manuell erfassen."
        )

    warnings.append(
        "Frame-Details werden in V1 noch nicht sicher aus OCR extrahiert und sollten bei Bedarf manuell ergänzt werden."
    )

    return UploadResult(
        filename=filename,
        raw_text=raw_text.strip(),
        detected_scores=detections,
        warnings=warnings,
    )
