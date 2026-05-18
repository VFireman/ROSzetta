"""Создание бэкапа конфигурации MikroTik с PUSH-доставкой на контроллер.

Поток:
1. На устройстве запускается `/system/backup/save name=...` и `/export file=...`.
2. Ждём появления файлов в `/file`.
3. Контроллер открывает в своём встроенном FTP-сервере одноразовую сессию
   (уникальный пользователь/пароль, изолированный каталог).
4. На устройстве выполняется `/tool fetch upload=yes mode=ftp ...`,
   которое отправляет файлы НА контроллер. На MikroTik не нужно включать
   ftp/ssh — нужен только исходящий доступ к контроллеру.
5. Бэкенд читает файлы из каталога сессии, удаляет файлы с устройства,
   закрывает FTP-сессию и возвращает байты.
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

from loguru import logger

from .client import RouterOSCredentials, RouterOSError, routeros_session
from ..backup_ftp_server import detect_push_host, get_server, start_server


@dataclass
class BackupFiles:
    binary_name: str
    binary_data: bytes
    text_name: str
    text_data: bytes


# ---------- helpers вокруг librouteros ----------

def _exec_path(api: Any, *path: str, **params: Any) -> list[dict[str, Any]]:
    """Выполнить RouterOS-команду. Последний сегмент — имя cmd для librouteros.

    Пример: _exec_path(api, "system", "backup", "save", name="x")
            => api.path("system", "backup")("save", name="x")
    """
    if not path:
        raise RouterOSError("_exec_path requires at least one path segment")
    *base, cmd = path
    p = api.path(*base) if base else api.path()
    return list(p(cmd, **params))


def _list_files(api: Any) -> list[dict[str, Any]]:
    return list(api.path("file"))


def _wait_file(api: Any, name: str, timeout: float = 15.0) -> dict[str, Any] | None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        for row in _list_files(api):
            if row.get("name") == name and int(row.get("size") or 0) > 0:
                return row
        time.sleep(0.5)
    return None


def _delete_file(api: Any, name: str) -> None:
    try:
        for row in _list_files(api):
            if row.get("name") == name:
                api.path("file").remove(row[".id"])
                return
    except Exception as exc:  # pragma: no cover
        logger.warning("Could not delete file {} on device: {}", name, exc)


# ---------- главный сценарий ----------

def create_backup_via_push(
    creds: RouterOSCredentials,
    base_name: str,
    push_host: str,
    push_port: int = 2121,
    timeout: float = 90.0,
) -> BackupFiles:
    """Полный цикл: создать backup+export на устройстве, дождаться upload на контроллер."""
    binary_name = f"{base_name}.backup"
    text_name = f"{base_name}.rsc"

    server = get_server() or start_server(port=push_port)
    session = server.open_session(expected_files={binary_name, text_name})

    try:
        logger.info(
            "Backup PUSH: device={} base={} push={}:{} user={}",
            creds.host, base_name, push_host, push_port, session.username,
        )
        with routeros_session(creds) as api:
            # 1) бинарный backup
            try:
                _exec_path(api, "system", "backup", "save", name=base_name)
            except Exception as exc:
                raise RouterOSError(f"backup save failed: {exc}") from exc
            if _wait_file(api, binary_name) is None:
                raise RouterOSError(f"backup file {binary_name} not appeared on device")

            # 2) текстовый export
            try:
                _exec_path(api, "export", file=base_name)
            except Exception as exc:
                raise RouterOSError(f"export failed: {exc}") from exc
            if _wait_file(api, text_name) is None:
                raise RouterOSError(f"export file {text_name} not appeared on device")

            # 3) push обоих файлов
            for fname in (binary_name, text_name):
                try:
                    _exec_path(
                        api, "tool", "fetch",
                        **{
                            "upload": "yes",
                            "mode": "ftp",
                            "address": push_host,
                            "port": str(push_port),
                            "user": session.username,
                            "password": session.password,
                            "src-path": fname,
                            "dst-path": fname,
                        },
                    )
                except Exception as exc:
                    raise RouterOSError(f"push {fname} failed: {exc}") from exc

        # 4) ждём, пока FTP-сервер контроллера получит оба
        try:
            files = server.wait_files(session.session_id, timeout=timeout)
        except TimeoutError as exc:
            raise RouterOSError(str(exc)) from exc

        if binary_name not in files or text_name not in files:
            raise RouterOSError(f"unexpected push contents: got={sorted(files.keys())}")

        # 5) подчищаем флэш на устройстве
        try:
            with routeros_session(creds) as api:
                _delete_file(api, binary_name)
                _delete_file(api, text_name)
        except Exception as exc:  # pragma: no cover
            logger.warning("Cleanup failed for {}: {}", base_name, exc)

        binary_data = files[binary_name]
        text_data = files[text_name]
        logger.info(
            "Backup PUSH ok: {} binary={}b text={}b",
            base_name, len(binary_data), len(text_data),
        )
        return BackupFiles(
            binary_name=binary_name,
            binary_data=binary_data,
            text_name=text_name,
            text_data=text_data,
        )
    finally:
        try:
            server.close_session(session.session_id)
        except Exception:  # pragma: no cover
            pass


# Обратно-совместимый алиас — используется существующими роутами.
def create_and_download_backup(
    creds: RouterOSCredentials,
    base_name: str,
    push_host: str | None = None,
    push_port: int = 2121,
    **_legacy: Any,
) -> BackupFiles:
    """Совместимая обёртка: принимает push_host/port вместо ssh/ftp_port."""
    if not push_host:
        push_host = detect_push_host()
    return create_backup_via_push(creds, base_name, push_host=push_host, push_port=push_port)
