import json

from fastapi.testclient import TestClient
from influxdb_client.rest import ApiException

from app.influx_client import get_influx_client
from app.main import app


class _FakeHttpResponse:
    def __init__(self, status: int, message: str):
        self.status = status
        self.reason = "Bad Request"
        self.data = json.dumps({"code": "invalid", "message": message}).encode()

    def getheaders(self):
        return {}

    def getheader(self, name, default=None):
        return default


class _BadInputQueryApi:
    def query_stream(self, flux):
        raise ApiException(http_resp=_FakeHttpResponse(400, "cannot query an empty range"))


class _BadInputClient:
    def query_api(self):
        return _BadInputQueryApi()


class _NotFoundQueryApi:
    def query_stream(self, flux):
        raise ApiException(http_resp=_FakeHttpResponse(404, 'could not find bucket "missing"'))


class _NotFoundClient:
    def query_api(self):
        return _NotFoundQueryApi()


def test_influx_bad_request_surfaces_its_own_message():
    app.dependency_overrides[get_influx_client] = lambda: _BadInputClient()
    try:
        client = TestClient(app)
        response = client.post(
            "/api/points/query",
            json={"bucket": "b", "measurements": [], "tags": {}, "start": "3d", "stop": "now()"},
        )
    finally:
        app.dependency_overrides.pop(get_influx_client, None)

    assert response.status_code == 400
    assert response.json()["detail"] == "cannot query an empty range"


def test_influx_not_found_keeps_its_status_code():
    app.dependency_overrides[get_influx_client] = lambda: _NotFoundClient()
    try:
        client = TestClient(app)
        response = client.post(
            "/api/points/query",
            json={"bucket": "missing", "measurements": [], "tags": {}, "start": "-1h", "stop": "now()"},
        )
    finally:
        app.dependency_overrides.pop(get_influx_client, None)

    assert response.status_code == 404
    assert "missing" in response.json()["detail"]


class _RejectingWriteApi:
    def write(self, bucket, org, record):
        raise ApiException(http_resp=_FakeHttpResponse(400, "invalid field value"))


class _RejectingWriteClient:
    def write_api(self, write_options=None):
        return _RejectingWriteApi()


def test_influx_write_error_surfaces_its_own_message():
    app.dependency_overrides[get_influx_client] = lambda: _RejectingWriteClient()
    try:
        client = TestClient(app)
        response = client.put(
            "/api/points",
            json={
                "bucket": "b",
                "measurement": "m",
                "tags": {},
                "field": "value",
                "value": 1.0,
                "time": "2026-06-19T00:00:00Z",
            },
        )
    finally:
        app.dependency_overrides.pop(get_influx_client, None)

    assert response.status_code == 400
    assert response.json()["detail"] == "invalid field value"
