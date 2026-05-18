from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from ..core.db import Base


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    # 'router' | 'switch' — вид устройства (разнесение в разделы Devices / Свичи)
    kind: Mapped[str] = mapped_column(String(16), default="router", nullable=False)
    host: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    port: Mapped[int] = mapped_column(Integer, default=8729, nullable=False)
    use_tls: Mapped[bool] = mapped_column(default=True, nullable=False)
    username: Mapped[str] = mapped_column(String(64), nullable=False)
    # Шифруется через core.security.encrypt_secret
    password_enc: Mapped[str] = mapped_column(Text, nullable=False)

    # Метаданные с устройства
    identity: Mapped[str | None] = mapped_column(String(128))
    model: Mapped[str | None] = mapped_column(String(64))
    serial: Mapped[str | None] = mapped_column(String(64))
    ros_version: Mapped[str | None] = mapped_column(String(32))
    # Архитектура платформы RouterOS: arm64 / arm / mipsbe / mmips / mipsle / smips / tile / ppc / x86 / x86_64
    architecture: Mapped[str | None] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(16), default="unknown", nullable=False)
    last_error: Mapped[str | None] = mapped_column(Text)
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Sprint 06
    internet_ok: Mapped[bool | None] = mapped_column()
    last_uptime_seconds: Mapped[int | None] = mapped_column(Integer)
    abnormal_reboot: Mapped[bool] = mapped_column(default=False, nullable=False)
    last_log_warning: Mapped[str | None] = mapped_column(Text)
    # Sprint 09 — мониторинг интерфейсов
    # CSV-список имён интерфейсов, по которым собирать графики rx/tx (через запятую)
    monitored_interfaces: Mapped[str | None] = mapped_column(Text)
    # CSV-список аплинков (uztelecom/lte/...): для индикатора "интернет на интерфейсе X"
    uplink_interfaces: Mapped[str | None] = mapped_column(Text)
    # глубина хранения статистики интерфейсов (часы)
    interface_history_hours: Mapped[int] = mapped_column(Integer, default=24, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
