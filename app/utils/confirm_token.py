import hashlib
import hmac
import json
import secrets
import time

# Process-lifetime secret: tokens don't need to survive a restart, they only
# guard against executing a destructive op against state that's gone stale
# since the matching preview call (not a real auth boundary).
_SECRET = secrets.token_bytes(32)
TOKEN_TTL_SECONDS = 300


def _sign(payload: dict, issued_at: int) -> str:
    body = json.dumps(payload, sort_keys=True, default=str).encode()
    return hmac.new(_SECRET, body + str(issued_at).encode(), hashlib.sha256).hexdigest()


def make_confirm_token(payload: dict) -> str:
    issued_at = int(time.time())
    return f"{issued_at}.{_sign(payload, issued_at)}"


def verify_confirm_token(payload: dict, token: str) -> bool:
    try:
        issued_at_str, mac = token.split(".", 1)
        issued_at = int(issued_at_str)
    except ValueError:
        return False
    if time.time() - issued_at > TOKEN_TTL_SECONDS:
        return False
    return hmac.compare_digest(_sign(payload, issued_at), mac)
