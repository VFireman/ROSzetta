"""Сервис мастер-пароля и шифрования секретов устройств (envelope encryption).

Архитектура:
  • DEK — случайные 32 байта, шифруют все секреты устройств AES-256-GCM.
  • KEK — производный ключ из мастер-пароля (PBKDF2-HMAC-SHA256, по умолчанию
    200_000 итераций, соль 16 B). KEK существует только в момент init/unlock/rotate.
  • В таблице `vault` хранится: соль, число итераций, verifier (короткий
    AES-GCM-токен от KEK для проверки пароля) и dek_wrapped (DEK, завёрнутый KEK).
  • После unlock'а DEK кешируется в памяти процесса; после рестарта vault
    автоматически locked, фоновые задачи и API устройств получают VaultLocked.

Мастер-пароль в БД НЕ хранится — только производные. Забыл — данные потеряны
безвозвратно (это by design). См. /api/v1/vault/rotate для смены пароля.
"""
from __future__ import annotations

import base64
import os
import secrets
import threading
from dataclasses import dataclass
from typing import Optional

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from sqlalchemy.orm import Session

from ..models.vault import Vault

DEFAULT_KDF_ITERATIONS = 200_000
DEK_BYTES = 32  # AES-256
SALT_BYTES = 16
NONCE_BYTES = 12  # стандарт AES-GCM
VERIFIER_PLAINTEXT = b"roszetta-vault-v2"
SECRET_PREFIX_V2 = "v2:"  # формат: v2:<base64(nonce|ct|tag)>


class VaultError(Exception):
    """Общий класс ошибок vault."""


class VaultLocked(VaultError):
    """Vault заблокирован — нужно ввести мастер-пароль через /api/v1/vault/unlock."""


class VaultNotInitialized(VaultError):
    """Мастер-пароль ещё не задан — нужен /api/v1/vault/init."""


class VaultAlreadyInitialized(VaultError):
    """Попытка повторного init — нужно использовать /rotate."""


class InvalidMasterPassword(VaultError):
    """Мастер-пароль не подходит."""


# --- helpers --------------------------------------------------------------

def _b64e(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def _b64d(text: str) -> bytes:
    return base64.b64decode(text.encode("ascii"))


def _derive_kek(master_password: str, salt: bytes, iterations: int) -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=iterations,
    )
    return kdf.derive(master_password.encode("utf-8"))


def _aead_encrypt(key: bytes, plaintext: bytes) -> str:
    """AES-256-GCM. Возвращает base64(nonce|ct|tag)."""
    aead = AESGCM(key)
    nonce = os.urandom(NONCE_BYTES)
    ct_with_tag = aead.encrypt(nonce, plaintext, associated_data=None)
    return _b64e(nonce + ct_with_tag)


def _aead_decrypt(key: bytes, token_b64: str) -> bytes:
    raw = _b64d(token_b64)
    if len(raw) < NONCE_BYTES + 16:
        raise InvalidMasterPassword("слишком короткий ciphertext")
    nonce, ct_with_tag = raw[:NONCE_BYTES], raw[NONCE_BYTES:]
    aead = AESGCM(key)
    return aead.decrypt(nonce, ct_with_tag, associated_data=None)


# --- основной сервис -------------------------------------------------------

@dataclass
class VaultStatus:
    initialized: bool
    unlocked: bool

    def as_dict(self) -> dict:
        return {"initialized": self.initialized, "unlocked": self.unlocked}


class VaultService:
    """Singleton-сервис. Держит DEK в памяти процесса."""

    def __init__(self) -> None:
        self._dek: Optional[bytes] = None
        self._lock = threading.RLock()
        # Кеш «инициализирован ли vault» — обновляется при init/status, чтобы
        # encrypt_secret() мог решить legacy-fallback без передачи db-сессии.
        self._initialized_cache: Optional[bool] = None

    def refresh_initialized_cache(self, db: Session) -> bool:
        with self._lock:
            self._initialized_cache = db.query(Vault).first() is not None
            return self._initialized_cache

    # ---- состояние ----
    def status(self, db: Session) -> VaultStatus:
        row = db.query(Vault).first()
        self._initialized_cache = row is not None
        return VaultStatus(initialized=row is not None, unlocked=self._dek is not None)

    def is_unlocked(self) -> bool:
        return self._dek is not None

    def is_initialized_cached(self) -> Optional[bool]:
        """None — кеш ещё не заполнен; True/False — последнее состояние."""
        return self._initialized_cache

    def _require_unlocked(self) -> bytes:
        if self._dek is None:
            raise VaultLocked("vault locked: введите мастер-пароль в Настройках → Безопасность")
        return self._dek

    # ---- init / unlock / lock / rotate ----
    def init_master_password(self, db: Session, master_password: str) -> None:
        if not master_password or len(master_password) < 8:
            raise VaultError("мастер-пароль должен быть не короче 8 символов")
        with self._lock:
            existing = db.query(Vault).first()
            if existing is not None:
                raise VaultAlreadyInitialized("vault уже инициализирован — используйте rotate")

            salt = os.urandom(SALT_BYTES)
            kek = _derive_kek(master_password, salt, DEFAULT_KDF_ITERATIONS)
            dek = secrets.token_bytes(DEK_BYTES)

            row = Vault(
                kdf_salt=_b64e(salt),
                kdf_iterations=DEFAULT_KDF_ITERATIONS,
                verifier=_aead_encrypt(kek, VERIFIER_PLAINTEXT),
                dek_wrapped=_aead_encrypt(kek, dek),
            )
            db.add(row)
            db.commit()
            self._dek = dek  # сразу разблокирован после init
            self._initialized_cache = True

    def unlock(self, db: Session, master_password: str) -> None:
        with self._lock:
            row = db.query(Vault).first()
            if row is None:
                raise VaultNotInitialized("сначала установите мастер-пароль")

            salt = _b64d(row.kdf_salt)
            kek = _derive_kek(master_password, salt, row.kdf_iterations)

            # 1) проверяем пароль через verifier
            try:
                check = _aead_decrypt(kek, row.verifier)
            except Exception as exc:  # noqa: BLE001 — любая ошибка дешифровки = неверный пароль
                raise InvalidMasterPassword("неверный мастер-пароль") from exc
            if check != VERIFIER_PLAINTEXT:
                raise InvalidMasterPassword("неверный мастер-пароль")

            # 2) разворачиваем DEK
            dek = _aead_decrypt(kek, row.dek_wrapped)
            if len(dek) != DEK_BYTES:
                raise VaultError("повреждённый dek_wrapped")
            self._dek = dek
            self._initialized_cache = True

    def lock(self) -> None:
        with self._lock:
            self._dek = None

    def rotate_master_password(self, db: Session, old_password: str, new_password: str) -> None:
        if not new_password or len(new_password) < 8:
            raise VaultError("новый мастер-пароль должен быть не короче 8 символов")
        with self._lock:
            row = db.query(Vault).first()
            if row is None:
                raise VaultNotInitialized("vault не инициализирован")

            # Сначала проверяем старый пароль и достаём DEK
            salt_old = _b64d(row.kdf_salt)
            kek_old = _derive_kek(old_password, salt_old, row.kdf_iterations)
            try:
                _ = _aead_decrypt(kek_old, row.verifier)
                dek = _aead_decrypt(kek_old, row.dek_wrapped)
            except Exception as exc:  # noqa: BLE001
                raise InvalidMasterPassword("текущий мастер-пароль неверен") from exc

            # Генерим новую соль и перешифровываем verifier/DEK новым KEK
            new_salt = os.urandom(SALT_BYTES)
            kek_new = _derive_kek(new_password, new_salt, DEFAULT_KDF_ITERATIONS)
            row.kdf_salt = _b64e(new_salt)
            row.kdf_iterations = DEFAULT_KDF_ITERATIONS
            row.verifier = _aead_encrypt(kek_new, VERIFIER_PLAINTEXT)
            row.dek_wrapped = _aead_encrypt(kek_new, dek)
            db.commit()
            self._dek = dek  # остаётся разблокированным с тем же DEK

    # ---- шифрование секретов устройств ----
    def encrypt_secret(self, value: str) -> str:
        dek = self._require_unlocked()
        token = _aead_encrypt(dek, value.encode("utf-8"))
        return SECRET_PREFIX_V2 + token

    def decrypt_secret_v2(self, token: str) -> str:
        dek = self._require_unlocked()
        if not token.startswith(SECRET_PREFIX_V2):
            raise VaultError("not a v2 ciphertext")
        payload = token[len(SECRET_PREFIX_V2):]
        try:
            return _aead_decrypt(dek, payload).decode("utf-8")
        except Exception as exc:  # noqa: BLE001
            raise VaultError(f"не удалось расшифровать секрет: {exc}") from exc


# Глобальный экземпляр (живёт всё время uvicorn-процесса)
vault_service = VaultService()


def migrate_legacy_device_secrets(db: Session) -> dict:
    """Перешифровывает password_enc у всех устройств с v1 (Fernet от SECRET_KEY)
    в v2 (AES-GCM от DEK). Безопасно вызывать многократно — уже v2 пропускаются.

    Возвращает {migrated, failed, skipped} для логов/UI.
    """
    from ..core.security import _legacy_fernet, is_legacy_secret
    from ..models.device import Device

    if not vault_service.is_unlocked():
        raise VaultLocked("нельзя мигрировать при заблокированном vault")

    migrated = 0
    failed = 0
    skipped = 0
    legacy = _legacy_fernet()

    for d in db.query(Device).all():
        if not is_legacy_secret(d.password_enc):
            skipped += 1
            continue
        try:
            plaintext = legacy.decrypt(d.password_enc.encode()).decode()
        except Exception:  # noqa: BLE001 — старый ключ не подошёл, пропустим, чтобы не терять данные
            failed += 1
            continue
        d.password_enc = vault_service.encrypt_secret(plaintext)
        migrated += 1
    db.commit()
    return {"migrated": migrated, "failed": failed, "skipped": skipped}
