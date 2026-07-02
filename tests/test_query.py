from datetime import datetime, timezone

from app.models.points import Selection, TimeRange
from app.services import query as query_service


class _FakeRecord:
    def __init__(self, index: int):
        self.values = {"_measurement": "m", "_field": "value", "result": "_result", "table": 0}

    def get_time(self):
        return datetime(2026, 6, 18, tzinfo=timezone.utc)

    def get_measurement(self):
        return "m"

    def get_field(self):
        return "value"

    def get_value(self):
        return 1.0


class _FakeQueryApi:
    def __init__(self, total_records: int):
        self.total_records = total_records

    def query_stream(self, flux):
        return (_FakeRecord(i) for i in range(self.total_records))


class _FakeClient:
    def __init__(self, total_records: int):
        self.total_records = total_records

    def query_api(self):
        return _FakeQueryApi(self.total_records)


def _selection() -> tuple[Selection, TimeRange]:
    return Selection(bucket="b"), TimeRange(start="-1h", stop="now()")


class _FakeMultiFieldRecord:
    # Reproduces ioBroker's "store as fields" mode: ack/from/q/value have no
    # differentiating tag, so Flux returns one table per field - this fake
    # client yields them table-by-table (all "ack" rows, then all "from"
    # rows, ...), not interleaved by time, exactly like query_stream() does
    # for that real shape.
    def __init__(self, field: str, time, value):
        self.values = {"_measurement": "m", "_field": field, "result": "_result", "table": 0}
        self._time = time
        self._field = field
        self._value = value

    def get_time(self):
        return self._time

    def get_measurement(self):
        return "m"

    def get_field(self):
        return self._field

    def get_value(self):
        return self._value


class _FakeMultiFieldQueryApi:
    def __init__(self, records):
        self._records = records

    def query_stream(self, flux):
        return iter(self._records)


class _FakeMultiFieldClient:
    def __init__(self, records):
        self._records = records

    def query_api(self):
        return _FakeMultiFieldQueryApi(self._records)


def test_rows_from_separate_field_tables_are_sorted_by_time():
    t1 = datetime(2026, 6, 18, 10, 0, 0, tzinfo=timezone.utc)
    t2 = datetime(2026, 6, 18, 10, 0, 1, tzinfo=timezone.utc)
    records = [
        _FakeMultiFieldRecord("ack", t1, True),
        _FakeMultiFieldRecord("ack", t2, True),
        _FakeMultiFieldRecord("value", t1, 36.5),
        _FakeMultiFieldRecord("value", t2, 36.6),
    ]
    selection, time_range = _selection()
    rows, _, _fb = query_service.query_points(_FakeMultiFieldClient(records), selection, time_range, None)

    assert [(row.time, row.field) for row in rows] == [
        (t1.isoformat().replace("+00:00", "Z"), "ack"),
        (t1.isoformat().replace("+00:00", "Z"), "value"),
        (t2.isoformat().replace("+00:00", "Z"), "ack"),
        (t2.isoformat().replace("+00:00", "Z"), "value"),
    ]


def test_result_under_cap_is_not_truncated():
    selection, time_range = _selection()
    rows, truncated, _ = query_service.query_points(_FakeClient(5), selection, time_range, None)
    assert len(rows) == 5
    assert truncated is False


def test_result_exactly_at_cap_is_not_truncated():
    selection, time_range = _selection()
    rows, truncated, _ = query_service.query_points(_FakeClient(10), selection, time_range, 10)
    assert len(rows) == 10
    assert truncated is False


def test_result_over_cap_is_truncated_at_the_cap():
    selection, time_range = _selection()
    rows, truncated, _ = query_service.query_points(_FakeClient(100), selection, time_range, 10)
    assert len(rows) == 10
    assert truncated is True


def test_no_limit_falls_back_to_the_hard_max(monkeypatch):
    monkeypatch.setattr(query_service, "MAX_QUERY_POINTS", 7)
    selection, time_range = _selection()
    rows, truncated, _ = query_service.query_points(_FakeClient(100), selection, time_range, None)
    assert len(rows) == 7
    assert truncated is True


def test_requested_limit_above_hard_max_is_clamped(monkeypatch):
    monkeypatch.setattr(query_service, "MAX_QUERY_POINTS", 7)
    selection, time_range = _selection()
    rows, truncated, _ = query_service.query_points(_FakeClient(100), selection, time_range, 1_000_000)
    assert len(rows) == 7
    assert truncated is True


def test_measurement_filter_uses_equality_not_contains():
    # contains() defeats InfluxDB's predicate push-down (measured 100x+ slower
    # on a real bucket - it forces a full scan instead of an index lookup).
    assert query_service._measurement_filter(["temperature"]) == 'r._measurement == "temperature"'


def test_measurement_filter_or_chains_multiple_values():
    result = query_service._measurement_filter(["temperature", "humidity"])
    assert result == 'r._measurement == "temperature" or r._measurement == "humidity"'
    assert "contains(" not in result


def test_measurement_filter_empty_list_is_none():
    assert query_service._measurement_filter([]) is None


def test_tag_filter_uses_equality_not_contains():
    assert query_service._tag_filter("room", ["kitchen"]) == 'r["room"] == "kitchen"'


def test_tag_filter_or_chains_multiple_values():
    result = query_service._tag_filter("room", ["kitchen", "bath"])
    assert result == 'r["room"] == "kitchen" or r["room"] == "bath"'
    assert "contains(" not in result
