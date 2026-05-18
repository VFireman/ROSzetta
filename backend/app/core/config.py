from __future__ import annotations

from functools import lru_cache
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "dev"
    secret_key: str = "dev-secret-change-me"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 14

    database_url: str = (
        "postgresql+psycopg2://ROSzetta:ROSzetta@postgres:5432/ROSzetta"
    )
    redis_url: str = "redis://redis:6379/0"

    s3_endpoint: str = "http://minio:9000"
    s3_access_key: str = "minio"
    s3_secret_key: str = "minio12345"
    s3_bucket: str = "roszetta-backups"

    bootstrap_admin_email: str = "admin"
    bootstrap_admin_password: str = "admin"

    cors_origins: str = "http://localhost:5173"

    # sprint 06: периодические задачи
    firmware_check_interval_hours: int = 24
    device_probe_interval_minutes: int = 5

    # sprint 08: push-доставка бэкапов
    backup_ftp_host: str = "0.0.0.0"
    backup_ftp_port: int = 2121
    backup_push_host: str = ""  # пусто → автоопределение detect_push_host()

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
