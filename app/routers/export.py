import json

from fastapi import APIRouter
from fastapi.responses import Response
from pydantic import BaseModel

from app.deps import InfluxClientDep, SettingsDep
from app.models.points import ExportSelectedRequest, PointQueryRequest
from app.services import ods_io
from app.services import query as query_service
from app.utils.flux import flux_string

router = APIRouter(prefix="/api/export", tags=["export"])

ODS_MEDIA_TYPE = "application/vnd.oasis.opendocument.spreadsheet"
RAW_MEDIA_TYPE = "text/csv"


class RawExportRequest(BaseModel):
    bucket: str
    start: str
    stop: str


@router.get("/ods")
def export_ods(selection_json: str, client: InfluxClientDep) -> Response:
    request = PointQueryRequest(**json.loads(selection_json))
    rows, _ = query_service.query_points(client, request, request, request.limit)
    content = ods_io.build_ods(request.bucket, rows)
    return Response(
        content=content,
        media_type=ODS_MEDIA_TYPE,
        headers={"Content-Disposition": "attachment; filename=influxweb-export.ods"},
    )


@router.post("/ods/selected")
def export_ods_selected(request: ExportSelectedRequest) -> Response:
    content = ods_io.build_ods(request.bucket, request.points)
    return Response(
        content=content,
        media_type=ODS_MEDIA_TYPE,
        headers={"Content-Disposition": "attachment; filename=influxweb-export.ods"},
    )


@router.post("/raw")
def export_raw(request: RawExportRequest, client: InfluxClientDep, settings: SettingsDep) -> Response:
    # Everything in the bucket for this time range, no measurement/tag
    # filtering - a single Flux query, with query_raw() returning InfluxDB's
    # own annotated CSV verbatim (no conversion on our side at all).
    flux = f"from(bucket: {flux_string(request.bucket)})\n  |> range(start: {request.start}, stop: {request.stop})"
    with client.query_api().query_raw(flux, org=settings.influx_org) as raw:
        content = raw.read()
    return Response(
        content=content,
        media_type=RAW_MEDIA_TYPE,
        headers={"Content-Disposition": "attachment; filename=influxweb-export.csv"},
    )
