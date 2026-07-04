import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Company, User
from app.serializers import company_to_dict
from app.services import dart_client, news_client, sync_service

router = APIRouter(prefix="/api/companies", tags=["companies"])

TICKER_RE = re.compile(r"^\d{6}$")


class CompanyCreate(BaseModel):
    ticker: str
    sector: str


@router.get("")
def list_companies(db: Session = Depends(get_db)):
    companies = db.query(Company).order_by(Company.score.desc().nulls_last()).all()
    return [company_to_dict(c) for c in companies]


@router.get("/{company_id}")
def get_company(company_id: int, db: Session = Depends(get_db)):
    company = db.get(Company, company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")
    return company_to_dict(company)


@router.get("/{company_id}/news")
def get_company_news(company_id: int, db: Session = Depends(get_db)):
    """기사분석 tab: last-6-months news screening per risk category
    (소송/지급보증/약정사항/특수관계자), with source links."""
    company = db.get(Company, company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")
    return news_client.fetch_company_news(company.name)


@router.post("")
def add_company(
    body: CompanyCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Adds a company the user chooses (by KRX ticker) to the tracked
    universe and syncs it immediately, rather than waiting for the next
    scheduled /api/sync -- so it shows up with real data right away."""
    ticker = body.ticker.strip()
    if not TICKER_RE.match(ticker):
        raise HTTPException(status_code=400, detail="종목코드는 6자리 숫자여야 합니다")

    existing = db.query(Company).filter(Company.ticker == ticker).one_or_none()
    if existing is not None:
        raise HTTPException(status_code=409, detail="이미 등록된 기업입니다")

    corp_map = dart_client.fetch_corp_code_map({ticker})
    corp_code = corp_map.get(ticker)
    if not corp_code:
        raise HTTPException(status_code=404, detail="DART에서 해당 종목코드를 찾을 수 없습니다")

    name = dart_client.fetch_company_name(corp_code) or ticker

    company = Company(name=name, ticker=ticker, sector=body.sector, corp_code=corp_code)
    db.add(company)
    db.flush()

    result = sync_service.sync_one_now(db, company)
    db.commit()

    if result.get("status") != "ok":
        # Keep the company row (it'll pick up data on the next scheduled
        # sync) but tell the caller the immediate sync didn't succeed.
        return {"company": company_to_dict(company), "sync": result}

    db.refresh(company)
    return {"company": company_to_dict(company), "sync": result}


@router.delete("/{company_id}")
def remove_company(
    company_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    company = db.get(Company, company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")
    db.delete(company)
    db.commit()
    return {"status": "ok"}
