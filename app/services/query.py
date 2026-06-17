from influxdb_client import InfluxDBClient

from app.models.points import FieldValue, PointDetail, PointRow, Selection, TimeRange
from app.utils.flux import flux_string
from app.utils.point_id import encode_point_id
from app.utils.time import ns_to_rfc3339

RESERVED_COLUMNS = {"result", "table"}


def _record_tags(record) -> dict[str, str]:
    return {
        key: value
        for key, value in record.values.items()
        if not key.startswith("_") and key not in RESERVED_COLUMNS
    }


def _measurement_filter(measurements: list[str]) -> str | None:
    if not measurements:
        return None
    values = ", ".join(flux_string(m) for m in measurements)
    return f"contains(value: r._measurement, set: [{values}])"


def _tag_filter(tag_key: str, tag_values: list[str]) -> str:
    values = ", ".join(flux_string(v) for v in tag_values)
    return f"contains(value: r[{flux_string(tag_key)}], set: [{values}])"


def build_query_flux(selection: Selection, time_range: TimeRange, limit: int | None) -> str:
    lines = [
        f"from(bucket: {flux_string(selection.bucket)})",
        f"  |> range(start: {time_range.start}, stop: {time_range.stop})",
    ]

    measurement_clause = _measurement_filter(selection.measurements)
    if measurement_clause:
        lines.append(f"  |> filter(fn: (r) => {measurement_clause})")

    for tag_key, tag_values in selection.tags.items():
        if tag_values:
            lines.append(f"  |> filter(fn: (r) => {_tag_filter(tag_key, tag_values)})")

    if limit is not None:
        lines.append(f"  |> limit(n: {limit})")

    return "\n".join(lines)


def query_points(
    client: InfluxDBClient, selection: Selection, time_range: TimeRange, limit: int | None
) -> tuple[list[PointRow], bool]:
    flux = build_query_flux(selection, time_range, limit + 1 if limit else None)
    tables = client.query_api().query(flux)

    rows: list[PointRow] = []
    for table in tables:
        for record in table.records:
            tags = _record_tags(record)
            time_str = record.get_time().isoformat().replace("+00:00", "Z")
            rows.append(
                PointRow(
                    id=encode_point_id(selection.bucket, record.get_measurement(), tags, time_str),
                    measurement=record.get_measurement(),
                    tags=tags,
                    field=record.get_field(),
                    value=record.get_value(),
                    time=time_str,
                )
            )

    truncated = limit is not None and len(rows) > limit
    if truncated:
        rows = rows[:limit]
    return rows, truncated


def get_point_detail(
    client: InfluxDBClient, bucket: str, measurement: str, tags: dict[str, str], time_ns: int
) -> PointDetail | None:
    start = ns_to_rfc3339(time_ns)
    # +1 microsecond, not +1ns: ns_to_rfc3339 truncates to microsecond precision,
    # so a 1ns offset would round back to the same string as `start`.
    stop = ns_to_rfc3339(time_ns + 1_000)

    lines = [
        f"from(bucket: {flux_string(bucket)})",
        f"  |> range(start: {start}, stop: {stop})",
        f"  |> filter(fn: (r) => r._measurement == {flux_string(measurement)})",
    ]
    for tag_key, tag_value in tags.items():
        lines.append(f"  |> filter(fn: (r) => r[{flux_string(tag_key)}] == {flux_string(tag_value)})")
    flux = "\n".join(lines)

    tables = client.query_api().query(flux)
    fields: dict[str, FieldValue] = {}
    found_tags: dict[str, str] = {}
    time_str = start
    for table in tables:
        for record in table.records:
            found_tags = _record_tags(record)
            fields[record.get_field()] = record.get_value()
            time_str = record.get_time().isoformat().replace("+00:00", "Z")

    if not fields:
        return None

    return PointDetail(
        id=encode_point_id(bucket, measurement, found_tags, time_str),
        measurement=measurement,
        tags=found_tags,
        fields=fields,
        time=time_str,
    )
