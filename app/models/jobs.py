from pydantic import BaseModel

from app.models.points import PointRow, Selection, TimeRange


class DeleteRequest(Selection, TimeRange):
    pass


class DeletePreviewResponse(BaseModel):
    matched_count: int
    sample_points: list[PointRow]
    measurements_affected: list[str]
    resolved_start: str | None
    resolved_stop: str | None
    confirm_token: str


class DeleteExecuteRequest(Selection):
    resolved_start: str
    resolved_stop: str
    confirm_token: str


class DeleteExecuteResponse(BaseModel):
    status: str
    predicates: list[str]
    start: str
    stop: str
