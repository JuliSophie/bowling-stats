import base64

import cv2
import easyocr
import numpy as np
from app.schemas import ManualCorner

_reader: easyocr.Reader | None = None


def _get_reader() -> easyocr.Reader:
    global _reader
    if _reader is None:
        _reader = easyocr.Reader(["de", "en"], gpu=False)
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
    def _estimate_skew_angle(image: np.ndarray) -> float | None:
        foreground = cv2.bitwise_not(image)
        coordinates = np.column_stack(np.where(foreground > 0))
        if len(coordinates) < 10:
            return None

        angle = cv2.minAreaRect(coordinates)[-1]
        if angle < -45:
            angle = -(90 + angle)
        else:
            angle = -angle

        if abs(angle) < 0.25 or abs(angle) > 7.5:
            return None
        return float(angle)

    @staticmethod
    def _rotate_image(image: np.ndarray, angle: float, border_value: int = 255) -> np.ndarray:
        fill_value: int | tuple[int, int, int]
        if image.ndim == 3:
            fill_value = (border_value, border_value, border_value)
        else:
            fill_value = border_value

        height, width = image.shape[:2]
        center = (width // 2, height // 2)
        rotation = cv2.getRotationMatrix2D(center, angle, 1.0)
        return cv2.warpAffine(
            image,
            rotation,
            (width, height),
            flags=cv2.INTER_CUBIC,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=fill_value,
        )

    @staticmethod
    def _deskew_image(image: np.ndarray, border_value: int = 255) -> np.ndarray:
        angle = ImagePreprocessor._estimate_skew_angle(image)
        if angle is None:
            return image
        return ImagePreprocessor._rotate_image(image, angle, border_value=border_value)

    @staticmethod
    def _build_bw_image(corrected: np.ndarray) -> np.ndarray:
        grayscale = cv2.cvtColor(corrected, cv2.COLOR_BGR2GRAY)
        grayscale = cv2.normalize(grayscale, None, 0, 255, cv2.NORM_MINMAX)
        grayscale = ImagePreprocessor._deskew_image(grayscale, border_value=255)
        if float(np.mean(grayscale)) < 127:
            grayscale = cv2.bitwise_not(grayscale)
        return grayscale

    @staticmethod
    def _cluster_line_segments(
        segments: list[tuple[int, int, int, float]],
        tolerance: int,
        min_total_length: float,
        min_count: int = 1,
    ) -> list[tuple[int, int, int, float, int]]:
        if not segments:
            return []

        sorted_segments = sorted(segments, key=lambda item: item[0])
        clusters: list[dict[str, float | int]] = []

        for position, span_start, span_end, length in sorted_segments:
            if not clusters or abs(position - int(clusters[-1]["position"])) > tolerance:
                clusters.append(
                    {
                        "position": float(position),
                        "weight": float(length),
                        "span_start": int(span_start),
                        "span_end": int(span_end),
                        "count": 1,
                    }
                )
                continue

            cluster = clusters[-1]
            weight = float(cluster["weight"])
            cluster["position"] = ((float(cluster["position"]) * weight) + (position * length)) / (weight + length)
            cluster["weight"] = weight + length
            cluster["span_start"] = min(int(cluster["span_start"]), span_start)
            cluster["span_end"] = max(int(cluster["span_end"]), span_end)
            cluster["count"] = int(cluster["count"]) + 1

        canonical_lines: list[tuple[int, int, int, float, int]] = []
        for cluster in clusters:
            if float(cluster["weight"]) < min_total_length:
                continue
            if int(cluster["count"]) < min_count:
                continue
            canonical_lines.append(
                (
                    int(round(float(cluster["position"]))),
                    int(cluster["span_start"]),
                    int(cluster["span_end"]),
                    float(cluster["weight"]),
                    int(cluster["count"]),
                )
            )

        return canonical_lines

    @staticmethod
    def _prune_line_clusters(
        lines: list[tuple[int, int, int, float, int]],
        min_gap: int,
    ) -> list[tuple[int, int, int, float, int]]:
        if not lines:
            return []

        pruned: list[tuple[int, int, int, float, int]] = []
        for line in sorted(lines, key=lambda item: item[0]):
            if not pruned or abs(line[0] - pruned[-1][0]) > min_gap:
                pruned.append(line)
                continue

            previous = pruned[-1]
            previous_span = previous[2] - previous[1]
            current_span = line[2] - line[1]
            previous_score = previous[3] + (previous_span * 0.5) + (previous[4] * 8)
            current_score = line[3] + (current_span * 0.5) + (line[4] * 8)
            if current_score > previous_score:
                pruned[-1] = line

        return pruned

    @staticmethod
    def _detect_table_lines(
        bw_image: np.ndarray,
    ) -> tuple[list[tuple[int, int, int, float, int]], list[tuple[int, int, int, float, int]]]:
        height, width = bw_image.shape[:2]
        enhanced = cv2.createCLAHE(clipLimit=2.4, tileGridSize=(8, 8)).apply(bw_image)
        blurred = cv2.GaussianBlur(enhanced, (3, 3), 0)
        edges = cv2.Canny(blurred, 55, 155)
        edges = cv2.dilate(edges, np.ones((2, 2), dtype=np.uint8), iterations=1)

        horizontal_segments: list[tuple[int, int, int, float]] = []
        vertical_segments: list[tuple[int, int, int, float]] = []

        lines = cv2.HoughLinesP(
            edges,
            1,
            np.pi / 180,
            threshold=max(40, width // 28),
            minLineLength=max(50, width // 14),
            maxLineGap=max(5, width // 220),
        )

        if lines is not None:
            for line in lines[:, 0]:
                x1, y1, x2, y2 = (int(value) for value in line)
                delta_x = x2 - x1
                delta_y = y2 - y1
                length = float(np.hypot(delta_x, delta_y))
                if length < max(50, width * 0.06):
                    continue

                angle = abs(np.degrees(np.arctan2(delta_y, delta_x)))
                is_horizontal = angle <= 6 or angle >= 174
                is_vertical = 84 <= angle <= 96
                if not (is_horizontal or is_vertical):
                    continue

                if is_horizontal and length < width * 0.08:
                    continue
                if is_vertical and length < height * 0.08:
                    continue

                if is_horizontal:
                    horizontal_segments.append((int(round((y1 + y2) / 2)), min(x1, x2), max(x1, x2), length))
                if is_vertical:
                    vertical_segments.append((int(round((x1 + x2) / 2)), min(y1, y2), max(y1, y2), length))

        horizontal_lines = ImagePreprocessor._prune_line_clusters(
            ImagePreprocessor._cluster_line_segments(
                horizontal_segments,
                tolerance=max(8, height // 90),
                min_total_length=width * 0.18,
                min_count=1,
            ),
            min_gap=max(12, height // 60),
        )
        vertical_lines = ImagePreprocessor._prune_line_clusters(
            ImagePreprocessor._cluster_line_segments(
                vertical_segments,
                tolerance=max(8, width // 110),
                min_total_length=height * 0.16,
                min_count=1,
            ),
            min_gap=max(16, width // 75),
        )

        if horizontal_lines:
            avg_h_span = sum(line[2] - line[1] for line in horizontal_lines) / len(horizontal_lines)
            horizontal_lines = [line for line in horizontal_lines if (line[2] - line[1]) >= avg_h_span]

        if vertical_lines:
            avg_v_span = sum(line[2] - line[1] for line in vertical_lines) / len(vertical_lines)
            vertical_lines = [line for line in vertical_lines if (line[2] - line[1]) >= avg_v_span]

        sorted_h = sorted(horizontal_lines, key=lambda l: l[0])[:10]
        sorted_v = sorted(vertical_lines, key=lambda l: l[0])
        return sorted_h, sorted_v

    @staticmethod
    def build_edge_debug_image(bw_image: np.ndarray) -> np.ndarray:
        sorted_h, sorted_v = ImagePreprocessor._detect_table_lines(bw_image)
        overlay = cv2.cvtColor(bw_image, cv2.COLOR_GRAY2BGR)

        if sorted_h and sorted_v:
            left_bound = sorted_v[0][0]
            right_bound = sorted_v[-1][0]
            top_bound = sorted_h[0][0]
            bottom_bound = sorted_h[-1][0]

            if len(sorted_h) >= 2 and len(sorted_v) >= 2:
                header_top = sorted_h[0][0]
                header_bottom = sorted_h[1][0]
                name_left = sorted_v[0][0]
                name_right = sorted_v[1][0]

                region = overlay[header_top:header_bottom, left_bound:right_bound].copy()
                cv2.rectangle(region, (0, 0), (region.shape[1], region.shape[0]), (255, 180, 50), -1)
                cv2.addWeighted(region, 0.25, overlay[header_top:header_bottom, left_bound:right_bound], 0.75, 0, overlay[header_top:header_bottom, left_bound:right_bound])

                region = overlay[header_bottom:bottom_bound, name_left:name_right].copy()
                cv2.rectangle(region, (0, 0), (region.shape[1], region.shape[0]), (50, 180, 255), -1)
                cv2.addWeighted(region, 0.25, overlay[header_bottom:bottom_bound, name_left:name_right], 0.75, 0, overlay[header_bottom:bottom_bound, name_left:name_right])

                pink = (180, 105, 255)
                last_col_idx = len(sorted_v) - 2
                for row_idx in range(1, len(sorted_h) - 1):
                    cell_top = sorted_h[row_idx][0]
                    cell_bottom = sorted_h[row_idx + 1][0]
                    mid_y = (cell_top + cell_bottom) // 2
                    for col_idx in range(1, len(sorted_v) - 1):
                        cell_left = sorted_v[col_idx][0]
                        cell_right = sorted_v[col_idx + 1][0]
                        cv2.line(overlay, (cell_left, mid_y), (cell_right, mid_y), pink, 1, lineType=cv2.LINE_AA)
                        if col_idx == last_col_idx:
                            cell_w = cell_right - cell_left
                            for i in range(1, 4):
                                split_x = cell_left + (cell_w * i) // 4
                                cv2.line(overlay, (split_x, cell_top), (split_x, mid_y), pink, 1, lineType=cv2.LINE_AA)
                        else:
                            mid_x = (cell_left + cell_right) // 2
                            cv2.line(overlay, (mid_x, cell_top), (mid_x, mid_y), pink, 1, lineType=cv2.LINE_AA)

            for y_position, _, _, _, _ in sorted_h:
                cv2.line(overlay, (left_bound, y_position), (right_bound, y_position), (255, 120, 0), 2, lineType=cv2.LINE_AA)

            for x_position, _, _, _, _ in sorted_v:
                cv2.line(overlay, (x_position, top_bound), (x_position, bottom_bound), (255, 120, 0), 2, lineType=cv2.LINE_AA)

        elif sorted_h:
            for y_position, span_start, span_end, _, _ in sorted_h:
                cv2.line(overlay, (span_start, y_position), (span_end, y_position), (255, 120, 0), 2, lineType=cv2.LINE_AA)

        elif sorted_v:
            for x_position, span_start, span_end, _, _ in sorted_v:
                cv2.line(overlay, (x_position, span_start), (x_position, span_end), (255, 120, 0), 2, lineType=cv2.LINE_AA)

        return overlay

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
    def extract_table_data(bw_image: np.ndarray, bw_threshold: int | None = None) -> list[dict]:
        from app.schemas import FrameData, PlayerData

        sorted_h, sorted_v = ImagePreprocessor._detect_table_lines(bw_image)
        if len(sorted_h) < 3 or len(sorted_v) < 3:
            return []

        if bw_threshold is not None:
            ocr_img = cv2.threshold(bw_image, bw_threshold, 255, cv2.THRESH_BINARY)[1]
        else:
            ocr_img = bw_image

        throw_chars = "0123456789-xX"
        score_chars = "0123456789"
        m = 6

        last_col_idx = len(sorted_v) - 2
        players: list[dict] = []

        for row_idx in range(1, len(sorted_h) - 1):
            cell_top = sorted_h[row_idx][0]
            cell_bottom = sorted_h[row_idx + 1][0]

            if not ImagePreprocessor._has_content(ocr_img[cell_top + 5:cell_bottom - 5, sorted_v[0][0] + 5:sorted_v[1][0] - 5]):
                continue
            name_crop = ocr_img[cell_top + m:cell_bottom - m, sorted_v[0][0] + m:sorted_v[1][0] - m]
            name = ImagePreprocessor._ocr_crop(name_crop)

            frames: list[dict] = []
            for col_idx in range(1, len(sorted_v) - 1):
                cell_left = sorted_v[col_idx][0]
                cell_right = sorted_v[col_idx + 1][0]
                mid_y = (cell_top + cell_bottom) // 2

                cumulative_crop = ocr_img[mid_y + m:cell_bottom - m, cell_left + m:cell_right - m]
                cumulative = ImagePreprocessor._ocr_crop(cumulative_crop, allowlist=score_chars, skip_empty_check=True)

                def throw_or_miss(crop: np.ndarray) -> str:
                    return ImagePreprocessor._ocr_crop(crop, allowlist=throw_chars, skip_empty_check=True) or "-"

                if col_idx == last_col_idx:
                    cell_w = cell_right - cell_left
                    s0 = cell_left
                    s1 = cell_left + cell_w // 4
                    s2 = cell_left + (cell_w * 2) // 4
                    s3 = cell_left + (cell_w * 3) // 4
                    frames.append(FrameData(
                        throw1=throw_or_miss(ocr_img[cell_top + m:mid_y - m, s0 + m:s1 - m]),
                        throw2=throw_or_miss(ocr_img[cell_top + m:mid_y - m, s1 + m:s2 - m]),
                        throw3=throw_or_miss(ocr_img[cell_top + m:mid_y - m, s2 + m:s3 - m]),
                        cumulative=cumulative,
                    ).model_dump())
                else:
                    mid_x = (cell_left + cell_right) // 2
                    frames.append(FrameData(
                        throw1=throw_or_miss(ocr_img[cell_top + m:mid_y - m, cell_left + m:mid_x - m]),
                        throw2=throw_or_miss(ocr_img[cell_top + m:mid_y - m, mid_x + m:cell_right - m]),
                        cumulative=cumulative,
                    ).model_dump())

            while len(frames) < 10:
                frames.append(FrameData().model_dump())

            players.append(PlayerData(name=name, frames=[FrameData(**f) for f in frames[:10]]).model_dump())

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