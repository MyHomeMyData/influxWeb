import io
import zipfile
from zoneinfo import ZoneInfo

import pytest
from odf.opendocument import OpenDocumentSpreadsheet, load
from odf.table import Table, TableCell, TableRow

from app.models.points import PointRow
from app.services import ods_io
from app.utils.time import rfc3339_to_ns


def _make_row(time: str, value=1.0) -> PointRow:
    value_type = "bool" if isinstance(value, bool) else "float" if isinstance(value, float) else "int"
    return PointRow(id="x", measurement="m", tags={}, field="value", value=value, value_type=value_type, time=time)


def _dummy_doc() -> OpenDocumentSpreadsheet:
    return OpenDocumentSpreadsheet()


def _read_table(content: bytes) -> Table:
    doc = load(io.BytesIO(content))
    return doc.spreadsheet.getElementsByType(Table)[0]


def _cell_text(cell: TableCell) -> str:
    return "".join(node.data for node in cell.childNodes[0].childNodes) if cell.childNodes else ""


def test_time_cell_applies_summer_dst_offset(monkeypatch):
    monkeypatch.setattr(ods_io, "LOCAL_ZONE", ZoneInfo("Europe/Berlin"))
    cell = ods_io._time_cell("2026-06-18T08:50:24Z", ods_io._setup_styles(_dummy_doc()))
    assert cell.getAttribute("datevalue") == "2026-06-18T10:50:24.000000"


def test_time_cell_applies_winter_non_dst_offset(monkeypatch):
    monkeypatch.setattr(ods_io, "LOCAL_ZONE", ZoneInfo("Europe/Berlin"))
    cell = ods_io._time_cell("2026-01-18T08:50:24Z", ods_io._setup_styles(_dummy_doc()))
    assert cell.getAttribute("datevalue") == "2026-01-18T09:50:24.000000"


def test_build_ods_instructions_mention_local_zone(monkeypatch):
    monkeypatch.setattr(ods_io, "LOCAL_ZONE", ZoneInfo("Europe/Berlin"))
    content = ods_io.build_ods("bucket1", [_make_row("2026-06-18T08:50:24Z")])
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        xml = archive.read("content.xml")
    assert b"Europe/Berlin" in xml
    assert b"NOT UTC" in xml
    assert b"time_ms" in xml


def test_value_cell_uses_declared_type_not_python_type():
    # Reproduces the export-side instance of the round-trip bug: a row whose
    # value is a whole-number float (e.g. 60.0, already round-tripped through
    # the frontend as JSON "60") must still be exported as a float-styled
    # cell, not silently downgraded to an int-styled one.
    styles = ods_io._setup_styles(_dummy_doc())
    cell = ods_io._value_cell(60, "float", styles)
    assert cell.getAttribute("stylename") == "FloatCell"


def test_value_cell_int_type_uses_int_style():
    styles = ods_io._setup_styles(_dummy_doc())
    cell = ods_io._value_cell(60, "int", styles)
    assert cell.getAttribute("stylename") == "IntCell"


def test_milliseconds_of_extracts_sub_second_remainder():
    assert ods_io._milliseconds_of("2026-06-18T08:50:24.123456Z") == 123
    assert ods_io._milliseconds_of("2026-06-18T08:50:24Z") == 0


def test_build_ods_writes_time_ms_column(monkeypatch):
    monkeypatch.setattr(ods_io, "LOCAL_ZONE", ZoneInfo("Europe/Berlin"))
    content = ods_io.build_ods("bucket1", [_make_row("2026-06-18T08:50:24.123456Z")])
    table = _read_table(content)
    rows = table.getElementsByType(TableRow)
    header = [_cell_text(cell) for cell in rows[-2].getElementsByType(TableCell)]
    data_row = [_cell_text(cell) for cell in rows[-1].getElementsByType(TableCell)]
    assert header[-1] == "time_ms"
    assert data_row[-1] == "123"


def _build_minimal_ods(header: list[str], data_rows: list[list[str]]) -> bytes:
    # A hand-rolled file with plain string cells everywhere - lets tests probe
    # parse_ods()'s header/column handling and error paths without depending
    # on build_ods()'s exact numeric/date cell formatting.
    doc = OpenDocumentSpreadsheet()
    table = Table(name="Data")
    header_row = TableRow()
    for title in header:
        header_row.addElement(ods_io._string_cell(title))
    table.addElement(header_row)
    for values in data_rows:
        row = TableRow()
        for value in values:
            row.addElement(ods_io._string_cell(value))
        table.addElement(row)
    doc.spreadsheet.addElement(table)
    buffer = io.BytesIO()
    doc.save(buffer)
    return buffer.getvalue()


def test_parse_ods_round_trips_build_ods_output(monkeypatch):
    monkeypatch.setattr(ods_io, "LOCAL_ZONE", ZoneInfo("Europe/Berlin"))
    rows = [
        PointRow(
            id="x1", measurement="temp", tags={"room": "kitchen"}, field="value",
            value=21.5, value_type="float", time="2026-06-18T08:50:24.123Z",
        ),
        PointRow(
            id="x2", measurement="temp", tags={"room": "kitchen"}, field="active",
            value=True, value_type="bool", time="2026-06-18T08:50:24Z",
        ),
        PointRow(
            id="x3", measurement="status", tags={}, field="label",
            value="ok", value_type="string", time="2026-06-18T09:00:00Z",
        ),
        PointRow(
            id="x4", measurement="counter", tags={}, field="count",
            value=5, value_type="int", time="2026-06-18T09:00:00Z",
        ),
    ]
    content = ods_io.build_ods("bucket1", rows)

    valid_rows, errors = ods_io.parse_ods(content)

    assert errors == []
    assert len(valid_rows) == 4
    requests = [request for _, request in valid_rows]

    assert requests[0].bucket == "bucket1"
    assert requests[0].measurement == "temp"
    assert requests[0].tags == {"room": "kitchen"}
    assert requests[0].field == "value"
    assert requests[0].value == 21.5
    assert requests[0].value_type == "float"
    assert rfc3339_to_ns(requests[0].time) == rfc3339_to_ns("2026-06-18T08:50:24.123Z")

    assert requests[1].value is True
    assert requests[1].value_type == "bool"

    assert requests[2].tags == {}
    assert requests[2].value == "ok"
    assert requests[2].value_type == "string"

    assert requests[3].value == 5
    assert requests[3].value_type == "int"


def test_parse_ods_garbage_content_raises_value_error():
    # A non-ODS upload (wrong file picked, truncated download, ...) fails
    # inside odfpy with a library-internal exception type (BadZipFile here) -
    # parse_ods() must normalize that to a ValueError like its own structural
    # errors, not let it escape as something the router doesn't expect.
    with pytest.raises(ValueError, match="could not read this as an ODS file"):
        ods_io.parse_ods(b"not an ods file")


def test_parse_ods_missing_required_column_raises():
    header = ["bucket", "measurement", "field", "value", "value_type", "time"]  # no time_ms
    content = _build_minimal_ods(header, [["b", "m", "f", "1", "int", "irrelevant"]])

    with pytest.raises(ValueError, match="time_ms"):
        ods_io.parse_ods(content)


def test_parse_ods_invalid_value_type_is_collected_as_row_error():
    content = _build_minimal_ods(
        ods_io.REQUIRED_IMPORT_COLUMNS,
        [["b", "m", "f", "1", "weird", "irrelevant", "0"]],
    )

    valid_rows, errors = ods_io.parse_ods(content)

    assert valid_rows == []
    assert len(errors) == 1
    assert errors[0].row_number == 2
    assert "value_type" in errors[0].reason


def test_parse_ods_malformed_time_is_collected_as_row_error():
    content = _build_minimal_ods(
        ods_io.REQUIRED_IMPORT_COLUMNS,
        [["b", "m", "f", "1", "int", "not-a-date", "0"]],
    )

    valid_rows, errors = ods_io.parse_ods(content)

    assert valid_rows == []
    assert len(errors) == 1
    assert "date value" in errors[0].reason


def test_parse_ods_blank_trailing_row_is_skipped_without_error():
    content = _build_minimal_ods(ods_io.REQUIRED_IMPORT_COLUMNS, [[""]])

    valid_rows, errors = ods_io.parse_ods(content)

    assert valid_rows == []
    assert errors == []
