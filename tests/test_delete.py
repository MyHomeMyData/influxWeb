from app.models.jobs import PointRef
from app.services.delete import _point_predicate


def test_point_predicate_quotes_tag_keys():
    # InfluxDB's delete predicate grammar rejects some tag key names (e.g.
    # "from") as reserved words unless the key itself is quoted too.
    point = PointRef(bucket="b", measurement="m", tags={"from": "system.adapter.javascript.1"}, time="2026-06-18T00:00:00Z")
    assert _point_predicate(point) == '_measurement="m" and "from"="system.adapter.javascript.1"'


def test_point_predicate_with_no_tags():
    point = PointRef(bucket="b", measurement="m", tags={}, time="2026-06-18T00:00:00Z")
    assert _point_predicate(point) == '_measurement="m"'


def test_point_predicate_with_multiple_tags():
    point = PointRef(bucket="b", measurement="m", tags={"room": "kitchen", "sensor": "s1"}, time="2026-06-18T00:00:00Z")
    assert _point_predicate(point) == '_measurement="m" and "room"="kitchen" and "sensor"="s1"'
