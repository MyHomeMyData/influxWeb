from fastapi import APIRouter, HTTPException

from app.deps import InfluxClientDep, SettingsDep
from app.models.retime import (
    RetimeComputeResponse,
    RetimeExecuteRequest,
    RetimeExecuteResponse,
    RetimeNormalizeComputeRequest,
    RetimeOffsetComputeRequest,
    RetimePreviewRequest,
    RetimePreviewResponse,
)
from app.services import retime as retime_service

router = APIRouter(prefix="/api/retime", tags=["retime"])


@router.post("/offset/compute", response_model=RetimeComputeResponse)
def compute_offset(request: RetimeOffsetComputeRequest) -> RetimeComputeResponse:
    points = retime_service.compute_offset(request.points, request.amount, request.unit)
    return RetimeComputeResponse(points=points)


@router.post("/normalize/compute", response_model=RetimeComputeResponse)
def compute_normalize(request: RetimeNormalizeComputeRequest) -> RetimeComputeResponse:
    points = retime_service.compute_normalize(request.points, request.granularity)
    return RetimeComputeResponse(points=points)


@router.post("/preview", response_model=RetimePreviewResponse)
def preview(request: RetimePreviewRequest) -> RetimePreviewResponse:
    return retime_service.preview_retime(request.points)


@router.post("/execute", response_model=RetimeExecuteResponse)
def execute(request: RetimeExecuteRequest, client: InfluxClientDep, settings: SettingsDep) -> RetimeExecuteResponse:
    try:
        return retime_service.execute_retime(client, settings.influx_org, request.points, request.confirm_token)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
