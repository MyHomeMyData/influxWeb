from fastapi.testclient import TestClient

from app.config import Settings
from app.deps import get_settings
from app.main import app
from app.version import __version__


def test_get_version_returns_current_version():
    # Force mode=default regardless of .env so the test is not affected by
    # whatever INFLUXWEB_MODE the developer set for manual testing.
    default_settings = Settings(influxweb_mode="default")
    app.dependency_overrides[get_settings] = lambda: default_settings
    try:
        client = TestClient(app)
        response = client.get("/api/version")
        assert response.status_code == 200
        assert response.json() == {"version": __version__, "mode": "default"}
    finally:
        app.dependency_overrides.pop(get_settings, None)
