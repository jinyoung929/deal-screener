from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import User, Watchlist

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])


class WatchlistCreate(BaseModel):
    company_id: int


@router.get("")
def list_watchlist(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(Watchlist).filter(Watchlist.user_id == user.id).all()
    return [row.company_id for row in rows]


@router.post("")
def add_watchlist(body: WatchlistCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    existing = (
        db.query(Watchlist)
        .filter(Watchlist.user_id == user.id, Watchlist.company_id == body.company_id)
        .one_or_none()
    )
    if existing is None:
        db.add(Watchlist(user_id=user.id, company_id=body.company_id))
        db.commit()
    return {"status": "ok"}


@router.delete("/{company_id}")
def remove_watchlist(company_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = (
        db.query(Watchlist)
        .filter(Watchlist.user_id == user.id, Watchlist.company_id == company_id)
        .one_or_none()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Not in watchlist")
    db.delete(row)
    db.commit()
    return {"status": "ok"}
