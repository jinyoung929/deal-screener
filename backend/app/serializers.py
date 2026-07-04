"""Serializes ORM rows into the exact camelCase shape the frontend's
`Company`/`AiFlag` TypeScript interfaces expect, so the frontend refactor is
close to a drop-in swap from the old hardcoded mock array."""

from app.models import Company


def _score_trend(score: float | None, prev_score: float | None) -> str:
    if score is None or prev_score is None or score == prev_score:
        return "stable"
    return "up" if score > prev_score else "down"


def _filing_date(dart_no: str | None) -> str | None:
    """DART 접수번호 is prefixed with the actual filing date (YYYYMMDD) --
    that's the real disclosure date, unlike updated_at which is merely
    when our sync job last ran."""
    if not dart_no or len(dart_no) < 8 or not dart_no[:8].isdigit():
        return None
    return f"{dart_no[0:4]}-{dart_no[4:6]}-{dart_no[6:8]}"


def _ts_points(rows, field: str) -> list[dict]:
    return [
        {"year": row.year, "value": getattr(row, field)}
        for row in sorted(rows, key=lambda r: r.year)
        if getattr(row, field) is not None
    ]


def company_to_dict(company: Company) -> dict:
    metrics = company.metrics_history
    return {
        "id": company.id,
        "name": company.name,
        "ticker": company.ticker,
        "sector": company.sector,
        "marketCap": company.market_cap,
        "score": company.score,
        "prevScore": company.prev_score,
        "scoreTrend": _score_trend(company.score, company.prev_score),
        "lastDisclosure": _filing_date(company.dart_no),
        "flags": [f.tag for f in company.flags],
        "dartNo": company.dart_no,
        "auditor": company.auditor,
        "fiscalYear": company.fiscal_year,
        "description": company.description or "",
        "revenue": _ts_points(metrics, "revenue"),
        "debtRatio": _ts_points(metrics, "debt_ratio"),
        "opMargin": _ts_points(metrics, "op_margin"),
        "currentRatio": _ts_points(metrics, "current_ratio"),
        "aiFlags": [
            {
                "id": str(f.id),
                "tag": f.tag,
                "severity": f.severity,
                "summary": f.summary,
                "basis": f.basis,
            }
            for f in company.flags
        ],
        "relatedTx": [
            {"date": t.date, "type": t.type, "amount": t.amount, "party": t.party, "desc": t.desc}
            for t in company.related_tx
        ],
        "ownership": [
            {"entity": o.entity, "share": o.share, "type": o.type} for o in company.ownership
        ],
    }
