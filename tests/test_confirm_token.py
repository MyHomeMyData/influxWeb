import time

from app.utils import confirm_token as confirm_token_module
from app.utils.confirm_token import make_confirm_token, verify_confirm_token


def test_round_trip():
    payload = {"bucket": "b", "start": "x", "stop": "y"}
    token = make_confirm_token(payload)
    assert verify_confirm_token(payload, token)


def test_rejects_mismatched_payload():
    token = make_confirm_token({"bucket": "b"})
    assert not verify_confirm_token({"bucket": "other"}, token)


def test_rejects_garbage_token():
    assert not verify_confirm_token({"bucket": "b"}, "not-a-real-token")


def test_rejects_expired_token(monkeypatch):
    payload = {"bucket": "b"}
    token = make_confirm_token(payload)
    monkeypatch.setattr(
        confirm_token_module, "time", type("T", (), {"time": staticmethod(lambda: time.time() + 9999)})
    )
    assert not verify_confirm_token(payload, token)
