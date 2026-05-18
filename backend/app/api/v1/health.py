from fastapi import APIRouter

APP_NAME = "ROSzetta"
APP_VERSION = "0.7.0"

router = APIRouter()


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/version")
def version() -> dict[str, str]:
    return {"name": APP_NAME, "version": APP_VERSION}
