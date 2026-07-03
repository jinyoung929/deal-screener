from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Alert, User

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


class AlertCreate(BaseModel):
    type: str
    target: str
    threshold: float | None = None
    channel: str


def _to_dict(a: Alert) -> dict:
    return {
        "id": a.id,
        "type": a.type,
        "target": a.target,
        "threshold": a.threshold,
        "channel": a.channel,
        "active": a.active,
    }


@router.get("")
def list_alerts(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(Alert).filter(Alert.user_id == user.id).all()
    return [_to_dict(a) for a in rows]


@router.post("")
def create_alert(body: AlertCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    alert = Alert(user_id=user.id, type=body.type, target=body.target, threshold=body.threshold, channel=body.channel)
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return _to_dict(alert)


@router.patch("/{alert_id}/toggle")
def toggle_alert(alert_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    alert = db.query(Alert).filter(Alert.id == alert_id, Alert.user_id == user.id).one_or_none()
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.active = not alert.active
    db.commit()
    return _to_dict(alert)


@router.delete("/{alert_id}")
def delete_alert(alert_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    alert = db.query(Alert).filter(Alert.id == alert_id, Alert.user_id == user.id).one_or_none()
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    db.delete(alert)
    db.commit()
    return {"status": "ok"}
