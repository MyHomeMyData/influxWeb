from fastapi import APIRouter, HTTPException

from app.deps import InfluxClientDep, SettingsDep
from app.models.jobs import DeleteExecuteRequest, DeleteExecuteResponse, DeletePreviewResponse, DeleteRequest
from app.models.points import Selection, TimeRange
from app.services import delete as delete_service

router = APIRouter(prefix="/api/delete", tags=["delete"])


@router.post("/preview", response_model=DeletePreviewResponse)
def preview(request: DeleteRequest, client: InfluxClientDep) -> DeletePreviewResponse:
    selection = Selection(bucket=request.bucket, measurements=request.measurements, tags=request.tags)
    time_range = TimeRange(start=request.start, stop=request.stop)
    return delete_service.preview_delete(client, selection, time_range)


@router.post("/execute", response_model=DeleteExecuteResponse)
def execute(
    request: DeleteExecuteRequest, client: InfluxClientDep, settings: SettingsDep
) -> DeleteExecuteResponse:
    selection = Selection(bucket=request.bucket, measurements=request.measurements, tags=request.tags)
    try:
        return delete_service.execute_delete(
            client,
            settings.influx_org,
            selection,
            request.resolved_start,
            request.resolved_stop,
            request.confirm_token,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
