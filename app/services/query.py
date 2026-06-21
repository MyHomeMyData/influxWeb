from influxdb_client import InfluxDBClient

from app.models.points import PointRow, Selection, TimeRange
from app.utils.field_value import value_type_of
from app.utils.flux import flux_string
from app.utils.point_id import encode_point_id

RESERVED_COLUMNS = {"result", "table"}

# Always enforced, regardless of what a caller requests: an unfiltered or very
# broad selection on a large bucket can otherwise match millions of points and
# exhaust memory on small devices (Flux's own limit() is per-table/series, not
# a global cap, so it alone isn't a reliable safety net for high-cardinality
# data - see query_points() below for the actual bound).
MAX_QUERY_POINTS = 200_000


def _record_tags(record) -> dict[str, str]:
    return {
        key: value
        for key, value in record.values.items()
        if not key.startswith("_") and key not in RESERVED_COLUMNS
    }


def _measurement_filter(measurements: list[str]) -> str | None:
    if not measurements:
        return None
    # contains() defeats InfluxDB's predicate push-down to the storage index,
    # forcing a full scan of every measurement across the whole time range
    # before filtering - OR-chained equality checks stay index-pushable and
    # measured 100x+ faster on a real bucket, regardless of how many values.
    return " or ".join(f"r._measurement == {flux_string(m)}" for m in measurements)


def _tag_filter(tag_key: str, tag_values: list[str]) -> str:
    key = flux_string(tag_key)
    return " or ".join(f"r[{key}] == {flux_string(v)}" for v in tag_values)


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
    effective_limit = min(limit, MAX_QUERY_POINTS) if limit is not None else MAX_QUERY_POINTS
    flux = build_query_flux(selection, time_range, effective_limit)

    rows: list[PointRow] = []
    truncated = False
    # query_stream() parses the response incrementally instead of loading the
    # whole result into memory first, so this loop can stop as soon as the cap
    # is hit instead of having already materialized everything by the time we
    # get to iterate.
    for record in client.query_api().query_stream(flux):
        if len(rows) >= effective_limit:
            truncated = True
            break
        tags = _record_tags(record)
        time_str = record.get_time().isoformat().replace("+00:00", "Z")
        value = record.get_value()
        rows.append(
            PointRow(
                id=encode_point_id(selection.bucket, record.get_measurement(), tags, time_str),
                measurement=record.get_measurement(),
                tags=tags,
                field=record.get_field(),
                value=value,
                value_type=value_type_of(value),
                time=time_str,
            )
        )

    return rows, truncated
