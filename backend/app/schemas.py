from datetime import date

from pydantic import BaseModel, Field


class DetectedScore(BaseModel):
    player_name: str = Field(min_length=1, max_length=120)
    total_score: int = Field(ge=0, le=300)
    frames: list[int | dict[str, int | str]] = Field(default_factory=list)


class UploadResult(BaseModel):
    filename: str
    raw_text: str
    detected_scores: list[DetectedScore] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ConfirmedScore(BaseModel):
    player_name: str = Field(min_length=1, max_length=120)
    total_score: int = Field(ge=0, le=300)
    frames: list[int | dict[str, int | str]] = Field(default_factory=list)
    avatar_url: str | None = Field(default=None, max_length=255)


class GameCreate(BaseModel):
    played_at: date
    location: str = Field(min_length=1, max_length=120)
    mode: str = Field(default="10-Pin", min_length=1, max_length=40)
    user_id: str | None = Field(default=None, max_length=64)
    scores: list[ConfirmedScore] = Field(min_length=1)


class StoredScore(BaseModel):
    player_name: str
    total_score: int
    frames: list[int | dict[str, int | str]] = Field(default_factory=list)


class GameRead(BaseModel):
    id: int
    played_at: date
    location: str
    mode: str
    user_id: str | None = None
    scores: list[StoredScore]


class TrendPoint(BaseModel):
    played_at: date
    total_score: int


class PlayerTrend(BaseModel):
    player_name: str
    games: list[TrendPoint]


class PlayerAverage(BaseModel):
    player_name: str
    average_score: float
    games_played: int


class HighScoreEntry(BaseModel):
    player_name: str
    total_score: int
    played_at: date
    location: str


class StatsResponse(BaseModel):
    score_trends: list[PlayerTrend] = Field(default_factory=list)
    averages: list[PlayerAverage] = Field(default_factory=list)
    hall_of_fame: list[HighScoreEntry] = Field(default_factory=list)
