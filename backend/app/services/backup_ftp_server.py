"""Встроенный FTP-сервер для приёма push-бэкапов от MikroTik.

Идея: вместо того чтобы открывать ssh/ftp на каждом устройстве и тянуть
с него файл, контроллер сам поднимает FTP на отдельном порту и выдаёт
устройству одноразовые креды. Устройство выполняет:

    /tool fetch upload=yes mode=ftp address=<ctrl> port=<p> \
                user=<u> password=<p> src-path=<file> dst-path=<file>

Файлы складываются во временную директорию сессии. По завершении
загрузки коллбэк `on_file_received` маркирует файл как готовый.
Бэкенд ждёт появления всех ожидаемых файлов и читает их.

Реализация — `pyftpdlib.servers.ThreadedFTPServer`, поднимается
в фоновом потоке и живёт вместе с процессом backend.
"""
from __future__ import annotations

import os
import secrets
import shutil
import socket
import tempfile
import threading
import time
from dataclasses import dataclass, field
from typing import Iterable

from loguru import logger
from pyftpdlib.authorizers import DummyAuthorizer
from pyftpdlib.handlers import FTPHandler
from pyftpdlib.servers import ThreadedFTPServer


@dataclass
class _Session:
    session_id: str
    username: str
    password: str
    home_dir: str
    expected: set[str]
    received: dict[str, str] = field(default_factory=dict)  # name -> abs path
    created_at: float = field(default_factory=time.time)


class _Server:
    def __init__(self, host: str = "0.0.0.0", port: int = 2121) -> None:
        self.host = host
        self.port = port
        self._sessions: dict[str, _Session] = {}
        self._sessions_by_user: dict[str, _Session] = {}
        self._lock = threading.RLock()
        self._authorizer = DummyAuthorizer()
        self._server: ThreadedFTPServer | None = None
        self._thread: threading.Thread | None = None
        self._root_tmp = tempfile.mkdtemp(prefix="mikbak-ftp-")

        srv = self  # closure для хэндлера

        class _Handler(FTPHandler):
            def on_file_received(self, file: str) -> None:  # type: ignore[override]
                try:
                    user = (self.username or "").strip()
                    name = os.path.basename(file)
                    srv._mark_received(user, name, file)
                except Exception as exc:  # pragma: no cover
                    logger.warning("FTP on_file_received error: {}", exc)

        _Handler.authorizer = self._authorizer
        _Handler.banner = "mikrocloud backup ftp ready"
        # Пассивный диапазон фиксируем (нужно открыть в compose).
        _Handler.passive_ports = range(30000, 30050)
        self._handler_cls = _Handler

    # ---------- lifecycle ----------
    def start(self) -> None:
        if self._server is not None:
            return
        self._server = ThreadedFTPServer((self.host, self.port), self._handler_cls)
        self._server.max_cons = 64
        self._thread = threading.Thread(
            target=self._server.serve_forever,
            name="backup-ftp",
            daemon=True,
        )
        self._thread.start()
        logger.info("Backup FTP server started on {}:{}", self.host, self.port)

    def stop(self) -> None:
        if self._server is None:
            return
        try:
            self._server.close_all()
        except Exception:  # pragma: no cover
            pass
        self._server = None
        self._thread = None
        try:
            shutil.rmtree(self._root_tmp, ignore_errors=True)
        except Exception:  # pragma: no cover
            pass
        logger.info("Backup FTP server stopped")

    # ---------- sessions ----------
    def open_session(self, expected_files: Iterable[str]) -> _Session:
        """Создаёт уникального пользователя и личный каталог."""
        with self._lock:
            sid = secrets.token_hex(8)
            user = f"mb_{sid}"
            password = secrets.token_urlsafe(18)
            home = os.path.join(self._root_tmp, sid)
            os.makedirs(home, exist_ok=True)
            self._authorizer.add_user(user, password, home, perm="elradfmw")
            sess = _Session(
                session_id=sid,
                username=user,
                password=password,
                home_dir=home,
                expected=set(expected_files),
            )
            self._sessions[sid] = sess
            self._sessions_by_user[user] = sess
            logger.info("FTP backup session opened: sid={} user={} expected={}",
                        sid, user, sess.expected)
            return sess

    def close_session(self, session_id: str) -> None:
        with self._lock:
            sess = self._sessions.pop(session_id, None)
            if sess is None:
                return
            self._sessions_by_user.pop(sess.username, None)
            try:
                self._authorizer.remove_user(sess.username)
            except Exception:  # pragma: no cover
                pass
            try:
                shutil.rmtree(sess.home_dir, ignore_errors=True)
            except Exception:  # pragma: no cover
                pass
            logger.info("FTP backup session closed: sid={}", session_id)

    def _mark_received(self, username: str, name: str, abs_path: str) -> None:
        with self._lock:
            sess = self._sessions_by_user.get(username)
            if sess is None:
                logger.warning("FTP upload from unknown user: {} ({})", username, name)
                return
            sess.received[name] = abs_path
            logger.info("FTP backup file received: sid={} name={} size={}b",
                        sess.session_id, name, os.path.getsize(abs_path))

    def wait_files(self, session_id: str, timeout: float = 60.0) -> dict[str, bytes]:
        """Ожидает поступления всех expected-файлов и возвращает их содержимое."""
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            with self._lock:
                sess = self._sessions.get(session_id)
                if sess is None:
                    raise RuntimeError(f"session {session_id} not found")
                missing = sess.expected - set(sess.received.keys())
                if not missing:
                    out: dict[str, bytes] = {}
                    for name, path in sess.received.items():
                        with open(path, "rb") as f:
                            out[name] = f.read()
                    return out
            time.sleep(0.3)
        with self._lock:
            sess = self._sessions.get(session_id)
            missing = sess.expected - set(sess.received.keys()) if sess else set()
        raise TimeoutError(f"backup files not received: missing={sorted(missing)}")


_INSTANCE: _Server | None = None
_INSTANCE_LOCK = threading.Lock()


def get_server() -> _Server | None:
    return _INSTANCE


def start_server(host: str = "0.0.0.0", port: int = 2121) -> _Server:
    global _INSTANCE
    with _INSTANCE_LOCK:
        if _INSTANCE is None:
            _INSTANCE = _Server(host=host, port=port)
            _INSTANCE.start()
        return _INSTANCE


def stop_server() -> None:
    global _INSTANCE
    with _INSTANCE_LOCK:
        if _INSTANCE is not None:
            _INSTANCE.stop()
            _INSTANCE = None


def detect_push_host(default: str | None = None) -> str:
    """Подсказка: IP контроллера, как его видят устройства.
    Берётся через udp-сокет к 8.8.8.8 (соединение не открывается).
    Используется fallback, если в ENV не задан BACKUP_PUSH_HOST.
    """
    if default:
        return default
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.3)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "0.0.0.0"
