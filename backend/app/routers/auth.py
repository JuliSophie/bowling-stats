"""Login / logout / session endpoints for the shared-password gate."""

from __future__ import annotations

import time

from fastapi import APIRouter, Cookie, HTTPException, Response, status
from pydantic import BaseModel

from app import auth


router = APIRouter(tags=["auth"])


class LoginRequest(BaseModel):
    password: str


class SessionResponse(BaseModel):
    authenticated: bool
    required: bool


@router.post("/auth/login")
def login(payload: LoginRequest, response: Response) -> dict[str, bool]:
    if not auth.auth_enabled():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentifizierung ist nicht konfiguriert.",
        )

    if not auth.verify_password(payload.password):
        # Small fixed delay to take the edge off brute-force attempts.
        time.sleep(0.5)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Falsches Passwort.",
        )

    auth.set_auth_cookie(response)
    return {"authenticated": True}


@router.post("/auth/logout")
def logout(response: Response) -> dict[str, bool]:
    auth.clear_auth_cookie(response)
    return {"authenticated": False}


@router.get("/auth/session", response_model=SessionResponse)
def session(bowling_auth: str | None = Cookie(default=None)) -> SessionResponse:
    if not auth.auth_enabled():
        return SessionResponse(authenticated=True, required=False)
    return SessionResponse(authenticated=auth.verify_token(bowling_auth), required=True)
