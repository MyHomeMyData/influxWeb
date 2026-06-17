from functools import lru_cache

from influxdb_client import InfluxDBClient

from app.config import get_settings


@lru_cache
def get_influx_client() -> InfluxDBClient:
    settings = get_settings()
    return InfluxDBClient(
        url=settings.influx_url,
        token=settings.influx_token,
        org=settings.influx_org,
    )
