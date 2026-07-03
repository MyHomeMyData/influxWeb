from typing import Literal

from pydantic import BaseModel

FieldValue = float | int | bool | str
# JSON has no int/float distinction for whole numbers (e.g. 60 vs 60.0 both
# round-trip through a browser as the same JS Number, then serialize back as
# "60") - so a write needs this explicit tag to know which Python type to
# build the InfluxDB field with, rather than guessing from the raw JSON value
# and risking a field-type conflict against what's already stored.
FieldValueType = Literal["float", "int", "bool", "string"]


class FieldEntry(BaseModel):
    value: FieldValue
    value_type: FieldValueType


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
    storage_variant: Literal["tag-based", "field-based"] | None = None
    # iobroker mode only: typed field values for ack/from/q - used by retime
    # to write all fields to the new timestamp (not needed for delete/edit,
    # which work from tags={} + field="value" alone).
    extra_fields: dict[str, FieldEntry] | None = None


class PointQueryResponse(BaseModel):
    points: list[PointRow]
    truncated: bool
    field_based_measurements: list[str] = []


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
