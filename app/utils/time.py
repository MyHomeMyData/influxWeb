from datetime import datetime, timezone

# Python's datetime only stores microsecond precision, so the sub-microsecond
# part of InfluxDB's nanosecond timestamps is lost here. All arithmetic below
# stays in integers (never float-seconds-times-1e9) to avoid float64 losing
# precision on the much larger nanosecond magnitude.


def rfc3339_to_ns(value: str) -> int:
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    epoch_seconds = int(dt.replace(microsecond=0).timestamp())
    return epoch_seconds * 1_000_000_000 + dt.microsecond * 1_000


def ns_to_rfc3339(ns: int) -> str:
    seconds, remainder_ns = divmod(ns, 1_000_000_000)
    dt = datetime.fromtimestamp(seconds, tz=timezone.utc).replace(microsecond=remainder_ns // 1_000)
    return dt.isoformat().replace("+00:00", "Z")
