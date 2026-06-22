import calendar
from datetime import datetime, timedelta, timezone, tzinfo
from typing import Literal

from app.utils.time import ns_to_rfc3339, rfc3339_to_ns
from app.utils.timezone import get_local_zone

OffsetUnit = Literal["minutes", "hours", "days", "weeks", "months", "years"]
NormalizeGranularity = Literal["minute", "hour", "day", "week", "month", "year"]


def _to_local(time_str: str, zone: tzinfo) -> datetime:
    ns = rfc3339_to_ns(time_str)
    seconds, remainder_ns = divmod(ns, 1_000_000_000)
    dt_utc = datetime.fromtimestamp(seconds, tz=timezone.utc).replace(microsecond=remainder_ns // 1_000)
    return dt_utc.astimezone(zone)


def local_datetime_to_rfc3339(dt_local: datetime) -> str:
    # Shared by shift_time()/normalize_time() below and by ods_io.py's ODS
    # import parsing, which both need to turn a local-time-zone-aware
    # datetime back into the app's standard UTC RFC3339 string, with the same
    # integer-nanosecond-safe precision as the rest of app/utils/time.py.
    dt_utc = dt_local.astimezone(timezone.utc)
    epoch_seconds = int(dt_utc.replace(microsecond=0).timestamp())
    ns = epoch_seconds * 1_000_000_000 + dt_utc.microsecond * 1_000
    return ns_to_rfc3339(ns)


def _add_calendar(dt: datetime, amount: int, unit: OffsetUnit) -> datetime:
    if unit in ("minutes", "hours", "days", "weeks"):
        return dt + timedelta(**{unit: amount})
    months_per_unit = 12 if unit == "years" else 1
    total_months = dt.month - 1 + amount * months_per_unit
    year = dt.year + total_months // 12
    month = total_months % 12 + 1
    day = min(dt.day, calendar.monthrange(year, month)[1])
    return dt.replace(year=year, month=month, day=day)


def shift_time(time_str: str, amount: int, unit: OffsetUnit, zone: tzinfo | None = None) -> str:
    dt_local = _to_local(time_str, zone or get_local_zone())
    shifted = _add_calendar(dt_local, amount, unit)
    return local_datetime_to_rfc3339(shifted)


def _truncate(dt: datetime, granularity: NormalizeGranularity) -> datetime:
    dt = dt.replace(microsecond=0, second=0)
    if granularity == "minute":
        return dt
    dt = dt.replace(minute=0)
    if granularity == "hour":
        return dt
    dt = dt.replace(hour=0)
    if granularity == "day":
        return dt
    if granularity == "week":
        return dt - timedelta(days=dt.weekday())  # Monday == 0
    if granularity == "month":
        return dt.replace(day=1)
    return dt.replace(month=1, day=1)  # "year"


def normalize_time(time_str: str, granularity: NormalizeGranularity, zone: tzinfo | None = None) -> str:
    dt_local = _to_local(time_str, zone or get_local_zone())
    truncated = _truncate(dt_local, granularity)
    return local_datetime_to_rfc3339(truncated)
