from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends
from sqlalchemy.orm import Session

from ...core.db import get_db
from ...models.user import User
from ...services.settings import get_settings_dict, update_settings_dict
from ...services import telegram as tg
from ..deps import get_current_user, require_role

router = APIRouter()


@router.get("")
def get_settings_endpoint(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict[str, Any]:
    s = get_settings_dict(db)
    # Маскируем токен бота при отдаче
    tg_cfg = s.get("telegram", {})
    if tg_cfg.get("bot_token"):
        tg_cfg = {**tg_cfg, "bot_token_masked": "***" + tg_cfg["bot_token"][-4:]}
        # Сам токен в открытую тоже отдаём админам через /settings (для редактирования)
    return s


@router.put("")
def put_settings_endpoint(
    patch: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin")),
) -> dict[str, Any]:
    out = update_settings_dict(db, patch)
    # Если изменён интервал автоопроса — переплинируем джобу.
    new_pm = (out.get("ui") or {}).get("probe_interval_minutes")
    if isinstance(new_pm, int):
        from ...main import reschedule_probe_job
        try:
            reschedule_probe_job(new_pm)
        except Exception:  # pragma: no cover
            pass
    return out


@router.post("/telegram/test")
def telegram_test(
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin")),
) -> dict[str, Any]:
    s = get_settings_dict(db)
    cfg = s.get("telegram", {})
    ok, msg = tg.test_credentials(cfg.get("bot_token", ""), cfg.get("chat_id", ""))
    return {"ok": ok, "message": msg}
