from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.routers import buckets, csv, points, schema

app = FastAPI(title="influxWeb")

app.include_router(buckets.router)
app.include_router(schema.router)
app.include_router(points.router)
app.include_router(csv.router)

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
