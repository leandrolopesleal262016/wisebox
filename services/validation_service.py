from __future__ import annotations

from dataclasses import dataclass


class ValidationError(ValueError):
    """Raised when the incoming box configuration is invalid."""


BOX_TYPES = {
    "open_box": "Caixa aberta",
    "closed_box": "Caixa fechada",
    "lidded_box": "Caixa com tampa",
    "tray": "Bandeja",
    "drawer": "Gaveta",
    "flex_box": "Caixa com flex cut",
}

JOINT_TYPES = {
    "finger": "Finger joint",
    "dovetail": "Dovetail",
    "plain": "Sem encaixe",
}

EXPORT_FORMATS = {"svg", "dxf", "pdf"}
UNITS = {"mm": 1.0, "cm": 10.0}


@dataclass(slots=True)
class BoxRequest:
    box_type: str
    width_mm: float
    height_mm: float
    depth_mm: float
    thickness_mm: float
    kerf_mm: float
    joint_type: str
    tolerance_mm: float
    unit: str
    export_format: str

    @property
    def has_lid(self) -> bool:
        return self.box_type in {"closed_box", "lidded_box", "flex_box"}

    @property
    def open_top(self) -> bool:
        return self.box_type in {"open_box", "tray", "drawer"}

    def to_preview_payload(self) -> dict[str, object]:
        return {
            "boxType": self.box_type,
            "boxTypeLabel": BOX_TYPES[self.box_type],
            "width": round(self.width_mm, 3),
            "height": round(self.height_mm, 3),
            "depth": round(self.depth_mm, 3),
            "thickness": round(self.thickness_mm, 3),
            "kerf": round(self.kerf_mm, 3),
            "jointType": self.joint_type,
            "jointTypeLabel": JOINT_TYPES[self.joint_type],
            "tolerance": round(self.tolerance_mm, 3),
            "hasLid": self.has_lid,
            "openTop": self.open_top,
            "hasDrawerShell": self.box_type == "drawer",
            "isFlex": self.box_type == "flex_box",
        }


def _coerce_float(payload: dict, field_name: str, label: str) -> float:
    raw_value = payload.get(field_name)
    if raw_value in (None, ""):
        raise ValidationError(f"{label} e obrigatorio.")
    try:
        return float(raw_value)
    except (TypeError, ValueError) as exc:
        raise ValidationError(f"{label} precisa ser numerico.") from exc


def validate_box_request(payload: dict) -> BoxRequest:
    unit = str(payload.get("unit", "mm")).strip().lower()
    if unit not in UNITS:
        raise ValidationError("Unidade invalida. Use mm ou cm.")
    factor = UNITS[unit]

    box_type = str(payload.get("boxType", "closed_box")).strip()
    if box_type not in BOX_TYPES:
        raise ValidationError("Tipo de caixa invalido.")

    joint_type = str(payload.get("jointType", "finger")).strip()
    if joint_type not in JOINT_TYPES:
        raise ValidationError("Tipo de encaixe invalido.")

    export_format = str(payload.get("exportFormat", "svg")).strip().lower()
    if export_format not in EXPORT_FORMATS:
        raise ValidationError("Formato de exportacao invalido.")

    width_mm = _coerce_float(payload, "width", "Largura") * factor
    height_mm = _coerce_float(payload, "height", "Altura") * factor
    depth_mm = _coerce_float(payload, "depth", "Profundidade") * factor
    thickness_mm = _coerce_float(payload, "thickness", "Espessura") * factor
    kerf_mm = _coerce_float(payload, "kerf", "Kerf") * factor
    tolerance_mm = _coerce_float(payload, "tolerance", "Folga") * factor

    for label, value in (
        ("Largura", width_mm),
        ("Altura", height_mm),
        ("Profundidade", depth_mm),
        ("Espessura", thickness_mm),
    ):
        if value <= 0:
            raise ValidationError(f"{label} precisa ser maior que zero.")

    if min(width_mm, height_mm, depth_mm) < 30:
        raise ValidationError("As medidas principais precisam ser de pelo menos 30 mm.")
    if not 0 <= kerf_mm <= 2:
        raise ValidationError("O kerf precisa estar entre 0 mm e 2 mm.")
    if not 0 <= tolerance_mm <= 1.5:
        raise ValidationError("A folga do encaixe precisa estar entre 0 mm e 1.5 mm.")
    if not 1 <= thickness_mm <= 20:
        raise ValidationError("A espessura precisa estar entre 1 mm e 20 mm.")
    if min(width_mm, depth_mm, height_mm) <= thickness_mm * 2:
        raise ValidationError("As dimensoes sao pequenas demais para a espessura informada.")

    if box_type == "tray" and height_mm > min(width_mm, depth_mm):
        raise ValidationError("Bandejas devem ter altura menor que largura e profundidade.")

    return BoxRequest(
        box_type=box_type,
        width_mm=round(width_mm, 3),
        height_mm=round(height_mm, 3),
        depth_mm=round(depth_mm, 3),
        thickness_mm=round(thickness_mm, 3),
        kerf_mm=round(kerf_mm, 3),
        joint_type=joint_type,
        tolerance_mm=round(tolerance_mm, 3),
        unit=unit,
        export_format=export_format,
    )
