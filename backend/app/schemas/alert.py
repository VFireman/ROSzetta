from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class AlertOut(BaseModel):
    id: int
    severity: str
    category: str
    source: str | None = None
    title: str
    message: str | None = None
    acknowledged: bool
    created_at: datetime

    class Config:
        from_attributes = True
