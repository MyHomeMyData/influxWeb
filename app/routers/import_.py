from fastapi import APIRouter, Form, HTTPException, UploadFile

from app.deps import InfluxClientDep, SettingsDep
from app.models.import_ods import ImportOdsResponse
from app.models.import_raw import ImportRawResponse
from app.services import import_ods as import_ods_service
from app.services import import_raw as import_raw_service

router = APIRouter(prefix="/api/import", tags=["import"])


@router.post("/ods", response_model=ImportOdsResponse)
async def import_ods(
    client: InfluxClientDep,
    settings: SettingsDep,
    file: UploadFile,
    dry_run: bool = Form(False),
) -> ImportOdsResponse:
    content = await file.read()
    try:
        if dry_run:
            return import_ods_service.preview_import(content)
        return import_ods_service.execute_import(client, settings.influx_org, content)
    except ValueError as exc:
        # A structural problem with the file itself (missing header/columns,
        # not a single bad row) - 400, not the otherwise-uncaught 500.
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/raw", response_model=ImportRawResponse)
async def import_raw(
    client: InfluxClientDep,
    settings: SettingsDep,
    file: UploadFile,
    bucket: str = Form(...),
) -> ImportRawResponse:
    content = await file.read()
    try:
        written_count = import_raw_service.import_raw(client, settings.influx_org, content, bucket)
    except ValueError as exc:
        # A structural problem with the file itself (bad encoding, missing
        # columns, an unparseable row) - 400 with the reason, not a bare 500.
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ImportRawResponse(written_count=written_count)
