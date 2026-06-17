import itertools

from influxdb_client import InfluxDBClient

from app.models.jobs import DeleteExecuteResponse, DeletePreviewResponse
from app.models.points import PointRow, Selection, TimeRange
from app.services.query import _record_tags, build_query_flux
from app.utils.confirm_token import make_confirm_token, verify_confirm_token
from app.utils.flux import flux_string
from app.utils.point_id import encode_point_id

SAMPLE_LIMIT = 20


def _count_matches(client: InfluxDBClient, selection: Selection, time_range: TimeRange) -> int:
    flux = build_query_flux(selection, time_range, None) + "\n  |> count()\n  |> group()\n  |> sum()"
    tables = client.query_api().query(flux)
    for table in tables:
        for record in table.records:
            return int(record.get_value())
    return 0


def _sample_and_bounds(
    client: InfluxDBClient, selection: Selection, time_range: TimeRange, limit: int
) -> tuple[list[PointRow], str | None, str | None]:
    flux = build_query_flux(selection, time_range, limit)
    tables = client.query_api().query(flux)

    rows: list[PointRow] = []
    resolved_start: str | None = None
    resolved_stop: str | None = None

    for table in tables:
        for record in table.records:
            if resolved_start is None:
                start_dt = record.values.get("_start")
                stop_dt = record.values.get("_stop")
                if start_dt and stop_dt:
                    resolved_start = start_dt.isoformat().replace("+00:00", "Z")
                    resolved_stop = stop_dt.isoformat().replace("+00:00", "Z")

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

    return rows, resolved_start, resolved_stop


def _confirm_payload(selection: Selection, resolved_start: str | None, resolved_stop: str | None) -> dict:
    return {
        "bucket": selection.bucket,
        "measurements": sorted(selection.measurements),
        "tags": {key: sorted(values) for key, values in selection.tags.items()},
        "start": resolved_start,
        "stop": resolved_stop,
    }


def preview_delete(client: InfluxDBClient, selection: Selection, time_range: TimeRange) -> DeletePreviewResponse:
    matched_count = _count_matches(client, selection, time_range)
    sample_rows, resolved_start, resolved_stop = _sample_and_bounds(client, selection, time_range, SAMPLE_LIMIT)

    if selection.measurements:
        measurements_affected = list(selection.measurements)
    else:
        measurements_affected = sorted({row.measurement for row in sample_rows})

    confirm_token = ""
    if matched_count > 0 and resolved_start and resolved_stop:
        confirm_token = make_confirm_token(_confirm_payload(selection, resolved_start, resolved_stop))

    return DeletePreviewResponse(
        matched_count=matched_count,
        sample_points=sample_rows,
        measurements_affected=measurements_affected,
        resolved_start=resolved_start,
        resolved_stop=resolved_stop,
        confirm_token=confirm_token,
    )


def build_predicates(selection: Selection) -> list[str]:
    """InfluxDB delete predicates only support AND, not OR, so multiple selected
    measurements/tag-values are expanded into one predicate per combination."""
    measurement_options: list[str | None] = list(selection.measurements) if selection.measurements else [None]
    tag_options = [[(key, value) for value in values] for key, values in selection.tags.items() if values]
    tag_combos = list(itertools.product(*tag_options)) if tag_options else [()]

    predicates = []
    for measurement in measurement_options:
        for combo in tag_combos:
            clauses = []
            if measurement is not None:
                clauses.append(f"_measurement={flux_string(measurement)}")
            clauses.extend(f"{tag_key}={flux_string(tag_value)}" for tag_key, tag_value in combo)
            predicates.append(" and ".join(clauses))
    return predicates


def execute_delete(
    client: InfluxDBClient,
    org: str,
    selection: Selection,
    resolved_start: str,
    resolved_stop: str,
    confirm_token: str,
) -> DeleteExecuteResponse:
    payload = _confirm_payload(selection, resolved_start, resolved_stop)
    if not verify_confirm_token(payload, confirm_token):
        raise ValueError("Confirm token is invalid or expired - re-run preview")

    predicates = build_predicates(selection)
    delete_api = client.delete_api()
    for predicate in predicates:
        delete_api.delete(
            start=resolved_start,
            stop=resolved_stop,
            predicate=predicate,
            bucket=selection.bucket,
            org=org,
        )

    return DeleteExecuteResponse(
        status="deleted",
        predicates=predicates,
        start=resolved_start,
        stop=resolved_stop,
    )
