import csv
import io

from app.services import import_raw as import_service

START = "2026-05-23T00:00:00Z"
STOP = "2026-06-22T00:00:00Z"


def _content(rows: list[list[str]]) -> bytes:
    # rows: [_time, _value, _field, _measurement, tag_value] - one shared "room" tag column.
    header = ["", "result", "table", "_start", "_stop", "_time", "_value", "_field", "_measurement", "room"]
    datatype_row = [
        "#datatype", "string", "long", "dateTime:RFC3339", "dateTime:RFC3339", "dateTime:RFC3339",
        "double", "string", "string", "string", "string",
    ]
    group_row = ["#group", "false", "false", "true", "true", "false", "false", "true", "true", "true"]
    default_row = ["#default", "_result", *([""] * 8)]

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(datatype_row)
    writer.writerow(group_row)
    writer.writerow(default_row)
    writer.writerow(header)
    for time_str, value, field, measurement, tag_value in rows:
        writer.writerow(["", "", "0", START, STOP, time_str, value, field, measurement, tag_value])
    return buffer.getvalue().encode("utf-8")


def _rows() -> list[list[str]]:
    return [
        ["2026-06-19T08:00:00Z", "21.5", "value", "temp", "kitchen"],
        ["2026-06-19T09:00:00Z", "19.0", "value", "temp", "office"],
    ]


class _FakeWriteApi:
    def __init__(self):
        self.calls: list[dict] = []

    def write(self, bucket, org, record):
        # record is a batch (list of Points), not a single Point - matches
        # the real write_api()'s line-protocol-batching behavior.
        lines = [point.to_line_protocol() for point in record]
        self.calls.append({"bucket": bucket, "org": org, "lines": lines})


class _FakeClient:
    def __init__(self):
        self.write_api_instance = _FakeWriteApi()

    def write_api(self, write_options=None):
        return self.write_api_instance


def test_import_raw_writes_all_points_in_a_single_batched_call():
    client = _FakeClient()
    written_count = import_service.import_raw(client, "org", _content(_rows()), "bucket1")

    assert written_count == 2
    assert len(client.write_api_instance.calls) == 1
    assert len(client.write_api_instance.calls[0]["lines"]) == 2
    assert client.write_api_instance.calls[0]["bucket"] == "bucket1"


def test_import_raw_aborts_on_malformed_row_without_writing_later_rows():
    rows = [["not-a-date", "1", "value", "temp", "kitchen"], *_rows()]
    client = _FakeClient()

    try:
        import_service.import_raw(client, "org", _content(rows), "bucket1")
        assert False, "expected a ValueError"
    except ValueError:
        pass

    assert len(client.write_api_instance.calls) == 0


def test_import_raw_flushes_rows_parsed_before_a_later_malformed_row():
    # The bad row comes after two good ones - those two must still be
    # durably written even though the whole import aborts, not silently
    # dropped just because they hadn't crossed the batch-size threshold yet.
    rows = [*_rows(), ["not-a-date", "1", "value", "temp", "kitchen"]]
    client = _FakeClient()

    try:
        import_service.import_raw(client, "org", _content(rows), "bucket1")
        assert False, "expected a ValueError"
    except ValueError:
        pass

    assert len(client.write_api_instance.calls) == 1
    assert len(client.write_api_instance.calls[0]["lines"]) == 2
