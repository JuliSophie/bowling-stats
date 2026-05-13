import base64
import logging
import tempfile
from pathlib import Path

import cv2
import easyocr
import numpy as np
from app.config import get_settings
from app.schemas import ManualCorner

_reader: easyocr.Reader | None = None
logger = logging.getLogger(__name__)


def _get_ocr_cache_dir() -> str:
    configured_dir = get_settings().temp_dir / "easyocr"
    fallback_dir = Path(tempfile.gettempdir()) / "bowling-stats" / "easyocr"

    try:
        configured_dir.mkdir(parents=True, exist_ok=True)
        return str(configured_dir)
    except PermissionError:
        fallback_dir.mkdir(parents=True, exist_ok=True)
        logger.warning("EasyOCR cache directory %s is not writable; falling back to %s", configured_dir, fallback_dir)
        return str(fallback_dir)


def _get_reader() -> easyocr.Reader:
    global _reader
    if _reader is None:
        cache_dir = _get_ocr_cache_dir()
        _reader = easyocr.Reader(
            ["de", "en"],
            gpu=False,
            model_storage_directory=cache_dir,
            user_network_directory=cache_dir,
        )
    return _reader


class ImagePreprocessor:
    PROCESSED_SIZE = (1600, 1200)

    @staticmethod
    def decode_image(file_bytes: bytes) -> np.ndarray:
        image_array = np.frombuffer(file_bytes, dtype=np.uint8)
        image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("Das Bild konnte nicht verarbeitet werden.")
        return image

    @staticmethod
    def _order_points(points: np.ndarray) -> np.ndarray:
        ordered = np.zeros((4, 2), dtype="float32")
        point_sums = points.sum(axis=1)
        point_diffs = np.diff(points, axis=1)

        ordered[0] = points[np.argmin(point_sums)]
        ordered[2] = points[np.argmax(point_sums)]
        ordered[1] = points[np.argmin(point_diffs)]
        ordered[3] = points[np.argmax(point_diffs)]
        return ordered

    @staticmethod
    def _normalize_manual_points(image: np.ndarray, corners: list[ManualCorner]) -> np.ndarray:
        height, width = image.shape[:2]
        return np.array([[corner.x * width, corner.y * height] for corner in corners], dtype="float32")

    @staticmethod
    def _normalize_points(points: np.ndarray, image: np.ndarray) -> list[ManualCorner]:
        height, width = image.shape[:2]
        normalized: list[ManualCorner] = []
        for x_value, y_value in ImagePreprocessor._order_points(points):
            normalized.append(
                ManualCorner(
                    x=float(np.clip(x_value / width, 0.0, 1.0)),
                    y=float(np.clip(y_value / height, 0.0, 1.0)),
                )
            )
        return normalized

    @staticmethod
    def _expand_points(points: np.ndarray, image: np.ndarray, factor: float = 0.035) -> np.ndarray:
        center = points.mean(axis=0)
        expanded = center + (points - center) * (1.0 + factor)
        height, width = image.shape[:2]
        expanded[:, 0] = np.clip(expanded[:, 0], 0, width - 1)
        expanded[:, 1] = np.clip(expanded[:, 1], 0, height - 1)
        return expanded.astype("float32")

    @staticmethod
    def _four_point_transform(image: np.ndarray, points: np.ndarray) -> np.ndarray:
        rect = ImagePreprocessor._order_points(points)
        top_left, top_right, bottom_right, bottom_left = rect

        width_top = np.linalg.norm(top_right - top_left)
        width_bottom = np.linalg.norm(bottom_right - bottom_left)
        max_width = max(int(width_top), int(width_bottom))

        height_right = np.linalg.norm(top_right - bottom_right)
        height_left = np.linalg.norm(top_left - bottom_left)
        max_height = max(int(height_right), int(height_left))

        if max_width < 50 or max_height < 50:
            return image

        destination = np.array(
            [
                [0, 0],
                [max_width - 1, 0],
                [max_width - 1, max_height - 1],
                [0, max_height - 1],
            ],
            dtype="float32",
        )

        transform = cv2.getPerspectiveTransform(rect, destination)
        return cv2.warpPerspective(image, transform, (max_width, max_height))

    @staticmethod
    def _find_monitor_contour(image: np.ndarray) -> np.ndarray | None:
        grayscale = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(grayscale, (5, 5), 0)
        edged = cv2.Canny(blurred, 60, 180)
        edged = cv2.dilate(edged, np.ones((3, 3), dtype=np.uint8), iterations=1)

        contours, _ = cv2.findContours(edged, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        image_area = image.shape[0] * image.shape[1]

        for contour in sorted(contours, key=cv2.contourArea, reverse=True)[:12]:
            perimeter = cv2.arcLength(contour, True)
            approximation = cv2.approxPolyDP(contour, 0.02 * perimeter, True)
            if len(approximation) != 4:
                continue

            if cv2.contourArea(approximation) < image_area * 0.12:
                continue

            return approximation.reshape(4, 2).astype("float32")

        return None

    @staticmethod
    def guess_monitor_corners(image: np.ndarray) -> list[ManualCorner]:
        contour = ImagePreprocessor._find_monitor_contour(image)
        if contour is None:
            return []
        return ImagePreprocessor._normalize_points(contour, image)

    @staticmethod
    def _resize_processed_image(image: np.ndarray) -> np.ndarray:
        return cv2.resize(image, ImagePreprocessor.PROCESSED_SIZE, interpolation=cv2.INTER_CUBIC)

    @staticmethod
    def _build_bw_image(corrected: np.ndarray) -> np.ndarray:
        grayscale = cv2.cvtColor(corrected, cv2.COLOR_BGR2GRAY)
        grayscale = cv2.normalize(grayscale, None, 0, 255, cv2.NORM_MINMAX)
        if float(np.mean(grayscale)) < 127:
            grayscale = cv2.bitwise_not(grayscale)
        return grayscale

    # ------------------------------------------------------------------
    # OCR helpers (unchanged, will be rewired once detection is rebuilt)
    # ------------------------------------------------------------------

    @staticmethod
    def _has_content(image: np.ndarray, threshold: float = 0.03) -> bool:
        if image.size == 0:
            return False
        return float(np.count_nonzero(image < 128)) / image.size > threshold

    @staticmethod
    def _guess_symbol(image: np.ndarray) -> str:
        binary = cv2.threshold(image, 128, 255, cv2.THRESH_BINARY_INV)[1]
        coords = np.column_stack(np.where(binary > 0))
        if len(coords) < 5:
            return ""
        y_coords, x_coords = coords[:, 0], coords[:, 1]
        y_span = float(y_coords.max() - y_coords.min())
        x_span = float(x_coords.max() - x_coords.min())
        if y_span < 3 and x_span < 3:
            return ""
        if y_span < 1:
            return "-"
        ratio = x_span / y_span
        if ratio > 3.0:
            return "-"
        if ratio < 0.35:
            return "1"
        if 0.5 < ratio < 2.0:
            return "/"
        return ""

    @staticmethod
    def _ocr_crop(image: np.ndarray, allowlist: str = "", skip_empty_check: bool = False) -> str:
        if image.size == 0 or image.shape[0] < 3 or image.shape[1] < 3:
            return ""
        if not skip_empty_check and not ImagePreprocessor._has_content(image):
            return ""

        h, w = image.shape[:2]
        scale = max(1.0, 64.0 / h)
        scaled = cv2.resize(image, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_CUBIC)
        padded = cv2.copyMakeBorder(scaled, 20, 20, 20, 20, cv2.BORDER_CONSTANT, value=255)

        reader = _get_reader()
        results = reader.readtext(padded, allowlist=allowlist or None, paragraph=False, text_threshold=0.3, low_text=0.3)
        text = " ".join(entry[1] for entry in results).strip() if results else ""
        is_throw_cell = "-" in allowlist
        if not text and is_throw_cell and ImagePreprocessor._has_content(image):
            text = ImagePreprocessor._guess_symbol(image)

        return text

    @staticmethod
    def extract_table_data(bw_image: np.ndarray, bw_threshold: int | None = None) -> tuple[list[dict], int]:
        from app.schemas import FrameData, PlayerData

        from app.services.line_detection import build_table_layout, detect_lines, rectify_table_image

        bw_image, _ = rectify_table_image(bw_image)

        raw_h, raw_v = detect_lines(bw_image)
        y_grid, x_grid, row_splits = build_table_layout(raw_h, raw_v)
        num_columns = max(0, len(x_grid) - 2)
        if len(y_grid) < 3 or len(x_grid) < 3:
            return [], num_columns

        if bw_threshold is not None:
            ocr_img = cv2.threshold(bw_image, bw_threshold, 255, cv2.THRESH_BINARY)[1]
        else:
            ocr_img = bw_image

        throw_chars = "0123456789-xX"
        score_chars = "0123456789"
        m = 6

        image_h, image_w = ocr_img.shape[:2]

        def crop_rect(top: int, bottom: int, left: int, right: int, margin: int = 0) -> np.ndarray:
            cropped_top = max(0, min(image_h, top + margin))
            cropped_bottom = max(0, min(image_h, bottom - margin))
            cropped_left = max(0, min(image_w, left + margin))
            cropped_right = max(0, min(image_w, right - margin))
            if cropped_bottom <= cropped_top or cropped_right <= cropped_left:
                return ocr_img[0:0, 0:0]
            return ocr_img[cropped_top:cropped_bottom, cropped_left:cropped_right]

        players: list[dict] = []
        frame_count = len(x_grid) - 2

        for row_idx in range(1, len(y_grid) - 1):
            cell_top = y_grid[row_idx]
            cell_bottom = y_grid[row_idx + 1]
            split_y = row_splits[row_idx] if row_idx < len(row_splits) else None
            if split_y is None or split_y <= cell_top + 6 or split_y >= cell_bottom - 6:
                split_y = (cell_top + cell_bottom) // 2

            if not ImagePreprocessor._has_content(crop_rect(cell_top, cell_bottom, x_grid[0], x_grid[1], 5)):
                continue
            name_crop = crop_rect(cell_top, cell_bottom, x_grid[0], x_grid[1], m)
            name = ImagePreprocessor._ocr_crop(name_crop)

            player_index = len(players) + 1
            if name.rstrip().endswith(str(player_index)):
                name = ""

            frames: list[dict] = []
            for frame_idx in range(frame_count):
                cell_left = x_grid[frame_idx + 1]
                cell_right = x_grid[frame_idx + 2]

                cumulative_crop = crop_rect(split_y, cell_bottom, cell_left, cell_right, m)
                cumulative = ImagePreprocessor._ocr_crop(cumulative_crop, allowlist=score_chars, skip_empty_check=True)

                def ocr_throw(crop: np.ndarray) -> str:
                    return ImagePreprocessor._ocr_crop(crop, allowlist=throw_chars, skip_empty_check=True)

                segment_count = 4 if frame_idx == frame_count - 1 else 2
                upper_bounds = [
                    int(round(cell_left + ((cell_right - cell_left) * idx) / segment_count))
                    for idx in range(segment_count + 1)
                ]
                upper_values = [
                    ocr_throw(crop_rect(cell_top, split_y, upper_bounds[idx], upper_bounds[idx + 1], m))
                    for idx in range(segment_count)
                ]

                if frame_idx == frame_count - 1:
                    raw1 = upper_values[0] if len(upper_values) > 0 else ""
                    raw2 = upper_values[1] if len(upper_values) > 1 else ""
                    raw3 = upper_values[2] if len(upper_values) > 2 and upper_values[2].strip() else ""
                    raw4 = upper_values[3] if len(upper_values) > 3 else ""
                    throw3 = raw3 or raw4 or "-"
                    frames.append(FrameData(
                        throw1=raw1 or ("" if raw2.strip().upper() == "X" else "-"),
                        throw2=raw2 or ("" if throw3.strip().upper() == "X" else "-"),
                        throw3=throw3,
                        cumulative=cumulative,
                    ).model_dump())
                else:
                    raw1 = upper_values[0] if len(upper_values) > 0 else ""
                    raw2 = upper_values[1] if len(upper_values) > 1 else ""
                    frames.append(FrameData(
                        throw1=raw1 or ("" if raw2.strip().upper() == "X" else "-"),
                        throw2=raw2 or "-",
                        cumulative=cumulative,
                    ).model_dump())

            while len(frames) < 10:
                frames.append(FrameData().model_dump())

            players.append(PlayerData(name=name, frames=[FrameData(**f) for f in frames[:10]]).model_dump())

        return players, num_columns

    @staticmethod
    def prepare_image(file_bytes: bytes, manual_corners: list[ManualCorner]) -> np.ndarray:
        image = ImagePreprocessor.decode_image(file_bytes)
        expanded_points = ImagePreprocessor._expand_points(ImagePreprocessor._normalize_manual_points(image, manual_corners), image)
        corrected = ImagePreprocessor._four_point_transform(image, expanded_points)
        corrected = ImagePreprocessor._resize_processed_image(corrected)
        return ImagePreprocessor._build_bw_image(corrected)

    @staticmethod
    def encode_image_data_url(image: np.ndarray) -> str | None:
        success, buffer = cv2.imencode(".png", image)
        if not success:
            return None

        encoded = base64.b64encode(buffer.tobytes()).decode("ascii")
        return f"data:image/png;base64,{encoded}"
