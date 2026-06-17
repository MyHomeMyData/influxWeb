from pydantic import BaseModel


class BucketInfo(BaseModel):
    id: str
    name: str
    retention_seconds: int | None = None
