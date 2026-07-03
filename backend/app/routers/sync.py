from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.services.sync_service import sync_all

router = APIRouter(prefix="/api", tags=["sync"])


@router.post("/sync")
def trigger_sync(
    db: Session = Depends(get_db),
    x_sync_token: str | None = Header(default=None),
):
    settings = get_settings()
    if x_sync_token != settings.sync_secret_token:
        raise HTTPException(status_code=401, detail="Invalid sync token")
    return sync_all(db)
