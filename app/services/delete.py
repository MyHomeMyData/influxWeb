from influxdb_client import InfluxDBClient

from app.models.jobs import DeleteSelectedExecuteResponse, DeleteSelectedPreviewResponse, PointRef
from app.utils.confirm_token import make_confirm_token, verify_confirm_token
from app.utils.flux import series_predicate
from app.utils.time import ns_to_rfc3339, rfc3339_to_ns


def _point_ref_payload(points: list[PointRef]) -> dict:
    return {"points": [point.model_dump() for point in points]}


def preview_delete_selected(points: list[PointRef]) -> DeleteSelectedPreviewResponse:
    confirm_token = make_confirm_token(_point_ref_payload(points)) if points else ""
    return DeleteSelectedPreviewResponse(matched_count=len(points), confirm_token=confirm_token)


def _point_predicate(point: PointRef) -> str:
    # Field-based ioBroker storage has no real tags - the tags on the PointRef
    # are synthetic (for display only). Use an empty tag dict so the predicate
    # matches on measurement alone; the precise nanosecond time window already
    # identifies the single point.
    tags = {} if point.storage_variant == "field-based" else point.tags
    return series_predicate(point.measurement, tags)


def execute_delete_selected(
    client: InfluxDBClient, org: str, points: list[PointRef], confirm_token: str
) -> DeleteSelectedExecuteResponse:
    if not verify_confirm_token(_point_ref_payload(points), confirm_token):
        raise ValueError("Confirm token is invalid or expired - re-run preview")

    delete_api = client.delete_api()
    # Sequential, deliberately: concurrent delete_api.delete() calls made this
    # *worse* on the real Pi (more timeouts, more partial-failure batches),
    # most likely because InfluxDB serializes delete/index bookkeeping
    # internally - concurrent requests then contend for that instead of
    # overlapping cleanly. See project memory for the measurements behind
    # this reversal.
    for point in points:
        start_ns = rfc3339_to_ns(point.time)
        delete_api.delete(
            start=ns_to_rfc3339(start_ns),
            # +1 microsecond: matches the precision ns_to_rfc3339 truncates to,
            # guarantees a non-empty [start, stop) window for this exact point.
            stop=ns_to_rfc3339(start_ns + 1_000),
            predicate=_point_predicate(point),
            bucket=point.bucket,
            org=org,
        )

    return DeleteSelectedExecuteResponse(status="deleted", deleted_count=len(points))
