from zoneinfo import ZoneInfo

from influxdb_client.client.write_api import SYNCHRONOUS

from app.models.retime import PointGroup, RetimePoint
from app.services.retime import compute_normalize, compute_offset, execute_retime, preview_retime

BERLIN = ZoneInfo("Europe/Berlin")


def _group(**overrides) -> PointGroup:
    defaults = dict(
        bucket="b",
        measurement="temperature",
        tags={"room": "kitchen"},
        time="2026-06-24T10:00:00Z",
        fields={"value": {"value": 21.5, "value_type": "float"}},
    )
    defaults.update(overrides)
    return PointGroup(**defaults)


def _point(**overrides) -> RetimePoint:
    defaults = dict(
        bucket="b",
        measurement="temperature",
        tags={"room": "kitchen"},
        old_time="2026-06-24T10:00:00Z",
        new_time="2026-06-25T10:00:00Z",
        fields={"value": {"value": 21.5, "value_type": "float"}},
    )
    defaults.update(overrides)
    return RetimePoint(**defaults)


def test_compute_offset_uses_shift_time():
    points = compute_offset([_group()], 1, "days")
    assert points[0].old_time == "2026-06-24T10:00:00Z"
    assert points[0].new_time == "2026-06-25T10:00:00Z"
    assert points[0].fields["value"].value == 21.5


def test_compute_normalize_uses_normalize_time():
    points = compute_normalize([_group(time="2026-06-24T12:00:00Z")], "day")
    assert points[0].new_time == "2026-06-23T22:00:00Z"  # local midnight, CEST (+02:00)


def test_preview_retime_issues_a_token_for_non_empty_points():
    preview = preview_retime([_point()])
    assert preview.matched_count == 1
    assert preview.confirm_token


def test_preview_retime_empty_list_has_no_token():
    preview = preview_retime([])
    assert preview.matched_count == 0
    assert preview.confirm_token == ""


class _RecordingWriteApi:
    def __init__(self, log: list[str]):
        self.log = log

    def write(self, bucket, org, record):
        self.log.append(f"write:{record.to_line_protocol()}")


class _RecordingDeleteApi:
    def __init__(self, log: list[str]):
        self.log = log

    def delete(self, start, stop, predicate, bucket, org):
        self.log.append(f"delete:{predicate}:{start}")


class _FakeClient:
    def __init__(self):
        self.log: list[str] = []
        self.write_options_used = None

    def write_api(self, write_options=None):
        self.write_options_used = write_options
        return _RecordingWriteApi(self.log)

    def delete_api(self):
        return _RecordingDeleteApi(self.log)


def test_execute_retime_writes_before_deleting():
    client = _FakeClient()
    point = _point()
    preview = preview_retime([point])

    execute_retime(client, "org", [point], preview.confirm_token)

    assert client.write_options_used is SYNCHRONOUS
    assert len(client.log) == 2
    assert client.log[0].startswith("write:")
    assert client.log[1].startswith("delete:")


def test_execute_retime_writes_all_fields_of_the_point():
    client = _FakeClient()
    point = _point(
        fields={
            "value": {"value": 21.5, "value_type": "float"},
            "active": {"value": True, "value_type": "bool"},
        }
    )
    preview = preview_retime([point])

    execute_retime(client, "org", [point], preview.confirm_token)

    write_line = client.log[0]
    assert "value=21.5" in write_line
    assert "active=true" in write_line


def test_execute_retime_coerces_whole_number_to_declared_type():
    # Same round-trip bug as write.py: a whole-number float (e.g. 60.0,
    # already stored as a float field in InfluxDB) becomes indistinguishable
    # from a JSON int once it's passed through a browser - value_type is what
    # decides, not whatever Pydantic happened to infer.
    client = _FakeClient()
    point = _point(fields={"humidity": {"value": 60, "value_type": "float"}})
    preview = preview_retime([point])

    execute_retime(client, "org", [point], preview.confirm_token)

    write_line = client.log[0]
    assert "humidity=60 " in write_line
    assert "humidity=60i" not in write_line


def test_execute_retime_skips_noop_moves():
    client = _FakeClient()
    point = _point(new_time="2026-06-24T10:00:00Z")  # same as old_time
    preview = preview_retime([point])

    execute_retime(client, "org", [point], preview.confirm_token)

    assert client.log == []


def test_execute_retime_rejects_invalid_confirm_token():
    client = _FakeClient()
    point = _point()

    try:
        execute_retime(client, "org", [point], "bogus-token")
        assert False, "expected ValueError"
    except ValueError:
        pass

    assert client.log == []
