import csv
import io

import pytest

from app.services import raw_io

START = "2026-05-23T00:00:00Z"
STOP = "2026-06-22T00:00:00Z"


def _build_csv(value_datatype: str, tag_names: list[str], data_rows: list[list[str]]) -> bytes:
    # data_rows entries are [_time, _value, _field, _measurement, *tag_values],
    # matching the live-verified shape of influxdb_client's query_raw() output.
    header = ["", "result", "table", "_start", "_stop", "_time", "_value", "_field", "_measurement", *tag_names]
    datatype_row = [
        "#datatype", "string", "long", "dateTime:RFC3339", "dateTime:RFC3339", "dateTime:RFC3339",
        value_datatype, "string", "string", "string", *(["string"] * len(tag_names)),
    ]
    group_row = ["#group", *(["false"] * 2), *(["true"] * 2), "false", "false", *(["true"] * (3 + len(tag_names)))]
    default_row = ["#default", "_result", *([""] * (len(header) - 2))]

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(datatype_row)
    writer.writerow(group_row)
    writer.writerow(default_row)
    writer.writerow(header)
    for time_str, value, field, measurement, *tag_values in data_rows:
        writer.writerow(["", "", "0", START, STOP, time_str, value, field, measurement, *tag_values])
    return buffer.getvalue().encode("utf-8")


def test_iter_raw_points_parses_double_field_with_tags():
    content = _build_csv(
        "double", ["room", "sensor"],
        [["2026-06-17T12:37:11Z", "45", "value", "humidity", "livingroom", "s1"]],
    )

    points = list(raw_io.iter_raw_points(content, "bucket1"))

    assert len(points) == 1
    request = points[0]
    assert request.bucket == "bucket1"
    assert request.measurement == "humidity"
    assert request.tags == {"room": "livingroom", "sensor": "s1"}
    assert request.field == "value"
    assert request.value == 45.0
    assert request.value_type == "float"


def test_iter_raw_points_long_field_is_int():
    content = _build_csv("long", [], [["2026-06-17T12:37:11Z", "60", "count", "m"]])

    points = list(raw_io.iter_raw_points(content, "bucket1"))

    assert points[0].value == 60
    assert points[0].value_type == "int"


def test_iter_raw_points_boolean_field():
    content = _build_csv("boolean", [], [["2026-06-17T12:37:11Z", "true", "ack", "m"]])

    points = list(raw_io.iter_raw_points(content, "bucket1"))

    assert points[0].value is True
    assert points[0].value_type == "bool"


def test_iter_raw_points_omits_empty_tag_value():
    content = _build_csv("double", ["room"], [["2026-06-17T12:37:11Z", "1", "value", "m", ""]])

    points = list(raw_io.iter_raw_points(content, "bucket1"))

    assert points[0].tags == {}


def test_iter_raw_points_parses_multiple_datatype_blocks():
    # Export Raw dumps the whole bucket with no filtering, so a file with
    # several measurements of different tag shapes commonly has more than
    # one #datatype block (one per distinct shape) - a new block just starts
    # a fresh column layout, it isn't an error.
    block = _build_csv("double", ["room"], [["2026-06-17T12:37:11Z", "1", "value", "m1", "kitchen"]]).decode()
    other_block = _build_csv("long", [], [["2026-06-18T12:37:11Z", "2", "count", "m2"]]).decode()
    content = (block + "\n" + other_block).encode("utf-8")

    points = list(raw_io.iter_raw_points(content, "bucket1"))

    assert len(points) == 2
    assert points[0].measurement == "m1"
    assert points[0].tags == {"room": "kitchen"}
    assert points[0].value_type == "float"
    assert points[1].measurement == "m2"
    assert points[1].tags == {}
    assert points[1].value_type == "int"
    assert points[1].value == 2


def test_iter_raw_points_missing_required_column_raises():
    header = ["", "result", "table", "_start", "_stop", "_time", "_value", "_field"]  # no _measurement
    text = "\n".join(
        [
            ",".join(["#datatype", "string", "long", "dateTime:RFC3339", "dateTime:RFC3339",
                      "dateTime:RFC3339", "double", "string", "string"]),
            ",".join(["#group"] + ["false"] * 7),
            ",".join(["#default", "_result"] + [""] * 6),
            ",".join(header),
            ",,0,2026-01-01T00:00:00Z,2026-01-02T00:00:00Z,2026-06-17T12:37:11Z,1,value",
        ]
    )

    with pytest.raises(ValueError, match="_measurement"):
        list(raw_io.iter_raw_points(text.encode("utf-8"), "bucket1"))


def test_iter_raw_points_unsupported_datatype_raises():
    content = _build_csv("unsignedLong", [], [["2026-06-17T12:37:11Z", "1", "value", "m"]])

    with pytest.raises(ValueError, match="unsupported _value datatype"):
        list(raw_io.iter_raw_points(content, "bucket1"))


def test_iter_raw_points_malformed_time_raises():
    content = _build_csv("double", [], [["not-a-date", "1", "value", "m"]])

    with pytest.raises(ValueError):
        list(raw_io.iter_raw_points(content, "bucket1"))


def test_iter_raw_points_invalid_utf8_raises():
    with pytest.raises(ValueError, match="UTF-8"):
        list(raw_io.iter_raw_points(b"\xff\xfe\x00\x01garbage", "bucket1"))


def test_iter_raw_points_empty_content_raises():
    with pytest.raises(ValueError):
        list(raw_io.iter_raw_points(b"", "bucket1"))
