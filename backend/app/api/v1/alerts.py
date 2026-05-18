from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from ...core.db import get_db
from ...models.alert import Alert
from ...models.user import User
from ...schemas.alert import AlertOut
from ..deps import get_current_user, require_role

router = APIRouter()


@router.get("", response_model=list[AlertOut])
def list_alerts(
    only_unack: bool = False,
    limit: int = 200,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[Alert]:
    q = db.query(Alert)
    if only_unack:
        q = q.filter(Alert.acknowledged.is_(False))
    return q.order_by(Alert.created_at.desc()).limit(limit).all()


@router.get("/unread-count")
def unread_count(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict[str, int]:
    n = db.query(Alert).filter(Alert.acknowledged.is_(False)).count()
    return {"count": n}


@router.post("/{alert_id}/ack", response_model=AlertOut)
def acknowledge(
    alert_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Alert:
    a = db.get(Alert, alert_id)
    if not a:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "alert not found")
    a.acknowledged = True
    db.commit()
    db.refresh(a)
    return a


@router.post("/ack-all")
def acknowledge_all(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict[str, int]:
    n = db.query(Alert).filter(Alert.acknowledged.is_(False)).update({"acknowledged": True})
    db.commit()
    return {"updated": n}


@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_alert(
    alert_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin")),
) -> Response:
    a = db.get(Alert, alert_id)
    if not a:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "alert not found")
    db.delete(a)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("")
def purge_alerts(
    only_acked: bool = False,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin")),
) -> dict:
    """Очистить лог алертов. По умолчанию удаляет всё; only_acked=true — только прочитанные."""
    q = db.query(Alert)
    if only_acked:
        q = q.filter(Alert.acknowledged == True)  # noqa: E712
    n = q.delete(synchronize_session=False)
    db.commit()
    return {"deleted": int(n or 0)}
