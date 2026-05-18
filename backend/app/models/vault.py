"""Хранилище ключа шифрования секретов устройств (envelope encryption).

В таблице ровно одна запись (id=1). Поля:
  - kdf_salt        — соль для PBKDF2 (16 B), base64
  - kdf_iterations  — число итераций PBKDF2 (по умолчанию 200_000)
  - verifier        — короткий тест-токен AES-GCM, зашифрованный KEK; используется,
                      чтобы проверить корректность мастер-пароля без расшифровки DEK
  - dek_wrapped     — DEK (32 B), завёрнутый AES-GCM от KEK; формат nonce|cipher|tag, base64
  - created_at / updated_at
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from ..core.db import Base


class Vault(Base):
    __tablename__ = "vault"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kdf_salt: Mapped[str] = mapped_column(String(64), nullable=False)
    kdf_iterations: Mapped[int] = mapped_column(Integer, nullable=False, default=200_000)
    verifier: Mapped[str] = mapped_column(Text, nullable=False)
    dek_wrapped: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
