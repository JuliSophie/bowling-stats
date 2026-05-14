from datetime import date

from pydantic import BaseModel, Field


class ManualCorner(BaseModel):
    x: float = Field(ge=0.0, le=1.0)
    y: float = Field(ge=0.0, le=1.0)


class LineSegment(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float


class SubCell(BaseModel):
    row: int
    col: int
    sub_index: int
    x: float
    y: float
    w: float
    h: float


class CornerGuessResult(BaseModel):
    filename: str
    guessed_corners: list[ManualCorner] = Field(default_factory=list, min_length=0, max_length=4)
    warnings: list[str] = Field(default_factory=list)


class RectifiedPreview(BaseModel):
    filename: str
    bw_image_data_url: str | None = None
    morph_horizontal_data_url: str | None = None
    morph_vertical_data_url: str | None = None
    horizontal_candidates: list[LineSegment] = Field(default_factory=list)
    vertical_candidates: list[LineSegment] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class TableBuildResult(BaseModel):
    rectified_bw_data_url: str | None = None
    sub_cells: list[SubCell] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class FrameData(BaseModel):
    throw1: str = ""
    throw2: str = ""
    throw3: str = ""
    cumulative: str = ""


class PlayerData(BaseModel):
    name: str = ""
    frames: list[FrameData] = Field(default_factory=list)


class ExtractionResult(BaseModel):
    filename: str
    players: list[PlayerData] = Field(default_factory=list)
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


class PlayerRenameRequest(BaseModel):
    current_name: str = Field(min_length=1, max_length=120)
    new_name: str = Field(min_length=1, max_length=120)


class PlayerRenameResponse(BaseModel):
    previous_name: str
    player_name: str
    merged: bool = False


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
