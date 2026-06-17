from fastapi import APIRouter

from app.deps import InfluxClientDep
from app.services import schema_introspection

router = APIRouter(prefix="/api/buckets/{bucket}", tags=["schema"])


@router.get("/measurements", response_model=list[str])
def get_measurements(bucket: str, client: InfluxClientDep, range_start: str = "-30d") -> list[str]:
    return schema_introspection.list_measurements(client, bucket, range_start)


@router.get("/tags", response_model=list[str])
def get_tags(
    bucket: str,
    client: InfluxClientDep,
    measurement: str | None = None,
    range_start: str = "-30d",
) -> list[str]:
    return schema_introspection.list_tag_keys(client, bucket, measurement, range_start)


@router.get("/tags/{tag_key}/values", response_model=list[str])
def get_tag_values(
    bucket: str,
    tag_key: str,
    client: InfluxClientDep,
    measurement: str | None = None,
    range_start: str = "-30d",
) -> list[str]:
    return schema_introspection.list_tag_values(client, bucket, tag_key, measurement, range_start)


@router.get("/fields", response_model=list[str])
def get_fields(
    bucket: str,
    client: InfluxClientDep,
    measurement: str | None = None,
    range_start: str = "-30d",
) -> list[str]:
    return schema_introspection.list_field_keys(client, bucket, measurement, range_start)
