from app.schemas import CornerGuessResult, ExtractionResult, ManualCorner, PlayerData, RectifiedPreview
from app.services.ocr_image import ImagePreprocessor


def guess_scorecard_corners(file_bytes: bytes, filename: str) -> CornerGuessResult:
    image = ImagePreprocessor.decode_image(file_bytes)
    guessed_corners = ImagePreprocessor.guess_monitor_corners(image)
    warnings: list[str] = []
    if guessed_corners:
        warnings.append("Automatisch erkannte Monitor-Ecken wurden vorgeschlagen. Bitte prüfen und bei Bedarf korrigieren.")
    else:
        warnings.append("Es konnten keine sicheren Monitor-Ecken erkannt werden. Bitte die vier Ecken manuell setzen.")

    return CornerGuessResult(filename=filename, guessed_corners=guessed_corners, warnings=warnings)


def build_rectified_preview(
    file_bytes: bytes,
    filename: str,
    manual_corners: list[ManualCorner],
) -> RectifiedPreview:
    bw_image = ImagePreprocessor.prepare_image(file_bytes, manual_corners)
    warnings = ["Bitte prüfe die Bildverarbeitung Schritt für Schritt."]
    return RectifiedPreview(
        filename=filename,
        bw_image_data_url=ImagePreprocessor.encode_image_data_url(bw_image),
        edge_debug_image_data_url=ImagePreprocessor.encode_image_data_url(ImagePreprocessor.build_edge_debug_image(bw_image)),
        warnings=warnings,
    )


def extract_scorecard(
    file_bytes: bytes,
    filename: str,
    manual_corners: list[ManualCorner],
    bw_threshold: int | None = None,
) -> ExtractionResult:
    bw_image = ImagePreprocessor.prepare_image(file_bytes, manual_corners)
    raw_players, num_columns = ImagePreprocessor.extract_table_data(bw_image, bw_threshold=bw_threshold)
    players = [PlayerData(**p) for p in raw_players]
    warnings: list[str] = []
    if not players:
        warnings.append("Keine Spieler erkannt. Bitte prüfe die Monitor-Ecken und versuche es erneut.")
    if num_columns < 11:
        warnings.append(f"Nur {num_columns} von 11 Spalten erkannt. Möglicherweise fehlen Frames — bitte prüfe die Ecken und den Schwellenwert.")
    return ExtractionResult(filename=filename, players=players, warnings=warnings)
