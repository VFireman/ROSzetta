from __future__ import annotations

from fastapi import APIRouter

from .v1 import alerts as alerts_router
from .v1 import auth as auth_router
from .v1 import backups as backups_router
from .v1 import cli as cli_router
from .v1 import controller_backup as controller_backup_router
from .v1 import devices as devices_router
from .v1 import firmware as firmware_router
from .v1 import health as health_router
from .v1 import metrics as metrics_router
from .v1 import settings as settings_router
from .v1 import vault as vault_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health_router.router, tags=["health"])
api_router.include_router(auth_router.router, prefix="/auth", tags=["auth"])
api_router.include_router(devices_router.router, prefix="/devices", tags=["devices"])
api_router.include_router(backups_router.router, tags=["backups"])
api_router.include_router(firmware_router.router, prefix="/firmware", tags=["firmware"])
api_router.include_router(alerts_router.router, prefix="/alerts", tags=["alerts"])
api_router.include_router(metrics_router.router, tags=["metrics"])
api_router.include_router(cli_router.router, prefix="/cli", tags=["cli"])
api_router.include_router(controller_backup_router.router, prefix="/controller/backup", tags=["controller"])
api_router.include_router(settings_router.router, prefix="/settings", tags=["settings"])
api_router.include_router(vault_router.router, prefix="/vault", tags=["vault"])
