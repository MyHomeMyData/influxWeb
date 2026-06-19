from concurrent.futures import ThreadPoolExecutor

from influxdb_client import InfluxDBClient

from app.models.jobs import DeleteSelectedExecuteResponse, DeleteSelectedPreviewResponse, PointRef
from app.utils.confirm_token import make_confirm_token, verify_confirm_token
from app.utils.flux import flux_string
from app.utils.time import ns_to_rfc3339, rfc3339_to_ns

# Each point needs its own delete call (InfluxDB's delete predicate has no OR,
# so distinct measurements/tags can't be combined into one request) and each
# call is a blocking network round-trip - running them concurrently instead of
# one-by-one cuts wall-clock time roughly by this factor on slower hardware.
DELETE_CONCURRENCY = 8


def _point_ref_payload(points: list[PointRef]) -> dict:
    return {"points": [point.model_dump() for point in points]}


def preview_delete_selected(points: list[PointRef]) -> DeleteSelectedPreviewResponse:
    confirm_token = make_confirm_token(_point_ref_payload(points)) if points else ""
    return DeleteSelectedPreviewResponse(matched_count=len(points), confirm_token=confirm_token)


def _point_predicate(point: PointRef) -> str:
    clauses = [f"_measurement={flux_string(point.measurement)}"]
    # Tag keys must be quoted too: the delete predicate grammar treats
    # some tag key names (e.g. "from") as reserved words otherwise.
    clauses.extend(f"{flux_string(key)}={flux_string(value)}" for key, value in point.tags.items())
    return " and ".join(clauses)


def execute_delete_selected(
    client: InfluxDBClient, org: str, points: list[PointRef], confirm_token: str
) -> DeleteSelectedExecuteResponse:
    if not verify_confirm_token(_point_ref_payload(points), confirm_token):
        raise ValueError("Confirm token is invalid or expired - re-run preview")

    delete_api = client.delete_api()

    def _delete_one(point: PointRef) -> None:
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

    with ThreadPoolExecutor(max_workers=DELETE_CONCURRENCY) as executor:
        # list() drives every future to completion and re-raises the first
        # exception encountered, same as letting an exception escape the loop.
        list(executor.map(_delete_one, points))

    return DeleteSelectedExecuteResponse(status="deleted", deleted_count=len(points))
