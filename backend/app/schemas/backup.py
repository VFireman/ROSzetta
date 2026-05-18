from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class BackupOut(BaseModel):
    id: int
    device_id: int
    filename: str
    fmt: str
    size: int
    created_at: datetime

    class Config:
        from_attributes = True
