from influxdb_client import InfluxDBClient, Point, WritePrecision
from influxdb_client.client.write_api import SYNCHRONOUS

from app.models.retime import (
    PointGroup,
    RetimeExecuteResponse,
    RetimePoint,
    RetimePreviewResponse,
)
from app.utils.confirm_token import make_confirm_token, verify_confirm_token
from app.utils.field_value import coerce_field_value
from app.utils.flux import series_predicate
from app.utils.local_time import NormalizeGranularity, OffsetUnit, normalize_time, shift_time
from app.utils.time import ns_to_rfc3339, rfc3339_to_ns


def compute_offset(groups: list[PointGroup], amount: int, unit: OffsetUnit) -> list[RetimePoint]:
    return [
        RetimePoint(
            bucket=group.bucket,
            measurement=group.measurement,
            tags=group.tags,
            old_time=group.time,
            new_time=shift_time(group.time, amount, unit),
            fields=group.fields,
        )
        for group in groups
    ]


def compute_normalize(groups: list[PointGroup], granularity: NormalizeGranularity) -> list[RetimePoint]:
    return [
        RetimePoint(
            bucket=group.bucket,
            measurement=group.measurement,
            tags=group.tags,
            old_time=group.time,
            new_time=normalize_time(group.time, granularity),
            fields=group.fields,
        )
        for group in groups
    ]


def _retime_payload(points: list[RetimePoint]) -> dict:
    return {"points": [point.model_dump() for point in points]}


def preview_retime(points: list[RetimePoint]) -> RetimePreviewResponse:
    confirm_token = make_confirm_token(_retime_payload(points)) if points else ""
    return RetimePreviewResponse(matched_count=len(points), confirm_token=confirm_token)


def execute_retime(
    client: InfluxDBClient, org: str, points: list[RetimePoint], confirm_token: str
) -> RetimeExecuteResponse:
    if not verify_confirm_token(_retime_payload(points), confirm_token):
        raise ValueError("Confirm token is invalid or expired - re-run preview")

    write_api = client.write_api(write_options=SYNCHRONOUS)
    delete_api = client.delete_api()

    # Sequential, deliberately: concurrent calls made delete *worse* on the
    # real Pi (see app/services/delete.py) - the same per-point InfluxDB call
    # pattern applies here. Write-before-delete: a failure mid-batch then
    # leaves a harmless duplicate (old + new both present) instead of losing
    # data.
    for point in points:
        if point.new_time == point.old_time:
            continue  # nothing to move - writing then deleting would just destroy it

        new_point = Point(point.measurement)
        for key, value in point.tags.items():
            new_point = new_point.tag(key, value)
        for field, entry in point.fields.items():
            new_point = new_point.field(field, coerce_field_value(entry.value, entry.value_type))
        new_point = new_point.time(rfc3339_to_ns(point.new_time), WritePrecision.NS)
        write_api.write(bucket=point.bucket, org=org, record=new_point)

        old_start_ns = rfc3339_to_ns(point.old_time)
        delete_api.delete(
            start=ns_to_rfc3339(old_start_ns),
            # +1 microsecond: matches the precision ns_to_rfc3339 truncates to,
            # guarantees a non-empty [start, stop) window for this exact point.
            stop=ns_to_rfc3339(old_start_ns + 1_000),
            predicate=series_predicate(point.measurement, point.tags),
            bucket=point.bucket,
            org=org,
        )

    return RetimeExecuteResponse(status="retimed", retimed_count=len(points))
