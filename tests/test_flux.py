from app.utils.flux import flux_string


def test_simple_string():
    assert flux_string("livingroom") == '"livingroom"'


def test_escapes_quotes_and_backslashes():
    assert flux_string('a"b\\c') == '"a\\"b\\\\c"'
