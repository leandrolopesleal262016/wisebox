from __future__ import annotations

from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app import create_app


@pytest.fixture()
def client(tmp_path: Path):
    app = create_app({"TESTING": True, "GENERATED_DIR": tmp_path / "generated"})
    return app.test_client()
