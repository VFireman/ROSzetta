"""API мастер-пароля / vault.

Эндпоинты:
  GET  /api/v1/vault/status   — состояние (initialized, unlocked); доступно всем авторизованным.
  POST /api/v1/vault/init     — установить первичный мастер-пароль (admin, только если не init).
  POST /api/v1/vault/unlock   — разблокировать DEK мастер-паролем (admin).
  POST /api/v1/vault/lock     — забыть DEK (admin).
  POST /api/v1/vault/rotate   — сменить мастер-пароль (admin).

После init/unlock автоматически выполняется миграция legacy v1-секретов в v2.
"""
from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ...core.db import get_db
from ...models.user import User
from ...services.vault import (
    InvalidMasterPassword,
    VaultAlreadyInitialized,
    VaultError,
    VaultLocked,
    VaultNotInitialized,
    migrate_legacy_device_secrets,
    vault_service,
)
from ..deps import get_current_user, require_role

router = APIRouter()


class InitPayload(BaseModel):
    master_password: str = Field(min_length=8, max_length=256)


class UnlockPayload(BaseModel):
    master_password: str = Field(min_length=1, max_length=256)


class RotatePayload(BaseModel):
    old_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=8, max_length=256)


@router.get("/status")
def vault_status(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict:
    return vault_service.status(db).as_dict()


@router.post("/init", status_code=status.HTTP_201_CREATED)
def vault_init(
    payload: InitPayload,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin")),
) -> dict:
    try:
        vault_service.init_master_password(db, payload.master_password)
    except VaultAlreadyInitialized as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc))
    except VaultError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))
    # После init обычно паролей ещё нет, но всё равно прогоним миграцию на всякий случай.
    migration = migrate_legacy_device_secrets(db)
    return {
        "status": vault_service.status(db).as_dict(),
        "migration": migration,
    }


@router.post("/unlock")
def vault_unlock(
    payload: UnlockPayload,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin")),
) -> dict:
    try:
        vault_service.unlock(db, payload.master_password)
    except VaultNotInitialized as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc))
    except InvalidMasterPassword as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc))
    except VaultError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))
    migration = migrate_legacy_device_secrets(db)
    return {
        "status": vault_service.status(db).as_dict(),
        "migration": migration,
    }


@router.post("/lock")
def vault_lock(
    _: User = Depends(require_role("admin")),
) -> dict:
    vault_service.lock()
    return {"unlocked": False}


@router.post("/rotate")
def vault_rotate(
    payload: RotatePayload,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin")),
) -> dict:
    try:
        vault_service.rotate_master_password(db, payload.old_password, payload.new_password)
    except VaultNotInitialized as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc))
    except InvalidMasterPassword as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc))
    except VaultError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))
    return {"status": vault_service.status(db).as_dict()}
