from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ...core.db import get_db
from ...models.device import Device
from ...models.metric import DeviceMetric
from ...models.user import User
from ...schemas.metric import MetricPoint
from ..deps import get_current_user

router = APIRouter()

@router.get("/devices/{device_id}/metrics", response_model=list[MetricPoint])
def get_metrics(
    device_id: int,
    hours: int = 24,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[MetricPoint]:
    if not db.get(Device, device_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "device not found")
    since = datetime.now(timezone.utc) - timedelta(hours=max(1, min(hours, 24 * 30)))
    rows = (
        db.query(DeviceMetric)
        .filter(DeviceMetric.device_id == device_id, DeviceMetric.created_at >= since)
        .order_by(DeviceMetric.created_at.asc())
        .all()
    )
    return [
        MetricPoint(
            ts=r.created_at,
            cpu_load=r.cpu_load,
            mem_used_pct=r.mem_used_pct,
            uptime_seconds=r.uptime_seconds,
            internet_ok=r.internet_ok,
            rx_bps=r.rx_bps,
            tx_bps=r.tx_bps,
        )
        for r in rows
    ]


@router.get("/heartbeat")
def heartbeat(
    hours: float = 24,
    bins: int = 48,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict:
    """Сводка статусов всех устройств по бинам времени для heartbeat-графика.

    Каждый бин получает один из статусов:
    - "up"      — есть метрика, internet_ok != False
    - "no-net"  — есть метрика, internet_ok == False
    - "down"    — нет ни одной метрики в окне
    - "none"    — нет данных вообще
    Приоритет внутри бина: down/no-net > up.
    """
    hours = max(0.25, min(float(hours), 24 * 7))
    bins = max(6, min(bins, 288))
    now = datetime.now(timezone.utc)
    since = now - timedelta(hours=hours)
    bin_seconds = (hours * 3600) / bins
    # Один сэмпл «закрашивает» окно вокруг себя, чтобы не было полосатости,
    # когда интервал опроса больше длины бина (например, 1 мин probe и 30 сек бин).
    halo_seconds = max(bin_seconds * 1.5, 90.0)

    devices = db.query(Device).order_by(Device.name.asc()).all()
    rows = (
        db.query(DeviceMetric)
        .filter(DeviceMetric.created_at >= since - timedelta(seconds=halo_seconds))
        .order_by(DeviceMetric.created_at.asc())
        .all()
    )
    by_dev: dict[int, list[DeviceMetric]] = {}
    for r in rows:
        by_dev.setdefault(r.device_id, []).append(r)

    # Приоритет: no-net побеждает up; down/none перекрываются любой выборкой.
    def _promote(cur: str, new: str) -> str:
        if new == "no-net":
            return "no-net"
        if cur in ("none", "down") and new == "up":
            return "up"
        return cur

    out_devices = []
    for dev in devices:
        buckets = ["none"] * bins
        for r in by_dev.get(dev.id, []):
            ts = r.created_at
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            offset = (ts - since).total_seconds()
            lo = int((offset - halo_seconds) // bin_seconds)
            hi = int((offset + halo_seconds) // bin_seconds)
            new_state = "no-net" if r.internet_ok is False else "up"
            for idx in range(max(0, lo), min(bins, hi + 1)):
                buckets[idx] = _promote(buckets[idx], new_state)
        out_devices.append({
            "id": dev.id,
            "name": dev.identity or dev.name,
            "host": dev.host,
            "status": dev.status,
            "buckets": buckets,
        })
    return {
        "since": since.isoformat(),
        "until": now.isoformat(),
        "bins": bins,
        "hours": hours,
        "devices": out_devices,
    }
