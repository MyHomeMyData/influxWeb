from app.models.points import PointRow
from app.services.iobroker import group_field_based_rows


def _field_row(field: str, value, value_type: str, time: str) -> PointRow:
    return PointRow(
        id=f"raw-{field}",
        measurement="verbrauch.gas2026",
        tags={},
        field=field,
        value=value,
        value_type=value_type,
        time=time,
    )


def test_groups_fields_with_identical_timestamp_into_one_point():
    rows = [
        _field_row("ack", True, "bool", "2026-04-02T09:16:23.658000Z"),
        _field_row("from", "system.adapter.admin.1", "string", "2026-04-02T09:16:23.658000Z"),
        _field_row("q", 0, "float", "2026-04-02T09:16:23.658000Z"),
        _field_row("value", 150.98, "float", "2026-04-02T09:16:23.658000Z"),
    ]

    grouped = group_field_based_rows(rows)

    assert len(grouped) == 1
    point = grouped[0]
    assert point.value == 150.98
    assert point.value_type == "float"
    assert point.tags == {"ack": "true", "from": "system.adapter.admin.1", "q": "0"}


def test_groups_fields_within_same_millisecond_despite_sub_ms_jitter():
    # Real-world bug (reported via forum.iobroker.net): ioBroker's InfluxDB
    # adapter does not always write ack/from/q/value for one logical point in
    # a single line-protocol write. When "value" lands microseconds apart from
    # its sibling fields, an exact-timestamp-string grouping key used to split
    # this into two broken rows - one falling back to another field's value,
    # one orphaned with no tags - silently hiding the real sensor reading.
    rows = [
        _field_row("ack", True, "bool", "2026-04-02T09:16:23.658000Z"),
        _field_row("from", "system.adapter.admin.1", "string", "2026-04-02T09:16:23.658000Z"),
        _field_row("q", 0, "float", "2026-04-02T09:16:23.658000Z"),
        _field_row("value", 150.98, "float", "2026-04-02T09:16:23.658901Z"),
    ]

    grouped = group_field_based_rows(rows)

    assert len(grouped) == 1
    point = grouped[0]
    assert point.value == 150.98
    assert point.value_type == "float"
    assert point.tags == {"ack": "true", "from": "system.adapter.admin.1", "q": "0"}


def test_does_not_merge_points_in_different_milliseconds():
    rows = [
        _field_row("value", 150.98, "float", "2026-04-02T09:16:23.658000Z"),
        _field_row("value", 151.02, "float", "2026-04-02T09:16:24.658000Z"),
    ]

    grouped = group_field_based_rows(rows)

    assert len(grouped) == 2
    assert {row.value for row in grouped} == {150.98, 151.02}
