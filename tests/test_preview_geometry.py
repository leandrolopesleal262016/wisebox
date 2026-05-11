from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Joinery:
    kind: str
    depth: float
    edge_inset: float
    pitch: float


def build_joinery(thickness: float, kerf: float) -> Joinery:
    depth = min(max(thickness * 0.96, 0.05), 0.26)
    edge_inset = max(depth * 0.26, 0.01)
    pitch = max(thickness * 3.4 + kerf * 0.04, 0.24)
    return Joinery(kind="finger", depth=depth, edge_inset=edge_inset, pitch=pitch)


def axis_vector(side: str) -> tuple[float, float]:
    return {
        "top": (1.0, 0.0),
        "right": (0.0, -1.0),
        "bottom": (-1.0, 0.0),
        "left": (0.0, 1.0),
    }[side]


def normal_vector(side: str) -> tuple[float, float]:
    return {
        "top": (0.0, 1.0),
        "right": (1.0, 0.0),
        "bottom": (0.0, -1.0),
        "left": (-1.0, 0.0),
    }[side]


def count_joinery_segments(length: float, pitch: float) -> int:
    count = max(3, round(length / pitch))
    return count + 1 if count % 2 == 0 else count


def dedupe_path(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    result: list[tuple[float, float]] = []
    for point in points:
        if not result or not same_point(result[-1], point):
            result.append(point)
    return result


def build_edge_points(
    start: tuple[float, float],
    side: str,
    length: float,
    role: str,
    joinery: Joinery,
) -> list[tuple[float, float]]:
    axis_x, axis_y = axis_vector(side)
    normal_x, normal_y = normal_vector(side)
    if joinery.kind == "plain" or role == "plain":
        return [(start[0] + axis_x * length, start[1] + axis_y * length)]

    inset = min(joinery.edge_inset, length / 4)
    inner_length = length - inset * 2
    if inner_length <= 0:
        return [(start[0] + axis_x * length, start[1] + axis_y * length)]

    teeth = count_joinery_segments(inner_length, joinery.pitch)
    span = inner_length / teeth
    edge_start = (start[0] + axis_x * inset, start[1] + axis_y * inset)
    edge_end = (start[0] + axis_x * length, start[1] + axis_y * length)
    segments: list[tuple[float, float]] = []

    if not same_point(edge_start, start):
        segments.append(edge_start)

    cursor = edge_start
    starts_with_cut = side in {"right", "left"}

    for index in range(teeth):
        next_point = (
            edge_start[0] + axis_x * span * (index + 1),
            edge_start[1] + axis_y * span * (index + 1),
        )
        if role == "female":
            cut_in = index % 2 == 0 if starts_with_cut else index % 2 == 1
        else:
            cut_in = index % 2 == 1 if starts_with_cut else index % 2 == 0

        if cut_in:
            p1 = (cursor[0] - normal_x * joinery.depth, cursor[1] - normal_y * joinery.depth)
            p2 = (next_point[0] - normal_x * joinery.depth, next_point[1] - normal_y * joinery.depth)
            segments.extend([p1, p2, next_point])
        else:
            segments.append(next_point)
        cursor = next_point

    if not segments or not same_point(segments[-1], edge_end):
        segments.append(edge_end)

    return dedupe_path(segments)


def build_panel_outline(
    width: float,
    height: float,
    joinery: Joinery,
    edges: dict[str, str],
) -> list[tuple[float, float]]:
    outline = [(-width / 2, height / 2)]
    current = outline[0]
    for side, length in (
        ("top", width),
        ("right", height),
        ("bottom", width),
        ("left", height),
    ):
        points = build_edge_points(current, side, length, edges.get(side, "plain"), joinery)
        outline.extend(points)
        current = outline[-1]
    return dedupe_path(outline)


def same_point(a: tuple[float, float], b: tuple[float, float], epsilon: float = 1e-9) -> bool:
    return abs(a[0] - b[0]) <= epsilon and abs(a[1] - b[1]) <= epsilon


def orientation(a: tuple[float, float], b: tuple[float, float], c: tuple[float, float]) -> float:
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def on_segment(a: tuple[float, float], b: tuple[float, float], c: tuple[float, float], epsilon: float = 1e-9) -> bool:
    return (
        min(a[0], c[0]) - epsilon <= b[0] <= max(a[0], c[0]) + epsilon
        and min(a[1], c[1]) - epsilon <= b[1] <= max(a[1], c[1]) + epsilon
    )


def segments_intersect(
    a: tuple[float, float],
    b: tuple[float, float],
    c: tuple[float, float],
    d: tuple[float, float],
) -> bool:
    o1 = orientation(a, b, c)
    o2 = orientation(a, b, d)
    o3 = orientation(c, d, a)
    o4 = orientation(c, d, b)
    epsilon = 1e-9

    if abs(o1) <= epsilon and on_segment(a, c, b):
        return True
    if abs(o2) <= epsilon and on_segment(a, d, b):
        return True
    if abs(o3) <= epsilon and on_segment(c, a, d):
        return True
    if abs(o4) <= epsilon and on_segment(c, b, d):
        return True

    return (o1 > 0) != (o2 > 0) and (o3 > 0) != (o4 > 0)


def polygon_has_self_intersection(points: list[tuple[float, float]]) -> bool:
    count = len(points)
    for index in range(count):
      a = points[index]
      b = points[(index + 1) % count]
      for other_index in range(index + 1, count):
          if abs(index - other_index) <= 1:
              continue
          if index == 0 and other_index == count - 1:
              continue
          c = points[other_index]
          d = points[(other_index + 1) % count]
          shared_endpoint = any(
              same_point(point_a, point_b)
              for point_a in (a, b)
              for point_b in (c, d)
          )
          if shared_endpoint:
              continue
          if segments_intersect(a, b, c, d):
              return True
    return False


def test_closed_box_preview_outlines_are_simple_polygons():
    joinery = build_joinery(thickness=0.06, kerf=0.12)
    outlines = {
        "front": build_panel_outline(
            width=4.0,
            height=2.4,
            joinery=joinery,
            edges={"top": "female", "right": "female", "bottom": "female", "left": "female"},
        ),
        "side": build_panel_outline(
            width=3.0,
            height=2.4,
            joinery=joinery,
            edges={"top": "female", "right": "male", "bottom": "female", "left": "male"},
        ),
        "bottom": build_panel_outline(
            width=4.0,
            height=3.0,
            joinery=joinery,
            edges={"top": "male", "right": "male", "bottom": "male", "left": "male"},
        ),
    }

    for outline in outlines.values():
        assert same_point(outline[0], outline[-1])
        assert not polygon_has_self_intersection(outline[:-1])


def test_open_box_preview_outlines_are_simple_polygons():
    joinery = build_joinery(thickness=0.06, kerf=0.12)
    outlines = {
        "front": build_panel_outline(
            width=4.0,
            height=2.4,
            joinery=joinery,
            edges={"top": "plain", "right": "female", "bottom": "female", "left": "female"},
        ),
        "side": build_panel_outline(
            width=3.0,
            height=2.4,
            joinery=joinery,
            edges={"top": "plain", "right": "male", "bottom": "female", "left": "male"},
        ),
    }

    for outline in outlines.values():
        assert same_point(outline[0], outline[-1])
        assert not polygon_has_self_intersection(outline[:-1])
