import csv
import io
from typing import Iterator

from app.models.points import FieldValue, FieldValueType, PointWriteRequest
from app.utils.time import rfc3339_to_ns

DATATYPE_TO_VALUE_TYPE: dict[str, FieldValueType] = {
    "long": "int",
    "double": "float",
    "boolean": "bool",
    "string": "string",
}


def _parse_value(raw: str, value_type: FieldValueType) -> FieldValue:
    if value_type == "bool":
        return raw.strip().lower() == "true"
    if value_type == "int":
        return int(float(raw))
    if value_type == "float":
        return float(raw)
    return raw


def iter_raw_points(content: bytes, bucket: str) -> Iterator[PointWriteRequest]:
    # Deliberately minimal and abort-on-first-error: raises ValueError
    # immediately on anything it can't make sense of, rather than trying to
    # validate or recover. A new #datatype line starts a new block (Export
    # Raw's whole-bucket dump commonly has several, one per distinct
    # measurement/tag shape) - it just resets the column layout, not an error.
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError(f"could not read this file as UTF-8 text: {exc}") from exc

    reader = csv.reader(io.StringIO(text))
    datatype_row: list[str] | None = None
    column_index: dict[str, int] | None = None
    tag_keys: list[str] = []
    value_type: FieldValueType | None = None

    for row in reader:
        if not row or all(cell == "" for cell in row):
            continue

        if row[0] == "#datatype":
            datatype_row = row
            column_index = None  # the next header row starts a new block
            continue
        if row[0].startswith("#"):
            continue

        if column_index is None:
            if datatype_row is None:
                raise ValueError(f"line {reader.line_num}: missing #datatype row before the header")
            column_index = {name: position for position, name in enumerate(row)}
            for required in ("_time", "_field", "_value", "_measurement"):
                if required not in column_index:
                    raise ValueError(f"missing required column {required!r}")
            datatype = datatype_row[column_index["_value"]]
            value_type = DATATYPE_TO_VALUE_TYPE.get(datatype)
            if value_type is None:
                raise ValueError(f"unsupported _value datatype {datatype!r}")
            tag_keys = [
                name for name in row if name and not name.startswith("_") and name not in ("result", "table")
            ]
            continue

        try:
            tags = {key: row[column_index[key]] for key in tag_keys if row[column_index[key]]}
            time_str = row[column_index["_time"]]
            rfc3339_to_ns(time_str)  # validates the timestamp without reformatting it
            yield PointWriteRequest(
                bucket=bucket,
                measurement=row[column_index["_measurement"]],
                tags=tags,
                field=row[column_index["_field"]],
                value=_parse_value(row[column_index["_value"]], value_type),
                value_type=value_type,
                time=time_str,
            )
        except Exception as exc:
            raise ValueError(f"line {reader.line_num}: {exc}") from exc

    if column_index is None:
        raise ValueError("could not find a #datatype block and header row in this file")
