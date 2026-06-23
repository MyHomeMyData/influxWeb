from influxdb_client import InfluxDBClient, Point
from influxdb_client.client.write_api import SYNCHRONOUS

from app.services import raw_io
from app.services.write import build_point

# One write() call per point measured ~180x slower than batching them (9.15s
# vs 0.05s for 2000 points) - each call is a full HTTP round trip. A batch
# this size keeps memory bounded for a whole-bucket export while still
# cutting the round trips by several orders of magnitude.
BATCH_SIZE = 5000


def import_raw(client: InfluxDBClient, org: str, content: bytes, bucket: str) -> int:
    write_api = client.write_api(write_options=SYNCHRONOUS)
    written_count = 0
    batch: list[Point] = []

    def flush() -> None:
        nonlocal written_count, batch
        if batch:
            write_api.write(bucket=bucket, org=org, record=batch)
            written_count += len(batch)
            batch = []

    try:
        for request in raw_io.iter_raw_points(content, bucket):
            batch.append(build_point(request))
            if len(batch) >= BATCH_SIZE:
                flush()
    except Exception:
        # Abort-on-first-error still means everything successfully parsed
        # before the bad row is durably written, not just whatever happened
        # to already cross the batch-size threshold.
        flush()
        raise

    flush()
    return written_count
