from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, HttpUrl


class FirmwareImportIn(BaseModel):
    url: HttpUrl
    name: str | None = None
    version: str | None = None
    architecture: str | None = None
    channel: str | None = None


class FirmwareBulkImportIn(BaseModel):
    version: str = Field(..., description="Например: 7.16.1")
    channel: str | None = "stable"
    architectures: list[str] = Field(..., min_length=1)


class FirmwareBulkResult(BaseModel):
    architecture: str
    ok: bool
    firmware_id: int | None = None
    error: str | None = None
    skipped: bool = False


class FirmwareBulkOut(BaseModel):
    version: str
    channel: str | None
    results: list[FirmwareBulkResult]


class FirmwareUpdateIn(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    version: str | None = None
    architecture: str | None = None
    channel: str | None = None


class FirmwareOut(BaseModel):
    id: int
    name: str
    version: str | None
    architecture: str | None
    channel: str | None
    size: int
    sha256: str | None
    source_url: str | None
    created_at: datetime

    class Config:
        from_attributes = True
