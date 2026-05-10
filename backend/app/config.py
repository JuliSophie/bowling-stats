from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


WORKSPACE_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_DATA_DIR = WORKSPACE_ROOT / "data"
DEFAULT_DB_PATH = DEFAULT_DATA_DIR / "app.db"
DEFAULT_TEMP_DIR = DEFAULT_DATA_DIR / "tmp"


class Settings(BaseSettings):
    app_name: str = "Bowling Stats API"
    environment: str = "development"
    database_url: str = Field(default_factory=lambda: f"sqlite:///{DEFAULT_DB_PATH.as_posix()}")
    cors_origins: str = "http://localhost:3001,http://127.0.0.1:3001"
    tesseract_cmd: str | None = None
    temp_dir: Path = DEFAULT_TEMP_DIR

    model_config = SettingsConfigDict(
        env_prefix="BOWLING_",
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    def ensure_runtime_paths(self) -> None:
        self.temp_dir.mkdir(parents=True, exist_ok=True)
        if self.database_url.startswith("sqlite:///"):
            db_path = Path(self.database_url.replace("sqlite:///", "", 1))
            db_path.parent.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.ensure_runtime_paths()
    return settings
