from typing import Literal

from pydantic import BaseModel

from app.models.points import FieldValue, FieldValueType


class FieldEntry(BaseModel):
    value: FieldValue
    value_type: FieldValueType


class PointGroup(BaseModel):
    bucket: str
    measurement: str
    tags: dict[str, str]
    time: str
    fields: dict[str, FieldEntry]


class RetimePoint(BaseModel):
    bucket: str
    measurement: str
    tags: dict[str, str]
    old_time: str
    new_time: str
    fields: dict[str, FieldEntry]


class RetimeOffsetComputeRequest(BaseModel):
    points: list[PointGroup]
    amount: int
    unit: Literal["minutes", "hours", "days", "weeks", "months", "years"]


class RetimeNormalizeComputeRequest(BaseModel):
    points: list[PointGroup]
    granularity: Literal["hour", "day", "week", "month", "year"]


class RetimeComputeResponse(BaseModel):
    points: list[RetimePoint]


class RetimePreviewRequest(BaseModel):
    points: list[RetimePoint]


class RetimePreviewResponse(BaseModel):
    matched_count: int
    confirm_token: str


class RetimeExecuteRequest(BaseModel):
    points: list[RetimePoint]
    confirm_token: str


class RetimeExecuteResponse(BaseModel):
    status: str
    retimed_count: int
