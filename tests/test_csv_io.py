from app.models.points import PointRow
from app.services.csv_io import points_to_csv


def test_points_to_csv_includes_all_tag_columns():
    rows = [
        PointRow(
            id="x1",
            measurement="temperature",
            tags={"room": "kitchen", "sensor": "s1"},
            field="value",
            value=19.8,
            time="2026-06-17T11:50:55Z",
        ),
        PointRow(
            id="x2",
            measurement="humidity",
            tags={"room": "livingroom"},
            field="value",
            value=45.0,
            time="2026-06-17T11:50:55Z",
        ),
    ]

    csv_text = points_to_csv(rows)
    lines = csv_text.strip().splitlines()

    assert lines[0] == "measurement,tag.room,tag.sensor,field,value,time"
    assert lines[1] == "temperature,kitchen,s1,value,19.8,2026-06-17T11:50:55Z"
    assert lines[2] == "humidity,livingroom,,value,45.0,2026-06-17T11:50:55Z"
