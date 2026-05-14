import cv2

from app.schemas import (
    CornerGuessResult,
    ExtractionResult,
    LineSegment,
    ManualCorner,
    PlayerData,
    RectifiedPreview,
    SubCell,
    TableBuildResult,
)
from app.services.line_detection import (
    build_directional_masks,
    compute_subcells,
    compute_table_corners,
    denormalize_segments,
    extract_horizontal_candidates,
    extract_vertical_candidates,
    normalize_segments,
    rectify_table,
    transform_lines_to_rectified,
)
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
    h_mask, v_mask = build_directional_masks(bw_image)
    height, width = bw_image.shape[:2]

    h_candidates = extract_horizontal_candidates(h_mask, width, height)
    v_candidates = extract_vertical_candidates(v_mask, width, height)

    h_norm = normalize_segments(h_candidates, width, height)
    v_norm = normalize_segments(v_candidates, width, height)

    morph_h_debug = cv2.cvtColor((h_mask * 255).astype("uint8"), cv2.COLOR_GRAY2BGR)
    morph_v_debug = cv2.cvtColor((v_mask * 255).astype("uint8"), cv2.COLOR_GRAY2BGR)

    return RectifiedPreview(
        filename=filename,
        bw_image_data_url=ImagePreprocessor.encode_image_data_url(bw_image),
        morph_horizontal_data_url=ImagePreprocessor.encode_image_data_url(morph_h_debug),
        morph_vertical_data_url=ImagePreprocessor.encode_image_data_url(morph_v_debug),
        horizontal_candidates=[LineSegment(x1=s[0], y1=s[1], x2=s[2], y2=s[3]) for s in h_norm],
        vertical_candidates=[LineSegment(x1=s[0], y1=s[1], x2=s[2], y2=s[3]) for s in v_norm],
    )


def _build_rectified_image(
    file_bytes: bytes,
    manual_corners: list[ManualCorner],
    selected_h: list[LineSegment],
    selected_v: list[LineSegment],
) -> tuple["__import__('numpy').ndarray", list[dict]] | None:
    import numpy as np

    bw_image = ImagePreprocessor.prepare_image(file_bytes, manual_corners)
    height, width = bw_image.shape[:2]

    h_px = denormalize_segments(
        [(s.x1, s.y1, s.x2, s.y2) for s in selected_h], width, height,
    )
    v_px = denormalize_segments(
        [(s.x1, s.y1, s.x2, s.y2) for s in selected_v], width, height,
    )

    corners = compute_table_corners(h_px, v_px)
    if corners is None:
        return None

    rectified, M = rectify_table(bw_image, corners)
    rect_h, rect_w = rectified.shape[:2]
    y_pos, x_pos = transform_lines_to_rectified(h_px, v_px, M)
    sub_cells = compute_subcells(y_pos, x_pos, rect_w, rect_h)
    return rectified, sub_cells


def build_table(
    file_bytes: bytes,
    filename: str,
    manual_corners: list[ManualCorner],
    selected_h: list[LineSegment],
    selected_v: list[LineSegment],
) -> TableBuildResult:
    result = _build_rectified_image(file_bytes, manual_corners, selected_h, selected_v)
    if result is None:
        return TableBuildResult(warnings=["Tabellenecken konnten nicht berechnet werden."])

    rectified, sub_cells = result
    return TableBuildResult(
        rectified_bw_data_url=ImagePreprocessor.encode_image_data_url(rectified),
        sub_cells=[SubCell(**c) for c in sub_cells],
    )


def extract_scorecard(
    file_bytes: bytes,
    filename: str,
    manual_corners: list[ManualCorner],
    selected_h: list[LineSegment],
    selected_v: list[LineSegment],
    bw_threshold: int = 128,
) -> ExtractionResult:
    result = _build_rectified_image(file_bytes, manual_corners, selected_h, selected_v)
    if result is None:
        return ExtractionResult(filename=filename, warnings=["Tabellenecken konnten nicht berechnet werden."])

    rectified, sub_cells = result
    raw_players = ImagePreprocessor.extract_from_grid(rectified, bw_threshold, sub_cells)
    players = [PlayerData(**p) for p in raw_players]
    warnings: list[str] = []
    if not players:
        warnings.append("Keine Spieler erkannt.")
    return ExtractionResult(filename=filename, players=players, warnings=warnings)
