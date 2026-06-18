from fastapi import APIRouter, HTTPException

from app.deps import InfluxClientDep, SettingsDep
from app.models.jobs import (
    DeleteSelectedExecuteRequest,
    DeleteSelectedExecuteResponse,
    DeleteSelectedPreviewRequest,
    DeleteSelectedPreviewResponse,
)
from app.services import delete as delete_service

router = APIRouter(prefix="/api/delete", tags=["delete"])


@router.post("/points/preview", response_model=DeleteSelectedPreviewResponse)
def preview_selected(request: DeleteSelectedPreviewRequest) -> DeleteSelectedPreviewResponse:
    return delete_service.preview_delete_selected(request.points)


@router.post("/points/execute", response_model=DeleteSelectedExecuteResponse)
def execute_selected(
    request: DeleteSelectedExecuteRequest, client: InfluxClientDep, settings: SettingsDep
) -> DeleteSelectedExecuteResponse:
    try:
        return delete_service.execute_delete_selected(
            client, settings.influx_org, request.points, request.confirm_token
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
