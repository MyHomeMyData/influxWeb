from influxdb_client import InfluxDBClient, Point, WritePrecision
from influxdb_client.client.write_api import SYNCHRONOUS

from app.models.points import PointWriteRequest
from app.utils.field_value import coerce_field_value
from app.utils.time import rfc3339_to_ns


def write_point(client: InfluxDBClient, org: str, request: PointWriteRequest) -> None:
    point = Point(request.measurement)
    for key, value in request.tags.items():
        point = point.tag(key, value)
    point = point.field(request.field, coerce_field_value(request.value, request.value_type))
    point = point.time(rfc3339_to_ns(request.time), WritePrecision.NS)

    # write_api() defaults to async batching, which wouldn't reliably surface
    # errors or guarantee the write has landed before this function returns -
    # SYNCHRONOUS makes it a plain blocking call, like delete_api() already is.
    write_api = client.write_api(write_options=SYNCHRONOUS)
    write_api.write(bucket=request.bucket, org=org, record=point)
