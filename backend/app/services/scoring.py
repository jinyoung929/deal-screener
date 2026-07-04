"""Quant risk metrics computed from real DART financial statement data.

Two rules govern this module:
1. Never fabricate a number. If required inputs are missing, return None
   and let the caller show "데이터 부족" rather than guessing.
2. The weighted risk-score formula mirrors the original frontend prototype's
   `computeBreakdown()` (deal-screener frontend App.tsx) so the UI's existing
   "산출 근거" breakdown panel stays meaningful once wired to real data.
"""

from dataclasses import dataclass


def debt_ratio(m: dict) -> float | None:
    if m.get("total_liabilities") is None or not m.get("total_equity"):
        return None
    return round(m["total_liabilities"] / m["total_equity"] * 100, 1)


def op_margin(m: dict) -> float | None:
    if m.get("operating_income") is None or not m.get("revenue"):
        return None
    return round(m["operating_income"] / m["revenue"] * 100, 1)


@dataclass
class BreakdownItem:
    label: str
    desc: str
    weight: float
    risk: int
    value: str


def _clamp(n: float) -> int:
    return max(0, min(100, round(n)))


def compute_breakdown(
    *,
    latest_debt_ratio: float | None,
    latest_op_margin: float | None,
    score_trend: str,  # "up" | "down" | "stable"
    flag_count: int,
) -> list[BreakdownItem]:
    """Weighted risk score from directly-observable ratios and rule-based
    flags only (부채비율, 영업이익률, 스코어 추이, Red Flag 수). Altman
    Z-Score and Beneish M-Score were dropped: both are multi-factor
    composite models with judgment calls baked into their coefficients,
    which is a harder thing to defend/explain than ratios computed
    directly from reported figures."""
    d = latest_debt_ratio if latest_debt_ratio is not None else 100.0
    o = latest_op_margin if latest_op_margin is not None else 5.0

    d_risk = (
        # Negative debt ratio means negative equity (완전자본잠식), the most
        # severe end of leverage risk -- must score as max risk, not fall
        # through to d/3 which would clamp to 0 (minimum risk) for very
        # negative d and read as "safe".
        100 if d < 0
        else 100 if d > 300
        else _clamp(70 + (d - 200) / 10) if d > 200
        else _clamp(30 + (d - 100) / 100 * 40) if d > 100
        else _clamp(d / 3)
    )
    o_risk = (
        _clamp(70 + (-o) * 3) if o < 0
        else _clamp(40 + (5 - o) * 6) if o < 5
        else _clamp(25 - (o - 5) * 2)
    )
    tr_risk = {"up": 80, "stable": 40, "down": 15}.get(score_trend, 40)
    fl_risk = _clamp(flag_count * 22)

    return [
        BreakdownItem("부채비율", "재무레버리지 위험", 40, d_risk, f"{d:.0f}%" if latest_debt_ratio is not None else "데이터 부족"),
        BreakdownItem("영업이익률", "수익성 위험", 30, o_risk, f"{o:.1f}%" if latest_op_margin is not None else "데이터 부족"),
        BreakdownItem("스코어 추이", "위험 방향성", 15, tr_risk, {"up": "상승↑", "down": "하락↓"}.get(score_trend, "유지—")),
        BreakdownItem("Red Flag 수", "공시 이상징후", 15, fl_risk, f"{flag_count}건"),
    ]


def weighted_score(items: list[BreakdownItem]) -> int:
    total = sum(item.risk * item.weight / 100 for item in items)
    return round(total)
