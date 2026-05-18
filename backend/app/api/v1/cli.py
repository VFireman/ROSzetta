from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ...core.db import get_db
from ...core.security import decrypt_secret
from ...models.device import Device
from ...models.user import User
from ...services.events import add_audit
from ...services.routeros.client import (
    RouterOSCredentials,
    RouterOSError,
    execute_cli,
)
from ..deps import require_role

router = APIRouter()


# Опасные команды требуют явного подтверждения через query ?confirm=1
DANGEROUS_PREFIXES = (
    "/system/reboot",
    "/system/shutdown",
    "/system/reset-configuration",
    "/system/routerboard/upgrade",
    "/file/remove",
)


class CLIRunIn(BaseModel):
    device_ids: list[int] = Field(default_factory=list)
    command: str
    confirm: bool = False


class CLIDeviceResult(BaseModel):
    device_id: int
    device_name: str | None = None
    ok: bool
    rows: list[dict[str, Any]] | None = None
    error: str | None = None


class CLIRunOut(BaseModel):
    command: str
    results: list[CLIDeviceResult]


@router.post("/run", response_model=CLIRunOut)
def run_cli(
    payload: CLIRunIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "operator")),
) -> CLIRunOut:
    if not payload.device_ids:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "device_ids is empty")
    cmd = payload.command.strip()
    if not cmd:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "command is empty")

    is_dangerous = any(cmd.startswith(p) for p in DANGEROUS_PREFIXES)
    if is_dangerous and not payload.confirm:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "dangerous command requires confirmation (set confirm=true)",
        )

    results: list[CLIDeviceResult] = []
    for did in payload.device_ids:
        d = db.get(Device, did)
        if not d:
            results.append(CLIDeviceResult(device_id=did, ok=False, error="device not found"))
            continue
        try:
            rows = execute_cli(
                RouterOSCredentials(
                    host=d.host,
                    username=d.username,
                    password=decrypt_secret(d.password_enc),
                    port=d.port,
                    use_tls=d.use_tls,
                    timeout=10.0,
                ),
                cmd,
            )
            results.append(
                CLIDeviceResult(device_id=did, device_name=d.identity or d.name, ok=True, rows=rows)
            )
        except RouterOSError as exc:
            results.append(
                CLIDeviceResult(device_id=did, device_name=d.identity or d.name, ok=False, error=str(exc))
            )
        add_audit(
            db,
            actor=user.email,
            action="cli.run",
            target=f"device:{did}",
            detail=cmd[:200],
        )

    return CLIRunOut(command=cmd, results=results)
