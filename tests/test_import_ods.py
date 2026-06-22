import io
import json

from influxdb_client.rest import ApiException
from odf.opendocument import load
from odf.table import Table, TableRow

from app.models.points import PointRow
from app.services import import_ods as import_service
from app.services import ods_io


def _rows() -> list[PointRow]:
    return [
        PointRow(
            id="x1", measurement="temp", tags={"room": "kitchen"}, field="value",
            value=21.5, value_type="float", time="2026-06-19T08:00:00Z",
        ),
        PointRow(
            id="x2", measurement="temp", tags={"room": "office"}, field="value",
            value=19.0, value_type="float", time="2026-06-19T09:00:00Z",
        ),
    ]


def _content(rows: list[PointRow] | None = None) -> bytes:
    return ods_io.build_ods("bucket1", rows if rows is not None else _rows())


class _FakeHttpResponse:
    def __init__(self, status: int, message: str):
        self.status = status
        self.reason = "Bad Request"
        self.data = json.dumps({"code": "invalid", "message": message}).encode()

    def getheaders(self):
        return {}

    def getheader(self, name, default=None):
        return default


class _FakeWriteApi:
    def __init__(self, fail_on_field: str | None = None):
        self.calls: list[dict] = []
        self.fail_on_field = fail_on_field

    def write(self, bucket, org, record):
        line = record.to_line_protocol()
        if self.fail_on_field and f"{self.fail_on_field}=" in line:
            raise ApiException(http_resp=_FakeHttpResponse(400, "invalid field value"))
        self.calls.append({"bucket": bucket, "org": org, "line": line})


class _FakeClient:
    def __init__(self, fail_on_field: str | None = None):
        self.write_api_instance = _FakeWriteApi(fail_on_field)

    def write_api(self, write_options=None):
        return self.write_api_instance


def test_preview_import_parses_without_writing():
    response = import_service.preview_import(_content())

    assert response.dry_run is True
    assert response.total_rows == 2
    assert response.valid_rows == 2
    assert response.written_count == 0
    assert response.buckets == ["bucket1"]
    assert len(response.sample) == 2
    assert response.errors == []


def test_execute_import_writes_each_valid_row():
    client = _FakeClient()
    response = import_service.execute_import(client, "org", _content())

    assert response.dry_run is False
    assert response.written_count == 2
    assert len(client.write_api_instance.calls) == 2
    assert response.errors == []


def test_execute_import_skips_and_collects_per_row_write_errors():
    client = _FakeClient(fail_on_field="value")
    response = import_service.execute_import(client, "org", _content())

    assert response.written_count == 0
    assert len(response.errors) == 2
    assert response.errors[0].reason == "invalid field value"
    rows = [row_number for row_number, _ in import_service.ods_io.parse_ods(_content())[0]]
    assert [error.row_number for error in response.errors] == rows


def _content_with_one_malformed_row() -> bytes:
    # Both rows from _rows() share the same single tag key ("room"), so the
    # header has exactly one "tag.room" column - append a row matching that
    # column count, but with an invalid value_type, to get a real parse error
    # alongside otherwise-valid rows in the same file.
    content = ods_io.build_ods("bucket1", _rows())
    doc = load(io.BytesIO(content))
    table = doc.spreadsheet.getElementsByType(Table)[0]
    bad_row = TableRow()
    values = ["bucket1", "temp", "kitchen", "value", "1", "not-a-type", "irrelevant", "0"]
    for value in values:
        bad_row.addElement(ods_io._string_cell(value))
    table.addElement(bad_row)
    buffer = io.BytesIO()
    doc.save(buffer)
    return buffer.getvalue()


def test_execute_import_collects_parse_errors_alongside_write_errors():
    client = _FakeClient()
    response = import_service.execute_import(client, "org", _content_with_one_malformed_row())

    assert response.total_rows == 3
    assert response.valid_rows == 2
    assert response.written_count == 2
    assert len(response.errors) == 1
    assert "value_type" in response.errors[0].reason
