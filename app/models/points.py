from pydantic import BaseModel

FieldValue = float | int | bool | str


class Selection(BaseModel):
    bucket: str
    measurements: list[str] = []
    tags: dict[str, list[str]] = {}


class TimeRange(BaseModel):
    start: str
    stop: str


class PointQueryRequest(Selection, TimeRange):
    limit: int | None = None


class PointRow(BaseModel):
    id: str
    measurement: str
    tags: dict[str, str]
    field: str
    value: FieldValue
    time: str


class PointQueryResponse(BaseModel):
    points: list[PointRow]
    truncated: bool


class ExportSelectedRequest(BaseModel):
    bucket: str
    points: list[PointRow]


class PointWriteRequest(BaseModel):
    bucket: str
    measurement: str
    tags: dict[str, str]
    field: str
    value: FieldValue
    time: str


class PointWriteResponse(BaseModel):
    status: str
