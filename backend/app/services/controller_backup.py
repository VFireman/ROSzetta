"""Бэкап самого контроллера: дамп БД и/или конфигурации."""
from __future__ import annotations

import io
import json
import os
import subprocess
import tarfile
from datetime import datetime, timezone

from loguru import logger

from ..core.config import get_settings


def _safe_settings_dump() -> dict:
    s = get_settings()
    data = s.model_dump()
    # маскируем секреты
    for k in list(data.keys()):
        if any(x in k.lower() for x in ("password", "secret", "key")):
            data[k] = "***"
    return data


def make_config_only_archive() -> tuple[str, bytes]:
    """Tar.gz с настройками контроллера (без БД)."""
    buf = io.BytesIO()
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    name = f"controller-config-{ts}.tar.gz"

    settings_json = json.dumps(_safe_settings_dump(), indent=2, default=str).encode()

    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        info = tarfile.TarInfo(name="settings.json")
        info.size = len(settings_json)
        info.mtime = int(datetime.now().timestamp())
        tar.addfile(info, io.BytesIO(settings_json))

        readme = (
            b"ROSzetta - config-only backup\n"
            b"Contains masked settings.json (no DB, no secrets).\n"
        )
        info2 = tarfile.TarInfo(name="README.txt")
        info2.size = len(readme)
        info2.mtime = int(datetime.now().timestamp())
        tar.addfile(info2, io.BytesIO(readme))

    return name, buf.getvalue()


def _dump_database() -> bytes:
    """Возвращает pg_dump БД (custom-format) либо raise."""
    s = get_settings()
    # parse postgresql+psycopg2://user:pass@host:port/db
    url = s.database_url.replace("postgresql+psycopg2://", "postgresql://")
    cmd = ["pg_dump", "-Fc", url]
    logger.info("running pg_dump")
    try:
        out = subprocess.run(
            cmd,
            check=True,
            capture_output=True,
            timeout=300,
            env={**os.environ},
        )
    except FileNotFoundError as exc:
        raise RuntimeError("pg_dump not installed in backend image") from exc
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(f"pg_dump failed: {exc.stderr.decode(errors='replace')[:400]}") from exc
    return out.stdout


def make_full_archive() -> tuple[str, bytes]:
    """Tar.gz с дампом БД + settings.json."""
    buf = io.BytesIO()
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    name = f"controller-full-{ts}.tar.gz"

    db_dump = _dump_database()
    settings_json = json.dumps(_safe_settings_dump(), indent=2, default=str).encode()

    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for fname, data in [
            ("db.dump", db_dump),
            ("settings.json", settings_json),
            (
                "README.txt",
                b"ROSzetta - full backup\n"
                b"Restore: pg_restore -d <db> db.dump\n",
            ),
        ]:
            info = tarfile.TarInfo(name=fname)
            info.size = len(data)
            info.mtime = int(datetime.now().timestamp())
            tar.addfile(info, io.BytesIO(data))

    return name, buf.getvalue()


def restore_full_archive(data: bytes) -> dict:
    """Разворачивает full-бэкап: дроп схемы public + pg_restore из db.dump в архиве.

    ВНИМАНИЕ: операция деструктивна. Текущая БД будет полностью заменена.
    """
    s = get_settings()
    try:
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tar:
            try:
                member = tar.getmember("db.dump")
            except KeyError as exc:
                raise RuntimeError("Архив не содержит db.dump (нужен full backup)") from exc
            f = tar.extractfile(member)
            if f is None:
                raise RuntimeError("Не удалось прочитать db.dump из архива")
            dump_bytes = f.read()
    except tarfile.TarError as exc:
        raise RuntimeError(f"Невалидный tar.gz: {exc}") from exc

    url = s.database_url.replace("postgresql+psycopg2://", "postgresql://")

    logger.warning("controller restore: dropping schema public")
    try:
        subprocess.run(
            ["psql", url, "-v", "ON_ERROR_STOP=1", "-c",
             "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"],
            check=True, capture_output=True, timeout=60, env={**os.environ},
        )
    except FileNotFoundError as exc:
        raise RuntimeError("psql not installed in backend image") from exc
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(f"psql DROP SCHEMA failed: {exc.stderr.decode(errors='replace')[:400]}") from exc

    logger.warning("controller restore: running pg_restore ({} bytes)", len(dump_bytes))
    try:
        proc = subprocess.run(
            ["pg_restore", "--no-owner", "--no-privileges", "-d", url],
            input=dump_bytes,
            check=True, capture_output=True, timeout=600, env={**os.environ},
        )
    except FileNotFoundError as exc:
        raise RuntimeError("pg_restore not installed in backend image") from exc
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(f"pg_restore failed: {exc.stderr.decode(errors='replace')[:400]}") from exc

    return {
        "ok": True,
        "message": "Бэкап успешно развёрнут. Перезайдите в систему — данные обновлены.",
        "stderr": proc.stderr.decode(errors='replace')[:400] if proc.stderr else "",
    }
