"""Debounced, server-side trainer for the lane-corner model.

Every lane-sample upload (re)arms a timer; training starts only after uploads
have been quiet for `lane_train_delay_seconds` (default 5 min), so a burst of
corrections ends in ONE training run over the newest data. The training script
runs as a subprocess of the backend process, i.e. on the server — the phone and
any dev machine are not involved. Output goes to data/lane_model/training.log.

Requires the training extras in the backend venv: pip install -r requirements-train.txt
"""

from __future__ import annotations

import asyncio
import logging
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from app.config import DEFAULT_DATA_DIR, get_settings

logger = logging.getLogger(__name__)

SCRIPT_PATH = Path(__file__).resolve().parents[2] / "scripts" / "train_lane_corners.py"
TRAINING_LOG_PATH = DEFAULT_DATA_DIR / "lane_model" / "training.log"

_last_upload_monotonic = 0.0
_task: asyncio.Task | None = None
_state: dict = {"status": "idle", "lastExitCode": None, "lastFinishedAt": None}


def notify_sample_uploaded() -> None:
    """Call after each stored sample: (re)arms the debounce timer on the running loop."""
    global _last_upload_monotonic, _task
    settings = get_settings()
    if not settings.lane_train_enabled:
        return
    _last_upload_monotonic = time.monotonic()
    if _task is None or _task.done():
        _task = asyncio.get_running_loop().create_task(_debounce_and_train())
        logger.info(
            "Lane training scheduled: %ds after the last sample upload.",
            settings.lane_train_delay_seconds,
        )


def status() -> dict:
    settings = get_settings()
    info = dict(_state)
    info["enabled"] = settings.lane_train_enabled
    if _state["status"] == "scheduled":
        info["secondsUntilTraining"] = max(
            0, round(_last_upload_monotonic + settings.lane_train_delay_seconds - time.monotonic())
        )
    return info


async def _debounce_and_train() -> None:
    global _task
    settings = get_settings()
    try:
        while True:
            remaining = _last_upload_monotonic + settings.lane_train_delay_seconds - time.monotonic()
            if remaining > 0:
                _state["status"] = "scheduled"
                await asyncio.sleep(min(remaining, 15.0))
                continue
            await _run_training(settings.lane_train_epochs, settings.lane_train_min_samples)
            # New uploads may have arrived while training — if so, debounce again.
            if _last_upload_monotonic + settings.lane_train_delay_seconds <= time.monotonic():
                return
    finally:
        _state["status"] = "idle"
        _task = None


async def _run_training(epochs: int, min_samples: int) -> None:
    _state["status"] = "training"
    TRAINING_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    logger.info("Lane-corner training starting (log: %s)", TRAINING_LOG_PATH)
    try:
        with TRAINING_LOG_PATH.open("ab") as log:
            log.write(
                f"\n=== training run {datetime.now(timezone.utc).isoformat()} ===\n".encode()
            )
            log.flush()
            process = await asyncio.create_subprocess_exec(
                sys.executable,
                str(SCRIPT_PATH),
                "--epochs",
                str(epochs),
                "--min-samples",
                str(min_samples),
                stdout=log,
                stderr=asyncio.subprocess.STDOUT,
            )
            exit_code = await process.wait()
    except OSError as exc:
        logger.exception("Lane-corner training failed to start")
        _state["lastExitCode"] = -1
        _state["lastError"] = str(exc)
        return
    _state["lastExitCode"] = exit_code
    _state["lastFinishedAt"] = datetime.now(timezone.utc).isoformat()
    logger.info("Lane-corner training finished with exit code %s.", exit_code)
