from typing import Literal

from pydantic import BaseModel

FieldValue = float | int | bool | str
# JSON has no int/float distinction for whole numbers (e.g. 60 vs 60.0 both
# round-trip through a browser as the same JS Number, then serialize back as
# "60") - so a write needs this explicit tag to know which Python type to
# build the InfluxDB field with, rather than guessing from the raw JSON value
# and risking a field-type conflict against what's already stored.
FieldValueType = Literal["float", "int", "bool", "string"]


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
    value_type: FieldValueType
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
    value_type: FieldValueType
    time: str


class PointWriteResponse(BaseModel):
    status: str
