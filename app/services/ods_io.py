import io
from datetime import datetime

from odf.number import DateStyle, Day, Hours, Minutes, Month, Number, NumberStyle, Seconds, Year
from odf.number import Text as NText
from odf.opendocument import OpenDocumentSpreadsheet
from odf.style import Style, TextProperties
from odf.table import Table, TableCell, TableRow
from odf.text import P

from app.models.points import FieldValue, FieldValueType, PointRow
from app.utils.field_value import coerce_field_value
from app.utils.timezone import get_local_zone, get_local_zone_name

LOCAL_ZONE = get_local_zone()


def _build_instructions() -> list[str]:
    # Shown as italic/gray rows above the header, so the round-trip contract for
    # a later import travels with the file even once it's detached from the app.
    offset = datetime.now(LOCAL_ZONE).strftime("%z")
    offset_display = f"{offset[:3]}:{offset[3:]}"  # "+0200" -> "+02:00"
    return [
        "influxWeb export - read before editing and re-importing.",
        "Do not rename, reorder, or delete the header row directly below this block.",
        "Tag columns must keep their 'tag.' prefix in the header.",
        f"The 'time' column is shown in the server's local time zone ({get_local_zone_name()}), with "
        f"daylight saving time applied per date - NOT UTC. As of this export, that's UTC{offset_display}. "
        "All other absolute time values in this app (e.g. the web UI) are UTC.",
        "The 'time_ms' column holds the millisecond remainder (0-999) of 'time' as a plain number, "
        "since a spreadsheet date cell can lose sub-second precision once edited. Leave it as 0 unless "
        "you specifically intend to set a sub-second time.",
        "Changing bucket, measurement, a tag value, or the time/time_ms of a row changes which point it maps to on import.",
        "Deleting a row here does NOT delete the point in InfluxDB - import only writes or overwrites, never deletes.",
        "Add a new row with every column filled in to create a new point on import.",
    ]


def _setup_styles(doc: OpenDocumentSpreadsheet) -> dict[str, str]:
    float_number = NumberStyle(name="FloatFormat")
    float_number.addElement(Number(decimalplaces="3", minintegerdigits="1", grouping="false"))
    doc.automaticstyles.addElement(float_number)
    float_cell = Style(name="FloatCell", family="table-cell", datastylename="FloatFormat")
    doc.automaticstyles.addElement(float_cell)

    int_number = NumberStyle(name="IntFormat")
    int_number.addElement(Number(decimalplaces="0", minintegerdigits="1", grouping="false"))
    doc.automaticstyles.addElement(int_number)
    int_cell = Style(name="IntCell", family="table-cell", datastylename="IntFormat")
    doc.automaticstyles.addElement(int_cell)

    datetime_format = DateStyle(name="DateTimeFormat")
    datetime_format.addElement(Day(style="long"))
    datetime_format.addElement(NText(text="."))
    datetime_format.addElement(Month(style="long"))
    datetime_format.addElement(NText(text="."))
    datetime_format.addElement(Year(style="long"))
    datetime_format.addElement(NText(text=" "))
    datetime_format.addElement(Hours(style="long"))
    datetime_format.addElement(NText(text=":"))
    datetime_format.addElement(Minutes(style="long"))
    datetime_format.addElement(NText(text=":"))
    datetime_format.addElement(Seconds(style="long"))
    doc.automaticstyles.addElement(datetime_format)
    datetime_cell = Style(name="DateTimeCell", family="table-cell", datastylename="DateTimeFormat")
    doc.automaticstyles.addElement(datetime_cell)

    header_style = Style(name="HeaderCell", family="table-cell")
    header_style.addElement(TextProperties(fontweight="bold"))
    doc.automaticstyles.addElement(header_style)

    instruction_style = Style(name="InstructionCell", family="table-cell")
    instruction_style.addElement(TextProperties(fontstyle="italic", color="#888888"))
    doc.automaticstyles.addElement(instruction_style)

    return {
        "float": "FloatCell",
        "int": "IntCell",
        "datetime": "DateTimeCell",
        "header": "HeaderCell",
        "instruction": "InstructionCell",
    }


def _string_cell(text: str, style_name: str | None = None) -> TableCell:
    cell = TableCell(valuetype="string", stylename=style_name) if style_name else TableCell(valuetype="string")
    cell.addElement(P(text=text))
    return cell


def _value_cell(value: FieldValue, value_type: FieldValueType, styles: dict[str, str]) -> TableCell:
    # Cast explicitly by the declared type rather than inspecting the raw
    # Python value: a row's `value` may have round-tripped through the
    # frontend as JSON, where a whole-number float is indistinguishable from
    # an int (the exact bug fixed in write_point()/execute_retime()) - using
    # `isinstance` here would silently export it with the wrong cell style.
    coerced = coerce_field_value(value, value_type)

    if value_type == "bool":
        cell = TableCell(valuetype="boolean", booleanvalue="true" if coerced else "false")
        cell.addElement(P(text="TRUE" if coerced else "FALSE"))
        return cell

    if value_type == "int":
        cell = TableCell(valuetype="float", value=str(coerced), stylename=styles["int"])
        cell.addElement(P(text=str(coerced)))
        return cell

    if value_type == "float":
        cell = TableCell(valuetype="float", value=str(coerced), stylename=styles["float"])
        display = f"{coerced:,.3f}".replace(",", "X").replace(".", ",").replace("X", ".")
        cell.addElement(P(text=display))
        return cell

    return _string_cell(str(coerced))


def _time_cell(time_str: str, styles: dict[str, str]) -> TableCell:
    dt_utc = datetime.fromisoformat(time_str.replace("Z", "+00:00"))
    dt_local = dt_utc.astimezone(LOCAL_ZONE)
    date_value = dt_local.strftime("%Y-%m-%dT%H:%M:%S.%f")
    display = dt_local.strftime("%d.%m.%Y %H:%M:%S")
    cell = TableCell(valuetype="date", datevalue=date_value, stylename=styles["datetime"])
    cell.addElement(P(text=display))
    return cell


def _milliseconds_of(time_str: str) -> int:
    dt_utc = datetime.fromisoformat(time_str.replace("Z", "+00:00"))
    return dt_utc.microsecond // 1000


def build_ods(bucket: str, rows: list[PointRow]) -> bytes:
    tag_keys: list[str] = []
    for row in rows:
        for key in row.tags:
            if key not in tag_keys:
                tag_keys.append(key)

    doc = OpenDocumentSpreadsheet()
    styles = _setup_styles(doc)
    sheet = Table(name="Data")

    for line in _build_instructions():
        row = TableRow()
        row.addElement(_string_cell(line, styles["instruction"]))
        sheet.addElement(row)

    header_titles = [
        "bucket",
        "measurement",
        *[f"tag.{key}" for key in tag_keys],
        "field",
        "value",
        "time",
        "time_ms",
    ]
    header_row = TableRow()
    for title in header_titles:
        header_row.addElement(_string_cell(title, styles["header"]))
    sheet.addElement(header_row)

    for row in rows:
        table_row = TableRow()
        table_row.addElement(_string_cell(bucket))
        table_row.addElement(_string_cell(row.measurement))
        for key in tag_keys:
            table_row.addElement(_string_cell(row.tags.get(key, "")))
        table_row.addElement(_string_cell(row.field))
        table_row.addElement(_value_cell(row.value, row.value_type, styles))
        table_row.addElement(_time_cell(row.time, styles))
        table_row.addElement(_value_cell(_milliseconds_of(row.time), "int", styles))
        sheet.addElement(table_row)

    doc.spreadsheet.addElement(sheet)

    buffer = io.BytesIO()
    doc.save(buffer)
    return buffer.getvalue()
