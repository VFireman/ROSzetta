from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status

from ...models.user import User
from ...services.controller_backup import (
    make_config_only_archive,
    make_full_archive,
    restore_full_archive,
)
from ..deps import require_role

router = APIRouter()


@router.get("/config")
def download_config_backup(
    _: User = Depends(require_role("admin")),
) -> Response:
    name, data = make_config_only_archive()
    return Response(
        content=data,
        media_type="application/gzip",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.get("/full")
def download_full_backup(
    _: User = Depends(require_role("admin")),
) -> Response:
    try:
        name, data = make_full_archive()
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc
    return Response(
        content=data,
        media_type="application/gzip",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.post("/restore")
async def restore_backup(
    file: UploadFile = File(...),
    _: User = Depends(require_role("admin")),
) -> dict:
    """Развёртывание full-бэкапа (tar.gz с db.dump). Деструктивно: дропает текущую БД."""
    if not file.filename or not file.filename.endswith((".tar.gz", ".tgz")):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ожидается файл .tar.gz")
    data = await file.read()
    if len(data) > 500 * 1024 * 1024:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Архив слишком большой (>500 MiB)")
    try:
        return restore_full_archive(data)
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc
