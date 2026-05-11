from __future__ import annotations

import math
from io import BytesIO, StringIO
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Iterable
from uuid import uuid4

import ezdxf
from reportlab.lib.colors import HexColor
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from services.validation_service import BOX_TYPES, BoxRequest


class BoxGenerationError(RuntimeError):
    """Raised when a vector artifact cannot be generated."""


Point = tuple[float, float]


@dataclass(slots=True)
class PathShape:
    points: list[Point]
    closed: bool = True

    def translated(self, dx: float, dy: float) -> "PathShape":
        return PathShape([(x + dx, y + dy) for x, y in self.points], self.closed)


@dataclass(slots=True)
class PanelShape:
    name: str
    width_mm: float
    height_mm: float
    paths: list[PathShape]
    metadata: dict[str, object] = field(default_factory=dict)

    def bounds(self) -> tuple[float, float, float, float]:
        points = [point for path in self.paths for point in path.points]
        min_x = min(point[0] for point in points)
        min_y = min(point[1] for point in points)
        max_x = max(point[0] for point in points)
        max_y = max(point[1] for point in points)
        return min_x, min_y, max_x, max_y

    def translated(self, dx: float, dy: float) -> "PanelShape":
        return PanelShape(
            name=self.name,
            width_mm=self.width_mm,
            height_mm=self.height_mm,
            paths=[path.translated(dx, dy) for path in self.paths],
            metadata=dict(self.metadata),
        )


@dataclass(slots=True)
class Layout:
    width_mm: float
    height_mm: float
    panels: list[PanelShape]


@dataclass(slots=True)
class GeneratedArtifact:
    filename: str
    export_format: str
    engine: str
    panel_summary: list[dict[str, object]]


def generate_artifact(box_request: BoxRequest, output_dir: Path) -> GeneratedArtifact:
    output_dir.mkdir(parents=True, exist_ok=True)

    layout = build_layout(box_request)
    filename = _build_filename(box_request)
    destination = output_dir / filename

    if box_request.export_format == "svg":
        destination.write_bytes(export_svg(layout))
    elif box_request.export_format == "pdf":
        destination.write_bytes(export_pdf(layout))
    elif box_request.export_format == "dxf":
        destination.write_bytes(export_dxf(layout))
    else:
        raise BoxGenerationError("Formato de exportacao nao suportado.")

    panel_summary = [
        {
            "name": panel.name,
            "width": round(panel.width_mm, 2),
            "height": round(panel.height_mm, 2),
            "kind": panel.metadata.get("kind", "panel"),
        }
        for panel in layout.panels
    ]

    return GeneratedArtifact(
        filename=filename,
        export_format=box_request.export_format,
        engine="native-wisebox",
        panel_summary=panel_summary,
    )


def build_layout(box_request: BoxRequest) -> Layout:
    panels = build_panels(box_request)
    placed_panels: list[PanelShape] = []
    gap = max(14.0, box_request.thickness_mm * 3)
    total_area = sum(panel.width_mm * panel.height_mm for panel in panels)
    row_target = max(280.0, math.sqrt(total_area) * 1.45)

    cursor_x = gap
    cursor_y = gap
    row_height = 0.0
    max_width = 0.0

    for panel in panels:
        min_x, min_y, max_x, max_y = panel.bounds()
        panel_width = max_x - min_x
        panel_height = max_y - min_y

        if cursor_x > gap and cursor_x + panel_width + gap > row_target:
            cursor_x = gap
            cursor_y += row_height + gap
            row_height = 0.0

        placed = panel.translated(cursor_x - min_x, cursor_y - min_y)
        placed_panels.append(placed)

        cursor_x += panel_width + gap
        row_height = max(row_height, panel_height)
        max_width = max(max_width, cursor_x)

    total_height = cursor_y + row_height + gap
    return Layout(width_mm=max_width + gap, height_mm=total_height, panels=placed_panels)


def build_panels(box_request: BoxRequest) -> list[PanelShape]:
    width = box_request.width_mm
    depth = box_request.depth_mm
    height = box_request.height_mm
    thickness = box_request.thickness_mm
    joint_type = box_request.joint_type
    kerf = box_request.kerf_mm
    tolerance = box_request.tolerance_mm

    panels: list[PanelShape] = []

    def face(
        name: str,
        face_width: float,
        face_height: float,
        edges: dict[str, str],
        *,
        kind: str = "panel",
        flex: bool = False,
    ) -> PanelShape:
        return create_panel(
            name=name,
            width_mm=face_width,
            height_mm=face_height,
            joint_type=joint_type,
            edge_roles=edges,
            thickness_mm=thickness,
            kerf_mm=kerf,
            tolerance_mm=tolerance,
            kind=kind,
            flex=flex,
        )

    base_front_edges = {"top": "female", "right": "female", "bottom": "female", "left": "female"}
    base_side_edges = {"top": "female", "right": "male", "bottom": "female", "left": "male"}
    base_top_edges = {"top": "male", "right": "male", "bottom": "male", "left": "male"}

    panels.extend(
        [
            face("Frente", width, height, base_front_edges),
            face("Costas", width, height, base_front_edges),
            face("Lateral esquerda", depth, height, base_side_edges, flex=box_request.box_type == "flex_box"),
            face("Lateral direita", depth, height, base_side_edges, flex=box_request.box_type == "flex_box"),
            face("Base", width, depth, base_top_edges),
        ]
    )

    if box_request.box_type in {"closed_box", "lidded_box", "flex_box"}:
        lid_kind = "lid" if box_request.box_type == "lidded_box" else "panel"
        panels.append(face("Tampa", width, depth, base_top_edges, kind=lid_kind))

    if box_request.box_type == "drawer":
        shell_width = width + 2 * (thickness + tolerance)
        shell_height = height + thickness + tolerance
        shell_depth = depth + thickness + tolerance
        shell_front_edges = {"top": "female", "right": "female", "bottom": "female", "left": "female"}
        shell_side_edges = {"top": "female", "right": "male", "bottom": "female", "left": "male"}
        shell_top_edges = {"top": "male", "right": "male", "bottom": "male", "left": "male"}
        panels.extend(
            [
                face("Corpo superior", shell_width, shell_depth, shell_top_edges, kind="drawer-shell"),
                face("Corpo inferior", shell_width, shell_depth, shell_top_edges, kind="drawer-shell"),
                face("Corpo lateral esquerda", shell_depth, shell_height, shell_side_edges, kind="drawer-shell"),
                face("Corpo lateral direita", shell_depth, shell_height, shell_side_edges, kind="drawer-shell"),
                face("Corpo traseiro", shell_width, shell_height, shell_front_edges, kind="drawer-shell"),
            ]
        )

    return panels


def create_panel(
    *,
    name: str,
    width_mm: float,
    height_mm: float,
    joint_type: str,
    edge_roles: dict[str, str],
    thickness_mm: float,
    kerf_mm: float,
    tolerance_mm: float,
    kind: str,
    flex: bool = False,
) -> PanelShape:
    outline = build_outline(width_mm, height_mm, edge_roles, joint_type, thickness_mm, kerf_mm, tolerance_mm)
    paths = [PathShape(outline)]
    if flex:
        paths.extend(build_flex_paths(width_mm, height_mm, thickness_mm))
    return PanelShape(
        name=name,
        width_mm=width_mm,
        height_mm=height_mm,
        paths=paths,
        metadata={"kind": kind},
    )


def build_outline(
    width_mm: float,
    height_mm: float,
    edge_roles: dict[str, str],
    joint_type: str,
    thickness_mm: float,
    kerf_mm: float,
    tolerance_mm: float,
) -> list[Point]:
    start = (0.0, 0.0)
    points: list[Point] = [start]
    current = start
    for side, length in (
        ("top", width_mm),
        ("right", height_mm),
        ("bottom", width_mm),
        ("left", height_mm),
    ):
        edge_points = build_edge_points(
            start=current,
            side=side,
            length_mm=length,
            joint_type=joint_type,
            role=edge_roles.get(side, "plain"),
            thickness_mm=thickness_mm,
            kerf_mm=kerf_mm,
            tolerance_mm=tolerance_mm,
        )
        points.extend(edge_points)
        current = points[-1]
    if points[-1] != start:
        points.append(start)
    return dedupe_points(points)


def build_edge_points(
    *,
    start: Point,
    side: str,
    length_mm: float,
    joint_type: str,
    role: str,
    thickness_mm: float,
    kerf_mm: float,
    tolerance_mm: float,
) -> list[Point]:
    axis, normal = orientation_vectors(side)

    if joint_type == "plain" or role == "plain":
        end = (start[0] + axis[0] * length_mm, start[1] + axis[1] * length_mm)
        return [round_point(end)]

    fingers = finger_count(length_mm)
    span = length_mm / fingers
    points: list[Point] = []
    cursor_x, cursor_y = start

    depth = max(thickness_mm, 0.6)
    kerf_adjust = kerf_mm * 0.5 + tolerance_mm * 0.35
    offset = depth - kerf_adjust if role == "male" else -(depth + kerf_adjust)
    offset = offset if role == "male" else min(offset, -0.5)

    for index in range(fingers):
        if index % 2 == 0:
            if joint_type == "dovetail":
                cursor_x += axis[0] * span * 0.18 + normal[0] * offset
                cursor_y += axis[1] * span * 0.18 + normal[1] * offset
                points.append(round_point((cursor_x, cursor_y)))
                cursor_x += axis[0] * span * 0.64
                cursor_y += axis[1] * span * 0.64
                points.append(round_point((cursor_x, cursor_y)))
                cursor_x += axis[0] * span * 0.18 - normal[0] * offset
                cursor_y += axis[1] * span * 0.18 - normal[1] * offset
                points.append(round_point((cursor_x, cursor_y)))
            else:
                cursor_x += normal[0] * offset
                cursor_y += normal[1] * offset
                points.append(round_point((cursor_x, cursor_y)))
                cursor_x += axis[0] * span
                cursor_y += axis[1] * span
                points.append(round_point((cursor_x, cursor_y)))
                cursor_x -= normal[0] * offset
                cursor_y -= normal[1] * offset
                points.append(round_point((cursor_x, cursor_y)))
        else:
            cursor_x += axis[0] * span
            cursor_y += axis[1] * span
            points.append(round_point((cursor_x, cursor_y)))

    expected_end = (start[0] + axis[0] * length_mm, start[1] + axis[1] * length_mm)
    points[-1] = round_point(expected_end)
    return dedupe_points(points)


def build_flex_paths(width_mm: float, height_mm: float, thickness_mm: float) -> list[PathShape]:
    slot_margin_x = max(thickness_mm * 1.6, 4.0)
    slot_margin_y = max(thickness_mm * 1.8, 5.0)
    slot_width = max(thickness_mm * 0.45, 0.9)
    slot_height = max(height_mm - slot_margin_y * 2, thickness_mm * 3)
    columns = max(5, int((width_mm - slot_margin_x * 2) / max(thickness_mm * 1.9, 8.0)))
    spacing = (width_mm - slot_margin_x * 2) / columns
    paths: list[PathShape] = []

    for column in range(columns):
        top = slot_margin_y if column % 2 == 0 else slot_margin_y + thickness_mm * 1.2
        bottom = min(top + slot_height - thickness_mm * 1.2, height_mm - slot_margin_y)
        x0 = slot_margin_x + column * spacing
        x1 = x0 + slot_width
        slot = [
            round_point((x0, top)),
            round_point((x1, top)),
            round_point((x1, bottom)),
            round_point((x0, bottom)),
            round_point((x0, top)),
        ]
        paths.append(PathShape(slot))

    return paths


def export_svg(layout: Layout) -> bytes:
    paths_markup = []
    for panel in layout.panels:
        for path in panel.paths:
            d_parts = [f"M {path.points[0][0]:.3f} {path.points[0][1]:.3f}"]
            d_parts.extend(f"L {x:.3f} {y:.3f}" for x, y in path.points[1:])
            if path.closed:
                d_parts.append("Z")
            paths_markup.append(f'<path d="{" ".join(d_parts)}" />')

    svg = f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{layout.width_mm:.3f}mm" height="{layout.height_mm:.3f}mm" viewBox="0 0 {layout.width_mm:.3f} {layout.height_mm:.3f}">
  <title>WiseBox Maker export</title>
  <desc>Arquivo vetorial gerado em {datetime.now(UTC).isoformat()}</desc>
  <g fill="none" stroke="#d90429" stroke-width="0.15" stroke-linejoin="round" stroke-linecap="round">
    {' '.join(paths_markup)}
  </g>
</svg>
"""
    return svg.encode("utf-8")


def export_pdf(layout: Layout) -> bytes:
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=(layout.width_mm * mm, layout.height_mm * mm))
    pdf.setStrokeColor(HexColor("#d90429"))
    pdf.setLineWidth(0.15 * mm)

    for panel in layout.panels:
        for path in panel.paths:
            drawing = pdf.beginPath()
            start_x, start_y = _pdf_point(layout, path.points[0])
            drawing.moveTo(start_x, start_y)
            for point in path.points[1:]:
                x, y = _pdf_point(layout, point)
                drawing.lineTo(x, y)
            if path.closed:
                drawing.close()
    pdf.drawPath(drawing, stroke=1, fill=0)

    pdf.showPage()
    pdf.save()
    return buffer.getvalue()


def export_dxf(layout: Layout) -> bytes:
    document = ezdxf.new("R2010")
    document.units = ezdxf.units.MM
    modelspace = document.modelspace()
    for panel in layout.panels:
        for path in panel.paths:
            modelspace.add_lwpolyline(path.points, close=path.closed)
    buffer = StringIO()
    document.write(buffer)
    return buffer.getvalue().encode("utf-8")


def orientation_vectors(side: str) -> tuple[Point, Point]:
    mapping = {
        "top": ((1.0, 0.0), (0.0, -1.0)),
        "right": ((0.0, 1.0), (1.0, 0.0)),
        "bottom": ((-1.0, 0.0), (0.0, 1.0)),
        "left": ((0.0, -1.0), (-1.0, 0.0)),
    }
    return mapping[side]


def finger_count(length_mm: float) -> int:
    approx = max(3, int(length_mm / 25))
    if approx % 2 == 0:
        approx += 1
    return approx


def dedupe_points(points: Iterable[Point]) -> list[Point]:
    deduped: list[Point] = []
    for point in points:
        if not deduped or deduped[-1] != point:
            deduped.append(point)
    return deduped


def round_point(point: Point) -> Point:
    return (round(point[0], 3), round(point[1], 3))


def _pdf_point(layout: Layout, point: Point) -> Point:
    return point[0] * mm, (layout.height_mm - point[1]) * mm


def _build_filename(box_request: BoxRequest) -> str:
    slug = BOX_TYPES[box_request.box_type].lower().replace(" ", "-")
    stamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    suffix = uuid4().hex[:8]
    return f"wisebox-{slug}-{stamp}-{suffix}.{box_request.export_format}"
