"""Тонкий враппер вокруг librouteros для синхронных вызовов из API/воркеров."""
from __future__ import annotations

import socket
import ssl
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any, Iterator

from librouteros import connect
from librouteros.exceptions import LibRouterosError
from librouteros.login import plain
from loguru import logger


class RouterOSError(RuntimeError):
    pass


@dataclass
class RouterOSCredentials:
    host: str
    username: str
    password: str
    # По умолчанию api-ssl: порт 8729 + TLS. plain api (8728) можно использовать
    # для legacy-устройств, явно передав port=8728, use_tls=False.
    port: int = 8729
    use_tls: bool = True
    timeout: float = 5.0


@contextmanager
def routeros_session(creds: RouterOSCredentials) -> Iterator[Any]:
    kwargs: dict[str, Any] = {
        "port": creds.port,
        "timeout": creds.timeout,
        "login_method": plain,
    }
    if creds.use_tls:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        kwargs["ssl_wrapper"] = ctx.wrap_socket

    try:
        api = connect(
            host=creds.host,
            username=creds.username,
            password=creds.password,
            **kwargs,
        )
        logger.info("RouterOS connected: {}:{} user={}", creds.host, creds.port, creds.username)
    except (LibRouterosError, OSError, socket.timeout) as exc:
        logger.warning(
            "RouterOS connection failed: {}:{} user={} reason={}",
            creds.host, creds.port, creds.username, exc,
        )
        raise RouterOSError(f"connect {creds.host}:{creds.port} failed: {exc}") from exc

    try:
        yield api
    finally:
        try:
            api.close()
        except Exception:  # pragma: no cover
            pass


def fetch_resource(creds: RouterOSCredentials) -> dict[str, Any]:
    """Возвращает первую запись `/system/resource`."""
    with routeros_session(creds) as api:
        rows = list(api.path("system", "resource"))
        return rows[0] if rows else {}


def fetch_identity(creds: RouterOSCredentials) -> str | None:
    with routeros_session(creds) as api:
        rows = list(api.path("system", "identity"))
        if not rows:
            return None
        return rows[0].get("name")


def fetch_interfaces(creds: RouterOSCredentials) -> list[dict[str, Any]]:
    with routeros_session(creds) as api:
        return list(api.path("interface"))


def cmd_reboot(creds: RouterOSCredentials) -> None:
    """Перезагрузить устройство (/system/reboot).

    Команды RouterOS API (а не path/print) выполняются через api(cmd=...).
    Итерация по api.path("system","reboot") даёт TrapError 'no such command',
    потому что /system/reboot — это действие, а не каталог записей."""
    logger.info("Sending reboot to {}:{}", creds.host, creds.port)
    try:
        with routeros_session(creds) as api:
            tuple(api(cmd="/system/reboot"))
    except (LibRouterosError, OSError) as exc:
        raise RouterOSError(f"reboot failed: {exc}") from exc


def cmd_safe_mode(creds: RouterOSCredentials) -> None:
    """Войти в safe mode (/system/safe-mode) — отправляет команду, устройство
    подтвердит переход (RouterOS 7+). Если устройство уже в safe mode,
    команда завершает его."""
    logger.info("Toggling safe-mode on {}:{}", creds.host, creds.port)
    try:
        with routeros_session(creds) as api:
            tuple(api(cmd="/system/safe-mode"))
    except (LibRouterosError, OSError) as exc:
        raise RouterOSError(f"safe-mode failed: {exc}") from exc


def check_internet(creds: RouterOSCredentials, target: str = "8.8.8.8") -> bool:
    """Проверка интернет-доступа на устройстве через `/ping count=1`."""
    try:
        with routeros_session(creds) as api:
            rows = list(api(cmd="/ping", address=target, count="2"))
        for row in rows:
            recv = int(row.get("received") or 0)
            if recv > 0:
                return True
        return False
    except (RouterOSError, Exception) as exc:
        logger.warning("internet check failed for {}: {}", creds.host, exc)
        return False


def parse_uptime(uptime: str | None) -> int | None:
    """Парсит RouterOS uptime '1w2d3h4m5s' → секунды."""
    if not uptime:
        return None
    import re
    units = {"w": 604800, "d": 86400, "h": 3600, "m": 60, "s": 1}
    total = 0
    for value, unit in re.findall(r"(\d+)([wdhms])", uptime):
        total += int(value) * units[unit]
    return total or None


def execute_cli(creds: RouterOSCredentials, command: str) -> list[dict[str, Any]]:
    """Выполнить произвольную команду RouterOS API.

    Команда должна быть в формате RouterOS API path-style, например:
      `/system/identity/print`
      `/interface/print`
      `/ip/address/print where interface=ether1`

    Дополнительные параметры через `name=value` после команды.
    Возвращает список словарей-результатов.
    """
    parts = command.strip().split()
    if not parts:
        raise RouterOSError("empty command")
    cmd = parts[0]
    if not cmd.startswith("/"):
        raise RouterOSError("command must start with '/'")
    kwargs: dict[str, str] = {}
    where: dict[str, str] = {}
    in_where = False
    for token in parts[1:]:
        if token == "where":
            in_where = True
            continue
        if "=" in token:
            k, v = token.split("=", 1)
            (where if in_where else kwargs)[k] = v
    logger.info("CLI exec on {}: {} args={} where={}", creds.host, cmd, kwargs, where)
    try:
        with routeros_session(creds) as api:
            res = api(cmd=cmd, **kwargs)
            rows = list(res)
            if where:
                rows = [r for r in rows if all(str(r.get(k)) == v for k, v in where.items())]
            return rows
    except (LibRouterosError, OSError) as exc:
        raise RouterOSError(f"cli failed: {exc}") from exc


# ---------- Sprint 09 helpers ----------

def _normalize_link_rate(rate: Any) -> str | None:
    """Привести значение `rate` от RouterOS monitor к каноничным строкам:
    "10M", "100M", "1G", "2.5G", "5G", "10G", "25G", "40G", "100G".
    Возвращает None, если значение пустое/нераспознано."""
    if rate is None:
        return None
    s = str(rate).strip()
    if not s:
        return None
    import re
    m = re.match(r"^\s*(\d+(?:[.,]\d+)?)\s*(M|G)bps\s*$", s, re.IGNORECASE)
    if not m:
        return None
    value = m.group(1).replace(",", ".")
    unit = m.group(2).upper()
    if "." in value:
        try:
            num = float(value)
            if num.is_integer():
                value = str(int(num))
            else:
                value = ("%g" % num)
        except ValueError:
            pass
    return f"{value}{unit}"


def _fetch_ethernet_link_speeds(api: Any) -> dict[str, str | None]:
    """Через `/interface/ethernet/monitor once=` собрать текущую скорость линка
    для всех ethernet-портов. Возвращает {name -> "1G" / "100M" / None}.

    Любые ошибки RouterOS глушим — это best-effort обогащение.
    """
    speeds: dict[str, str | None] = {}
    try:
        eth_rows = list(api.path("interface", "ethernet"))
    except Exception as exc:
        logger.debug("ethernet list failed: {}", exc)
        return speeds

    numbers: list[str] = []
    for r in eth_rows:
        rid = r.get(".id")
        if rid:
            numbers.append(str(rid))
    if not numbers:
        return speeds

    try:
        # librouteros: `=once=` передаётся как пустая строка
        rows = list(api(cmd="/interface/ethernet/monitor",
                        **{"numbers": ",".join(numbers), "once": ""}))
    except Exception as exc:
        logger.debug("ethernet monitor failed: {}", exc)
        return speeds

    for row in rows:
        name = row.get("name")
        if not name:
            continue
        status = str(row.get("status", "")).lower()
        rate = row.get("rate")
        if status in {"no-link", "disabled"}:
            speeds[name] = None
            continue
        speeds[name] = _normalize_link_rate(rate)
    return speeds


def fetch_interface_stats(creds: RouterOSCredentials) -> list[dict[str, Any]]:
    """Список интерфейсов со счётчиками rx/tx, флагом running и текущей скоростью линка.

    Поле `link_speed` — каноничная строка ("10M"/"100M"/"1G"/"10G"/...) либо None,
    если порт не ethernet, нет линка, или устройство не дало monitor.
    """
    out: list[dict[str, Any]] = []
    try:
        with routeros_session(creds) as api:
            link_speeds = _fetch_ethernet_link_speeds(api)
            for r in api.path("interface"):
                def _i(v: Any) -> int:
                    try:
                        return int(v)
                    except (TypeError, ValueError):
                        return 0
                running = str(r.get("running", "")).lower() == "true"
                disabled = str(r.get("disabled", "")).lower() == "true"
                name = r.get("name")
                link_speed = link_speeds.get(name) if running and not disabled else None
                out.append({
                    "name": name,
                    "rx_bytes": _i(r.get("rx-byte")),
                    "tx_bytes": _i(r.get("tx-byte")),
                    "running": running,
                    "disabled": disabled,
                    "type": r.get("type"),
                    "comment": r.get("comment") or None,
                    "mac_address": r.get("mac-address") or None,
                    "link_speed": link_speed,
                })
    except (LibRouterosError, OSError) as exc:
        raise RouterOSError(f"interface stats failed: {exc}") from exc
    return out


def fetch_dhcp_leases(creds: RouterOSCredentials) -> list[dict[str, Any]]:
    """Все лизы DHCP-сервера на устройстве."""
    out: list[dict[str, Any]] = []
    try:
        with routeros_session(creds) as api:
            for r in api.path("ip", "dhcp-server", "lease"):
                out.append({
                    "address": r.get("address"),
                    "mac_address": r.get("mac-address"),
                    "host_name": r.get("host-name") or r.get("comment"),
                    "comment": r.get("comment") or None,
                    "server": r.get("server"),
                    "status": r.get("status"),
                    "dynamic": str(r.get("dynamic", "")).lower() == "true",
                    "blocked": str(r.get("blocked", "")).lower() == "true",
                    "last_seen": r.get("last-seen"),
                    "expires_after": r.get("expires-after"),
                })
    except (LibRouterosError, OSError) as exc:
        raise RouterOSError(f"dhcp leases failed: {exc}") from exc
    return out


def cmd_upgrade_check(creds: RouterOSCredentials, channel: str = "stable") -> dict[str, Any]:
    """Запросить у MikroTik проверку доступного обновления и инициировать
    /system/package/update/check-for-updates. Возвращает текущее состояние."""
    try:
        with routeros_session(creds) as api:
            try:
                tuple(api.path("system", "package", "update").call("set",
                                                                    **{"channel": channel}))
            except Exception:
                pass
            try:
                tuple(api(cmd="/system/package/update/check-for-updates"))
            except Exception:
                pass
            rows = list(api.path("system", "package", "update"))
            return rows[0] if rows else {}
    except (LibRouterosError, OSError) as exc:
        raise RouterOSError(f"upgrade check failed: {exc}") from exc


def cmd_upgrade_install(creds: RouterOSCredentials) -> None:
    """Запустить установку обновления (устройство ребутнётся)."""
    try:
        with routeros_session(creds) as api:
            tuple(api(cmd="/system/package/update/install"))
    except (LibRouterosError, OSError) as exc:
        raise RouterOSError(f"upgrade install failed: {exc}") from exc


def push_firmware_via_ftp(
    creds: RouterOSCredentials,
    server: str,
    port: int,
    user: str,
    password: str,
    src_path: str,
    dst_filename: str,
) -> None:
    """Загрузить файл с FTP-сервера контроллера на устройство (`/tool/fetch download`).
    Используется для установки прошивки из локального репозитория без выгрузки на устройство.
    """
    url = f"ftp://{server}:{port}/{src_path}"
    try:
        with routeros_session(creds) as api:
            tuple(api(
                cmd="/tool/fetch",
                url=url, user=user, password=password,
                mode="ftp", **{"dst-path": dst_filename},
            ))
    except (LibRouterosError, OSError) as exc:
        raise RouterOSError(f"fetch firmware failed: {exc}") from exc


def cmd_reboot_for_upgrade(creds: RouterOSCredentials) -> None:
    """`/system/reboot` — после загрузки .npk RouterOS установит апдейт при загрузке."""
    cmd_reboot(creds)

