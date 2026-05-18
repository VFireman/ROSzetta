from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class MetricPoint(BaseModel):
    ts: datetime
    cpu_load: float | None = None
    mem_used_pct: float | None = None
    uptime_seconds: int | None = None
    internet_ok: bool | None = None
    rx_bps: int | None = None
    tx_bps: int | None = None
