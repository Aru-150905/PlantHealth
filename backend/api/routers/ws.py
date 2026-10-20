"""
Live streaming — PlantHealth API. Per section 11: "WebSocket for live streaming."

Streams a synthetic demo signal for a plant, chunked, at a configurable speed multiplier
(real deployment would stream real ADC samples off a device connection instead — not built
yet, no real hardware exists for this project; see backend/api/README.md). Every frame
carries is_synthetic=true, same honesty rule as the REST endpoints.
"""

from __future__ import annotations

import asyncio
import hashlib
import sys
from pathlib import Path

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from ..db import SessionLocal
from ..models import Plant, Tenant, User
from ..security import decode_access_token

BACKEND_DIR = Path(__file__).parent.parent.parent
sys.path.insert(0, str(BACKEND_DIR / "data"))
from synthetic import CLASS_LABELS, HardwareConfig, PlantRecordingConfig, generate_plant_recording  # noqa: E402

router = APIRouter(tags=["streaming"])

CHUNK_SECONDS = 1.0


@router.websocket("/ws/stream/{plant_id}")
async def stream_plant(
    websocket: WebSocket, plant_id: str,
    token: str = Query(...), fs_hz: float = Query(10.0), speed: float = Query(10.0, gt=0),
):
    """speed=10 (default) means 10 simulated seconds per 1 real second — fast enough to
    actually watch something happen in a demo without a long wait; pass speed=1 for
    real-time pacing."""
    db: Session = SessionLocal()
    try:
        try:
            payload = decode_access_token(token)
            user = db.get(User, payload.get("sub"))
        except Exception:
            user = None
        if user is None:
            await websocket.close(code=4401, reason="Invalid or missing token")
            return

        plant = db.query(Plant).filter(Plant.id == plant_id, Plant.tenant_id == user.tenant_id).first()
        if plant is None:
            await websocket.close(code=4404, reason="Plant not found")
            return

        await websocket.accept()

        seed = int(hashlib.sha256(plant_id.encode()).hexdigest(), 16) % (2**31)
        class_label = CLASS_LABELS[seed % len(CLASS_LABELS)]
        cfg = PlantRecordingConfig(
            plant_id=plant_id, class_label=class_label, duration_days=0.25,  # 6h buffer, looped
            seed=seed, hardware=HardwareConfig(fs_hz=fs_hz),
        )
        df = generate_plant_recording(cfg)
        chunk_n = int(CHUNK_SECONDS * fs_hz)

        pos = 0
        n = len(df)
        while True:
            chunk = df.iloc[pos:pos + chunk_n]
            if len(chunk) < chunk_n:  # loop the buffer
                pos = 0
                chunk = df.iloc[pos:pos + chunk_n]
            pos += chunk_n

            await websocket.send_json({
                "plant_id": plant_id,
                "is_synthetic": True,
                "fs_hz": fs_hz,
                "t_s": chunk["timestamp_s"].tolist(),
                "potential_mv": chunk["potential_mv"].round(4).tolist(),
                "air_temp_c": chunk["air_temp_c"].round(3).tolist(),
                "humidity_pct": chunk["humidity_pct"].round(2).tolist(),
                "leaf_temp_c": chunk["leaf_temp_c"].round(3).tolist(),
            })
            await asyncio.sleep(CHUNK_SECONDS / speed)
    except WebSocketDisconnect:
        pass
    finally:
        db.close()
