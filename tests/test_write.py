from influxdb_client.client.write_api import SYNCHRONOUS

from app.models.points import PointWriteRequest
from app.services.write import write_point
from app.utils.time import rfc3339_to_ns

TIME = "2026-06-19T08:00:00.123456Z"
TIME_NS = rfc3339_to_ns(TIME)


class _FakeWriteApi:
    def __init__(self):
        self.calls: list[dict] = []

    def write(self, bucket, org, record):
        self.calls.append({"bucket": bucket, "org": org, "record": record})


class _FakeClient:
    def __init__(self):
        self.write_api_instance = _FakeWriteApi()
        self.write_options_used = None

    def write_api(self, write_options=None):
        self.write_options_used = write_options
        return self.write_api_instance


def _request(**overrides) -> PointWriteRequest:
    defaults = dict(
        bucket="b",
        measurement="temperature",
        tags={"room": "kitchen"},
        field="value",
        value=21.5,
        value_type="float",
        time=TIME,
    )
    defaults.update(overrides)
    return PointWriteRequest(**defaults)


def test_write_point_uses_synchronous_write_options():
    client = _FakeClient()
    write_point(client, "org", _request())
    assert client.write_options_used is SYNCHRONOUS


def test_write_point_builds_correct_line_protocol_for_float():
    client = _FakeClient()
    write_point(client, "org", _request())

    assert len(client.write_api_instance.calls) == 1
    call = client.write_api_instance.calls[0]
    assert call["bucket"] == "b"
    assert call["org"] == "org"
    assert call["record"].to_line_protocol() == f"temperature,room=kitchen value=21.5 {TIME_NS}"


def test_write_point_preserves_microsecond_precision():
    client = _FakeClient()
    write_point(client, "org", _request(time="2026-06-19T08:00:00.000001Z"))

    line = client.write_api_instance.calls[0]["record"].to_line_protocol()
    assert line.endswith(f" {rfc3339_to_ns('2026-06-19T08:00:00.000001Z')}")


def test_write_point_with_boolean_value():
    client = _FakeClient()
    write_point(client, "org", _request(field="ack", value=True, value_type="bool", tags={}))

    line = client.write_api_instance.calls[0]["record"].to_line_protocol()
    assert line == f"temperature ack=true {TIME_NS}"


def test_write_point_with_string_value():
    client = _FakeClient()
    write_point(client, "org", _request(value="hello", value_type="string"))

    line = client.write_api_instance.calls[0]["record"].to_line_protocol()
    assert line == f'temperature,room=kitchen value="hello" {TIME_NS}'


def test_write_point_coerces_whole_number_to_float_when_declared_float():
    # Reproduces the round-trip bug: a JSON number with no decimal point is
    # ambiguous (60 vs 60.0), so the explicit value_type must decide, not
    # whatever type Pydantic happened to infer from the raw JSON literal.
    client = _FakeClient()
    write_point(client, "org", _request(field="humidity", value=60, value_type="float"))

    line = client.write_api_instance.calls[0]["record"].to_line_protocol()
    assert "humidity=60 " in line
    assert "humidity=60i" not in line


def test_write_point_coerces_to_int_when_declared_int():
    client = _FakeClient()
    write_point(client, "org", _request(field="count", value=60, value_type="int"))

    line = client.write_api_instance.calls[0]["record"].to_line_protocol()
    assert "count=60i" in line


def test_write_point_with_multiple_tags():
    client = _FakeClient()
    write_point(client, "org", _request(tags={"room": "kitchen", "sensor": "s1"}))

    line = client.write_api_instance.calls[0]["record"].to_line_protocol()
    assert line == f"temperature,room=kitchen,sensor=s1 value=21.5 {TIME_NS}"
