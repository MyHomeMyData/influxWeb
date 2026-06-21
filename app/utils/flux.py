def flux_string(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def series_predicate(measurement: str, tags: dict[str, str]) -> str:
    clauses = [f"_measurement={flux_string(measurement)}"]
    # Tag keys must be quoted too: the delete predicate grammar treats some
    # tag key names (e.g. "from") as reserved words otherwise.
    clauses.extend(f"{flux_string(key)}={flux_string(value)}" for key, value in tags.items())
    return " and ".join(clauses)
