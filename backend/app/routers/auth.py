from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.auth import SESSION_COOKIE, create_session_token, get_current_user_optional, oauth
from app.database import get_db
from app.models import User

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/google/login")
async def google_login(request: Request):
    redirect_uri = request.url_for("google_callback")
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/google/callback")
async def google_callback(request: Request, db: Session = Depends(get_db)):
    token = await oauth.google.authorize_access_token(request)
    userinfo = token.get("userinfo") or {}
    sub, email, name = userinfo.get("sub"), userinfo.get("email"), userinfo.get("name")

    user = db.query(User).filter(User.google_sub == sub).one_or_none()
    if user is None:
        user = User(google_sub=sub, email=email, name=name)
        db.add(user)
    else:
        user.email, user.name = email, name
    db.commit()
    db.refresh(user)

    session_token = create_session_token(user)
    response = RedirectResponse(url="/")
    response.set_cookie(SESSION_COOKIE, session_token, httponly=True, samesite="lax", max_age=60 * 60 * 24 * 14)
    return response


@router.post("/logout")
async def logout():
    response = RedirectResponse(url="/", status_code=303)
    response.delete_cookie(SESSION_COOKIE)
    return response


@router.get("/me")
async def me(user: User | None = Depends(get_current_user_optional)):
    if user is None:
        return None
    return {"id": user.id, "email": user.email, "name": user.name}
