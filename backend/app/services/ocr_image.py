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
    def _ocr_crop(
        image: np.ndarray,
        allowlist: str = "",
        skip_empty_check: bool = False,
        content_threshold: float = 0.03,
    ) -> str:
        if image.size == 0 or image.shape[0] < 3 or image.shape[1] < 3:
            return ""
        if not skip_empty_check and not ImagePreprocessor._has_content(image, threshold=content_threshold):
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
    def extract_from_grid(
        rectified_bw: np.ndarray,
        bw_threshold: int,
        sub_cells: list[dict],
    ) -> list[dict]:
        from app.schemas import FrameData, PlayerData

        _, ocr_img = cv2.threshold(rectified_bw, bw_threshold, 255, cv2.THRESH_BINARY)
        img_h, img_w = ocr_img.shape[:2]
        grid: dict[tuple[int, int], dict[int, dict]] = {}
        for cell in sub_cells:
            key = (cell["row"], cell["col"])
            if key not in grid:
                grid[key] = {}
            grid[key][cell["sub_index"]] = cell

        rows = sorted({r for r, _ in grid})
        cols = sorted({c for _, c in grid})
        if not rows or not cols:
            return []

        frame_cols = [c for c in cols if c > 0]
        throw_chars = "0123456789-xX"
        score_chars = "0123456789"

        def crop(cell: dict) -> np.ndarray:
            cx = int(cell["x"] * img_w)
            cy = int(cell["y"] * img_h)
            cr = int((cell["x"] + cell["w"]) * img_w)
            cb = int((cell["y"] + cell["h"]) * img_h)
            pad_x = max(3, int((cr - cx) * 0.08))
            pad_y = max(3, int((cb - cy) * 0.08))
            x, y = max(0, cx + pad_x), max(0, cy + pad_y)
            r, b = min(img_w, cr - pad_x), min(img_h, cb - pad_y)
            if r <= x or b <= y:
                return ocr_img[0:0, 0:0]
            return ocr_img[y:b, x:r]

        players: list[dict] = []
        for row in rows:
            if row == 0:
                continue

            name_cell = grid.get((row, 0), {}).get(0)
            if not name_cell:
                continue
            name_crop = crop(name_cell)
            if not ImagePreprocessor._has_content(name_crop, threshold=0.02):
                continue
            raw_name = ImagePreprocessor._ocr_crop(name_crop)
            name = "" if raw_name and raw_name[-1].isdigit() else raw_name

            frames: list[dict] = []
            for col in frame_cols:
                col_cells = grid.get((row, col), {})
                is_last = col == max(frame_cols)
                sub_count = 4 if is_last else 2

                throws = []
                for si in range(sub_count):
                    sc = col_cells.get(si)
                    if sc:
                        cr = crop(sc)
                        if ImagePreprocessor._has_content(cr, threshold=0.01):
                            throws.append(ImagePreprocessor._ocr_crop(cr, allowlist=throw_chars, content_threshold=0.01))
                        else:
                            throws.append("")
                    else:
                        throws.append("")

                cum_cell = col_cells.get(sub_count)
                cum = ""
                if cum_cell:
                    cr = crop(cum_cell)
                    if ImagePreprocessor._has_content(cr, threshold=0.012):
                        cum = ImagePreprocessor._ocr_crop(cr, allowlist=score_chars, content_threshold=0.012)

                if is_last:
                    frames.append(FrameData(
                        throw1=throws[0] or "-",
                        throw2=throws[1] or "-",
                        throw3=throws[2] if len(throws) > 2 else "-",
                        cumulative=cum,
                    ).model_dump())
                else:
                    frames.append(FrameData(
                        throw1=throws[0] or "-",
                        throw2=throws[1] or "-",
                        cumulative=cum,
                    ).model_dump())

            while len(frames) < 10:
                frames.append(FrameData().model_dump())

            players.append(PlayerData(
                name=name,
                frames=[FrameData(**f) for f in frames[:10]],
            ).model_dump())

        return players

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
