import time

from app.models.jobs import PointRef
from app.services.delete import _point_predicate, execute_delete_selected, preview_delete_selected


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


class _SlowDeleteApi:
    def __init__(self, delay_seconds: float):
        self.delay_seconds = delay_seconds
        self.calls: list[str] = []

    def delete(self, start, stop, predicate, bucket, org):
        time.sleep(self.delay_seconds)
        self.calls.append(predicate)


class _FakeDeleteClient:
    def __init__(self, delay_seconds: float):
        self.delete_api_instance = _SlowDeleteApi(delay_seconds)

    def delete_api(self):
        return self.delete_api_instance


def _make_points(count: int) -> list[PointRef]:
    return [
        PointRef(bucket="b", measurement="m", tags={"i": str(i)}, time="2026-06-18T00:00:00Z") for i in range(count)
    ]


def test_execute_delete_selected_deletes_every_point():
    points = _make_points(5)
    preview = preview_delete_selected(points)
    client = _FakeDeleteClient(delay_seconds=0)

    execute_delete_selected(client, "org", points, preview.confirm_token)

    assert len(client.delete_api_instance.calls) == 5


def test_execute_delete_selected_runs_concurrently_not_one_by_one():
    points = _make_points(16)
    preview = preview_delete_selected(points)
    client = _FakeDeleteClient(delay_seconds=0.05)

    started = time.monotonic()
    execute_delete_selected(client, "org", points, preview.confirm_token)
    elapsed = time.monotonic() - started

    # Sequential would take 16 * 0.05s = 0.8s; concurrent (8-wide pool) takes
    # about 2 batches (~0.1s) - generous bound below to avoid flakiness while
    # still clearly failing if a regression makes this sequential again.
    assert elapsed < 0.5
