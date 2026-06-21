import io
import zipfile
from zoneinfo import ZoneInfo

from odf.opendocument import OpenDocumentSpreadsheet, load
from odf.table import Table, TableCell, TableRow

from app.models.points import PointRow
from app.services import ods_io


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
