from app.models.points import FieldValue, FieldValueType


def coerce_field_value(value: FieldValue, value_type: FieldValueType) -> FieldValue:
    # Re-casts to the declared type explicitly, rather than trusting whatever
    # type Pydantic guessed for the raw JSON - a whole-number float (60.0)
    # and a JSON int (60) are indistinguishable on the wire once they've
    # round-tripped through a browser, but InfluxDB enforces a fixed type per
    # field and rejects a mismatched write.
    if value_type == "float":
        return float(value)
    if value_type == "int":
        return int(value)
    if value_type == "bool":
        return bool(value)
    return str(value)


def value_type_of(value: FieldValue) -> FieldValueType:
    # bool must be checked before int: in Python, bool is a subclass of int.
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, float):
        return "float"
    if isinstance(value, int):
        return "int"
    return "string"
