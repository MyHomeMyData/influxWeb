from fastapi import APIRouter, HTTPException

from app.deps import InfluxClientDep
from app.models.points import PointDetail, PointQueryRequest, PointQueryResponse
from app.services import query as query_service
from app.utils.point_id import decode_point_id

router = APIRouter(prefix="/api/points", tags=["points"])


@router.post("/query", response_model=PointQueryResponse)
def query_points(request: PointQueryRequest, client: InfluxClientDep) -> PointQueryResponse:
    rows, truncated = query_service.query_points(client, request, request, request.limit)
    return PointQueryResponse(points=rows, truncated=truncated)


@router.get("/{point_id}", response_model=PointDetail)
def get_point(point_id: str, client: InfluxClientDep) -> PointDetail:
    bucket, measurement, tags, time_ns = decode_point_id(point_id)
    detail = query_service.get_point_detail(client, bucket, measurement, tags, time_ns)
    if detail is None:
        raise HTTPException(status_code=404, detail="Point not found")
    return detail
