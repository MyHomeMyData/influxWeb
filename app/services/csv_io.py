import csv
import io

from app.models.points import PointRow


def points_to_csv(rows: list[PointRow]) -> str:
    tag_keys: list[str] = []
    for row in rows:
        for key in row.tags:
            if key not in tag_keys:
                tag_keys.append(key)

    buffer = io.StringIO()
    fieldnames = ["measurement", *[f"tag.{key}" for key in tag_keys], "field", "value", "time"]
    writer = csv.DictWriter(buffer, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        record = {
            "measurement": row.measurement,
            "field": row.field,
            "value": row.value,
            "time": row.time,
        }
        for key in tag_keys:
            record[f"tag.{key}"] = row.tags.get(key, "")
        writer.writerow(record)

    return buffer.getvalue()
