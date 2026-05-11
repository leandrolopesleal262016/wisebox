from services.boxes_service import build_panels
from services.validation_service import validate_box_request


def build_request(box_type: str):
    return validate_box_request(
        {
            "boxType": box_type,
            "width": 180,
            "height": 120,
            "depth": 140,
            "thickness": 3,
            "kerf": 0.12,
            "tolerance": 0.1,
            "jointType": "finger",
            "unit": "mm",
            "exportFormat": "svg",
        }
    )


def test_lidded_box_uses_plain_cover_lid():
    box_request = build_request("lidded_box")
    panels = {panel.name: panel for panel in build_panels(box_request)}

    lid = panels["Tampa"]
    front = panels["Frente"]

    assert lid.metadata["kind"] == "lid"
    assert lid.paths[0].points == [
        (0.0, 0.0),
        (180.0, 0.0),
        (180.0, 140.0),
        (0.0, 140.0),
        (0.0, 0.0),
    ]
    assert front.paths[0].points[1] == (180.0, 0.0)


def test_closed_box_keeps_top_joinery_on_front_panel():
    box_request = build_request("closed_box")
    panels = {panel.name: panel for panel in build_panels(box_request)}

    assert panels["Frente"].paths[0].points[1] != (180.0, 0.0)
