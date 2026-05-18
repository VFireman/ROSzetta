from __future__ import annotations

from sqlalchemy.orm import Session

from ..models.alert import Alert
from .settings import get_settings_dict, severity_meets
from . import telegram as tg


# Соответствие категории алерта ключу notify-toggle.
_NOTIFY_KEY_BY_CATEGORY = {
    "device": "device_status",
    "internet": "internet",
    "abnormal_reboot": "abnormal_reboot",
    "firmware": "firmware",
}


def add_alert(
    db: Session,
    *,
    title: str,
    severity: str = "info",
    category: str = "system",
    source: str | None = None,
    message: str | None = None,
) -> Alert | None:
    """Создаёт алерт с учётом включенных нотификаций. Возвращает None, если категория отключена."""
    cfg = get_settings_dict(db)
    notify_cfg = cfg.get("notify", {})
    notify_key = _NOTIFY_KEY_BY_CATEGORY.get(category)
    if notify_key is not None and notify_cfg.get(notify_key) is False:
        return None

    a = Alert(
        title=title,
        severity=severity,
        category=category,
        source=source,
        message=message,
    )
    db.add(a)
    db.commit()
    db.refresh(a)

    tg_cfg = cfg.get("telegram", {})
    if tg_cfg.get("enabled") and severity_meets(severity, tg_cfg.get("min_severity", "warning")):
        text = f"<b>[{severity.upper()}] {title}</b>"
        if message:
            text += f"\n{message}"
        if source:
            text += f"\n<i>src: {source}</i>"
        tg.send_message(tg_cfg.get("bot_token", ""), tg_cfg.get("chat_id", ""), text)

    return a


def add_audit(*args, **kwargs) -> None:
    """No-op. Аудит-логи удалены, функция оставлена как заглушка для совместимости."""
    return None
