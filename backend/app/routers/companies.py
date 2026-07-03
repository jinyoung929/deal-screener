from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Company
from app.serializers import company_to_dict

router = APIRouter(prefix="/api/companies", tags=["companies"])


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
