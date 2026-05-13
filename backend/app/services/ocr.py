from app.schemas import CornerGuessResult, ExtractionResult, ManualCorner, PlayerData, RectifiedPreview
from app.services.line_detection import build_debug_stage_images
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
    bw_threshold: int | None = None,
) -> RectifiedPreview:
    bw_image = ImagePreprocessor.prepare_image(file_bytes, manual_corners)
    rectified_bw, morph_horizontal, morph_vertical, edge_debug = build_debug_stage_images(
        bw_image,
        bw_threshold=bw_threshold,
    )
    return RectifiedPreview(
        filename=filename,
        bw_image_data_url=ImagePreprocessor.encode_image_data_url(rectified_bw),
        edge_debug_image_data_url=ImagePreprocessor.encode_image_data_url(edge_debug),
        morph_horizontal_data_url=ImagePreprocessor.encode_image_data_url(morph_horizontal),
        morph_vertical_data_url=ImagePreprocessor.encode_image_data_url(morph_vertical),
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
    return ExtractionResult(filename=filename, players=players, warnings=warnings)
