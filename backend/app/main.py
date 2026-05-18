from __future__ import annotations

from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger

from .api.router import api_router
from .core.bootstrap import init_db
from .core.config import get_settings
from .core.db import SessionLocal
from .services.vault import VaultLocked, VaultNotInitialized, vault_service


def _job_firmware_check() -> None:
    from .services.firmware_check import check_and_alert
    db = SessionLocal()
    try:
        check_and_alert(db)
    except Exception as exc:  # pragma: no cover
        logger.warning("firmware check job failed: {}", exc)
    finally:
        db.close()


def _job_probe_devices() -> None:
    """Периодически опрашивает все устройства, обновляет метрики/алерты."""
    from .models.device import Device
    from .models.metric import DeviceMetric
    from .models.interface_stat import InterfaceStat
    from .core.security import decrypt_secret
    from .services.events import add_alert
    from .services.routeros.client import (
        RouterOSCredentials, RouterOSError, check_internet,
        fetch_identity, fetch_interface_stats, fetch_resource, parse_uptime,
    )
    from datetime import datetime, timedelta, timezone

    # Если vault уже инициализирован, но заблокирован — пропускаем итерацию:
    # без DEK не получится расшифровать password_enc устройств в формате v2.
    # До инициализации (legacy-режим) опрос продолжается со старым ключом из SECRET_KEY.
    if vault_service.is_initialized_cached() is True and not vault_service.is_unlocked():
        logger.info("probe_devices: vault locked, пропускаем итерацию")
        return

    db = SessionLocal()
    try:
        for d in db.query(Device).all():
            creds = RouterOSCredentials(
                host=d.host, username=d.username,
                password=decrypt_secret(d.password_enc),
                port=d.port, use_tls=d.use_tls, timeout=5.0,
            )
            try:
                res = fetch_resource(creds)
                ident = fetch_identity(creds)
            except RouterOSError as exc:
                if d.status != "down":
                    add_alert(db, severity="error", category="device",
                              source=f"device:{d.id}",
                              title=f"Устройство недоступно: {d.identity or d.name}",
                              message=str(exc))
                d.status = "down"
                d.last_error = str(exc)
                db.commit()
                continue

            d.identity = ident or d.identity
            d.model = res.get("board-name") or d.model
            d.ros_version = res.get("version") or d.ros_version
            d.architecture = res.get("architecture-name") or d.architecture
            prev_status = d.status
            d.status = "up"
            d.last_error = None
            d.last_seen = datetime.now(timezone.utc)
            uptime_s = parse_uptime(res.get("uptime"))
            if uptime_s is not None and d.last_uptime_seconds is not None:
                if uptime_s < d.last_uptime_seconds - 60:
                    d.abnormal_reboot = True
                    add_alert(db, severity="warning", category="abnormal_reboot",
                              source=f"device:{d.id}",
                              title=f"Аварийный перезапуск: {d.identity or d.name}",
                              message=f"uptime {d.last_uptime_seconds}s → {uptime_s}s")
                else:
                    d.abnormal_reboot = False
            d.last_uptime_seconds = uptime_s
            try:
                d.internet_ok = check_internet(creds)
            except Exception:
                d.internet_ok = None
            if prev_status == "down":
                add_alert(db, severity="info", category="device",
                          source=f"device:{d.id}",
                          title=f"Устройство снова онлайн: {d.identity or d.name}")

            def _i(v):
                try: return int(v) if v is not None else None
                except: return None  # noqa: E722
            cpu = _i(res.get("cpu-load"))
            free_mem = _i(res.get("free-memory"))
            total_mem = _i(res.get("total-memory"))
            mem_pct = None
            if free_mem is not None and total_mem and total_mem > 0:
                mem_pct = round(100 - (free_mem / total_mem) * 100, 1)
            db.add(DeviceMetric(
                device_id=d.id,
                cpu_load=float(cpu) if cpu is not None else None,
                mem_used_pct=mem_pct,
                free_memory=free_mem, total_memory=total_mem,
                uptime_seconds=uptime_s, internet_ok=d.internet_ok,
            ))
            # ---- Sprint 09: счётчики выбранных интерфейсов ----
            mon = (d.monitored_interfaces or "").strip()
            up = (d.uplink_interfaces or "").strip()
            wanted = {x.strip() for x in mon.split(",") if x.strip()}
            wanted |= {x.strip() for x in up.split(",") if x.strip()}
            if wanted:
                try:
                    iface_rows = fetch_interface_stats(creds)
                    now_ts = datetime.now(timezone.utc)
                    for r in iface_rows:
                        if r["name"] in wanted:
                            db.add(InterfaceStat(
                                device_id=d.id, name=r["name"],
                                rx_bytes=r["rx_bytes"], tx_bytes=r["tx_bytes"],
                                running=r["running"], ts=now_ts,
                            ))
                    # ретенция: глубина в часах
                    keep_hours = int(d.interface_history_hours or 24)
                    cutoff = now_ts - timedelta(hours=keep_hours)
                    db.query(InterfaceStat).filter(
                        InterfaceStat.device_id == d.id,
                        InterfaceStat.ts < cutoff,
                    ).delete(synchronize_session=False)
                except RouterOSError as exc:
                    logger.debug("iface stats failed for {}: {}", d.host, exc)
            db.commit()
    except Exception as exc:  # pragma: no cover
        logger.warning("probe job failed: {}", exc)
    finally:
        db.close()


_scheduler: AsyncIOScheduler | None = None

# Допустимые интервалы автоопроса (мин), используются для clamp/валидации.
ALLOWED_PROBE_MINUTES: tuple[int, ...] = (1, 2, 3, 5, 10)


def reschedule_probe_job(minutes: int) -> int:
    """Изменяет интервал джобы probe_devices на лету. Возвращает применённое значение."""
    global _scheduler
    if minutes not in ALLOWED_PROBE_MINUTES:
        # ближайшее снизу из разрешённых
        minutes = max((m for m in ALLOWED_PROBE_MINUTES if m <= minutes), default=ALLOWED_PROBE_MINUTES[0])
    if _scheduler is None:
        return minutes
    _scheduler.reschedule_job("probe_devices", trigger="interval", minutes=minutes)
    logger.info("probe_devices job rescheduled: every {}m", minutes)
    return minutes


@asynccontextmanager
async def lifespan(_: FastAPI):
    global _scheduler
    settings = get_settings()
    logger.info("Starting ROSzetta API ({} env)", settings.app_env)
    init_db()

    # Прогреваем кеш «vault initialized?» — нужен encrypt_secret() для legacy-fallback
    # и probe-джобе, чтобы решать skip/run без обращения к БД.
    try:
        _db = SessionLocal()
        try:
            initialized = vault_service.refresh_initialized_cache(_db)
            logger.info("Vault initialized={}, unlocked={}", initialized, vault_service.is_unlocked())
        finally:
            _db.close()
    except Exception as exc:  # pragma: no cover
        logger.warning("vault init-cache refresh failed: {}", exc)

    # FTP-сервер для приёма push-бэкапов от MikroTik
    try:
        from .services.backup_ftp_server import start_server
        start_server(host=settings.backup_ftp_host, port=settings.backup_ftp_port)
    except Exception as exc:  # pragma: no cover
        logger.warning("Backup FTP server failed to start: {}", exc)

    # Стартовый интервал берём из настроек БД (если уже сохранены), иначе из env.
    probe_minutes = settings.device_probe_interval_minutes
    try:
        from .services.settings import get_settings_dict
        db = SessionLocal()
        try:
            s = get_settings_dict(db)
            ui_pm = (s.get("ui") or {}).get("probe_interval_minutes")
            if isinstance(ui_pm, int) and ui_pm in ALLOWED_PROBE_MINUTES:
                probe_minutes = ui_pm
        finally:
            db.close()
    except Exception as exc:  # pragma: no cover
        logger.warning("could not load probe interval from settings: {}", exc)

    _scheduler = AsyncIOScheduler(timezone="UTC")
    from datetime import datetime, timedelta, timezone
    now = datetime.now(timezone.utc)
    _scheduler.add_job(
        _job_firmware_check, "interval",
        hours=max(1, settings.firmware_check_interval_hours),
        id="firmware_check",
        next_run_time=now + timedelta(seconds=30),
    )
    _scheduler.add_job(
        _job_probe_devices, "interval",
        minutes=max(1, probe_minutes),
        id="probe_devices",
        next_run_time=now + timedelta(seconds=10),
    )
    _scheduler.start()
    logger.info("Scheduler started: firmware/{}h, probe/{}m",
                settings.firmware_check_interval_hours, probe_minutes)
    yield
    if _scheduler:
        _scheduler.shutdown(wait=False)
    try:
        from .services.backup_ftp_server import stop_server
        stop_server()
    except Exception:  # pragma: no cover
        pass
    logger.info("Shutting down")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="ROSzetta API",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(VaultLocked)
    async def _vault_locked(_: Request, exc: VaultLocked) -> JSONResponse:
        # 423 Locked — стандартный HTTP-код для «ресурс заперт»; фронт ловит его и
        # показывает форму ввода мастер-пароля.
        return JSONResponse(status_code=423, content={"detail": str(exc), "code": "vault_locked"})

    @app.exception_handler(VaultNotInitialized)
    async def _vault_uninit(_: Request, exc: VaultNotInitialized) -> JSONResponse:
        return JSONResponse(
            status_code=412,
            content={"detail": str(exc), "code": "vault_not_initialized"},
        )

    app.include_router(api_router)
    return app


app = create_app()
