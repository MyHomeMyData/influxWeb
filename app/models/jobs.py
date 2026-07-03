from typing import Literal

from pydantic import BaseModel


class PointRef(BaseModel):
    bucket: str
    measurement: str
    tags: dict[str, str]
    time: str
    storage_variant: Literal["tag-based", "field-based"] | None = None


class DeleteSelectedPreviewRequest(BaseModel):
    points: list[PointRef]


class DeleteSelectedPreviewResponse(BaseModel):
    matched_count: int
    confirm_token: str


class DeleteSelectedExecuteRequest(BaseModel):
    points: list[PointRef]
    confirm_token: str


class DeleteSelectedExecuteResponse(BaseModel):
    status: str
    deleted_count: int
