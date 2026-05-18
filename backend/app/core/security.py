from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from cryptography.fernet import Fernet
from jose import JWTError, jwt
from passlib.context import CryptContext

from .config import get_settings

settings = get_settings()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def create_access_token(subject: str | int, extra: dict[str, Any] | None = None) -> str:
    payload: dict[str, Any] = {
        "sub": str(subject),
        "type": "access",
        "iat": _now(),
        "exp": _now() + timedelta(minutes=settings.access_token_expire_minutes),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def create_refresh_token(subject: str | int) -> str:
    payload = {
        "sub": str(subject),
        "type": "refresh",
        "iat": _now(),
        "exp": _now() + timedelta(days=settings.refresh_token_expire_days),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except JWTError as exc:  # pragma: no cover
        raise ValueError(f"invalid token: {exc}") from exc


# --- Симметричное шифрование секретов устройств -----------------------------
# Двухслойная схема:
#   v1: Fernet от SHA256(SECRET_KEY) — устаревший формат (без префикса для
#       обратной совместимости). Только дешифрация. Запись новых v1 запрещена.
#   v2: AES-256-GCM от DEK из services.vault, префикс "v2:".
#
# encrypt_secret() требует, чтобы vault был инициализирован и разблокирован.
# decrypt_secret() умеет читать оба формата.
# Подробнее см. services/vault.py.

SECRET_PREFIX_V2 = "v2:"


def _legacy_fernet() -> Fernet:
    import base64
    import hashlib

    digest = hashlib.sha256(settings.secret_key.encode()).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def encrypt_secret(value: str) -> str:
    """Шифрует секрет DEK'ом из vault. Если vault ещё не инициализирован
    (свежий апгрейд с 0.6.x) — fallback на legacy Fernet, чтобы существующие
    сценарии не ломались. После /api/v1/vault/init все секреты пишутся как v2.
    """
    from ..services.vault import vault_service  # локальный импорт против цикла
    initialized = vault_service.is_initialized_cached()
    if initialized is False:
        # legacy v1: пишем Fernet-токен без префикса
        return _legacy_fernet().encrypt(value.encode()).decode()
    # initialized is True (или None — тогда поверим, что инициализирован, и
    # если на самом деле нет — VaultNotInitialized всплывёт; админу всё равно
    # пора создавать мастер-пароль).
    return vault_service.encrypt_secret(value)


def decrypt_secret(token: str) -> str:
    """Дешифрует секрет. Поддерживает v2 (vault) и legacy v1 (SECRET_KEY)."""
    if token.startswith(SECRET_PREFIX_V2):
        from ..services.vault import vault_service
        return vault_service.decrypt_secret_v2(token)
    # Legacy: Fernet-токен без префикса.
    return _legacy_fernet().decrypt(token.encode()).decode()


def is_legacy_secret(token: str) -> bool:
    """True, если секрет ещё не мигрирован на v2 (Fernet от SECRET_KEY)."""
    return not token.startswith(SECRET_PREFIX_V2)
