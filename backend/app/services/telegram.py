"""Опциональная отправка сообщений в Telegram-бот."""
from __future__ import annotations

import httpx
from loguru import logger


def send_message(bot_token: str, chat_id: str, text: str) -> bool:
    if not bot_token or not chat_id:
        return False
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    try:
        r = httpx.post(
            url,
            json={"chat_id": chat_id, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True},
            timeout=8.0,
        )
        if r.status_code != 200:
            logger.warning("telegram send failed: {} {}", r.status_code, r.text[:200])
            return False
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("telegram send error: {}", exc)
        return False


def test_credentials(bot_token: str, chat_id: str) -> tuple[bool, str]:
    if not bot_token or not chat_id:
        return False, "Не заданы bot_token или chat_id"
    ok = send_message(bot_token, chat_id, "<b>ROSzetta</b>\nТестовое сообщение \u2705")
    return (ok, "OK" if ok else "Не удалось отправить (см. логи)")
