import json

from fastapi import APIRouter
from fastapi.responses import Response

from app.deps import InfluxClientDep
from app.models.points import PointQueryRequest
from app.services import csv_io, query as query_service

router = APIRouter(prefix="/api/export", tags=["export"])


@router.get("/csv")
def export_csv(selection_json: str, client: InfluxClientDep) -> Response:
    request = PointQueryRequest(**json.loads(selection_json))
    rows, _ = query_service.query_points(client, request, request, request.limit)
    csv_text = csv_io.points_to_csv(rows)
    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=influxweb-export.csv"},
    )
