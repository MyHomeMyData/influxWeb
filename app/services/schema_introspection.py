from influxdb_client import InfluxDBClient

from app.utils.flux import flux_string

RESERVED_TAG_KEYS = {"_measurement", "_field", "_start", "_stop", "_time", "_value"}


def _run_value_query(client: InfluxDBClient, flux: str) -> list[str]:
    tables = client.query_api().query(flux)
    values: list[str] = []
    for table in tables:
        for record in table.records:
            values.append(record.get_value())
    return values


def _measurement_predicate(measurement: str | None) -> str:
    if measurement is None:
        return "(r) => true"
    return f"(r) => r._measurement == {flux_string(measurement)}"


def list_measurements(client: InfluxDBClient, bucket: str, range_start: str = "-30d") -> list[str]:
    flux = f"""
import "influxdata/influxdb/schema"
schema.measurements(bucket: {flux_string(bucket)}, start: {range_start})
"""
    return _run_value_query(client, flux)


def list_tag_keys(
    client: InfluxDBClient,
    bucket: str,
    measurement: str | None = None,
    range_start: str = "-30d",
) -> list[str]:
    flux = f"""
import "influxdata/influxdb/schema"
schema.tagKeys(bucket: {flux_string(bucket)}, predicate: {_measurement_predicate(measurement)}, start: {range_start})
"""
    return [key for key in _run_value_query(client, flux) if key not in RESERVED_TAG_KEYS]


def list_tag_values(
    client: InfluxDBClient,
    bucket: str,
    tag_key: str,
    measurement: str | None = None,
    range_start: str = "-30d",
) -> list[str]:
    flux = f"""
import "influxdata/influxdb/schema"
schema.tagValues(bucket: {flux_string(bucket)}, tag: {flux_string(tag_key)}, predicate: {_measurement_predicate(measurement)}, start: {range_start})
"""
    return _run_value_query(client, flux)


def list_field_keys(
    client: InfluxDBClient,
    bucket: str,
    measurement: str | None = None,
    range_start: str = "-30d",
) -> list[str]:
    flux = f"""
import "influxdata/influxdb/schema"
schema.fieldKeys(bucket: {flux_string(bucket)}, predicate: {_measurement_predicate(measurement)}, start: {range_start})
"""
    return _run_value_query(client, flux)
