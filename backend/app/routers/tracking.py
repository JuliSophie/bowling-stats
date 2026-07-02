from __future__ import annotations

import asyncio
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, status

from app.live_scoring import ScoreboardResult, compute_scoreboard
from app.schemas import (
    LiveEvent,
    ThrowCorrection,
    ThrowObservation,
    TrackingPlayersUpdate,
    TrackingScoreboard,
    TrackingSessionCreate,
    TrackingSessionRead,
)


router = APIRouter(tags=["tracking"])

DEFAULT_LIVE_SESSION_ID = "demo-session"
MAX_EVENT_HISTORY = 200
# A session is dropped once it has gone this long without any activity (throws, roster
# changes, or a live client connecting). Expiry is evaluated lazily on the next access.
SESSION_TTL = timedelta(hours=10)


class LiveSession:
    def __init__(self, session_id: str, pairing_token: str, payload: TrackingSessionCreate) -> None:
        self.session_id = session_id
        self.pairing_token = pairing_token
        self.created_at = datetime.now(timezone.utc)
        self.last_active_at = self.created_at
        names = [name.strip() for name in payload.player_names if name.strip()]
        self.player_names = names
        self.player_count = max(1, len(names))
        self.location = payload.location
        # The single source of truth: every throw the companion has ever reported, in order.
        # The score table is *derived* from this by replaying it through the scoring engine,
        # so changing the player count just re-runs the replay — no mutable game state to drift.
        self.throw_log: list[dict[str, Any]] = []
        self.companion_connected = False
        self.live_clients: set[WebSocket] = set()
        self.events: list[LiveEvent] = []
        self.seen_client_event_ids: set[str] = set()

    def touch(self) -> None:
        """Mark the session active so the inactivity timer restarts."""
        self.last_active_at = datetime.now(timezone.utc)

    def is_expired(self, now: datetime | None = None) -> bool:
        now = now or datetime.now(timezone.utc)
        return now - self.last_active_at > SESSION_TTL

    def reset(self) -> None:
        """Start a fresh game: wipe the throw log while keeping the roster and pairing."""
        self.throw_log.clear()
        self.seen_client_event_ids.clear()
        self.touch()

    def scoreboard(self) -> ScoreboardResult:
        normalized_log = self._normalized_throw_log()
        return compute_scoreboard(
            [throw.get("pinsKnockedDown") for throw in normalized_log],
            self.player_count,
            self.player_names,
        )

    def _inject_fallen_pins(self, board: ScoreboardResult, throw_log: list[dict[str, Any]]) -> None:
        """Attach each frame's per-ball fallen pins from the throw log, keyed by the scoring engine's
        assignment of throws to (player, frame). Deriving it from the assignments keeps the pin data
        aligned even after manual corrections shuffle the log."""
        grouped: dict[tuple[int, int], list[list[int]]] = {}
        for index, assignment in enumerate(board.assignments):
            if index >= len(throw_log):
                break
            fallen = throw_log[index].get("fallenPins") or []
            grouped.setdefault((assignment.player_index, assignment.frame - 1), []).append(fallen)
        for player_index, player in enumerate(board.players):
            for frame_index, frame in enumerate(player["frames"]):
                frame["fallenPins"] = grouped.get((player_index, frame_index), [])

    def _logged_throws(self, board: ScoreboardResult, throw_log: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Expose the current replay log with the same player/frame assignment used for scoring."""
        rows: list[dict[str, Any]] = []
        for index, throw in enumerate(throw_log):
            assignment = board.assignments[index] if index < len(board.assignments) else None
            if assignment is not None and board.players:
                player = board.players[assignment.player_index]["name"]
                frame = assignment.frame
                throw_in_frame = assignment.throw_in_frame
            else:
                player = "—"
                frame = 10
                throw_in_frame = 1
            rows.append(
                {
                    "index": index,
                    "player": player,
                    "frame": frame,
                    "throw": throw_in_frame,
                    "pinsKnockedDown": throw.get("pinsKnockedDown"),
                    "fallenPins": throw.get("fallenPins") or [],
                    "observedFallenPins": throw.get("observedFallenPins") or throw.get("fallenPins") or [],
                    "alreadyDownPins": throw.get("alreadyDownPins") or [],
                    "capturedAt": throw.get("capturedAt"),
                    "manual": bool(throw.get("manual")),
                    "manualCorrection": bool(throw.get("manualCorrection")),
                    "lowConfidence": bool(throw.get("lowConfidence")),
                    "ballSpeedKmh": throw.get("ballSpeedKmh"),
                }
            )
        return rows

    def _fallen_pins_for_throw(
        self,
        board: ScoreboardResult,
        throw_log: list[dict[str, Any]],
        player_index: int,
        frame: int,
        throw_in_frame: int,
    ) -> set[int]:
        for index, assignment in enumerate(board.assignments):
            if index >= len(throw_log):
                break
            if (
                assignment.player_index == player_index
                and assignment.frame == frame
                and assignment.throw_in_frame == throw_in_frame
            ):
                return {pin for pin in throw_log[index].get("fallenPins", []) if 1 <= pin <= 10}
        return set()

    def _already_down_pins_for_next_throw(self, board: ScoreboardResult, throw_log: list[dict[str, Any]]) -> set[int]:
        """Pins already down on the *same physical rack* before the next throw.

        The companion reports all pins currently down after a delivery. For a second ball, that
        includes pins knocked down by the first ball of the same player/frame. Bowling resets the
        rack on a new frame, on strikes, and on 10th-frame bonus balls after a spare/strike, so only
        same-rack prior throws should be subtracted.
        """
        player_index = board.current_player_index
        frame = board.current_frame
        throw_in_frame = board.current_throw
        if throw_in_frame <= 1 or not board.players:
            return set()

        player = board.players[player_index]
        frames = player.get("frames", [])
        if frame - 1 >= len(frames):
            return set()
        frame_throws = frames[frame - 1].get("throws", [])

        if frame < 10:
            return self._fallen_pins_for_throw(board, throw_log, player_index, frame, 1) if throw_in_frame == 2 else set()

        if throw_in_frame == 2:
            first = frame_throws[0] if len(frame_throws) >= 1 else 0
            return set() if first >= 10 else self._fallen_pins_for_throw(board, throw_log, player_index, frame, 1)

        if throw_in_frame == 3:
            first = frame_throws[0] if len(frame_throws) >= 1 else 0
            second = frame_throws[1] if len(frame_throws) >= 2 else 0
            # First strike: second ball starts a fresh rack. If it was not a strike, the third ball
            # continues that rack. Otherwise the rack resets again.
            if first >= 10:
                return set() if second >= 10 else self._fallen_pins_for_throw(board, throw_log, player_index, frame, 2)
            # First two balls made a spare: bonus ball gets a fresh rack.
            return set()

        return set()

    def _normalize_observed_throw(
        self,
        metrics: dict[str, Any],
        board_before: ScoreboardResult,
        normalized_log_before: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Convert companion-observed fallen pins into newly knocked pins for scoring."""
        observed_source = metrics.get("observedFallenPins") if "observedFallenPins" in metrics else metrics.get("fallenPins", [])
        observed = sorted({pin for pin in observed_source if 1 <= pin <= 10})
        metrics["observedFallenPins"] = observed
        metrics["observedPinsKnockedDown"] = metrics.get("pinsKnockedDown")
        if not observed:
            metrics["alreadyDownPins"] = []
            return metrics

        already_down = self._already_down_pins_for_next_throw(board_before, normalized_log_before)
        actual = sorted(set(observed) - already_down)
        ignored = sorted(set(observed) & already_down)
        metrics["fallenPins"] = actual
        metrics["pinsKnockedDown"] = len(actual)
        metrics["alreadyDownPins"] = ignored
        return metrics

    def _normalized_throw_log(self) -> list[dict[str, Any]]:
        """Replay raw companion observations into a normalized log of newly knocked pins.

        This keeps later throws correct even after an earlier false throw is deleted or edited.
        """
        normalized: list[dict[str, Any]] = []
        for raw in self.throw_log:
            entry = dict(raw)
            if entry.get("manual") or entry.get("manualCorrection") or not (entry.get("observedFallenPins") or entry.get("fallenPins")):
                entry["alreadyDownPins"] = []
                normalized.append(entry)
                continue
            board_before = compute_scoreboard(
                [throw.get("pinsKnockedDown") for throw in normalized],
                self.player_count,
                self.player_names,
            )
            normalized.append(self._normalize_observed_throw(entry, board_before, normalized))
        return normalized

    def snapshot(self) -> TrackingSessionRead:
        normalized_log = self._normalized_throw_log()
        board = compute_scoreboard(
            [throw.get("pinsKnockedDown") for throw in normalized_log],
            self.player_count,
            self.player_names,
        )
        self._inject_fallen_pins(board, normalized_log)
        current_index = board.current_player_index
        current_name = board.players[current_index]["name"] if board.players else None
        scoreboard_model = TrackingScoreboard.model_validate(
            {
                "playerCount": self.player_count,
                "players": board.players,
                "throwCount": len(self.throw_log),
                "throws": self._logged_throws(board, normalized_log),
            }
        )
        return TrackingSessionRead(
            sessionId=self.session_id,
            pairingToken=self.pairing_token,
            createdAt=self.created_at,
            playerNames=[player["name"] for player in board.players],
            playerCount=self.player_count,
            currentPlayer=current_name,
            currentPlayerIndex=current_index,
            currentFrame=board.current_frame,
            currentThrow=board.current_throw,
            companionConnected=self.companion_connected,
            liveClientCount=len(self.live_clients),
            scoreboard=scoreboard_model,
            location=self.location,
        )


sessions: dict[str, LiveSession] = {}
sessions_lock = asyncio.Lock()


def _new_pairing_token() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def _new_event(event_type: str, payload: dict[str, Any]) -> LiveEvent:
    return LiveEvent(
        eventId=secrets.token_urlsafe(10),
        type=event_type,
        payload=payload,
        createdAt=datetime.now(timezone.utc),
    )


async def _get_session(session_id: str) -> LiveSession:
    session = sessions.get(session_id)
    if session is not None and session.is_expired():
        async with sessions_lock:
            # Re-check under the lock; another request may have refreshed or replaced it.
            if sessions.get(session_id) is session and session.is_expired():
                del sessions[session_id]
        session = None
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Live-Session nicht gefunden.")
    return session


async def _ensure_session(session_id: str, payload: TrackingSessionCreate | None = None) -> LiveSession:
    async with sessions_lock:
        session = sessions.get(session_id)
        if session is not None and not session.is_expired():
            return session

        # No session, or the previous one lapsed after the inactivity window — start fresh.
        session = LiveSession(session_id, _new_pairing_token(), payload or TrackingSessionCreate())
        sessions[session_id] = session
        return session


async def _append_and_broadcast(session: LiveSession, event: LiveEvent) -> None:
    session.events.append(event)
    del session.events[:-MAX_EVENT_HISTORY]

    event_payload = event.model_dump(mode="json", by_alias=True)
    stale_clients: list[WebSocket] = []
    for websocket in session.live_clients:
        try:
            await websocket.send_json(event_payload)
        except RuntimeError:
            stale_clients.append(websocket)

    for websocket in stale_clients:
        session.live_clients.discard(websocket)


def _speed_from_trajectory(observation: ThrowObservation) -> float | None:
    if observation.ball_speed_kmh is not None:
        return round(observation.ball_speed_kmh, 2)
    if len(observation.trajectory) < 2:
        return None

    first = observation.trajectory[0]
    last = observation.trajectory[-1]
    elapsed_seconds = (last.timestamp_ms - first.timestamp_ms) / 1000
    if elapsed_seconds <= 0:
        return None

    return round(((last.distance_m - first.distance_m) / elapsed_seconds) * 3.6, 2)


def _analysis_metrics(session: LiveSession, observation: ThrowObservation) -> dict[str, Any]:
    """Everything the camera measured about a throw — but NOT whose turn it is.

    Player / frame / throw-in-frame are assigned later by the scoring engine, which is the
    only thing that knows the game state. This keeps the stored throw log replayable.
    """
    trajectory = observation.trajectory
    impact_board = observation.impact_board
    if impact_board is None and trajectory:
        impact_board = trajectory[-1].board

    confidence_values = [
        value
        for value in [observation.confidence, observation.tracking_confidence, observation.calibration_confidence]
        if value is not None
    ]
    confidence = round(sum(confidence_values) / len(confidence_values), 3) if confidence_values else None

    # Hook size: trust the companion's reconstructed value, else derive from raw samples.
    curve_boards = observation.curve_deviation_boards
    if curve_boards is None and len(trajectory) >= 2:
        curve_boards = abs(trajectory[-1].board - trajectory[0].board)

    return {
        "sessionId": session.session_id,
        "clientEventId": observation.client_event_id,
        "capturedAt": observation.captured_at.isoformat(),
        "pinsKnockedDown": observation.pins_knocked_down,
        "fallenPins": sorted({pin for pin in observation.fallen_pins if 1 <= pin <= 10}),
        "ballSpeedKmh": _speed_from_trajectory(observation),
        "impactBoard": round(impact_board, 2) if impact_board is not None else None,
        "launchBoard": observation.launch_board if observation.launch_board is not None else (trajectory[0].board if trajectory else None),
        "breakpointBoard": observation.breakpoint_board,
        "entryAngleDeg": observation.entry_angle_deg,
        "curveBoards": round(curve_boards, 2) if curve_boards is not None else None,
        "isCurve": observation.is_curve,
        "trackedPoints": observation.tracked_points if observation.tracked_points is not None else len(trajectory),
        "isLikelyRatShot": observation.is_likely_rat_shot,
        "confidence": confidence,
        "lowConfidence": confidence is not None and confidence < 0.7,
        "trajectory": [sample.model_dump(mode="json", by_alias=True) for sample in trajectory],
        # Smoothed reconstruction the UI can draw directly.
        "curve": observation.curve.model_dump(mode="json", by_alias=True) if observation.curve else None,
        "path": [point.model_dump(mode="json", by_alias=True) for point in observation.path],
    }


def _manual_throw(session: LiveSession, pins: int) -> dict[str, Any]:
    """A minimal throw-log entry for an operator-inserted (missed-by-camera) throw. Only the pin
    count drives scoring; no ball metrics exist for a manual entry."""
    return {
        "sessionId": session.session_id,
        "clientEventId": None,
        "capturedAt": datetime.now(timezone.utc).isoformat(),
        "pinsKnockedDown": pins,
        "fallenPins": [],
        "manual": True,
    }


async def _mark_companion_connected(session: LiveSession) -> None:
    """Flag the companion online, emitting the event only on a real disconnected->connected flip.

    The companion has no persistent connection — it POSTs one throw at a time — so without this
    guard every throw would spam a fresh "companion_connected" into the event stream.
    """
    if session.companion_connected:
        return
    session.companion_connected = True
    await _append_and_broadcast(session, _new_event("companion_connected", {"sessionId": session.session_id}))


async def _ingest_throw(session: LiveSession, observation: ThrowObservation) -> LiveEvent:
    session.touch()
    if observation.client_event_id and observation.client_event_id in session.seen_client_event_ids:
        existing = next(
            (event for event in reversed(session.events) if event.payload.get("clientEventId") == observation.client_event_id),
            None,
        )
        if existing is not None:
            return existing

    if observation.client_event_id:
        session.seen_client_event_ids.add(observation.client_event_id)

    metrics = _analysis_metrics(session, observation)
    session.throw_log.append(metrics)

    # Replay the full log so this throw gets assigned to the right player / frame / ball.
    normalized_log = session._normalized_throw_log()
    board = compute_scoreboard(
        [throw.get("pinsKnockedDown") for throw in normalized_log],
        session.player_count,
        session.player_names,
    )
    metrics = normalized_log[-1] if normalized_log else metrics
    assignment = board.assignments[-1] if board.assignments else None
    if assignment is not None and board.players:
        player_name = board.players[assignment.player_index]["name"]
        frame = assignment.frame
        throw_in_frame = assignment.throw_in_frame
    else:
        player_name, frame, throw_in_frame = "Spieler 1", 1, 1

    payload = {**metrics, "player": player_name, "frame": frame, "throw": throw_in_frame}
    event = _new_event("throw_analyzed", payload)
    await _append_and_broadcast(session, event)

    if metrics["lowConfidence"]:
        await _append_and_broadcast(session, _new_event("low_confidence_detection", payload))

    await _append_and_broadcast(
        session,
        _new_event("score_updated", {"session": session.snapshot().model_dump(mode="json", by_alias=True)}),
    )
    return event


@router.post("/tracking/sessions", response_model=TrackingSessionRead, status_code=status.HTTP_201_CREATED)
async def create_tracking_session(payload: TrackingSessionCreate) -> TrackingSessionRead:
    session_id = payload.session_id or secrets.token_urlsafe(8)
    session = await _ensure_session(session_id, payload)
    event = _new_event("session_created", {"session": session.snapshot().model_dump(mode="json", by_alias=True)})
    await _append_and_broadcast(session, event)
    return session.snapshot()


@router.get("/tracking/sessions/{session_id}", response_model=TrackingSessionRead)
async def get_tracking_session(session_id: str) -> TrackingSessionRead:
    session = await _get_session(session_id)
    return session.snapshot()


@router.post("/tracking/sessions/{session_id}/join-companion")
async def join_companion(session_id: str) -> dict[str, bool]:
    session = await _get_session(session_id)
    await _mark_companion_connected(session)
    return {"connected": True}


@router.post("/tracking/sessions/{session_id}/players", response_model=TrackingSessionRead)
async def set_players(session_id: str, payload: TrackingPlayersUpdate) -> TrackingSessionRead:
    session = await _get_session(session_id)
    session.touch()
    session.player_count = payload.player_count
    names = [name.strip() for name in payload.player_names if name.strip()]
    if names:
        session.player_names = names
    # The score table is rebuilt from the throw log on snapshot(), so just rebroadcast it.
    await _append_and_broadcast(
        session,
        _new_event("score_updated", {"session": session.snapshot().model_dump(mode="json", by_alias=True)}),
    )
    return session.snapshot()


@router.post("/tracking/sessions/{session_id}/reset", response_model=TrackingSessionRead)
async def reset_tracking_session(session_id: str) -> TrackingSessionRead:
    """Start a new game on an existing session: clear the throw log, keep the roster."""
    session = await _get_session(session_id)
    session.reset()
    await _append_and_broadcast(session, _new_event("session_reset", {"sessionId": session.session_id}))
    await _append_and_broadcast(
        session,
        _new_event("score_updated", {"session": session.snapshot().model_dump(mode="json", by_alias=True)}),
    )
    return session.snapshot()


@router.post("/tracking/sessions/{session_id}/throws", response_model=LiveEvent, status_code=status.HTTP_202_ACCEPTED)
async def ingest_throw(session_id: str, observation: ThrowObservation) -> LiveEvent:
    session = await _get_session(session_id)
    return await _ingest_throw(session, observation)


@router.post("/tracking/sessions/{session_id}/throws/correct", response_model=TrackingSessionRead)
async def correct_throw(session_id: str, payload: ThrowCorrection) -> TrackingSessionRead:
    """Fix the ordered throw log by hand when the camera missed or mis-scored a throw.

    - ``insert_at_end`` registers a throw the camera missed right now (advances the turn normally).
    - ``insert_before_last`` adds a missed throw just before the latest one, which shifts the latest
      (and everything after) to the right player/frame — for when a later throw already misaligned.
    - ``edit_last`` corrects the pin count of the most recent throw.
    - ``delete_last`` removes a false/duplicate detection.
    - ``delete_at`` removes a specific false detection from the replay log.
    - ``edit_at_pattern`` overrides the exact pin pattern of a specific throw.
    Everything downstream (player/frame/ball, score) is re-derived from the log automatically.
    """
    session = await _get_session(session_id)
    session.touch()
    log = session.throw_log
    if payload.action == "delete_last":
        if log:
            log.pop()
    elif payload.action == "delete_at":
        if payload.throw_index is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="throwIndex fehlt.")
        if payload.throw_index >= len(log):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Wurf nicht gefunden.")
        log.pop(payload.throw_index)
    elif payload.action == "edit_at_pattern":
        if payload.throw_index is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="throwIndex fehlt.")
        if payload.throw_index >= len(log):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Wurf nicht gefunden.")
        pattern = sorted({pin for pin in payload.fallen_pins if 1 <= pin <= 10})
        log[payload.throw_index] = {
            **log[payload.throw_index],
            "pinsKnockedDown": len(pattern),
            "fallenPins": pattern,
            "observedFallenPins": [],
            "alreadyDownPins": [],
            "manualCorrection": True,
        }
    elif payload.action == "edit_last":
        if log and payload.pins_knocked_down is not None:
            log[-1] = {
                **log[-1],
                "pinsKnockedDown": payload.pins_knocked_down,
                "fallenPins": [],
                "observedFallenPins": [],
                "alreadyDownPins": [],
                "manualCorrection": True,
            }
    elif payload.action == "insert_before_last":
        log.insert(max(0, len(log) - 1), _manual_throw(session, payload.pins_knocked_down or 0))
    elif payload.action == "insert_at_end":
        log.append(_manual_throw(session, payload.pins_knocked_down or 0))

    await _append_and_broadcast(
        session,
        _new_event("throw_corrected", {"action": payload.action, "throwIndex": payload.throw_index, "throwCount": len(log)}),
    )
    await _append_and_broadcast(
        session,
        _new_event("score_updated", {"session": session.snapshot().model_dump(mode="json", by_alias=True)}),
    )
    return session.snapshot()


@router.post("/tracking/mock-throws", response_model=LiveEvent, status_code=status.HTTP_202_ACCEPTED)
async def ingest_mock_throw(observation: ThrowObservation) -> LiveEvent:
    session = await _ensure_session(observation.session_id or DEFAULT_LIVE_SESSION_ID)
    await _mark_companion_connected(session)
    return await _ingest_throw(session, observation)


@router.get("/tracking/sessions/{session_id}/events", response_model=list[LiveEvent])
async def list_events(session_id: str) -> list[LiveEvent]:
    session = await _get_session(session_id)
    return session.events


@router.websocket("/tracking/sessions/{session_id}/ws")
async def tracking_websocket(websocket: WebSocket, session_id: str) -> None:
    await websocket.accept()
    session = await _ensure_session(session_id)
    session.touch()
    session.live_clients.add(websocket)
    try:
        await websocket.send_json(
            _new_event(
                "session_snapshot",
                {
                    "session": session.snapshot().model_dump(mode="json", by_alias=True),
                    "events": [event.model_dump(mode="json", by_alias=True) for event in session.events],
                },
            ).model_dump(mode="json", by_alias=True)
        )
        await _append_and_broadcast(session, _new_event("live_client_connected", {"liveClientCount": len(session.live_clients)}))
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        session.live_clients.discard(websocket)
        await _append_and_broadcast(session, _new_event("live_client_disconnected", {"liveClientCount": len(session.live_clients)}))