from influxdb_client import InfluxDBClient
from influxdb_client.rest import ApiException

from app.models.import_ods import ImportOdsResponse, ImportRowError
from app.services import ods_io
from app.services.write import write_point
from app.utils.api_error import extract_message

SAMPLE_SIZE = 20


def preview_import(content: bytes) -> ImportOdsResponse:
    valid_rows, errors = ods_io.parse_ods(content)
    buckets = sorted({request.bucket for _, request in valid_rows})
    return ImportOdsResponse(
        dry_run=True,
        total_rows=len(valid_rows) + len(errors),
        valid_rows=len(valid_rows),
        written_count=0,
        buckets=buckets,
        sample=[request for _, request in valid_rows[:SAMPLE_SIZE]],
        errors=errors,
    )


def execute_import(client: InfluxDBClient, org: str, content: bytes) -> ImportOdsResponse:
    valid_rows, parse_errors = ods_io.parse_ods(content)
    total_rows = len(valid_rows) + len(parse_errors)
    buckets = sorted({request.bucket for _, request in valid_rows})

    write_errors: list[ImportRowError] = []
    written_count = 0
    for row_number, request in valid_rows:
        try:
            write_point(client, org, request)
            written_count += 1
        except ApiException as exc:
            write_errors.append(ImportRowError(row_number=row_number, reason=extract_message(exc)))

    return ImportOdsResponse(
        dry_run=False,
        total_rows=total_rows,
        valid_rows=len(valid_rows),
        written_count=written_count,
        buckets=buckets,
        sample=[request for _, request in valid_rows[:SAMPLE_SIZE]],
        errors=sorted([*parse_errors, *write_errors], key=lambda error: error.row_number),
    )
