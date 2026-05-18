from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from ...core.db import get_db
from pydantic import BaseModel

from ...core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from ...models.user import User
from ...schemas.auth import LoginIn, RefreshIn, TokenPair, UserOut
from ...services.events import add_audit
from ..deps import get_current_user


class ChangePasswordIn(BaseModel):
    current: str
    new: str

router = APIRouter()


def _issue(user: User) -> TokenPair:
    return TokenPair(
        access_token=create_access_token(user.id, extra={"role": user.role}),
        refresh_token=create_refresh_token(user.id),
    )


def _client_ip(req: Request) -> str | None:
    fwd = req.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return req.client.host if req.client else None


@router.post("/login", response_model=TokenPair)
def login_json(payload: LoginIn, request: Request, db: Session = Depends(get_db)) -> TokenPair:
    user = db.query(User).filter(User.email == payload.email).first()
    ip = _client_ip(request)
    if not user or not verify_password(payload.password, user.hashed_password):
        add_audit(db, actor=payload.email, action="login.fail", ip=ip, detail="invalid credentials")
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid credentials")
    if not user.is_active:
        add_audit(db, actor=payload.email, action="login.fail", ip=ip, detail="user disabled")
        raise HTTPException(status.HTTP_403_FORBIDDEN, "user disabled")
    add_audit(db, actor=user.email, action="login.success", ip=ip)
    return _issue(user)


@router.post("/login/form", response_model=TokenPair, include_in_schema=False)
def login_form(
    request: Request,
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
) -> TokenPair:
    """Совместимость со Swagger «Authorize»."""
    user = db.query(User).filter(User.email == form.username).first()
    ip = _client_ip(request)
    if not user or not verify_password(form.password, user.hashed_password):
        add_audit(db, actor=form.username, action="login.fail", ip=ip, detail="invalid credentials")
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid credentials")
    add_audit(db, actor=user.email, action="login.success", ip=ip)
    return _issue(user)


@router.post("/refresh", response_model=TokenPair)
def refresh(payload: RefreshIn, db: Session = Depends(get_db)) -> TokenPair:
    try:
        data = decode_token(payload.refresh_token)
    except ValueError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from exc
    if data.get("type") != "refresh":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "wrong token type")
    user = db.query(User).filter(User.id == int(data["sub"])).first()
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "user not found")
    return _issue(user)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.post("/change-password")
def change_password(
    payload: ChangePasswordIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    if not verify_password(payload.current, user.hashed_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Текущий пароль неверный")
    if len(payload.new) < 4:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Новый пароль слишком короткий")
    user.hashed_password = hash_password(payload.new)
    db.commit()
    return {"ok": True}
