from app.utils.time import ns_to_rfc3339, rfc3339_to_ns


def test_round_trip_seconds_precision():
    ns = rfc3339_to_ns("2026-06-17T11:50:55Z")
    assert ns_to_rfc3339(ns) == "2026-06-17T11:50:55Z"


def test_round_trip_microsecond_precision():
    ns = rfc3339_to_ns("2026-06-17T11:50:55.123456Z")
    assert ns_to_rfc3339(ns) == "2026-06-17T11:50:55.123456Z"


def test_ns_to_rfc3339_handles_offset():
    base_ns = rfc3339_to_ns("2026-06-17T11:50:55Z")
    later = ns_to_rfc3339(base_ns + 1_000)
    assert later == "2026-06-17T11:50:55.000001Z"
