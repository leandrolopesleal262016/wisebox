from pathlib import Path


def build_payload(**overrides):
    payload = {
        "boxType": "closed_box",
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
    payload.update(overrides)
    return payload


def test_index_route_renders(client):
    response = client.get("/")
    assert response.status_code == 200
    assert b"WiseBox Maker" in response.data


def test_preview_route_returns_3d_payload(client):
    response = client.post("/api/preview-data", json=build_payload())
    data = response.get_json()

    assert response.status_code == 200
    assert data["ok"] is True
    assert data["preview"]["width"] == 180
    assert data["preview"]["openTop"] is False


def test_generate_route_creates_svg_file(client):
    response = client.post("/api/generate", json=build_payload())
    data = response.get_json()

    assert response.status_code == 200
    assert data["ok"] is True
    assert data["format"] == "svg"

    download_response = client.get(data["downloadUrl"])
    assert download_response.status_code == 200
    assert b"<svg" in download_response.data


def test_generate_route_creates_pdf_file(client):
    response = client.post("/api/generate", json=build_payload(exportFormat="pdf"))
    data = response.get_json()

    assert response.status_code == 200
    assert data["format"] == "pdf"

    download_response = client.get(data["downloadUrl"])
    assert download_response.status_code == 200
    assert download_response.data.startswith(b"%PDF")
