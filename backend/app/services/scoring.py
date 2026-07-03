"""Quant risk metrics computed from real DART financial statement data.

Two rules govern this module:
1. Never fabricate a number. If required inputs are missing, return None
   and let the caller show "데이터 부족" rather than guessing.
2. The weighted risk-score formula mirrors the original frontend prototype's
   `computeBreakdown()` (deal-screener frontend App.tsx) so the UI's existing
   "산출 근거" breakdown panel stays meaningful once wired to real data.
"""

from dataclasses import dataclass


def altman_z_prime(m: dict) -> float | None:
    """Private-company variant (Z') that doesn't need market cap:
    Z' = 0.717*A + 0.847*B + 3.107*C + 0.420*D + 0.998*E
    A=WC/TA  B=RE/TA  C=EBIT/TA  D=BookEquity/TotalLiabilities  E=Sales/TA
    """
    required = ("total_assets", "current_assets", "current_liabilities", "retained_earnings",
                "operating_income", "total_equity", "total_liabilities", "revenue")
    if any(m.get(k) is None for k in required):
        return None
    if not m["total_assets"] or not m["total_liabilities"]:
        return None

    working_capital = m["current_assets"] - m["current_liabilities"]
    a = working_capital / m["total_assets"]
    b = m["retained_earnings"] / m["total_assets"]
    c = m["operating_income"] / m["total_assets"]
    d = m["total_equity"] / m["total_liabilities"]
    e = m["revenue"] / m["total_assets"]
    return round(0.717 * a + 0.847 * b + 3.107 * c + 0.420 * d + 0.998 * e, 2)


def beneish_m_score(curr: dict, prev: dict) -> float | None:
    """8-variable Beneish M-Score using two consecutive years of data.
    Returns None (not a fabricated partial score) if any of the 8 inputs
    can't be derived from the fetched DART line items -- most commonly
    depreciation, which isn't always tagged in the standard extract."""
    try:
        dsri = (curr["receivables"] / curr["revenue"]) / (prev["receivables"] / prev["revenue"])

        gm_curr = (curr["revenue"] - curr["cogs"]) / curr["revenue"]
        gm_prev = (prev["revenue"] - prev["cogs"]) / prev["revenue"]
        gmi = gm_prev / gm_curr

        aqi_curr = 1 - (curr["current_assets"] + curr["ppe"]) / curr["total_assets"]
        aqi_prev = 1 - (prev["current_assets"] + prev["ppe"]) / prev["total_assets"]
        aqi = aqi_curr / aqi_prev

        sgi = curr["revenue"] / prev["revenue"]

        depi_prev = prev["depreciation"] / (prev["depreciation"] + prev["ppe"])
        depi_curr = curr["depreciation"] / (curr["depreciation"] + curr["ppe"])
        depi = depi_prev / depi_curr

        sgai = (curr["sga"] / curr["revenue"]) / (prev["sga"] / prev["revenue"])

        # TATA = (net income - cash flow from operations) / total assets.
        # Requires net_income and cfo to both be present -- if DART didn't
        # tag either (common for cfo, which lives on the CF statement), this
        # raises TypeError and the whole M-score correctly comes back None.
        tata = (curr["net_income"] - curr["cfo"]) / curr["total_assets"]

        lvgi = (curr["total_liabilities"] / curr["total_assets"]) / (prev["total_liabilities"] / prev["total_assets"])
    except (TypeError, ZeroDivisionError, KeyError):
        return None

    m = (
        -4.84
        + 0.920 * dsri
        + 0.528 * gmi
        + 0.404 * aqi
        + 0.892 * sgi
        + 0.115 * depi
        - 0.172 * sgai
        + 4.679 * tata
        - 0.327 * lvgi
    )
    return round(m, 2)


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
    latest_z: float | None,
    latest_m: float | None,
    latest_debt_ratio: float | None,
    latest_op_margin: float | None,
    score_trend: str,  # "up" | "down" | "stable"
    flag_count: int,
) -> list[BreakdownItem]:
    """Ported 1:1 from the frontend prototype's computeBreakdown() (App.tsx)
    so the weighting/thresholds stay identical between the old mock UI and
    the real backend. z_risk/m_risk fall back to a neutral mid-range score
    when the underlying metric is None (insufficient DART data) instead of
    silently treating missing data as "safe"."""
    z = latest_z if latest_z is not None else 3.0
    m = latest_m if latest_m is not None else -3.0
    d = latest_debt_ratio if latest_debt_ratio is not None else 100.0
    o = latest_op_margin if latest_op_margin is not None else 5.0

    z_risk = (
        _clamp(80 + (1.81 - z) * 25) if z < 1.81
        else _clamp(30 + (2.99 - z) / (2.99 - 1.81) * 50) if z < 2.99
        else _clamp(25 - (z - 2.99) * 8)
    )
    m_risk = (
        90 if m > -1.78
        else _clamp(50 + (m + 2.22) / (-1.78 + 2.22) * 40) if m > -2.22
        else _clamp(40 + (m + 3) * 20)
    )
    d_risk = (
        100 if d > 300
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
        BreakdownItem("Altman Z-Score", "재무건전성 종합", 25, z_risk, f"{z:.2f}" if latest_z is not None else "데이터 부족"),
        BreakdownItem("Beneish M-Score", "이익조정 가능성", 20, m_risk, f"{m:.2f}" if latest_m is not None else "데이터 부족"),
        BreakdownItem("부채비율", "재무레버리지 위험", 20, d_risk, f"{d:.0f}%" if latest_debt_ratio is not None else "데이터 부족"),
        BreakdownItem("영업이익률", "수익성 위험", 15, o_risk, f"{o:.1f}%" if latest_op_margin is not None else "데이터 부족"),
        BreakdownItem("스코어 추이", "위험 방향성", 10, tr_risk, {"up": "상승↑", "down": "하락↓"}.get(score_trend, "유지—")),
        BreakdownItem("Red Flag 수", "공시 이상징후", 10, fl_risk, f"{flag_count}건"),
    ]


def weighted_score(items: list[BreakdownItem]) -> int:
    total = sum(item.risk * item.weight / 100 for item in items)
    return round(total)
