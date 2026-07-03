from typing import TYPE_CHECKING, Literal

if TYPE_CHECKING:
    from app.models.points import PointRow

# Field names that ioBroker's field-based storage mode writes as InfluxDB fields
# instead of tags. Their presence as _field values identifies the variant.
IOBROKER_META_FIELDS = {"ack", "from", "q"}
IOBROKER_ALL_FIELDS = IOBROKER_META_FIELDS | {"value"}


def detect_variant(records: list) -> Literal["tag-based", "field-based"]:
    """Return 'field-based' if any record uses ack/from/q as a _field value."""
    for record in records:
        if record.get_field() in IOBROKER_META_FIELDS:
            return "field-based"
    return "tag-based"


def _to_tag_string(value: object) -> str:
    """Convert a field value to a synthetic tag string for display."""
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def group_field_based_rows(rows: "list[PointRow]") -> "list[PointRow]":
    """Collapse multiple per-field PointRows into one per logical ioBroker point.

    The grouped row has:
    - tags: synthetic string representations of ack/from/q (for display only)
    - field: "value" / value: the sensor reading
    - extra_fields: typed FieldEntry objects for ack/from/q (used by retime to
      write all fields to the new timestamp)
    - storage_variant: "field-based"

    Delete and single-value edit work correctly from the empty-tags InfluxDB
    series without needing extra_fields.
    """
    # Import here to avoid circular dependency at module load time
    from app.models.points import FieldEntry, PointRow

    groups: dict[str, list[PointRow]] = {}
    order: list[str] = []
    for row in rows:
        key = f"{row.measurement}||{row.time}"
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(row)

    result: list[PointRow] = []
    for key in order:
        field_rows = groups[key]
        value_row = next((r for r in field_rows if r.field == "value"), field_rows[0])
        extra = {
            r.field: FieldEntry(value=r.value, value_type=r.value_type)
            for r in field_rows
            if r.field != "value"
        }
        synthetic_tags = {
            r.field: _to_tag_string(r.value)
            for r in field_rows
            if r.field in IOBROKER_META_FIELDS
        }
        result.append(
            PointRow(
                id=value_row.id,
                measurement=value_row.measurement,
                tags=synthetic_tags,
                field="value",
                value=value_row.value,
                value_type=value_row.value_type,
                time=value_row.time,
                storage_variant="field-based",
                extra_fields=extra if extra else None,
            )
        )
    return result


def expand_field_based_row(row: "PointRow") -> "list[PointRow]":
    """Inverse of group_field_based_rows: one grouped PointRow → individual field rows.

    Used before ODS export so the spreadsheet contains one row per InfluxDB field
    (value, ack, from, q), all with tags={}, making a round-trip export→import safe.
    """
    from app.models.points import PointRow

    if row.storage_variant != "field-based" or not row.extra_fields:
        return [row]

    rows: list[PointRow] = [
        PointRow(
            id=row.id,
            measurement=row.measurement,
            tags={},
            field=row.field,
            value=row.value,
            value_type=row.value_type,
            time=row.time,
        )
    ]
    for field_name, entry in row.extra_fields.items():
        rows.append(
            PointRow(
                id=row.id,
                measurement=row.measurement,
                tags={},
                field=field_name,
                value=entry.value,
                value_type=entry.value_type,
                time=row.time,
            )
        )
    return rows
