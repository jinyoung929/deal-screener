"""Orchestrates one full DART sync run: fetch -> parse -> score -> detect
flags -> summarize -> persist. Triggered by POST /api/sync."""

from datetime import date, datetime

from sqlalchemy.orm import Session

from app.models import Company, Flag, MetricsHistory, ScoreHistory
from app.seed import TRACKED_COMPANIES
from app.services import dart_client, financial_parser, flags as flags_service, gemini_summary, scoring


def _target_years() -> list[str]:
    """Annual reports (사업보고서) for fiscal year Y are typically filed by
    end of March Y+1, so before April we fall back one extra year."""
    today = date.today()
    latest = today.year - 1 if today.month >= 4 else today.year - 2
    return [str(latest), str(latest - 1), str(latest - 2)]


def sync_one_now(db: Session, company: Company) -> dict:
    """Sync a single company immediately (used when a user adds a new
    ticker), rather than waiting for the next scheduled /api/sync run."""
    return sync_company(db, company, _target_years())


def ensure_companies(db: Session) -> list[Company]:
    companies = []
    for spec in TRACKED_COMPANIES:
        company = db.query(Company).filter(Company.ticker == spec["ticker"]).one_or_none()
        if company is None:
            company = Company(name=spec["name"], ticker=spec["ticker"], sector=spec["sector"])
            db.add(company)
            db.flush()
        companies.append(company)
    db.commit()
    return companies


def sync_all(db: Session) -> dict:
    companies = ensure_companies(db)

    missing_corp_code = {c.ticker for c in companies if not c.corp_code}
    if missing_corp_code:
        corp_map = dart_client.fetch_corp_code_map(missing_corp_code)
        for company in companies:
            if company.ticker in corp_map:
                company.corp_code = corp_map[company.ticker]
        db.commit()

    years = _target_years()
    results = []
    for company in companies:
        if not company.corp_code:
            results.append({"ticker": company.ticker, "status": "no_corp_code"})
            continue
        try:
            results.append(sync_company(db, company, years))
        except Exception as exc:  # keep the batch going even if one company fails
            results.append({"ticker": company.ticker, "status": "error", "detail": str(exc)})

    db.commit()
    return {"years": years, "companies": results}


def sync_company(db: Session, company: Company, years: list[str]) -> dict:
    raw_by_year = dart_client.fetch_multi_year_items(company.corp_code, years)
    parsed_by_year = {year: financial_parser.parse_year(items) for year, items in raw_by_year.items() if items}

    if not parsed_by_year:
        return {"ticker": company.ticker, "status": "no_data"}

    available_years = sorted(parsed_by_year.keys(), reverse=True)
    latest_year, prev_year = available_years[0], (available_years[1] if len(available_years) > 1 else None)
    curr_metrics = parsed_by_year[latest_year]
    prev_metrics = parsed_by_year.get(prev_year) if prev_year else None

    # --- persist per-year metrics + compute per-year ratios ---
    existing_rows = {
        row.year: row
        for row in db.query(MetricsHistory).filter(MetricsHistory.company_id == company.id).all()
    }

    year_ratios: dict[str, dict] = {}
    for year, m in parsed_by_year.items():
        d_ratio = scoring.debt_ratio(m)
        o_margin = scoring.op_margin(m)
        year_ratios[year] = {"debt_ratio": d_ratio, "op_margin": o_margin}

        row = existing_rows.get(year)
        if row is None:
            row = MetricsHistory(company_id=company.id, year=year)
            db.add(row)
        # DART reports revenue in raw KRW won; the frontend chart is
        # labeled "매출액 (억원)" (100M-KRW units), so convert here to match
        # -- storing raw won produced 14-digit Y-axis tick labels that
        # rendered as garbled "0000" strings.
        revenue_won = m.get("revenue")
        row.revenue = revenue_won / 1e8 if revenue_won is not None else None
        row.debt_ratio = d_ratio
        row.op_margin = o_margin

    # --- flags (rule-based, only when we have two comparable years) ---
    detected = []
    if prev_metrics:
        detected = flags_service.detect_flags(
            curr_metrics, prev_metrics,
            year_ratios[latest_year]["debt_ratio"],
            year_ratios[prev_year]["debt_ratio"],
        )

    db.query(Flag).filter(Flag.company_id == company.id).delete()
    for f in detected:
        summary = gemini_summary.summarize_flag(f.tag, f.basis)
        db.add(Flag(company_id=company.id, tag=f.tag, severity=f.severity, summary=summary, basis=f.basis))

    # --- weighted risk score ---
    # "trend" feeds into the score itself, so it can't be derived from the
    # score-to-be-computed. Instead we derive it from the underlying
    # fundamentals: did leverage (부채비율) worsen or improve vs the prior
    # year? Falls back to op margin direction if debt ratio is unavailable
    # for either year, and to "stable" if neither is available.
    prior_score = company.score
    d_curr, d_prev = year_ratios[latest_year]["debt_ratio"], year_ratios.get(prev_year, {}).get("debt_ratio")
    o_curr, o_prev = year_ratios[latest_year]["op_margin"], year_ratios.get(prev_year, {}).get("op_margin")
    if d_curr is not None and d_prev is not None:
        trend = "up" if d_curr > d_prev else "down" if d_curr < d_prev else "stable"
    elif o_curr is not None and o_prev is not None:
        trend = "up" if o_curr < o_prev else "down" if o_curr > o_prev else "stable"
    else:
        trend = "stable"

    breakdown = scoring.compute_breakdown(
        latest_debt_ratio=year_ratios[latest_year]["debt_ratio"],
        latest_op_margin=year_ratios[latest_year]["op_margin"],
        score_trend=trend,
        flag_count=len(detected),
    )
    new_score = scoring.weighted_score(breakdown)

    company.prev_score = prior_score if prior_score is not None else new_score
    company.score = new_score
    company.fiscal_year = f"{latest_year}년 사업보고서"
    company.updated_at = datetime.utcnow()
    latest_raw = raw_by_year.get(latest_year) or []
    if latest_raw:
        company.dart_no = latest_raw[0].get("rcept_no") or company.dart_no

    db.add(ScoreHistory(
        company_id=company.id,
        snapshot_date=date.today(),
        score=new_score,
        prev_score=company.prev_score,
    ))

    return {
        "ticker": company.ticker,
        "status": "ok",
        "latest_year": latest_year,
        "score": new_score,
        "flags": len(detected),
    }
