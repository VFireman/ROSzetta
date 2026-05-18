from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from ..core.db import Base


class DeviceMetric(Base):
    __tablename__ = "device_metrics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[int] = mapped_column(
        ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, index=True
    )
    cpu_load: Mapped[float | None] = mapped_column(Float)
    mem_used_pct: Mapped[float | None] = mapped_column(Float)
    free_memory: Mapped[int | None] = mapped_column(Integer)
    total_memory: Mapped[int | None] = mapped_column(Integer)
    uptime_seconds: Mapped[int | None] = mapped_column(Integer)
    internet_ok: Mapped[bool | None] = mapped_column()
    rx_bps: Mapped[int | None] = mapped_column(Integer)
    tx_bps: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    __table_args__ = (
        Index("ix_device_metrics_device_time", "device_id", "created_at"),
    )
