from __future__ import annotations

import asyncio
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, status

from app.live_scoring import ScoreboardResult, compute_scoreboard
from app.schemas import (
    LiveEvent,
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
        return compute_scoreboard(
            [throw.get("pinsKnockedDown") for throw in self.throw_log],
            self.player_count,
            self.player_names,
        )

    def snapshot(self) -> TrackingSessionRead:
        board = self.scoreboard()
        current_index = board.current_player_index
        current_name = board.players[current_index]["name"] if board.players else None
        scoreboard_model = TrackingScoreboard.model_validate(
            {
                "playerCount": self.player_count,
                "players": board.players,
                "throwCount": len(self.throw_log),
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
    board = session.scoreboard()
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