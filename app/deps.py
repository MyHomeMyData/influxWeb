from typing import Annotated

from fastapi import Depends
from influxdb_client import InfluxDBClient

from app.config import Settings, get_settings
from app.influx_client import get_influx_client

SettingsDep = Annotated[Settings, Depends(get_settings)]
InfluxClientDep = Annotated[InfluxDBClient, Depends(get_influx_client)]
