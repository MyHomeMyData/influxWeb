from fastapi import APIRouter

from app.deps import InfluxClientDep
from app.models.schema import BucketInfo
from app.services import buckets as buckets_service

router = APIRouter(prefix="/api/buckets", tags=["buckets"])


@router.get("", response_model=list[BucketInfo])
def get_buckets(client: InfluxClientDep) -> list[BucketInfo]:
    return buckets_service.list_buckets(client)
