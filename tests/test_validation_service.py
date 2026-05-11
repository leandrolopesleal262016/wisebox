import pytest

from services.validation_service import ValidationError, validate_box_request


def test_validate_box_request_converts_cm_to_mm():
    box_request = validate_box_request(
        {
            "boxType": "closed_box",
            "width": 18,
            "height": 12,
            "depth": 14,
            "thickness": 0.3,
            "kerf": 0.012,
            "tolerance": 0.01,
            "jointType": "finger",
            "unit": "cm",
            "exportFormat": "svg",
        }
    )

    assert box_request.width_mm == 180
    assert box_request.thickness_mm == 3
    assert box_request.export_format == "svg"


def test_validate_box_request_rejects_small_dimensions():
    with pytest.raises(ValidationError):
        validate_box_request(
            {
                "boxType": "closed_box",
                "width": 20,
                "height": 20,
                "depth": 20,
                "thickness": 3,
                "kerf": 0.1,
                "tolerance": 0.1,
                "jointType": "finger",
                "unit": "mm",
                "exportFormat": "svg",
            }
        )


def test_validate_box_request_rejects_invalid_kerf():
    with pytest.raises(ValidationError):
        validate_box_request(
            {
                "boxType": "closed_box",
                "width": 120,
                "height": 100,
                "depth": 120,
                "thickness": 3,
                "kerf": 2.5,
                "tolerance": 0.1,
                "jointType": "finger",
                "unit": "mm",
                "exportFormat": "svg",
            }
        )


def test_validate_box_request_rejects_removed_box_types():
    with pytest.raises(ValidationError):
        validate_box_request(
            {
                "boxType": "drawer",
                "width": 120,
                "height": 100,
                "depth": 120,
                "thickness": 3,
                "kerf": 0.12,
                "tolerance": 0.1,
                "jointType": "finger",
                "unit": "mm",
                "exportFormat": "svg",
            }
        )
