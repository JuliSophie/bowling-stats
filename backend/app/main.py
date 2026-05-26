from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from app.config import get_settings
from app.database import Base, engine
from app import models  # noqa: F401
from app.routers.games import router as games_router
from app.routers.stats import router as stats_router
from app.routers.upload import router as upload_router


settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    inspector = inspect(engine)
    if "games" in inspector.get_table_names() and "created_at" not in {col["name"] for col in inspector.get_columns("games")}:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE games ADD COLUMN created_at DATETIME"))
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_games_created_at ON games (created_at)"))
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(upload_router, prefix="/api")
app.include_router(games_router, prefix="/api")
app.include_router(stats_router, prefix="/api")