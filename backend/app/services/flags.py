"""Rule-based red-flag detection over two consecutive years of parsed DART
metrics. Every flag's `basis` string is built only from numbers actually
computed here -- this replaces the old prototype's fabricated "quote from
the filing" with a real, reproducible calculation."""

from dataclasses import dataclass


@dataclass
class DetectedFlag:
    tag: str
    severity: str  # high | medium | low
    basis: str


def _pct_change(curr: float | None, prev: float | None) -> float | None:
    if curr is None or prev is None or not prev:
        return None
    return (curr - prev) / abs(prev) * 100


def _eok(won: float) -> str:
    """DART amounts are raw KRW won; render in 억원 (100M KRW), matching the
    unit convention the rest of the UI already uses."""
    return f"{won / 1e8:,.0f}억원"


def detect_flags(curr: dict, prev: dict, curr_debt_ratio: float | None, prev_debt_ratio: float | None) -> list[DetectedFlag]:
    flags: list[DetectedFlag] = []

    # Negative equity makes 부채비율(부채/자본) mathematically nonsensical
    # (e.g. -4912%) rather than just "high" -- surface it as its own flag
    # (완전자본잠식) instead of letting it corrupt the debt-ratio-jump check
    # below.
    curr_equity, prev_equity = curr.get("total_equity"), prev.get("total_equity")
    if curr_equity is not None and curr_equity < 0:
        flags.append(DetectedFlag(
            tag="완전자본잠식",
            severity="high",
            basis=f"당기 자본총계 {_eok(curr_equity)}으로 자본잠식 상태" + (
                f" (전기 {_eok(prev_equity)})" if prev_equity is not None else ""
            ),
        ))

    revenue_growth = _pct_change(curr.get("revenue"), prev.get("revenue"))
    receivables_growth = _pct_change(curr.get("receivables"), prev.get("receivables"))
    if revenue_growth is not None and receivables_growth is not None and receivables_growth - revenue_growth > 15:
        flags.append(DetectedFlag(
            tag="매출채권 급증",
            severity="high" if receivables_growth - revenue_growth > 30 else "medium",
            basis=f"매출채권 {receivables_growth:+.1f}% vs 매출 {revenue_growth:+.1f}% (매출증가율 대비 {receivables_growth - revenue_growth:.1f}%p 초과 증가)",
        ))

    op_income_growth = _pct_change(curr.get("operating_income"), prev.get("operating_income"))
    if curr.get("operating_income") is not None and curr["operating_income"] < 0:
        flags.append(DetectedFlag(
            tag="영업손실 전환" if (prev.get("operating_income") or 0) >= 0 else "영업이익 급감",
            severity="high",
            basis=f"당기 영업손실 {_eok(curr['operating_income'])}" + (
                f" (전기 {_eok(prev['operating_income'])} 대비 악화)" if prev.get("operating_income") is not None else ""
            ),
        ))
    elif op_income_growth is not None and op_income_growth < -30:
        flags.append(DetectedFlag(
            tag="영업이익 급감",
            severity="high",
            basis=f"영업이익 전기 대비 {op_income_growth:.1f}% 감소",
        ))

    equity_positive_both_years = curr_equity is not None and curr_equity > 0 and prev_equity is not None and prev_equity > 0
    if equity_positive_both_years and curr_debt_ratio is not None and prev_debt_ratio is not None and curr_debt_ratio - prev_debt_ratio > 20:
        flags.append(DetectedFlag(
            tag="부채비율 상승",
            severity="high" if curr_debt_ratio > 200 else "medium",
            basis=f"부채비율 {prev_debt_ratio:.0f}% → {curr_debt_ratio:.0f}% ({curr_debt_ratio - prev_debt_ratio:+.1f}%p)",
        ))

    inventories_growth = _pct_change(curr.get("inventories"), prev.get("inventories"))
    if inventories_growth is not None and inventories_growth > 30:
        flags.append(DetectedFlag(
            tag="재고자산 이상증가",
            severity="medium",
            basis=f"재고자산 전기 대비 {inventories_growth:.1f}% 증가",
        ))

    cfo_curr, cfo_prev = curr.get("cfo"), prev.get("cfo")
    if cfo_curr is not None and cfo_curr < 0 and (cfo_prev is None or cfo_prev >= 0):
        flags.append(DetectedFlag(
            tag="현금흐름 악화",
            severity="high",
            basis=f"영업활동현금흐름 {_eok(cfo_curr)}으로 유출 전환" + (
                f" (전기 {_eok(cfo_prev)} 유입)" if cfo_prev is not None else ""
            ),
        ))

    return flags
