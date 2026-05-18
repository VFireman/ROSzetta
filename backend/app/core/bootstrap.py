from __future__ import annotations

from loguru import logger
from sqlalchemy.orm import Session

from .config import get_settings
from .db import Base, SessionLocal, engine
from .security import hash_password
from ..models.user import User


def init_db() -> None:
    # Импортируем модели, чтобы они зарегистрировались в Base.metadata
    from ..models import device as _device  # noqa: F401
    from ..models import user as _user  # noqa: F401
    from ..models import backup as _backup  # noqa: F401
    from ..models import firmware as _firmware  # noqa: F401
    from ..models import alert as _alert  # noqa: F401
    from ..models import metric as _metric  # noqa: F401
    from ..models import settings as _settings  # noqa: F401
    from ..models import interface_stat as _ifs  # noqa: F401
    from ..models import vault as _vault  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _ensure_columns()
    _ensure_admin()


def _ensure_columns() -> None:
    """Лёгкие миграции на ALTER TABLE для совместимости со старыми БД."""
    from sqlalchemy import text
    statements = [
        "ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_error TEXT",
        "ALTER TABLE devices ADD COLUMN IF NOT EXISTS internet_ok BOOLEAN",
        "ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_uptime_seconds INTEGER",
        "ALTER TABLE devices ADD COLUMN IF NOT EXISTS abnormal_reboot BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_log_warning TEXT",
        "ALTER TABLE devices ADD COLUMN IF NOT EXISTS monitored_interfaces TEXT",
        "ALTER TABLE devices ADD COLUMN IF NOT EXISTS uplink_interfaces TEXT",
        "ALTER TABLE devices ADD COLUMN IF NOT EXISTS interface_history_hours INTEGER NOT NULL DEFAULT 24",
        "ALTER TABLE devices ADD COLUMN IF NOT EXISTS kind VARCHAR(16) NOT NULL DEFAULT 'router'",
        "ALTER TABLE devices ADD COLUMN IF NOT EXISTS architecture VARCHAR(32)",
    ]
    with engine.begin() as conn:
        for s in statements:
            try:
                conn.execute(text(s))
            except Exception as exc:  # pragma: no cover
                logger.warning("migration failed: {} ({})", s, exc)


def _ensure_admin() -> None:
    settings = get_settings()
    db: Session = SessionLocal()
    try:
        exists = db.query(User).filter(User.email == settings.bootstrap_admin_email).first()
        if exists:
            return
        admin = User(
            email=settings.bootstrap_admin_email,
            hashed_password=hash_password(settings.bootstrap_admin_password),
            role="admin",
            is_active=True,
        )
        db.add(admin)
        db.commit()
        logger.info("Created bootstrap admin: {}", settings.bootstrap_admin_email)
    finally:
        db.close()
