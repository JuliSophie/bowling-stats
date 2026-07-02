"""Train the lane-corner model from operator-confirmed samples.

Every accepted (and hand-corrected) lane calibration in the companion app lands
in data/lane_samples as <id>.jpg + <id>.json (corners in image pixels, order
TL, TR, BR, BL). This script fine-tunes a MobileNetV3-Small corner regressor on
those samples and exports data/lane_model/lane_corners.onnx, which the backend
serves to the app via GET /api/lane-model.

In production the backend triggers this script itself (app/services/lane_training.py):
training starts on the server once sample uploads have been quiet for
BOWLING_LANE_TRAIN_DELAY_SECONDS (default 300), so every run sees the newest data.
Output lands in data/lane_model/training.log.

Manual usage (from backend/):
    python scripts/train_lane_corners.py                 # train once
    python scripts/train_lane_corners.py --watch         # poll-and-retrain loop (dev machines)
    python scripts/train_lane_corners.py --epochs 120 --min-samples 8
"""

from __future__ import annotations

import argparse
import json
import random
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from torch.utils.data import DataLoader, Dataset
from torchvision.models import MobileNet_V3_Small_Weights, mobilenet_v3_small

DATA_DIR = Path(__file__).resolve().parents[3] / "data"
SAMPLES_DIR = DATA_DIR / "lane_samples"
MODEL_DIR = DATA_DIR / "lane_model"
ONNX_PATH = MODEL_DIR / "lane_corners.onnx"
CHECKPOINT_PATH = MODEL_DIR / "lane_corners.pt"
STATE_PATH = MODEL_DIR / "train_state.json"

INPUT_SIZE = 256
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


@dataclass
class Sample:
    image_path: Path
    corners: np.ndarray  # (4, 2) normalized [0,1], order TL TR BR BL


def load_samples() -> list[Sample]:
    samples: list[Sample] = []
    if not SAMPLES_DIR.exists():
        return samples
    for label_path in sorted(SAMPLES_DIR.glob("*.json")):
        image_path = label_path.with_suffix(".jpg")
        if not image_path.exists():
            continue
        try:
            label = json.loads(label_path.read_text(encoding="utf-8"))
            corners = np.array(label["corners"], dtype=np.float32)
            with Image.open(image_path) as im:
                w, h = im.size
        except (json.JSONDecodeError, KeyError, OSError, ValueError):
            print(f"skipping unreadable sample {label_path.name}")
            continue
        if corners.shape != (4, 2) or w < 32 or h < 32:
            continue
        corners[:, 0] /= w
        corners[:, 1] /= h
        samples.append(Sample(image_path, corners))
    return samples


class LaneCornerDataset(Dataset):
    """Aggressive augmentation squeezes a usable model out of few samples: the
    camera is on a tripod, so realistic variation is mostly crop/exposure."""

    def __init__(self, samples: list[Sample], train: bool):
        self.samples = samples
        self.train = train

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor]:
        sample = self.samples[idx]
        with Image.open(sample.image_path) as im:
            image = im.convert("RGB")
        corners = sample.corners.copy()

        if self.train:
            image, corners = self._augment(image, corners)

        image = image.resize((INPUT_SIZE, INPUT_SIZE), Image.BILINEAR)
        array = np.asarray(image, dtype=np.float32) / 255.0
        array = (array - IMAGENET_MEAN) / IMAGENET_STD
        tensor = torch.from_numpy(array.transpose(2, 0, 1))
        return tensor, torch.from_numpy(corners.reshape(8))

    def _augment(self, image: Image.Image, corners: np.ndarray) -> tuple[Image.Image, np.ndarray]:
        w, h = image.size

        # random crop that keeps all corners inside (with a small margin)
        min_x = float(np.clip(corners[:, 0].min(), 0.0, 1.0))
        max_x = float(np.clip(corners[:, 0].max(), 0.0, 1.0))
        min_y = float(np.clip(corners[:, 1].min(), 0.0, 1.0))
        max_y = float(np.clip(corners[:, 1].max(), 0.0, 1.0))
        left = random.uniform(0.0, max(0.0, min_x - 0.02))
        top = random.uniform(0.0, max(0.0, min_y - 0.02))
        right = random.uniform(min(1.0, max_x + 0.02), 1.0)
        bottom = random.uniform(min(1.0, max_y + 0.02), 1.0)
        if right - left > 0.3 and bottom - top > 0.3:
            image = image.crop((int(left * w), int(top * h), int(right * w), int(bottom * h)))
            corners = corners.copy()
            corners[:, 0] = (corners[:, 0] - left) / (right - left)
            corners[:, 1] = (corners[:, 1] - top) / (bottom - top)

        # horizontal flip swaps left/right corners (TL<->TR, BL<->BR)
        if random.random() < 0.5:
            image = image.transpose(Image.FLIP_LEFT_RIGHT)
            corners = corners.copy()
            corners[:, 0] = 1.0 - corners[:, 0]
            corners = corners[[1, 0, 3, 2]]

        # brightness / contrast / color jitter
        array = np.asarray(image, dtype=np.float32)
        array = array * random.uniform(0.6, 1.4) + random.uniform(-25, 25)
        if random.random() < 0.3:  # channel gains approximate white-balance shifts
            array *= np.array(
                [random.uniform(0.85, 1.15) for _ in range(3)], dtype=np.float32
            )
        array = np.clip(array, 0, 255).astype(np.uint8)
        return Image.fromarray(array), corners


def build_model() -> nn.Module:
    model = mobilenet_v3_small(weights=MobileNet_V3_Small_Weights.DEFAULT)
    in_features = model.classifier[3].in_features
    model.classifier[3] = nn.Sequential(nn.Linear(in_features, 8), nn.Sigmoid())
    return model


def train(epochs: int, min_samples: int, batch_size: int, lr: float) -> bool:
    samples = load_samples()
    if len(samples) < min_samples:
        print(f"{len(samples)} samples < required {min_samples}; not training.")
        return False

    random.Random(42).shuffle(samples)
    val_count = max(1, len(samples) // 5) if len(samples) >= 5 else 0
    val_samples = samples[:val_count]
    train_samples = samples[val_count:] if val_count else samples

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = build_model().to(device)
    if CHECKPOINT_PATH.exists():
        try:
            model.load_state_dict(torch.load(CHECKPOINT_PATH, map_location=device, weights_only=True))
            print("resumed from previous checkpoint")
        except (RuntimeError, OSError):
            print("previous checkpoint incompatible; training from pretrained backbone")

    train_loader = DataLoader(
        LaneCornerDataset(train_samples, train=True),
        batch_size=min(batch_size, len(train_samples)),
        shuffle=True,
    )
    val_loader = (
        DataLoader(LaneCornerDataset(val_samples, train=False), batch_size=batch_size)
        if val_samples
        else None
    )

    optimizer = torch.optim.AdamW(model.parameters(), lr=lr)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)
    criterion = nn.SmoothL1Loss()

    best_val = float("inf")
    for epoch in range(1, epochs + 1):
        model.train()
        total = 0.0
        for images, targets in train_loader:
            images, targets = images.to(device), targets.to(device)
            optimizer.zero_grad()
            loss = criterion(model(images), targets)
            loss.backward()
            optimizer.step()
            total += loss.item() * len(images)
        scheduler.step()
        train_loss = total / len(train_samples)

        val_loss = train_loss
        if val_loader:
            model.eval()
            with torch.no_grad():
                val_total = sum(
                    criterion(model(images.to(device)), targets.to(device)).item() * len(images)
                    for images, targets in val_loader
                )
            val_loss = val_total / len(val_samples)

        if val_loss < best_val:
            best_val = val_loss
            MODEL_DIR.mkdir(parents=True, exist_ok=True)
            torch.save(model.state_dict(), CHECKPOINT_PATH)

        if epoch % 10 == 0 or epoch == 1:
            # mean corner error in normalized units, roughly comparable across runs
            print(f"epoch {epoch:3d}/{epochs}  train {train_loss:.5f}  val {val_loss:.5f}")

    export_onnx(device)
    STATE_PATH.write_text(
        json.dumps({"trainedOnSamples": len(samples), "bestValLoss": best_val}), encoding="utf-8"
    )
    print(f"done: {len(samples)} samples, best val loss {best_val:.5f}, model -> {ONNX_PATH}")
    return True


def export_onnx(device: torch.device) -> None:
    model = build_model().to(device)
    model.load_state_dict(torch.load(CHECKPOINT_PATH, map_location=device, weights_only=True))
    model.eval()
    dummy = torch.zeros(1, 3, INPUT_SIZE, INPUT_SIZE, device=device)
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        model,
        dummy,
        str(ONNX_PATH),
        input_names=["image"],
        output_names=["corners"],
        opset_version=17,
        dynamo=False,
    )


def sample_signature() -> str:
    if not SAMPLES_DIR.exists():
        return ""
    parts = [
        f"{p.name}:{p.stat().st_mtime_ns}"
        for p in sorted(SAMPLES_DIR.glob("*.json"))
    ]
    return "|".join(parts)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--epochs", type=int, default=80)
    parser.add_argument("--min-samples", type=int, default=8)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--watch", action="store_true", help="retrain whenever samples change")
    parser.add_argument("--interval", type=int, default=300, help="watch poll seconds")
    args = parser.parse_args()

    if not args.watch:
        train(args.epochs, args.min_samples, args.batch_size, args.lr)
        return

    print(f"watching {SAMPLES_DIR} (poll every {args.interval}s) — Ctrl+C to stop")
    last_signature = None
    while True:
        signature = sample_signature()
        if signature and signature != last_signature:
            print("samples changed — retraining...")
            try:
                if train(args.epochs, args.min_samples, args.batch_size, args.lr):
                    last_signature = signature
            except Exception as exc:  # keep the watcher alive across bad runs
                print(f"training failed: {exc}")
                last_signature = signature
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
