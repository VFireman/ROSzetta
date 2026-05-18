"""Метрики интерфейсов: счётчики rx/tx и состояние running.

Фиксируется значение счётчиков (монотонно растущих, до перезагрузки),
во время каждого probe-цикла. На фронте берутся последние ~N точек,
для отрисовки графика bps вычисляется (delta/seconds).
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from ..core.db import Base


class InterfaceStat(Base):
    __tablename__ = "interface_stats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[int] = mapped_column(
        ForeignKey("devices.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    rx_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    tx_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    running: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    ts: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    __table_args__ = (
        Index("ix_iface_stats_dev_name_ts", "device_id", "name", "ts"),
    )
