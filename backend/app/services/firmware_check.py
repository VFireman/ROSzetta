"""Сервис проверки новых версий прошивок MikroTik по нескольким каналам."""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone

import httpx
from loguru import logger
from sqlalchemy.orm import Session

from ..models.settings import AppSetting
from .events import add_alert

# Каналы и URL-ы для проверки.
CHANNELS: dict[str, str] = {
    "stable":    "https://download.mikrotik.com/routeros/NEWESTa7.stable",
    "long-term": "https://download.mikrotik.com/routeros/NEWESTa7.long-term",
    "testing":   "https://download.mikrotik.com/routeros/NEWESTa7.testing",
}

STATE_KEY = "firmware_state"


def _fetch_channel(url: str, timeout: float = 10.0) -> tuple[str, datetime] | None:
    try:
        with httpx.Client(timeout=timeout, follow_redirects=True) as cli:
            r = cli.get(url)
            r.raise_for_status()
            text = r.text.strip()
    except httpx.HTTPError as exc:
        logger.warning("firmware check: HTTP error for {}: {}", url, exc)
        return None
    m = re.match(r"(\S+)\s+(\d+)", text)
    if not m:
        logger.warning("firmware check: unexpected response for {}: {!r}", url, text[:120])
        return None
    return m.group(1), datetime.fromtimestamp(int(m.group(2)), tz=timezone.utc)


def _load_state(db: Session) -> dict:
    row = db.query(AppSetting).filter(AppSetting.key == STATE_KEY).first()
    if not row:
        return {}
    try:
        return json.loads(row.value) or {}
    except Exception:
        return {}


def _save_state(db: Session, state: dict) -> None:
    row = db.query(AppSetting).filter(AppSetting.key == STATE_KEY).first()
    if not row:
        row = AppSetting(key=STATE_KEY, value=json.dumps(state))
        db.add(row)
    else:
        row.value = json.dumps(state)
    db.commit()


def get_state(db: Session) -> dict:
    """Состояние проверок по каналам: {channel: {version, released_at, last_check}}."""
    return _load_state(db)


def fetch_latest_version(timeout: float = 10.0) -> tuple[str, datetime] | None:
    """Backwards-compat: возвращает только stable."""
    return _fetch_channel(CHANNELS["stable"], timeout=timeout)


def check_and_alert(db: Session) -> dict:
    """Проверяет все каналы. При появлении новой версии создаёт alert. Возвращает обновлённый state."""
    state = _load_state(db)
    now_iso = datetime.now(timezone.utc).isoformat()
    for channel, url in CHANNELS.items():
        res = _fetch_channel(url)
        prev = (state.get(channel) or {}).get("version")
        if res is None:
            # сохраняем last_check всё равно, чтобы видеть попытку
            state.setdefault(channel, {})["last_check"] = now_iso
            state[channel]["last_check_ok"] = False
            continue
        version, released_at = res
        state[channel] = {
            "version": version,
            "released_at": released_at.isoformat(),
            "last_check": now_iso,
            "last_check_ok": True,
        }
        if prev and prev != version:
            add_alert(
                db,
                severity="info",
                category="firmware",
                source=f"mikrotik.com/{channel}",
                title=f"RouterOS {channel}: новая версия {version}",
                message=f"Предыдущая отслеживаемая: {prev}",
            )
            logger.info("firmware check {}: new version {} (was {})", channel, version, prev)
        elif not prev:
            logger.info("firmware check {}: initial = {}", channel, version)
    _save_state(db, state)
    return state
