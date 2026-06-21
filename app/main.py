import json
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from influxdb_client.rest import ApiException
from urllib3.exceptions import TimeoutError as Urllib3TimeoutError

from app.routers import buckets, delete, export, points, retime, schema

app = FastAPI(title="influxWeb")

app.include_router(buckets.router)
app.include_router(schema.router)
app.include_router(points.router)
app.include_router(export.router)
app.include_router(delete.router)
app.include_router(retime.router)


@app.exception_handler(Urllib3TimeoutError)
def handle_influx_timeout(request: Request, exc: Urllib3TimeoutError) -> JSONResponse:
    return JSONResponse(
        status_code=504,
        content={
            "detail": "The request to InfluxDB timed out. Try selecting fewer measurements/tags "
            "or a shorter time range, then try again."
        },
    )


@app.exception_handler(ApiException)
def handle_influx_api_error(request: Request, exc: ApiException) -> JSONResponse:
    # InfluxDB rejects bad input (malformed range/duration strings, invalid
    # Flux, etc.) with a 400 and a JSON body that already has a useful
    # message - surface that instead of a bare 500.
    message = exc.reason or "InfluxDB rejected the request."
    if exc.body:
        try:
            message = json.loads(exc.body).get("message", message)
        except (ValueError, AttributeError):
            pass
    status_code = exc.status if exc.status and 400 <= exc.status < 500 else 502
    return JSONResponse(status_code=status_code, content={"detail": message})


STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
