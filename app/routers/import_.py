from fastapi import APIRouter, Form, UploadFile

from app.deps import InfluxClientDep, SettingsDep
from app.models.import_ods import ImportOdsResponse
from app.services import import_ods as import_service

router = APIRouter(prefix="/api/import", tags=["import"])


@router.post("/ods", response_model=ImportOdsResponse)
async def import_ods(
    client: InfluxClientDep,
    settings: SettingsDep,
    file: UploadFile,
    dry_run: bool = Form(False),
) -> ImportOdsResponse:
    content = await file.read()
    if dry_run:
        return import_service.preview_import(content)
    return import_service.execute_import(client, settings.influx_org, content)
