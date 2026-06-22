from zoneinfo import ZoneInfo

from app.utils.local_time import normalize_time, shift_time

BERLIN = ZoneInfo("Europe/Berlin")


def test_normalize_minute_truncates_seconds_microseconds():
    assert normalize_time("2026-06-24T10:34:56.789Z", "minute", zone=BERLIN) == "2026-06-24T10:34:00Z"


def test_normalize_hour_truncates_minutes_seconds_microseconds():
    assert normalize_time("2026-06-24T10:34:56.789Z", "hour", zone=BERLIN) == "2026-06-24T10:00:00Z"


def test_normalize_day_uses_local_midnight():
    # 2026-06-24 12:00 UTC is 14:00 local (CEST, +02:00) - local midnight is 22:00 UTC the day before.
    assert normalize_time("2026-06-24T12:00:00Z", "day", zone=BERLIN) == "2026-06-23T22:00:00Z"


def test_normalize_week_starts_on_monday():
    # 2026-06-24 is a Wednesday; the preceding Monday is 2026-06-22.
    assert normalize_time("2026-06-24T10:00:00Z", "week", zone=BERLIN) == "2026-06-21T22:00:00Z"


def test_normalize_month_uses_first_of_month():
    assert normalize_time("2026-06-24T10:00:00Z", "month", zone=BERLIN) == "2026-05-31T22:00:00Z"


def test_normalize_year_uses_january_first():
    assert normalize_time("2026-06-24T10:00:00Z", "year", zone=BERLIN) == "2025-12-31T23:00:00Z"


def test_normalize_day_resolves_dst_independently_per_row():
    # Germany's 2026 spring-forward transition is 2026-03-29 (02:00 -> 03:00 local).
    # A timestamp the day before and one the day after must each normalize to
    # *their own* local midnight, with UTC offsets that differ by the DST shift -
    # this is the "can change across the selected rows" requirement.
    before = normalize_time("2026-03-29T10:00:00Z", "day", zone=BERLIN)
    after = normalize_time("2026-03-30T10:00:00Z", "day", zone=BERLIN)
    assert before == "2026-03-28T23:00:00Z"  # local midnight, still CET (+01:00)
    assert after == "2026-03-29T22:00:00Z"  # local midnight, now CEST (+02:00)


def test_shift_hours_is_a_fixed_duration():
    assert shift_time("2026-06-24T01:00:00Z", -2, "hours", zone=BERLIN) == "2026-06-23T23:00:00Z"


def test_shift_days_preserves_local_wall_clock_across_dst():
    # 2026-03-28 23:00 local (CET) + 1 day = 2026-03-29 23:00 local, but that day
    # is already CEST - so the UTC gap is 23h, not exactly 24h.
    assert shift_time("2026-03-28T22:00:00Z", 1, "days", zone=BERLIN) == "2026-03-29T21:00:00Z"


def test_shift_months_clamps_day_overflow():
    # Jan 31 + 1 month has no Feb 31 - clamp to the last day of February.
    assert shift_time("2026-01-31T10:00:00Z", 1, "months", zone=BERLIN) == "2026-02-28T10:00:00Z"


def test_shift_years_keeps_month_and_day():
    assert shift_time("2026-06-24T10:00:00Z", 1, "years", zone=BERLIN) == "2027-06-24T10:00:00Z"
