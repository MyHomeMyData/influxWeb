import base64
import json

from app.utils.time import rfc3339_to_ns


def encode_point_id(bucket: str, measurement: str, tags: dict[str, str], time: str) -> str:
    payload = [bucket, measurement, sorted(tags.items()), rfc3339_to_ns(time)]
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode_point_id(point_id: str) -> tuple[str, str, dict[str, str], int]:
    padding = "=" * (-len(point_id) % 4)
    raw = base64.urlsafe_b64decode(point_id + padding)
    bucket, measurement, tag_items, time_ns = json.loads(raw)
    return bucket, measurement, dict(tag_items), time_ns
