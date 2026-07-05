import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from app.auth import auth_enabled, require_auth
from app.config import get_settings
from app.database import Base, engine
from app import models  # noqa: F401
from app.routers.auth import router as auth_router
from app.routers.games import router as games_router
from app.routers.lane_samples import router as lane_samples_router
from app.routers.stats import router as stats_router
from app.routers.tracking import router as tracking_router
from app.routers.upload import router as upload_router


logger = logging.getLogger(__name__)

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    inspector = inspect(engine)
    if "games" in inspector.get_table_names():
        existing_columns = {col["name"] for col in inspector.get_columns("games")}
        with engine.begin() as connection:
            if "created_at" not in existing_columns:
                connection.execute(text("ALTER TABLE games ADD COLUMN created_at DATETIME"))
                connection.execute(text("CREATE INDEX IF NOT EXISTS ix_games_created_at ON games (created_at)"))
            if "played_at_time" not in existing_columns:
                connection.execute(text("ALTER TABLE games ADD COLUMN played_at_time TIME"))
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)


if not auth_enabled():
    logger.warning(
        "Auth is DISABLED: set BOWLING_APP_PASSWORD and BOWLING_AUTH_SECRET to "
        "protect the API. The /api surface is currently public."
    )


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


# Protected: everything below requires a valid auth cookie (browser) or bearer token (companion app).
protected = [Depends(require_auth)]

# Public: the login/session endpoints must be reachable before authentication.
app.include_router(auth_router, prefix="/api")

# Tracking (live sessions + companion throw ingest) is now gated: strangers can't
# post throws or read the live feed. The browser authenticates with the cookie, the
# Android companion with its bearer token.
app.include_router(tracking_router, prefix="/api", dependencies=protected)

app.include_router(upload_router, prefix="/api", dependencies=protected)
app.include_router(lane_samples_router, prefix="/api", dependencies=protected)
app.include_router(games_router, prefix="/api", dependencies=protected)
app.include_router(stats_router, prefix="/api", dependencies=protected)

# Keep CORS as the outermost ASGI wrapper. If an endpoint raises an unhandled
# exception, FastAPI's server-error handler can otherwise generate a response
# before CORSMiddleware sees it, which makes the browser report a misleading
# "No Access-Control-Allow-Origin" error instead of the real backend error.
app = CORSMiddleware(
    app,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)