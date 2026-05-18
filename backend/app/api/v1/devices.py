from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from ...core.db import get_db
from ...core.security import decrypt_secret, encrypt_secret
from ...models.device import Device
from ...models.metric import DeviceMetric
from ...models.user import User
from ...schemas.device import (
    DeviceCreate,
    DeviceOut,
    DeviceResource,
    DeviceUpdate,
)
from ...services.events import add_alert, add_audit
from ...services.routeros.client import (
    RouterOSCredentials,
    RouterOSError,
    check_internet,
    cmd_reboot,
    cmd_safe_mode,
    cmd_upgrade_check,
    cmd_upgrade_install,
    fetch_dhcp_leases,
    fetch_identity,
    fetch_interface_stats,
    fetch_resource,
    parse_uptime,
    push_firmware_via_ftp,
)
from ..deps import get_current_user, require_role

router = APIRouter()


def _creds(d: Device) -> RouterOSCredentials:
    return RouterOSCredentials(
        host=d.host,
        username=d.username,
        password=decrypt_secret(d.password_enc),
        port=d.port,
        use_tls=d.use_tls,
    )


@router.get("", response_model=list[DeviceOut])
def list_devices(
    kind: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[Device]:
    q = db.query(Device)
    if kind:
        q = q.filter(Device.kind == kind)
    return q.order_by(Device.id.desc()).all()


@router.post("", response_model=DeviceOut, status_code=status.HTTP_201_CREATED)
def create_device(
    payload: DeviceCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin", "operator")),
) -> Device:
    d = Device(
        name=payload.name,
        host=payload.host,
        port=payload.port,
        use_tls=payload.use_tls,
        username=payload.username,
        password_enc=encrypt_secret(payload.password),
        kind=payload.kind or "router",
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    return d


@router.get("/{device_id}", response_model=DeviceOut)
def get_device(
    device_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Device:
    d = db.get(Device, device_id)
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "device not found")
    return d


@router.patch("/{device_id}", response_model=DeviceOut)
def update_device(
    device_id: int,
    payload: DeviceUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin", "operator")),
) -> Device:
    d = db.get(Device, device_id)
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "device not found")
    data = payload.model_dump(exclude_unset=True)
    if "password" in data:
        d.password_enc = encrypt_secret(data.pop("password"))
    for k, v in data.items():
        setattr(d, k, v)
    db.commit()
    db.refresh(d)
    return d


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_device(
    device_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin")),
) -> Response:
    d = db.get(Device, device_id)
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "device not found")
    db.delete(d)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{device_id}/probe", response_model=DeviceResource)
def probe_device(
    device_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> DeviceResource:
    """Подключиться к устройству, прочитать `/system/resource` и обновить
    метаданные (identity, model, serial, version, status)."""
    d = db.get(Device, device_id)
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "device not found")

    try:
        res = fetch_resource(_creds(d))
        identity = fetch_identity(_creds(d))
    except RouterOSError as exc:
        d.status = "down"
        d.last_error = str(exc)
        db.commit()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc

    d.identity = identity or d.identity
    d.model = res.get("board-name") or d.model
    d.ros_version = res.get("version") or d.ros_version
    d.architecture = res.get("architecture-name") or d.architecture
    prev_status = d.status
    d.status = "up"
    d.last_error = None
    d.last_seen = datetime.now(timezone.utc)

    def _to_int(v):
        try:
            return int(v) if v is not None else None
        except (TypeError, ValueError):
            return None

    cpu = _to_int(res.get("cpu-load"))
    free_mem = _to_int(res.get("free-memory"))
    total_mem = _to_int(res.get("total-memory"))
    uptime_s = parse_uptime(res.get("uptime"))

    # abnormal reboot detection: новый uptime < предыдущего и отличие > 60s
    abnormal = False
    if uptime_s is not None and d.last_uptime_seconds is not None:
        if uptime_s < d.last_uptime_seconds - 60:
            abnormal = True
            d.abnormal_reboot = True
            add_alert(
                db,
                severity="warning",
                category="abnormal_reboot",
                source=f"device:{d.id}",
                title=f"Возможен аварийный перезапуск: {d.identity or d.name}",
                message=(
                    f"Uptime упал с {d.last_uptime_seconds}s до {uptime_s}s "
                    f"без штатной команды reboot."
                ),
            )
    if not abnormal:
        d.abnormal_reboot = False
    d.last_uptime_seconds = uptime_s

    # internet check
    try:
        ok = check_internet(_creds(d))
        d.internet_ok = ok
        if not ok:
            add_alert(
                db,
                severity="warning",
                category="internet",
                source=f"device:{d.id}",
                title=f"Нет интернета на {d.identity or d.name}",
                message="Ping 8.8.8.8 не прошёл.",
            )
    except Exception:
        d.internet_ok = None

    # уведомление о возврате в строй
    if prev_status == "down" and d.status == "up":
        add_alert(
            db,
            severity="info",
            category="device",
            source=f"device:{d.id}",
            title=f"Устройство снова онлайн: {d.identity or d.name}",
        )

    mem_used_pct = None
    if free_mem is not None and total_mem and total_mem > 0:
        mem_used_pct = round(100 - (free_mem / total_mem) * 100, 1)

    metric = DeviceMetric(
        device_id=d.id,
        cpu_load=float(cpu) if cpu is not None else None,
        mem_used_pct=mem_used_pct,
        free_memory=free_mem,
        total_memory=total_mem,
        uptime_seconds=uptime_s,
        internet_ok=d.internet_ok,
    )
    db.add(metric)
    db.commit()

    return DeviceResource(
        cpu_load=cpu,
        free_memory=free_mem,
        total_memory=total_mem,
        uptime=res.get("uptime"),
        version=res.get("version"),
        board_name=res.get("board-name"),
        architecture_name=res.get("architecture-name"),
    )


@router.post("/{device_id}/reboot", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def reboot_device(
    device_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "operator")),
) -> Response:
    """Отправить команду перезагрузки устройству."""
    d = db.get(Device, device_id)
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "device not found")
    try:
        cmd_reboot(_creds(d))
    except RouterOSError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    add_audit(db, actor=user.email, action="device.reboot", target=f"device:{device_id}")
    add_alert(db, severity="info", category="device", source=f"device:{device_id}",
              title=f"Reboot отправлен: {d.identity or d.name}", message=f"by {user.email}")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{device_id}/safe-mode", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def toggle_safe_mode(
    device_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "operator")),
) -> Response:
    """Переключить safe mode на устройстве."""
    d = db.get(Device, device_id)
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "device not found")
    try:
        cmd_safe_mode(_creds(d))
    except RouterOSError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    add_audit(db, actor=user.email, action="device.safe_mode", target=f"device:{device_id}")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- Sprint 09: интерфейсы / DHCP / upgrade ----------

@router.get("/{device_id}/interfaces")
def list_interfaces(
    device_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[dict]:
    """Список интерфейсов устройства со счётчиками rx/tx и running."""
    d = db.get(Device, device_id)
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "device not found")
    try:
        return fetch_interface_stats(_creds(d))
    except RouterOSError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc


@router.get("/{device_id}/interface-traffic")
def interface_traffic(
    device_id: int,
    names: str | None = None,
    hours: float = 24.0,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict:
    """Серии bps по выбранным интерфейсам за окно `hours`.

    `names` — CSV. Если пусто — берётся из `device.monitored_interfaces`.
    Возвращает {"series": {name: [{ts, rx_bps, tx_bps, running}]}}.
    """
    from ...models.interface_stat import InterfaceStat
    from datetime import datetime, timedelta, timezone
    d = db.get(Device, device_id)
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "device not found")
    if not names:
        names = d.monitored_interfaces or ""
    name_list = [x.strip() for x in names.split(",") if x.strip()]
    if not name_list:
        return {"series": {}, "hours": hours}
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    rows = (
        db.query(InterfaceStat)
        .filter(
            InterfaceStat.device_id == device_id,
            InterfaceStat.name.in_(name_list),
            InterfaceStat.ts >= since,
        )
        .order_by(InterfaceStat.name.asc(), InterfaceStat.ts.asc())
        .all()
    )
    by_name: dict[str, list] = {n: [] for n in name_list}
    last: dict[str, tuple] = {}
    for r in rows:
        prev = last.get(r.name)
        rx_bps = tx_bps = None
        if prev is not None:
            dt = (r.ts - prev[0]).total_seconds()
            if dt > 0:
                # счётчики могут сброситься после reboot — игнорируем отрицательные дельты
                drx = r.rx_bytes - prev[1]
                dtx = r.tx_bytes - prev[2]
                if drx >= 0 and dtx >= 0:
                    rx_bps = round(drx * 8 / dt)
                    tx_bps = round(dtx * 8 / dt)
        by_name[r.name].append({
            "ts": r.ts.isoformat(),
            "rx_bps": rx_bps,
            "tx_bps": tx_bps,
            "running": r.running,
        })
        last[r.name] = (r.ts, r.rx_bytes, r.tx_bytes)
    return {"series": by_name, "hours": hours}


@router.get("/{device_id}/uplink-status")
def uplink_status(
    device_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[dict]:
    """Текущий статус выбранных аплинков (running) — по последней записи."""
    from ...models.interface_stat import InterfaceStat
    d = db.get(Device, device_id)
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "device not found")
    name_list = [x.strip() for x in (d.uplink_interfaces or "").split(",") if x.strip()]
    out = []
    for n in name_list:
        last = (
            db.query(InterfaceStat)
            .filter(InterfaceStat.device_id == device_id, InterfaceStat.name == n)
            .order_by(InterfaceStat.ts.desc()).first()
        )
        out.append({
            "name": n,
            "running": bool(last.running) if last else None,
            "ts": last.ts.isoformat() if last else None,
        })
    return out


@router.get("/{device_id}/dhcp-leases")
def dhcp_leases(
    device_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[dict]:
    """Список выданных DHCP-лизов по всем DHCP-серверам устройства."""
    d = db.get(Device, device_id)
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "device not found")
    try:
        return fetch_dhcp_leases(_creds(d))
    except RouterOSError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc


@router.post("/{device_id}/upgrade/internet")
def upgrade_from_internet(
    device_id: int,
    channel: str = "stable",
    install: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "operator")),
) -> dict:
    """Запросить у MikroTik проверку обновления и при `install=true` — установить.

    Идёт через штатный `/system/package/update` (репозиторий MikroTik).
    Установка перезагрузит устройство.
    """
    d = db.get(Device, device_id)
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "device not found")
    try:
        info = cmd_upgrade_check(_creds(d), channel=channel)
        if install:
            cmd_upgrade_install(_creds(d))
            add_audit(db, actor=user.email, action="device.upgrade.internet",
                      target=f"device:{device_id}", detail=f"channel={channel}")
            add_alert(db, severity="info", category="firmware",
                      source=f"device:{device_id}",
                      title=f"Обновление из интернета запущено: {d.identity or d.name}",
                      message=f"by {user.email}, channel={channel}")
            db.commit()
        return {"ok": True, "info": info, "installed": bool(install)}
    except RouterOSError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc


@router.post("/{device_id}/upgrade/local")
def upgrade_from_local(
    device_id: int,
    firmware_id: int,
    reboot: bool = True,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "operator")),
) -> dict:
    """Установить прошивку из локального репозитория контроллера.

    Файл прошивки временно публикуется во встроенный FTP, устройство сам
    скачивает его командой `/tool/fetch`, затем (опц.) перезагружается —
    RouterOS установит .npk при загрузке.
    """
    from ...models.firmware import Firmware
    from ...services.backup_ftp_server import get_server, detect_push_host
    from ...core.config import get_settings as _cfg
    import os
    d = db.get(Device, device_id)
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "device not found")
    fw = db.get(Firmware, firmware_id)
    if not fw:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "firmware not found")
    if not fw.content:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "firmware has no payload")
    srv = get_server()
    if srv is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "backup ftp server not running")
    cfg = _cfg()
    push_host = cfg.backup_push_host or detect_push_host()
    if not push_host:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "BACKUP_PUSH_HOST not configured")
    sess = srv.open_session([fw.name])
    try:
        path = os.path.join(sess.home_dir, fw.name)
        with open(path, "wb") as f:
            f.write(fw.content)
        try:
            push_firmware_via_ftp(
                _creds(d),
                server=push_host, port=int(cfg.backup_ftp_port),
                user=sess.username, password=sess.password,
                src_path=fw.name, dst_filename=fw.name,
            )
        except RouterOSError as exc:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
        if reboot:
            try:
                cmd_reboot(_creds(d))
            except RouterOSError as exc:
                raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
        add_audit(db, actor=user.email, action="device.upgrade.local",
                  target=f"device:{device_id}", detail=f"firmware={fw.name}")
        add_alert(db, severity="info", category="firmware",
                  source=f"device:{device_id}",
                  title=f"Установлена локальная прошивка: {d.identity or d.name}",
                  message=f"{fw.name} by {user.email}")
        db.commit()
        return {"ok": True, "file": fw.name, "reboot": reboot}
    finally:
        srv.close_session(sess.session_id)
