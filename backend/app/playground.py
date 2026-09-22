"""Small, deliberately isolated local playground for the live tracking UI.

This module must only be started by the playground script.  In particular, it
does not import ``app.main``: that module also imports the OCR and upload stack.
"""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

if os.environ.get("BOWLING_PLAYGROUND") != "1":
    raise RuntimeError("Set BOWLING_PLAYGROUND=1 before importing app.playground.")

runtime_value = os.environ.get("BOWLING_PLAYGROUND_RUNTIME", "")
local_appdata = os.environ.get("LOCALAPPDATA", "")
designated_root = (Path(local_appdata) / "BowlingStatsPlayground").resolve() if local_appdata else None
runtime_candidate = Path(runtime_value) if runtime_value else Path()
runtime = runtime_candidate.resolve() if runtime_value else Path()
if (
    not runtime_value
    or not runtime_candidate.is_absolute()
    or designated_root is None
    or runtime != designated_root and designated_root not in runtime.parents
):
    raise RuntimeError("BOWLING_PLAYGROUND_RUNTIME must be an absolute isolated path.")
runtime.mkdir(parents=True, exist_ok=True)

# These assignments intentionally win over backend/.env.  Do not add production
# origins or credentials to this process.
os.environ.update(
    BOWLING_DATABASE_URL=f"sqlite:///{(runtime / 'playground.db').as_posix()}",
    BOWLING_TEMP_DIR=str(runtime / "tmp"),
    BOWLING_ENVIRONMENT="development",
    BOWLING_APP_PASSWORD="",
    BOWLING_AUTH_SECRET="",
    BOWLING_LANE_TRAIN_ENABLED="false",
    BOWLING_CORS_ORIGINS="http://127.0.0.1:4317,http://127.0.0.1:8317",
)

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import inspect, text
from starlette.staticfiles import StaticFiles

from app import models  # noqa: F401
from app.config import get_settings
from app.database import Base, engine
from app.routers.auth import router as auth_router
from app.routers.games import router as games_router
from app.routers.stats import router as stats_router
from app.routers.tracking import router as tracking_router
from app.routers.trash_talk import router as trash_talk_router

settings = get_settings()
ALLOWED_HOST = "127.0.0.1:8317"
ALLOWED_ORIGINS = {"http://127.0.0.1:4317", "http://127.0.0.1:8317"}
CLIENT = Path(__file__).parent / "playground_client"


class LocalBoundaryMiddleware:
    """Reject requests and WebSockets that did not originate from this playground."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] not in {"http", "websocket"}:
            await self.app(scope, receive, send)
            return
        headers = {key.decode().lower(): value.decode() for key, value in scope.get("headers", [])}
        if headers.get("host", "").lower() != ALLOWED_HOST:
            if scope["type"] == "websocket":
                await send({"type": "websocket.close", "code": 1008, "reason": "local host required"})
            else:
                response = JSONResponse({"detail": "Nur 127.0.0.1:8317 ist erlaubt."}, status_code=421)
                await response(scope, receive, send)
            return
        origin = headers.get("origin")
        if origin and origin not in ALLOWED_ORIGINS:
            if scope["type"] == "websocket":
                await send({"type": "websocket.close", "code": 1008, "reason": "local origin required"})
            else:
                response = JSONResponse({"detail": "Nicht erlaubter lokaler Origin."}, status_code=403)
                await response(scope, receive, send)
            return
        await self.app(scope, receive, send)


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    inspector = inspect(engine)
    if "games" in inspector.get_table_names():
        columns = {column["name"] for column in inspector.get_columns("games")}
        with engine.begin() as connection:
            if "created_at" not in columns:
                connection.execute(text("ALTER TABLE games ADD COLUMN created_at DATETIME"))
            if "played_at_time" not in columns:
                connection.execute(text("ALTER TABLE games ADD COLUMN played_at_time TIME"))
    yield


app = FastAPI(title="Bowling Stats Local Playground", lifespan=lifespan)
app.add_middleware(LocalBoundaryMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(ALLOWED_ORIGINS),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "playground": "bowling-stats-local"}


app.include_router(auth_router, prefix="/api")
app.include_router(tracking_router, prefix="/api")
app.include_router(games_router, prefix="/api")
app.include_router(stats_router, prefix="/api")
app.include_router(trash_talk_router, prefix="/api")
app.mount("/debug/assets", StaticFiles(directory=CLIENT), name="playground-assets")


@app.get("/debug", include_in_schema=False)
@app.get("/debug/", include_in_schema=False)
def debug_client() -> FileResponse:
    return FileResponse(CLIENT / "index.html")
