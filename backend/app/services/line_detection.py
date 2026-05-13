import cv2
import numpy as np


def _cluster_positions(values: list[int], tolerance: int = 6) -> list[int]:
    if not values:
        return []

    sorted_values = sorted(values)
    clusters: list[list[int]] = [[sorted_values[0]]]
    for value in sorted_values[1:]:
        if value - clusters[-1][-1] <= tolerance:
            clusters[-1].append(value)
        else:
            clusters.append([value])

    return [int(round(float(np.mean(cluster)))) for cluster in clusters]


def _cluster_position_support(
    positions_with_support: list[tuple[int, int]],
    tolerance: int = 6,
) -> list[tuple[int, int]]:
    if not positions_with_support:
        return []

    sorted_values = sorted(positions_with_support, key=lambda item: item[0])
    clusters: list[list[tuple[int, int]]] = [[sorted_values[0]]]
    for position, support in sorted_values[1:]:
        if position - clusters[-1][-1][0] <= tolerance:
            clusters[-1].append((position, support))
        else:
            clusters.append([(position, support)])

    aggregated: list[tuple[int, int]] = []
    for cluster in clusters:
        total_support = sum(support for _, support in cluster)
        weighted_position = int(round(sum(position * support for position, support in cluster) / max(total_support, 1)))
        aggregated.append((weighted_position, total_support))
    return aggregated


def _prepare_foreground_mask(bw_image: np.ndarray) -> np.ndarray:
    blurred = cv2.GaussianBlur(bw_image, (3, 3), 0)
    _, thresholded = cv2.threshold(
        blurred,
        0,
        255,
        cv2.THRESH_BINARY + cv2.THRESH_OTSU,
    )
    return ((255 - thresholded) > 0).astype(np.uint8)


def _build_directional_mask(
    foreground: np.ndarray,
    kernels: list[tuple[int, int]],
    closing_kernel: tuple[int, int],
) -> np.ndarray:
    mask = np.zeros_like(foreground)
    for kernel_w, kernel_h in kernels:
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_w, kernel_h))
        opened = cv2.morphologyEx(foreground, cv2.MORPH_OPEN, kernel)
        mask = cv2.bitwise_or(mask, opened)

    if closing_kernel[0] > 1 or closing_kernel[1] > 1:
        mask = cv2.morphologyEx(
            mask,
            cv2.MORPH_CLOSE,
            cv2.getStructuringElement(cv2.MORPH_RECT, closing_kernel),
        )
    return mask


def _build_directional_masks(bw_image: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    height, width = bw_image.shape[:2]
    foreground = _prepare_foreground_mask(bw_image)
    horizontal_mask = _build_directional_mask(
        foreground,
        kernels=[
            (max(25, width // 30), 3),
            (max(45, width // 18), 3),
            (max(85, width // 10), 3),
        ],
        closing_kernel=(max(9, width // 180), 1),
    )
    vertical_mask = _build_directional_mask(
        foreground,
        kernels=[
            (3, max(25, height // 30)),
            (3, max(45, height // 18)),
            (3, max(85, height // 10)),
        ],
        closing_kernel=(1, max(9, height // 180)),
    )
    return horizontal_mask, vertical_mask


def _fit_component_segment(
    component_mask: np.ndarray,
    offset_x: int,
    offset_y: int,
) -> tuple[int, int, int, int] | None:
    ys, xs = np.where(component_mask > 0)
    if len(xs) < 2:
        return None

    points = np.column_stack((xs + offset_x, ys + offset_y)).astype(np.float32)
    vx, vy, x0, y0 = cv2.fitLine(points, cv2.DIST_L2, 0, 0.01, 0.01)
    direction = np.array([float(vx[0]), float(vy[0])], dtype=np.float32)
    norm = float(np.linalg.norm(direction))
    if norm == 0:
        return None
    direction /= norm

    origin = np.array([float(x0[0]), float(y0[0])], dtype=np.float32)
    projections = (points - origin) @ direction
    start = origin + direction * float(np.min(projections))
    end = origin + direction * float(np.max(projections))

    x1, y1 = int(round(float(start[0]))), int(round(float(start[1])))
    x2, y2 = int(round(float(end[0]))), int(round(float(end[1])))
    if (x1, y1) == (x2, y2):
        return None
    if x1 > x2 or (x1 == x2 and y1 > y2):
        x1, y1, x2, y2 = x2, y2, x1, y1
    return x1, y1, x2, y2


def _extract_horizontal_segments(
    horizontal_mask: np.ndarray,
    width: int,
    height: int,
) -> list[tuple[int, int, int, int]]:
    count, labels, stats, _ = cv2.connectedComponentsWithStats(horizontal_mask, connectivity=8)
    min_width = max(40, width // 14)
    max_thickness = max(12, height // 30)

    horizontal: list[tuple[int, int, int, int]] = []
    for idx in range(1, count):
        x, y, component_w, component_h, _ = stats[idx]
        if component_w < min_width:
            continue
        if component_h > max_thickness:
            continue
        if component_w / max(component_h, 1) < 8:
            continue

        component_mask = (labels[y:y + component_h, x:x + component_w] == idx).astype(np.uint8)
        segment = _fit_component_segment(component_mask, x, y)
        if segment is None:
            continue

        x1, y1, x2, y2 = segment
        if abs(y2 - y1) > max(8, abs(x2 - x1) // 20):
            continue
        horizontal.append(segment)

    return sorted(horizontal, key=lambda line: (min(line[1], line[3]), min(line[0], line[2])))


def _extract_vertical_segments(
    vertical_mask: np.ndarray,
    width: int,
    height: int,
) -> list[tuple[int, int, int, int]]:
    support_by_x = vertical_mask.sum(axis=0)
    min_support = max(60, int(height * 0.18))
    candidate_columns = np.where(support_by_x >= min_support)[0].tolist()
    x_positions = _cluster_positions(candidate_columns, tolerance=max(4, width // 300))

    band_half_width = max(3, width // 220)
    min_length = max(30, height // 28)
    max_gap = max(4, height // 220)

    vertical: list[tuple[int, int, int, int]] = []
    for x in x_positions:
        left = max(0, x - band_half_width)
        right = min(width, x + band_half_width + 1)
        band = vertical_mask[:, left:right]
        occupied = np.any(band > 0, axis=1)

        start: int | None = None
        gap = 0
        for y, is_occupied in enumerate(occupied.tolist()):
            if is_occupied:
                if start is None:
                    start = y
                gap = 0
                continue

            if start is None:
                continue

            gap += 1
            if gap <= max_gap:
                continue

            end = y - gap
            if end - start + 1 >= min_length:
                vertical.append((x, start, x, end))
            start = None
            gap = 0

        if start is not None:
            end = len(occupied) - 1
            if end - start + 1 >= min_length:
                vertical.append((x, start, x, end))

    return sorted(vertical, key=lambda line: (min(line[0], line[2]), min(line[1], line[3])))


def _extract_structural_horizontal_lines(
    horizontal_mask: np.ndarray,
    width: int,
    height: int,
) -> list[tuple[int, int, int, int]]:
    count, labels, stats, _ = cv2.connectedComponentsWithStats(horizontal_mask, connectivity=8)
    min_width = max(200, int(width * 0.55))
    max_thickness = max(90, height // 12)

    structural: list[tuple[int, int, int, int]] = []
    for idx in range(1, count):
        x, y, component_w, component_h, _ = stats[idx]
        if component_w < min_width:
            continue
        if component_h > max_thickness:
            continue
        if component_w / max(component_h, 1) < 6:
            continue

        component_mask = (labels[y:y + component_h, x:x + component_w] == idx).astype(np.uint8)
        segment = _fit_component_segment(component_mask, x, y)
        if segment is None:
            continue

        x1, y1, x2, y2 = segment
        if abs(y2 - y1) > max(12, abs(x2 - x1) // 18):
            continue
        structural.append(segment)

    return sorted(structural, key=lambda line: (line[1] + line[3]) / 2.0)


def _extract_structural_vertical_lines(
    vertical_mask: np.ndarray,
    width: int,
    height: int,
) -> list[tuple[int, int, int, int]]:
    count, labels, stats, _ = cv2.connectedComponentsWithStats(vertical_mask, connectivity=8)
    min_height = max(200, int(height * 0.65))
    max_width = max(25, width // 40)

    structural: list[tuple[int, int, int, int]] = []
    for idx in range(1, count):
        x, y, component_w, component_h, _ = stats[idx]
        if component_h < min_height:
            continue
        if component_w > max_width:
            continue
        if component_h / max(component_w, 1) < 8:
            continue

        component_mask = (labels[y:y + component_h, x:x + component_w] == idx).astype(np.uint8)
        segment = _fit_component_segment(component_mask, x, y)
        if segment is None:
            continue

        x1, y1, x2, y2 = segment
        if abs(x2 - x1) > max(10, abs(y2 - y1) // 18):
            continue
        if y1 > y2:
            segment = (x2, y2, x1, y1)
        structural.append(segment)

    return sorted(structural, key=lambda line: (line[0] + line[2]) / 2.0)


def _segment_to_line_coefficients(segment: tuple[int, int, int, int]) -> np.ndarray:
    x1, y1, x2, y2 = (float(value) for value in segment)
    return np.array([y1 - y2, x2 - x1, x1 * y2 - x2 * y1], dtype=np.float64)


def _intersect_lines(line_a: np.ndarray, line_b: np.ndarray) -> np.ndarray | None:
    cross = np.cross(line_a, line_b)
    if abs(float(cross[2])) < 1e-6:
        return None
    return (cross[:2] / cross[2]).astype(np.float32)


def _order_quad(points: np.ndarray) -> np.ndarray:
    ordered = np.zeros((4, 2), dtype=np.float32)
    point_sums = points.sum(axis=1)
    point_diffs = np.diff(points, axis=1).reshape(-1)
    ordered[0] = points[np.argmin(point_sums)]
    ordered[2] = points[np.argmax(point_sums)]
    ordered[1] = points[np.argmin(point_diffs)]
    ordered[3] = points[np.argmax(point_diffs)]
    return ordered


def _estimate_table_corners(bw_image: np.ndarray) -> np.ndarray | None:
    height, width = bw_image.shape[:2]
    horizontal_mask, vertical_mask = _build_directional_masks(bw_image)
    horizontal = _extract_structural_horizontal_lines(horizontal_mask, width, height)
    vertical = _extract_structural_vertical_lines(vertical_mask, width, height)
    if len(horizontal) < 2 or len(vertical) < 2:
        return None

    top = min(horizontal, key=lambda line: (line[1] + line[3]) / 2.0)
    bottom = max(horizontal, key=lambda line: (line[1] + line[3]) / 2.0)
    left = min(vertical, key=lambda line: (line[0] + line[2]) / 2.0)
    right = max(vertical, key=lambda line: (line[0] + line[2]) / 2.0)

    top_line = _segment_to_line_coefficients(top)
    bottom_line = _segment_to_line_coefficients(bottom)
    left_line = _segment_to_line_coefficients(left)
    right_line = _segment_to_line_coefficients(right)

    intersections = [
        _intersect_lines(top_line, left_line),
        _intersect_lines(top_line, right_line),
        _intersect_lines(bottom_line, right_line),
        _intersect_lines(bottom_line, left_line),
    ]
    if any(point is None for point in intersections):
        return None

    corners = _order_quad(np.asarray(intersections, dtype=np.float32))
    if np.any(corners[:, 0] < -width * 0.1) or np.any(corners[:, 0] > width * 1.1):
        return None
    if np.any(corners[:, 1] < -height * 0.1) or np.any(corners[:, 1] > height * 1.1):
        return None
    return corners


def rectify_table_image(bw_image: np.ndarray) -> tuple[np.ndarray, np.ndarray | None]:
    corners = _estimate_table_corners(bw_image)
    if corners is None:
        return bw_image, None

    return _warp_image_to_table(bw_image, corners), corners


def _warp_image_to_table(bw_image: np.ndarray, corners: np.ndarray) -> np.ndarray:
    corners = corners.astype(np.float32)

    width_top = float(np.linalg.norm(corners[1] - corners[0]))
    width_bottom = float(np.linalg.norm(corners[2] - corners[3]))
    height_left = float(np.linalg.norm(corners[3] - corners[0]))
    height_right = float(np.linalg.norm(corners[2] - corners[1]))

    output_width = max(50, int(round(max(width_top, width_bottom))))
    output_height = max(50, int(round(max(height_left, height_right))))
    destination = np.array(
        [
            [0, 0],
            [output_width - 1, 0],
            [output_width - 1, output_height - 1],
            [0, output_height - 1],
        ],
        dtype=np.float32,
    )

    transform = cv2.getPerspectiveTransform(corners, destination)
    rectified = cv2.warpPerspective(
        bw_image,
        transform,
        (output_width, output_height),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=255,
    )
    return rectified


def detect_lines(
    bw_image: np.ndarray,
) -> tuple[list[tuple[int, int, int, int]], list[tuple[int, int, int, int]]]:
    height, width = bw_image.shape[:2]

    horizontal_mask, vertical_mask = _build_directional_masks(bw_image)

    horizontal = _extract_horizontal_segments(horizontal_mask, width, height)
    vertical = _extract_vertical_segments(vertical_mask, width, height)
    return horizontal, vertical


def infer_grid(
    horizontal: list[tuple[int, int, int, int]],
    vertical: list[tuple[int, int, int, int]],
) -> tuple[list[int], list[int]]:
    if len(horizontal) < 2 or len(vertical) < 2:
        return [], []

    horizontal_support = _cluster_position_support(
        [
            (int(round((line[1] + line[3]) / 2)), abs(line[2] - line[0]) + 1)
            for line in horizontal
        ],
        tolerance=8,
    )
    if len(horizontal_support) < 2:
        return [], []

    max_horizontal_support = max(support for _, support in horizontal_support)
    y_positions = [
        position
        for position, support in horizontal_support
        if support >= max(80, int(round(max_horizontal_support * 0.8)))
    ]
    if len(y_positions) < 2:
        y_positions = [position for position, _ in horizontal_support]
    y_positions = sorted(y_positions)
    if len(y_positions) < 2:
        return [], []

    top, bottom = y_positions[0], y_positions[-1]
    table_h = bottom - top
    if table_h < 50:
        return y_positions, []

    vertical_support = _cluster_position_support(
        [
            (int(round((line[0] + line[2]) / 2)), abs(line[3] - line[1]) + 1)
            for line in vertical
        ],
        tolerance=8,
    )
    if len(vertical_support) < 2:
        return y_positions, []

    max_vertical_support = max(support for _, support in vertical_support)
    min_major_support = max(int(round(table_h * 0.75)), int(round(max_vertical_support * 0.78)))
    x_positions = [
        position
        for position, support in vertical_support
        if support >= min_major_support
    ]
    if len(x_positions) < 2:
        x_positions = [position for position, _ in vertical_support]

    x_positions = sorted(x_positions)
    return y_positions, x_positions


def _split_span(left: int, right: int, segments: int) -> list[int]:
    if segments <= 1:
        return [left, right]
    return [int(round(left + ((right - left) * idx) / segments)) for idx in range(segments + 1)]


def _infer_row_splits(
    horizontal: list[tuple[int, int, int, int]],
    y_positions: list[int],
    scoring_left: int,
    scoring_right: int,
) -> list[int | None]:
    if len(y_positions) < 2:
        return []

    scoring_width = scoring_right - scoring_left
    left_tolerance = max(12, scoring_width // 30)
    min_span = max(80, int(scoring_width * 0.55))
    row_splits: list[int | None] = []

    for row_idx in range(len(y_positions) - 1):
        top = y_positions[row_idx]
        bottom = y_positions[row_idx + 1]
        if row_idx == 0:
            row_splits.append(None)
            continue

        target_y = top + int(round((bottom - top) * 0.52))
        candidates: list[tuple[float, int, int]] = []
        for x1, y1, x2, y2 in horizontal:
            mid_y = int(round((y1 + y2) / 2))
            start_x = min(x1, x2)
            end_x = max(x1, x2)
            span = end_x - start_x

            if mid_y <= top + 6 or mid_y >= bottom - 6:
                continue
            if start_x < scoring_left - left_tolerance or start_x > scoring_left + left_tolerance:
                continue
            if end_x < scoring_right - left_tolerance:
                continue
            if span < min_span:
                continue

            candidates.append((abs(mid_y - target_y), -span, mid_y))

        if candidates:
            candidates.sort()
            row_splits.append(int(candidates[0][2]))
        else:
            row_splits.append(int(round((top + bottom) / 2)))

    return row_splits


def build_table_layout(
    horizontal: list[tuple[int, int, int, int]],
    vertical: list[tuple[int, int, int, int]],
) -> tuple[list[int], list[int], list[int | None]]:
    y_positions, x_positions = infer_grid(horizontal, vertical)
    if len(y_positions) < 2 or len(x_positions) < 2:
        return y_positions, x_positions, []

    scoring_left = x_positions[1] if len(x_positions) > 1 else x_positions[0]
    scoring_right = x_positions[-1]
    row_splits = _infer_row_splits(horizontal, y_positions, scoring_left, scoring_right)
    return y_positions, x_positions, row_splits


def build_lines_debug_image(bw_image: np.ndarray, bw_threshold: int | None = None) -> np.ndarray:
    _, _, _, overlay = build_debug_stage_images(bw_image, bw_threshold=bw_threshold)
    return overlay


def build_debug_stage_images(
    bw_image: np.ndarray,
    bw_threshold: int | None = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    _ = bw_threshold
    line_source = bw_image

    rectified_bw, corners = rectify_table_image(bw_image)
    rectified_line_source = _warp_image_to_table(line_source, corners) if corners is not None else line_source

    horizontal_mask, vertical_mask = _build_directional_masks(rectified_line_source)
    horizontal, vertical = detect_lines(rectified_line_source)
    y_grid, x_grid, row_splits = build_table_layout(horizontal, vertical)
    overlay = cv2.cvtColor(rectified_line_source, cv2.COLOR_GRAY2BGR)
    has_enough_columns = len(x_grid) >= 12
    detected_line_color = (0, 0, 220) if not has_enough_columns else None

    if y_grid and x_grid:
        left, right = x_grid[0], x_grid[-1]
        top, bottom = y_grid[0], y_grid[-1]

        for y in y_grid:
            cv2.line(overlay, (left, y), (right, y), (0, 180, 0), 2, lineType=cv2.LINE_AA)
        for x in x_grid:
            cv2.line(overlay, (x, top), (x, bottom), (0, 180, 0), 2, lineType=cv2.LINE_AA)

        if len(x_grid) >= 3 and len(row_splits) == len(y_grid) - 1:
            scoring_left = x_grid[1]
            frame_count = len(x_grid) - 2
            for row_idx in range(1, len(y_grid) - 1):
                split_y = row_splits[row_idx]
                if split_y is None:
                    continue
                row_top = y_grid[row_idx]

                for frame_idx in range(frame_count):
                    frame_left = x_grid[frame_idx + 1]
                    frame_right = x_grid[frame_idx + 2]
                    segment_count = 4 if frame_idx == frame_count - 1 else 2
                    bounds = _split_span(frame_left, frame_right, segment_count)
                    for boundary in bounds[1:-1]:
                        cv2.line(overlay, (boundary, row_top), (boundary, split_y), (255, 80, 0), 2, lineType=cv2.LINE_AA)

    for x1, y1, x2, y2 in horizontal:
        cv2.line(
            overlay,
            (x1, y1),
            (x2, y2),
            detected_line_color or (0, 200, 200),
            1,
            lineType=cv2.LINE_AA,
        )
    for x1, y1, x2, y2 in vertical:
        cv2.line(
            overlay,
            (x1, y1),
            (x2, y2),
            detected_line_color or (0, 80, 220),
            1,
            lineType=cv2.LINE_AA,
        )

    rectified = "Y" if corners is not None else "N"
    status_color = (0, 0, 220) if not has_enough_columns else (0, 180, 0)
    cv2.putText(
        overlay,
        f"H: {len(horizontal)}  V: {len(vertical)}  Grid: {len(y_grid)}x{len(x_grid)}  R: {rectified}",
        (10, 30),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        status_color,
        2,
    )
    if not has_enough_columns:
        cv2.putText(
            overlay,
            "Zu wenig Hauptspalten erkannt",
            (10, 58),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0, 0, 220),
            2,
        )

    return rectified_bw, horizontal_mask * 255, vertical_mask * 255, overlay
