import json

from influxdb_client.rest import ApiException


def extract_message(exc: ApiException) -> str:
    message = exc.reason or "InfluxDB rejected the request."
    if exc.body:
        try:
            message = json.loads(exc.body).get("message", message)
        except (ValueError, AttributeError):
            pass
    return message
