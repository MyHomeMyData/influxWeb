from pydantic import BaseModel

from app.models.points import PointWriteRequest


class ImportRowError(BaseModel):
    row_number: int
    reason: str


class ImportOdsResponse(BaseModel):
    dry_run: bool
    total_rows: int
    valid_rows: int
    written_count: int
    buckets: list[str]
    sample: list[PointWriteRequest]
    errors: list[ImportRowError]
