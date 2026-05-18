from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class DeviceBase(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    host: str
    port: int = 8729
    use_tls: bool = True
    username: str
    kind: str = "router"


class DeviceCreate(DeviceBase):
    password: str


class DeviceUpdate(BaseModel):
    name: str | None = None
    host: str | None = None
    port: int | None = None
    use_tls: bool | None = None
    username: str | None = None
    password: str | None = None
    kind: str | None = None
    monitored_interfaces: str | None = None
    uplink_interfaces: str | None = None
    interface_history_hours: int | None = None


class DeviceOut(DeviceBase):
    id: int
    identity: str | None = None
    model: str | None = None
    serial: str | None = None
    ros_version: str | None = None
    architecture: str | None = None
    status: str
    last_error: str | None = None
    last_seen: datetime | None = None
    internet_ok: bool | None = None
    last_uptime_seconds: int | None = None
    abnormal_reboot: bool = False
    last_log_warning: str | None = None
    monitored_interfaces: str | None = None
    uplink_interfaces: str | None = None
    interface_history_hours: int = 24
    created_at: datetime

    class Config:
        from_attributes = True


class DeviceResource(BaseModel):
    """Срез `/system/resource`."""
    cpu_load: int | None = None
    free_memory: int | None = None
    total_memory: int | None = None
    uptime: str | None = None
    version: str | None = None
    board_name: str | None = None
    architecture_name: str | None = None
