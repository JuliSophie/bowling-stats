import cv2
import numpy as np


def _prepare_foreground_mask(bw_image: np.ndarray) -> np.ndarray:
    blurred = cv2.GaussianBlur(bw_image, (3, 3), 0)
    _, thresholded = cv2.threshold(
        blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU,
    )
    return ((255 - thresholded) > 0).astype(np.uint8)


def _build_directional_mask(
    foreground: np.ndarray,
    kernels: list[tuple[int, int]],
    closing_kernel: tuple[int, int],
) -> np.ndarray:
    mask = np.zeros_like(foreground)
    for kw, kh in kernels:
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kw, kh))
        opened = cv2.morphologyEx(foreground, cv2.MORPH_OPEN, kernel)
        mask = cv2.bitwise_or(mask, opened)
    if closing_kernel[0] > 1 or closing_kernel[1] > 1:
        mask = cv2.morphologyEx(
            mask, cv2.MORPH_CLOSE,
            cv2.getStructuringElement(cv2.MORPH_RECT, closing_kernel),
        )
    return mask


def build_directional_masks(bw_image: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    h, w = bw_image.shape[:2]
    fg = _prepare_foreground_mask(bw_image)
    h_mask = _build_directional_mask(
        fg,
        kernels=[(max(25, w // 30), 3), (max(45, w // 18), 3), (max(85, w // 10), 3)],
        closing_kernel=(max(9, w // 180), 1),
    )
    v_mask = _build_directional_mask(
        fg,
        kernels=[(3, max(25, h // 30)), (3, max(45, h // 18)), (3, max(85, h // 10))],
        closing_kernel=(1, max(9, h // 180)),
    )
    return h_mask, v_mask


def _fit_line_to_points(points: np.ndarray) -> tuple[float, float, float, float] | None:
    if len(points) < 2:
        return None
    pts = points.astype(np.float32)
    vx, vy, x0, y0 = cv2.fitLine(pts, cv2.DIST_L2, 0, 0.01, 0.01)
    d = np.array([float(vx[0]), float(vy[0])], dtype=np.float32)
    n = float(np.linalg.norm(d))
    if n == 0:
        return None
    d /= n
    o = np.array([float(x0[0]), float(y0[0])], dtype=np.float32)
    proj = (pts - o) @ d
    start = o + d * float(np.min(proj))
    end = o + d * float(np.max(proj))
    return (float(start[0]), float(start[1]), float(end[0]), float(end[1]))


def _extend_h_to_bounds(
    seg: tuple[float, float, float, float], width: int,
) -> tuple[float, float, float, float]:
    x1, y1, x2, y2 = seg
    dx = x2 - x1
    if abs(dx) < 1e-6:
        mid_y = (y1 + y2) / 2
        return (0.0, mid_y, float(width), mid_y)
    slope = (y2 - y1) / dx
    return (0.0, float(y1 - slope * x1), float(width), float(y1 + slope * (width - x1)))


def _extend_v_to_bounds(
    seg: tuple[float, float, float, float], height: int,
) -> tuple[float, float, float, float]:
    x1, y1, x2, y2 = seg
    dy = y2 - y1
    if abs(dy) < 1e-6:
        mid_x = (x1 + x2) / 2
        return (mid_x, 0.0, mid_x, float(height))
    slope = (x2 - x1) / dy
    return (float(x1 - slope * y1), 0.0, float(x1 + slope * (height - y1)), float(height))


def extract_horizontal_candidates(
    h_mask: np.ndarray, width: int, height: int,
) -> list[tuple[float, float, float, float]]:
    count, labels, stats, _ = cv2.connectedComponentsWithStats(h_mask, connectivity=8)
    min_w = int(width * 0.8)
    min_row_span = int(width * 0.5)
    max_h = max(15, height // 25)

    candidates: list[tuple[float, float, float, float]] = []
    for idx in range(1, count):
        x, y, cw, ch, _ = stats[idx]
        if cw < min_w:
            continue

        comp = (labels[y : y + ch, x : x + cw] == idx).astype(np.uint8)
        ys_all, xs_all = np.where(comp > 0)
        if len(ys_all) < 5:
            continue

        col_thickness = comp.sum(axis=0)
        active = col_thickness[col_thickness > 0]
        if len(active) == 0:
            continue
        median_thick = float(np.median(active))
        max_col = max(median_thick * 3, max_h)

        cleaned = comp.copy()
        cleaned[:, col_thickness > max_col] = 0

        ys_c, xs_c = np.where(cleaned > 0)
        if len(ys_c) < 5:
            continue

        row_min = np.full(ch, cw, dtype=np.int32)
        row_max = np.full(ch, -1, dtype=np.int32)
        np.minimum.at(row_min, ys_c, xs_c)
        np.maximum.at(row_max, ys_c, xs_c)
        row_span = row_max - row_min + 1
        wide = row_span >= min_row_span

        bands: list[list[int]] = []
        current: list[int] = []
        gap = 0
        for i in range(ch):
            if wide[i]:
                if current and gap > 3:
                    bands.append(current)
                    current = []
                current.append(i)
                gap = 0
            elif current:
                gap += 1
        if current:
            bands.append(current)

        for band in bands:
            lo, hi = min(band), max(band)
            orig_band = (ys_all >= lo) & (ys_all <= hi)
            if orig_band.sum() < 5:
                continue
            total_extent = float(np.max(xs_all[orig_band]) - np.min(xs_all[orig_band]))
            if total_extent < cw * 0.7:
                continue
            row_mask = (ys_c >= lo) & (ys_c <= hi)
            if row_mask.sum() < 5:
                continue
            seg = _fit_line_to_points(np.column_stack((xs_c[row_mask] + x, ys_c[row_mask] + y)))
            if seg is None:
                continue
            x1, y1, x2, y2 = seg
            if abs(y2 - y1) > max(20, abs(x2 - x1) // 8):
                continue
            candidates.append(_extend_h_to_bounds(seg, width))

    return sorted(candidates, key=lambda s: (s[1] + s[3]) / 2)


def extract_vertical_candidates(
    v_mask: np.ndarray, width: int, height: int,
) -> list[tuple[float, float, float, float]]:
    support = v_mask.sum(axis=0)
    min_sup = max(20, int(height * 0.05))
    cols = np.where(support >= min_sup)[0].tolist()
    if not cols:
        return []

    tol = max(4, width // 250)
    clusters: list[list[int]] = [[cols[0]]]
    for c in cols[1:]:
        if c - clusters[-1][-1] <= tol:
            clusters[-1].append(c)
        else:
            clusters.append([c])

    band_hw = max(4, width // 180)
    max_row_w = max(10, width // 50)
    candidates: list[tuple[float, float, float, float]] = []
    for cluster in clusters:
        cx = int(round(float(np.mean(cluster))))
        left = max(0, cx - band_hw)
        right = min(width, cx + band_hw + 1)
        band = v_mask[:, left:right]
        ys, xs = np.where(band > 0)
        if len(ys) < 8:
            continue

        row_thickness = band.sum(axis=1)
        active_rows = row_thickness[row_thickness > 0]
        if len(active_rows) == 0:
            continue
        median_row = float(np.median(active_rows))
        if median_row > max_row_w:
            continue
        max_row = max(median_row * 3, max_row_w)
        good_rows = row_thickness <= max_row
        mask = good_rows[ys]
        ys, xs = ys[mask], xs[mask]
        if len(ys) < 8:
            continue

        y_span = float(np.max(ys) - np.min(ys))
        if y_span < height * 0.7:
            continue
        filled_rows = len(np.unique(ys))
        if filled_rows / (y_span + 1) < 0.8:
            continue
        seg = _fit_line_to_points(np.column_stack((xs + left, ys)))
        if seg is None:
            continue
        x1, y1, x2, y2 = seg
        if y1 > y2:
            x1, y1, x2, y2 = x2, y2, x1, y1
        if abs(x2 - x1) > max(20, abs(y2 - y1) // 8):
            continue
        candidates.append(_extend_v_to_bounds((x1, y1, x2, y2), height))

    return sorted(candidates, key=lambda s: (s[0] + s[2]) / 2)


def normalize_segments(
    segments: list[tuple[float, float, float, float]], width: int, height: int,
) -> list[tuple[float, float, float, float]]:
    return [(x1 / width, y1 / height, x2 / width, y2 / height) for x1, y1, x2, y2 in segments]


def denormalize_segments(
    segments: list[tuple[float, float, float, float]], width: int, height: int,
) -> list[tuple[float, float, float, float]]:
    return [(x1 * width, y1 * height, x2 * width, y2 * height) for x1, y1, x2, y2 in segments]


def _line_eq(seg: tuple[float, float, float, float]) -> np.ndarray:
    x1, y1, x2, y2 = seg
    return np.array([y1 - y2, x2 - x1, x1 * y2 - x2 * y1], dtype=np.float64)


def _intersect(l1: np.ndarray, l2: np.ndarray) -> tuple[float, float] | None:
    c = np.cross(l1, l2)
    if abs(float(c[2])) < 1e-6:
        return None
    return (float(c[0] / c[2]), float(c[1] / c[2]))


def compute_table_corners(
    h_lines: list[tuple[float, float, float, float]],
    v_lines: list[tuple[float, float, float, float]],
) -> np.ndarray | None:
    if len(h_lines) < 2 or len(v_lines) < 2:
        return None

    top = min(h_lines, key=lambda s: (s[1] + s[3]) / 2)
    bottom = max(h_lines, key=lambda s: (s[1] + s[3]) / 2)
    left = min(v_lines, key=lambda s: (s[0] + s[2]) / 2)
    right = max(v_lines, key=lambda s: (s[0] + s[2]) / 2)

    tl = _intersect(_line_eq(top), _line_eq(left))
    tr = _intersect(_line_eq(top), _line_eq(right))
    br = _intersect(_line_eq(bottom), _line_eq(right))
    bl = _intersect(_line_eq(bottom), _line_eq(left))

    if any(p is None for p in [tl, tr, br, bl]):
        return None
    return np.array([tl, tr, br, bl], dtype=np.float32)


def rectify_table(
    bw_image: np.ndarray, table_corners: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    corners = table_corners.astype(np.float32)
    w_top = float(np.linalg.norm(corners[1] - corners[0]))
    w_bot = float(np.linalg.norm(corners[2] - corners[3]))
    h_left = float(np.linalg.norm(corners[3] - corners[0]))
    h_right = float(np.linalg.norm(corners[2] - corners[1]))

    out_w = max(50, int(round(max(w_top, w_bot))))
    out_h = max(50, int(round(max(h_left, h_right))))
    dst = np.array(
        [[0, 0], [out_w - 1, 0], [out_w - 1, out_h - 1], [0, out_h - 1]],
        dtype=np.float32,
    )

    M = cv2.getPerspectiveTransform(corners, dst)
    rectified = cv2.warpPerspective(
        bw_image, M, (out_w, out_h),
        flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=255,
    )
    return rectified, M


def transform_lines_to_rectified(
    h_lines: list[tuple[float, float, float, float]],
    v_lines: list[tuple[float, float, float, float]],
    M: np.ndarray,
) -> tuple[list[float], list[float]]:
    rect_h: list[float] = []
    for seg in h_lines:
        pts = np.array([[seg[0], seg[1]], [seg[2], seg[3]]], dtype=np.float32).reshape(-1, 1, 2)
        t = cv2.perspectiveTransform(pts, M).reshape(-1, 2)
        rect_h.append(float((t[0][1] + t[1][1]) / 2))

    rect_v: list[float] = []
    for seg in v_lines:
        pts = np.array([[seg[0], seg[1]], [seg[2], seg[3]]], dtype=np.float32).reshape(-1, 1, 2)
        t = cv2.perspectiveTransform(pts, M).reshape(-1, 2)
        rect_v.append(float((t[0][0] + t[1][0]) / 2))

    return sorted(rect_h), sorted(rect_v)


def compute_subcells(
    y_positions: list[float],
    x_positions: list[float],
    rect_w: int,
    rect_h: int,
) -> list[dict]:
    if len(y_positions) < 2 or len(x_positions) < 2:
        return []

    num_rows = len(y_positions) - 1
    num_cols = len(x_positions) - 1
    cells: list[dict] = []

    for row in range(num_rows):
        top = y_positions[row]
        bot = y_positions[row + 1]
        mid = (top + bot) / 2

        for col in range(num_cols):
            left = x_positions[col]
            right = x_positions[col + 1]

            if row == 0 or col == 0:
                cells.append({
                    "row": row, "col": col, "sub_index": 0,
                    "x": left / rect_w, "y": top / rect_h,
                    "w": (right - left) / rect_w, "h": (bot - top) / rect_h,
                })
                continue

            is_last = col == num_cols - 1
            sub_count = 4 if is_last else 2
            sub_w = (right - left) / sub_count

            for si in range(sub_count):
                sl = left + si * sub_w
                cells.append({
                    "row": row, "col": col, "sub_index": si,
                    "x": sl / rect_w, "y": top / rect_h,
                    "w": sub_w / rect_w, "h": (mid - top) / rect_h,
                })

            cells.append({
                "row": row, "col": col, "sub_index": sub_count,
                "x": left / rect_w, "y": mid / rect_h,
                "w": (right - left) / rect_w, "h": (bot - mid) / rect_h,
            })

    return cells
