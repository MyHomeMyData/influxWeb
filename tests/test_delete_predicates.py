from app.models.points import Selection
from app.services.delete import build_predicates


def test_no_measurement_no_tags_means_delete_everything_in_range():
    selection = Selection(bucket="b")
    assert build_predicates(selection) == [""]


def test_single_measurement_no_tags():
    selection = Selection(bucket="b", measurements=["temperature"])
    assert build_predicates(selection) == ['_measurement="temperature"']


def test_multiple_measurements_expand_to_one_predicate_each():
    selection = Selection(bucket="b", measurements=["temperature", "humidity"])
    predicates = build_predicates(selection)
    assert predicates == ['_measurement="temperature"', '_measurement="humidity"']


def test_multiple_tag_values_expand_since_or_is_unsupported():
    selection = Selection(bucket="b", measurements=["temperature"], tags={"room": ["kitchen", "livingroom"]})
    predicates = build_predicates(selection)
    assert predicates == [
        '_measurement="temperature" and room="kitchen"',
        '_measurement="temperature" and room="livingroom"',
    ]


def test_multiple_tag_keys_form_cartesian_product():
    selection = Selection(bucket="b", tags={"room": ["a", "b"], "sensor": ["s1", "s2"]})
    predicates = build_predicates(selection)
    assert predicates == [
        'room="a" and sensor="s1"',
        'room="a" and sensor="s2"',
        'room="b" and sensor="s1"',
        'room="b" and sensor="s2"',
    ]
