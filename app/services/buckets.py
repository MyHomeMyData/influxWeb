from influxdb_client import InfluxDBClient

from app.models.schema import BucketInfo


def list_buckets(client: InfluxDBClient) -> list[BucketInfo]:
    buckets = client.buckets_api().find_buckets().buckets or []
    result = []
    for bucket in buckets:
        retention_seconds = None
        if bucket.retention_rules:
            retention_seconds = bucket.retention_rules[0].every_seconds
        result.append(
            BucketInfo(id=bucket.id, name=bucket.name, retention_seconds=retention_seconds)
        )
    return result
