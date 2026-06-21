from fastapi import APIRouter

from app.deps import InfluxClientDep, SettingsDep
from app.models.points import PointQueryRequest, PointQueryResponse, PointWriteRequest, PointWriteResponse
from app.services import query as query_service
from app.services import write as write_service

router = APIRouter(prefix="/api/points", tags=["points"])


@router.post("/query", response_model=PointQueryResponse)
def query_points(request: PointQueryRequest, client: InfluxClientDep) -> PointQueryResponse:
    rows, truncated = query_service.query_points(client, request, request, request.limit)
    return PointQueryResponse(points=rows, truncated=truncated)


@router.put("", response_model=PointWriteResponse)
def write_point(request: PointWriteRequest, client: InfluxClientDep, settings: SettingsDep) -> PointWriteResponse:
    write_service.write_point(client, settings.influx_org, request)
    return PointWriteResponse(status="written")
