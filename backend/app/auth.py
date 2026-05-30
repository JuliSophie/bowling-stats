"""Shared-password authentication.

A single shared password (``BOWLING_APP_PASSWORD``) gates the whole ``/api``
surface. On a successful login the backend issues a signed, expiring token
stored in an HttpOnly cookie. The token is a self-contained HMAC over its
expiry timestamp — no server-side session store required.

Auth is only enforced when BOTH ``app_password`` and ``auth_secret`` are set;
otherwise the gate is disabled (handy for throwaway local runs) and a warning
is logged at startup.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import time

from fastapi import Cookie, HTTPException, Response, status

from app.config import get_settings


logger = logging.getLogger(__name__)

COOKIE_NAME = "bowling_auth"


def auth_enabled() -> bool:
    settings = get_settings()
    return bool(settings.app_password and settings.auth_secret)


def _b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _b64decode(value: str) -> bytes:
    padded = value + "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(padded)


def _sign(message: str, secret: str) -> str:
    digest = hmac.new(secret.encode(), message.encode(), hashlib.sha256).digest()
    return _b64encode(digest)


def create_token(ttl_seconds: int) -> str:
    secret = get_settings().auth_secret
    expiry = str(int(time.time()) + ttl_seconds)
    payload = _b64encode(expiry.encode())
    return f"{payload}.{_sign(payload, secret)}"


def verify_token(token: str | None) -> bool:
    if not token or "." not in token:
        return False

    secret = get_settings().auth_secret
    if not secret:
        return False

    payload, _, signature = token.partition(".")
    if not hmac.compare_digest(signature, _sign(payload, secret)):
        return False

    try:
        expiry = int(_b64decode(payload).decode())
    except (ValueError, UnicodeDecodeError):
        return False

    return expiry > int(time.time())


def verify_password(candidate: str) -> bool:
    expected = get_settings().app_password
    if not expected:
        return False
    return hmac.compare_digest(candidate, expected)


def set_auth_cookie(response: Response) -> None:
    settings = get_settings()
    ttl = settings.auth_token_ttl_days * 86_400
    response.set_cookie(
        key=COOKIE_NAME,
        value=create_token(ttl),
        max_age=ttl,
        httponly=True,
        secure=settings.environment.lower() != "development",
        samesite="lax",
        domain=settings.auth_cookie_domain or None,
        path="/",
    )


def clear_auth_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        key=COOKIE_NAME,
        domain=settings.auth_cookie_domain or None,
        path="/",
    )


def require_auth(bowling_auth: str | None = Cookie(default=None)) -> None:
    """FastAPI dependency guarding protected routers."""
    if not auth_enabled():
        return
    if not verify_token(bowling_auth):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nicht angemeldet.",
        )
