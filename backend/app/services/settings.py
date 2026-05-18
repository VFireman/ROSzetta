"""Глобальные настройки контроллера: хранятся в БД как один JSON-блоб (key='global')."""
from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from ..models.settings import AppSetting

KEY = "global"

# Дефолтные значения. Нельзя менять ключи — только добавлять новые.
DEFAULTS: dict[str, Any] = {
    # Брендинг и локализация интерфейса
    "ui": {
        "instance_name": "ROSzetta",   # отображается в шапке
        "locale": "ru",                            # ru | en | uz
        "theme": "mk-dark",                     # см. фронтенд theme.ts
        "heartbeat_hours": 6,                      # окно heartbeat-сетки на дашборде: 6 | 3 | 1 | 0.5
        "probe_interval_minutes": 5,               # автоопрос устройств: 1 | 2 | 3 | 5 | 10
    },
    # Видимость пунктов меню
    "menu": {
        "dashboard": True,
        "devices": True,
        "switches": True,
        "firmware": True,
        "notif_center": True,
        "cli": True,
        "settings": True,
    },
    # Включение/отключение генерации алертов и учёта в global health
    "notify": {
        "device_status": True,        # переход up<->down
        "internet": True,             # отсутствие интернета на устройстве
        "abnormal_reboot": True,      # аномальная перезагрузка
        "firmware": True,             # вышла новая версия RouterOS
        "style": "jokes",             # стиль сообщений GlobalHealth: jokes | serious
    },
    # Telegram-бот (опциональная отправка алертов)
    "telegram": {
        "enabled": False,
        "bot_token": "",
        "chat_id": "",
        "min_severity": "warning",    # info|warning|error|critical
    },
}


def _merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    out = dict(base)
    for k, v in override.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _merge(out[k], v)
        else:
            out[k] = v
    return out


def get_settings_dict(db: Session) -> dict[str, Any]:
    row = db.query(AppSetting).filter(AppSetting.key == KEY).first()
    if not row:
        return json.loads(json.dumps(DEFAULTS))
    try:
        stored = json.loads(row.value)
    except Exception:
        stored = {}
    return _merge(DEFAULTS, stored if isinstance(stored, dict) else {})


def update_settings_dict(db: Session, patch: dict[str, Any]) -> dict[str, Any]:
    current = get_settings_dict(db)
    merged = _merge(current, patch)
    row = db.query(AppSetting).filter(AppSetting.key == KEY).first()
    if not row:
        row = AppSetting(key=KEY, value=json.dumps(merged))
        db.add(row)
    else:
        row.value = json.dumps(merged)
    db.commit()
    return merged


_SEVERITY_RANK = {"info": 0, "warning": 1, "error": 2, "critical": 3}


def severity_meets(actual: str, threshold: str) -> bool:
    return _SEVERITY_RANK.get(actual, 0) >= _SEVERITY_RANK.get(threshold, 1)
