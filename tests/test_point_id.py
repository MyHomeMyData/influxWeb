from app.utils.point_id import decode_point_id, encode_point_id


def test_round_trip():
    point_id = encode_point_id("bucket1", "temperature", {"room": "kitchen", "sensor": "s1"}, "2026-06-17T11:50:55Z")
    bucket, measurement, tags, time_ns = decode_point_id(point_id)
    assert bucket == "bucket1"
    assert measurement == "temperature"
    assert tags == {"room": "kitchen", "sensor": "s1"}
    assert time_ns == 1781697055000000000


def test_tag_order_does_not_affect_id():
    id_a = encode_point_id("b", "m", {"a": "1", "b": "2"}, "2026-01-01T00:00:00Z")
    id_b = encode_point_id("b", "m", {"b": "2", "a": "1"}, "2026-01-01T00:00:00Z")
    assert id_a == id_b
