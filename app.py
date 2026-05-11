from __future__ import annotations

import os
from pathlib import Path

from flask import Flask, jsonify, render_template, request, send_from_directory, url_for
from werkzeug.exceptions import BadRequest, NotFound

from services.boxes_service import BoxGenerationError, generate_artifact
from services.validation_service import ValidationError, validate_box_request

BASE_DIR = Path(__file__).resolve().parent


def create_app(test_config: dict | None = None) -> Flask:
    app = Flask(__name__)
    app.config.update(
        SECRET_KEY=os.getenv("SECRET_KEY", "wisebox-dev"),
        GENERATED_DIR=Path(os.getenv("GENERATED_DIR", str(BASE_DIR / "static" / "generated"))),
        MAX_CONTENT_LENGTH=1024 * 1024,
    )

    if test_config:
        app.config.update(test_config)

    Path(app.config["GENERATED_DIR"]).mkdir(parents=True, exist_ok=True)

    @app.get("/")
    def index() -> str:
        return render_template("index.html")

    @app.get("/healthz")
    def healthz():
        return jsonify({"ok": True, "status": "healthy"})

    @app.post("/api/preview-data")
    def preview_data():
        payload = request.get_json(silent=True) or {}
        box_request = validate_box_request(payload)
        return jsonify({"ok": True, "preview": box_request.to_preview_payload()})

    @app.post("/api/generate")
    def generate():
        payload = request.get_json(silent=True) or {}
        box_request = validate_box_request(payload)
        artifact = generate_artifact(box_request, Path(app.config["GENERATED_DIR"]))
        return jsonify(
            {
                "ok": True,
                "filename": artifact.filename,
                "format": artifact.export_format,
                "downloadUrl": url_for("download_file", filename=artifact.filename),
                "preview": box_request.to_preview_payload(),
                "panels": artifact.panel_summary,
                "engine": artifact.engine,
            }
        )

    @app.get("/download/<path:filename>")
    def download_file(filename: str):
        target = Path(app.config["GENERATED_DIR"]) / filename
        if not target.is_file():
            raise NotFound("Arquivo nao encontrado.")
        return send_from_directory(
            app.config["GENERATED_DIR"],
            filename,
            as_attachment=True,
            download_name=filename,
        )

    @app.errorhandler(ValidationError)
    @app.errorhandler(BoxGenerationError)
    @app.errorhandler(BadRequest)
    def handle_known_errors(error: Exception):
        status_code = 400
        if isinstance(error, BoxGenerationError):
            status_code = 500
        return jsonify({"ok": False, "error": str(error)}), status_code

    @app.errorhandler(NotFound)
    def handle_not_found(error: NotFound):
        return jsonify({"ok": False, "error": str(error)}), 404

    return app


app = create_app()


if __name__ == "__main__":
    app.run(
        host=os.getenv("FLASK_HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "5000")),
        debug=os.getenv("FLASK_DEBUG", "0") == "1",
    )
