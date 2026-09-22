from datetime import date, datetime, time
from typing import Any, Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator


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
    captured_at: datetime | None = None
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
    fallen_pins: list[list[int] | None] | None = Field(default=None, alias="fallenPins")
    ball_speed_kmh: list[float | None] | None = Field(default=None, alias="ballSpeedKmh")

    model_config = ConfigDict(populate_by_name=True)


class PlayerData(BaseModel):
    name: str = ""
    frames: list[FrameData] = Field(default_factory=list)
    row_crop_data_url: str | None = None
    frame_crop_data_urls: list[str | None] = Field(default_factory=list)


class ExtractionResult(BaseModel):
    filename: str
    players: list[PlayerData] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class RecentPlayerNamesResponse(BaseModel):
    names: list[str] = Field(default_factory=list)


class ConfirmedScore(BaseModel):
    # frame dicts may carry per-throw "fallenPins" (list[list[int]]) from live tracking, so values
    # are typed Any rather than the OCR-only int|str.
    player_name: str = Field(min_length=1, max_length=120)
    total_score: int = Field(ge=0, le=300)
    frames: list[int | dict[str, Any]] = Field(default_factory=list)
    avatar_url: str | None = Field(default=None, max_length=255)


class GameCreate(BaseModel):
    played_at: date
    played_at_time: time | None = None
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


class SpareCounterfactual(BaseModel):
    frame: int
    original_score: int
    hypothetical_score: int
    gain: int
    pins_added: int
    single_pin_attempt: bool
    pin: int | None = None


class PinLeaveEvidence(BaseModel):
    frame: int
    standing_pins: list[int]
    converted: bool


class TrashTalkEvidence(BaseModel):
    valid: bool
    reason: str | None = None
    counterfactuals: list[SpareCounterfactual] = Field(default_factory=list)
    strike_count: int = 0
    spare_count: int = 0
    open_count: int = 0
    clean: bool = False
    frame_points: list[int] = Field(default_factory=list)
    leaves: list[PinLeaveEvidence] = Field(default_factory=list)


class StoredScore(BaseModel):
    player_name: str
    total_score: int
    frames: list[int | dict[str, Any]] = Field(default_factory=list)
    trash_talk_evidence: TrashTalkEvidence | None = None


class GameRead(BaseModel):
    id: int
    played_at: date
    played_at_time: time | None = None
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


class TrackingSessionCreate(BaseModel):
    session_id: str | None = Field(default=None, alias="sessionId", max_length=120)
    player_names: list[str] = Field(default_factory=list, alias="playerNames")
    location: str | None = Field(default=None, max_length=120)

    model_config = ConfigDict(populate_by_name=True)


class TrackingSessionJoin(BaseModel):
    pairing_token: str = Field(alias="pairingToken")

    @field_validator("pairing_token", mode="before")
    @classmethod
    def normalize_pairing_token(cls, value: Any) -> str:
        if not isinstance(value, str):
            raise ValueError("pairingToken muss aus genau sechs ASCII-Ziffern bestehen.")
        token = value.strip()
        if len(token) != 6 or any(character < "0" or character > "9" for character in token):
            raise ValueError("pairingToken muss aus genau sechs ASCII-Ziffern bestehen.")
        return token

    model_config = ConfigDict(populate_by_name=True)


class TrackingPlayersUpdate(BaseModel):
    """Operator-controlled roster: how many players are on the lane (and optional names)."""

    player_count: int = Field(alias="playerCount", ge=1, le=8)
    player_names: list[str] = Field(default_factory=list, alias="playerNames")

    model_config = ConfigDict(populate_by_name=True)


class ThrowCorrection(BaseModel):
    """Manual fix-ups to the ordered throw log when the camera mis-/under-detected a throw."""

    action: Literal["edit_last", "insert_before_last", "insert_at_end", "delete_last", "delete_at", "edit_at_pattern"]
    pins_knocked_down: int | None = Field(
        default=None, validation_alias=AliasChoices("pinsKnockedDown", "pins_knocked_down"), ge=0, le=10
    )
    throw_index: int | None = Field(
        default=None, validation_alias=AliasChoices("throwIndex", "throw_index"), ge=0
    )
    fallen_pins: list[int] | None = Field(default=None, validation_alias=AliasChoices("fallenPins", "fallen_pins"))

    @field_validator("fallen_pins", mode="before")
    @classmethod
    def strict_pattern(cls, value: Any) -> list[int] | None:
        if value is None:
            return None
        if not isinstance(value, list) or any(type(pin) is not int or not 1 <= pin <= 10 for pin in value):
            raise ValueError("fallenPins muss eine eindeutige Liste von Pins 1 bis 10 sein.")
        if len(set(value)) != len(value):
            raise ValueError("fallenPins darf keine doppelten Pins enthalten.")
        return value

    @field_validator("pins_knocked_down", mode="before")
    @classmethod
    def strict_count(cls, value: Any) -> int | None:
        if value is None or (type(value) is int and 0 <= value <= 10):
            return value
        raise ValueError("pinsKnockedDown muss eine ganze Zahl von 0 bis 10 oder null sein.")

    model_config = ConfigDict(populate_by_name=True)


class TrackingFrame(BaseModel):
    """One frame on a player's card: the pins per ball plus the running cumulative score."""

    throws: list[int] = Field(default_factory=list)
    cumulative: int | None = None
    is_strike: bool = Field(default=False, alias="isStrike")
    is_spare: bool = Field(default=False, alias="isSpare")
    # Pins (1..10) that fell on each ball of this frame, in ball order. Empty when not tracked.
    fallen_pins: list[list[int] | None] = Field(default_factory=list, alias="fallenPins")
    ball_speed_kmh: list[float | None] = Field(default_factory=list, alias="ballSpeedKmh")

    model_config = ConfigDict(populate_by_name=True)


class TrackingPlayerCard(BaseModel):
    index: int
    name: str
    frames: list[TrackingFrame] = Field(default_factory=list)
    total: int = 0
    is_current: bool = Field(default=False, alias="isCurrent")

    model_config = ConfigDict(populate_by_name=True)


class TrackingLoggedThrow(BaseModel):
    """One entry in the replayable throw log, enriched with current score-table assignment."""

    index: int
    throw_id: str = Field(alias="throwId")
    player: str
    frame: int = Field(ge=1, le=10)
    throw: int = Field(ge=1, le=3)
    pins_knocked_down: int | None = Field(default=None, alias="pinsKnockedDown")
    fallen_pins: list[int] | None = Field(default=None, alias="fallenPins")
    observed_fallen_pins: list[int] | None = Field(default=None, alias="observedFallenPins")
    already_down_pins: list[int] | None = Field(default=None, alias="alreadyDownPins")
    captured_at: str | None = Field(default=None, alias="capturedAt")
    manual: bool = False
    manual_correction: bool = Field(default=False, alias="manualCorrection")
    low_confidence: bool = Field(default=False, alias="lowConfidence")
    ball_speed_kmh: float | None = Field(default=None, alias="ballSpeedKmh")
    player_index: int | None = Field(default=None, alias="playerIndex")
    commentary_context: dict[str, Any] | None = Field(default=None, alias="commentaryContext")

    model_config = ConfigDict(populate_by_name=True)


class TrackingScoreboard(BaseModel):
    """The full score table, rebuilt from the stored throw log on every update."""

    player_count: int = Field(alias="playerCount")
    players: list[TrackingPlayerCard] = Field(default_factory=list)
    throw_count: int = Field(default=0, alias="throwCount")
    throws: list[TrackingLoggedThrow] = Field(default_factory=list)
    is_finished: bool = Field(default=False, alias="isFinished")
    revision: int = 0
    commentary_context: dict[str, Any] | None = Field(default=None, alias="commentaryContext")

    model_config = ConfigDict(populate_by_name=True)


class TrackingSessionRead(BaseModel):
    session_id: str = Field(alias="sessionId")
    pairing_token: str = Field(alias="pairingToken")
    created_at: datetime = Field(alias="createdAt")
    player_names: list[str] = Field(default_factory=list, alias="playerNames")
    player_count: int = Field(default=1, alias="playerCount", ge=1, le=8)
    current_player: str | None = Field(default=None, alias="currentPlayer")
    current_player_index: int = Field(default=0, alias="currentPlayerIndex", ge=0)
    current_frame: int = Field(default=1, alias="currentFrame", ge=1, le=10)
    current_throw: int = Field(default=1, alias="currentThrow", ge=1, le=3)
    companion_connected: bool = Field(default=False, alias="companionConnected")
    live_client_count: int = Field(default=0, alias="liveClientCount", ge=0)
    scoreboard: TrackingScoreboard | None = None
    location: str | None = None
    revision: int = 0

    model_config = ConfigDict(populate_by_name=True)


class TrackingCompanionSessionRead(TrackingSessionRead):
    """Session details returned only to the companion that owns the current lease."""

    companion_token: str = Field(alias="companionToken")

    model_config = ConfigDict(populate_by_name=True)


class TrajectorySample(BaseModel):
    timestamp_ms: float = Field(validation_alias=AliasChoices("timestampMs", "timestamp_ms"), serialization_alias="timestampMs", ge=0)
    distance_m: float = Field(validation_alias=AliasChoices("distanceM", "distance_m"), serialization_alias="distanceM", ge=0)
    board: float
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)

    model_config = ConfigDict(populate_by_name=True)


class BallPathPoint(BaseModel):
    """A single point on the smoothed, reconstructable ball line (lane coordinates)."""

    distance_m: float = Field(validation_alias=AliasChoices("distanceM", "distance_m"), serialization_alias="distanceM", ge=0)
    board: float

    model_config = ConfigDict(populate_by_name=True)


class ThrowCurve(BaseModel):
    """Key shape points so the UI can redraw the throw: start, high spot, landing."""

    launch: BallPathPoint | None = None
    apex: BallPathPoint | None = None
    impact: BallPathPoint | None = None

    model_config = ConfigDict(populate_by_name=True)


class ThrowObservation(BaseModel):
    session_id: str | None = Field(default=None, validation_alias=AliasChoices("sessionId", "session_id"))
    client_event_id: str | None = Field(default=None, validation_alias=AliasChoices("clientEventId", "client_event_id"), max_length=120)
    captured_at: datetime = Field(default_factory=datetime.utcnow, validation_alias=AliasChoices("capturedAt", "captured_at"))
    likely_throw_index: int | None = Field(default=None, validation_alias=AliasChoices("likelyThrowIndex", "likely_throw_index"), ge=1, le=3)
    is_likely_rat_shot: bool = Field(default=False, validation_alias=AliasChoices("isLikelyRatShot", "is_likely_rat_shot"))
    trajectory: list[TrajectorySample] = Field(default_factory=list)
    impact_board: float | None = Field(default=None, validation_alias=AliasChoices("impactBoard", "impact_board"))
    pin_deck_before_ref: str | None = Field(default=None, validation_alias=AliasChoices("pinDeckBeforeRef", "pin_deck_before_ref"), max_length=255)
    pin_deck_after_ref: str | None = Field(default=None, validation_alias=AliasChoices("pinDeckAfterRef", "pin_deck_after_ref"), max_length=255)
    calibration_confidence: float | None = Field(default=None, validation_alias=AliasChoices("calibrationConfidence", "calibration_confidence"), ge=0.0, le=1.0)
    tracking_confidence: float | None = Field(default=None, validation_alias=AliasChoices("trackingConfidence", "tracking_confidence"), ge=0.0, le=1.0)

    # Legacy/demo payload fields already sent by the Android companion button.
    player: str | None = Field(default=None, max_length=120)
    frame: int | None = Field(default=None, ge=1, le=10)
    throw: int | None = Field(default=None, ge=1, le=3)
    pins_knocked_down: int | None = Field(default=None, validation_alias=AliasChoices("pinsKnockedDown", "pins_knocked_down"), ge=0, le=10)
    # Pin numbers (1..10) the overhead display showed as fallen on THIS delivery, from the companion.
    fallen_pins: list[int] | None = Field(default=None, validation_alias=AliasChoices("fallenPins", "fallen_pins"))
    ball_speed_kmh: float | None = Field(default=None, validation_alias=AliasChoices("ballSpeedKmh", "ball_speed_kmh"), ge=0)
    launch_board: float | None = Field(default=None, validation_alias=AliasChoices("launchBoard", "launch_board"))
    breakpoint_board: float | None = Field(default=None, validation_alias=AliasChoices("breakpointBoard", "breakpoint_board"))
    entry_angle_deg: float | None = Field(default=None, validation_alias=AliasChoices("entryAngleDeg", "entry_angle_deg"))
    tracked_points: int | None = Field(default=None, validation_alias=AliasChoices("trackedPoints", "tracked_points"), ge=0)
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)

    # Reconstructed ball line: a smoothed polyline plus its key shape points, so the
    # live UI can redraw the throw (straight or hooking).
    path: list[BallPathPoint] = Field(default_factory=list)
    curve: ThrowCurve | None = None
    is_curve: bool = Field(default=False, validation_alias=AliasChoices("isCurve", "is_curve"))
    curve_deviation_boards: float | None = Field(
        default=None,
        validation_alias=AliasChoices("curveDeviationBoards", "curve_deviation_boards"),
        ge=0,
    )

    model_config = ConfigDict(populate_by_name=True)

    @field_validator("fallen_pins", mode="before")
    @classmethod
    def strict_fallen_pins(cls, value: Any) -> list[int] | None:
        if value is None:
            return None
        if not isinstance(value, list) or any(type(pin) is not int or not 1 <= pin <= 10 for pin in value):
            raise ValueError("fallenPins muss eine eindeutige Liste von Pins 1 bis 10 sein.")
        if len(set(value)) != len(value):
            raise ValueError("fallenPins darf keine doppelten Pins enthalten.")
        return value

    @field_validator("pins_knocked_down", mode="before")
    @classmethod
    def strict_count(cls, value: Any) -> int | None:
        if value is None or (type(value) is int and 0 <= value <= 10):
            return value
        raise ValueError("pinsKnockedDown muss eine ganze Zahl von 0 bis 10 oder null sein.")


class LiveEvent(BaseModel):
    event_id: str = Field(alias="eventId")
    type: str
    payload: dict[str, Any]
    created_at: datetime = Field(alias="createdAt")
    revision: int = 0

    model_config = ConfigDict(populate_by_name=True)
