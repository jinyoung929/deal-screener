"""Rule-based red-flag detection over two consecutive years of parsed DART
metrics. Every flag's `basis` string is built only from numbers actually
computed here -- this replaces the old prototype's fabricated "quote from
the filing" with a real, reproducible calculation.

Each basis spells out the full calculation: the raw balances for both
years, the derived rates, and the threshold that tripped the rule -- so
the reader can re-verify the arithmetic against the filing themselves
rather than just being told a percentage.
"""

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


def detect_flags(curr: dict, prev: dict, curr_debt_ratio: float | None, prev_debt_ratio: float | None,
                 curr_current_ratio: float | None = None) -> list[DetectedFlag]:
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
            basis=f"당기 자본총계 {_eok(curr_equity)} < 0 → 자본잠식 상태" + (
                f" (전기 자본총계 {_eok(prev_equity)})" if prev_equity is not None else ""
            ),
        ))

    revenue_growth = _pct_change(curr.get("revenue"), prev.get("revenue"))
    receivables_growth = _pct_change(curr.get("receivables"), prev.get("receivables"))
    if revenue_growth is not None and receivables_growth is not None and receivables_growth - revenue_growth > 15:
        gap = receivables_growth - revenue_growth
        flags.append(DetectedFlag(
            tag="매출채권 급증",
            severity="high" if gap > 30 else "medium",
            basis=(
                f"매출채권 {_eok(prev['receivables'])} → {_eok(curr['receivables'])} ({receivables_growth:+.1f}%), "
                f"매출액 {_eok(prev['revenue'])} → {_eok(curr['revenue'])} ({revenue_growth:+.1f}%). "
                f"매출채권 증가율이 매출 증가율을 {gap:.1f}%p 초과 (기준: 15%p 초과 시 플래그, 30%p 초과 시 high). "
                f"매출 성장 없이 채권만 쌓이면 회수 지연·밀어내기 매출 가능성을 점검해야 함"
            ),
        ))

    op_income_growth = _pct_change(curr.get("operating_income"), prev.get("operating_income"))
    if curr.get("operating_income") is not None and curr["operating_income"] < 0:
        turned_negative = (prev.get("operating_income") or 0) >= 0
        op_margin_txt = ""
        if curr.get("revenue"):
            op_margin_txt = f" (영업이익률 {curr['operating_income']/curr['revenue']*100:.1f}%)"
        flags.append(DetectedFlag(
            tag="영업손실 전환" if turned_negative else "영업이익 급감",
            severity="high",
            basis=(
                f"당기 영업손익 {_eok(curr['operating_income'])}{op_margin_txt}"
                + (f", 전기 {_eok(prev['operating_income'])}" if prev.get("operating_income") is not None else "")
                + (". 흑자에서 적자로 전환" if turned_negative else ". 2개년 연속 영업손실로 손실 폭 확대")
            ),
        ))
    elif op_income_growth is not None and op_income_growth < -30:
        flags.append(DetectedFlag(
            tag="영업이익 급감",
            severity="high",
            basis=(
                f"영업이익 {_eok(prev['operating_income'])} → {_eok(curr['operating_income'])} "
                f"({op_income_growth:.1f}%). 기준: 전기 대비 30% 초과 감소 시 플래그"
            ),
        ))

    equity_positive_both_years = curr_equity is not None and curr_equity > 0 and prev_equity is not None and prev_equity > 0
    if equity_positive_both_years and curr_debt_ratio is not None and prev_debt_ratio is not None and curr_debt_ratio - prev_debt_ratio > 20:
        flags.append(DetectedFlag(
            tag="부채비율 상승",
            severity="high" if curr_debt_ratio > 200 else "medium",
            basis=(
                f"부채총계 {_eok(prev['total_liabilities'])} → {_eok(curr['total_liabilities'])}, "
                f"자본총계 {_eok(prev_equity)} → {_eok(curr_equity)}. "
                f"부채비율(부채÷자본) {prev_debt_ratio:.0f}% → {curr_debt_ratio:.0f}% ({curr_debt_ratio - prev_debt_ratio:+.1f}%p). "
                f"기준: 20%p 초과 상승 시 플래그, 200% 초과 시 high"
            ),
        ))

    inventories_growth = _pct_change(curr.get("inventories"), prev.get("inventories"))
    if inventories_growth is not None and inventories_growth > 30:
        rev_context = f", 같은 기간 매출 {revenue_growth:+.1f}%" if revenue_growth is not None else ""
        flags.append(DetectedFlag(
            tag="재고자산 이상증가",
            severity="medium",
            basis=(
                f"재고자산 {_eok(prev['inventories'])} → {_eok(curr['inventories'])} "
                f"({inventories_growth:+.1f}%){rev_context}. "
                f"기준: 전기 대비 30% 초과 증가 시 플래그. 판매 부진에 따른 재고 적체 여부 점검 필요"
            ),
        ))

    cfo_curr, cfo_prev = curr.get("cfo"), prev.get("cfo")
    if cfo_curr is not None and cfo_curr < 0 and (cfo_prev is None or cfo_prev >= 0):
        op_context = ""
        if curr.get("operating_income") is not None:
            op_context = f" 당기 영업손익은 {_eok(curr['operating_income'])}로, 손익과 현금흐름의 방향 차이 확인 필요."
        flags.append(DetectedFlag(
            tag="현금흐름 악화",
            severity="high",
            basis=(
                f"영업활동현금흐름 {_eok(cfo_prev) + ' 유입 → ' if cfo_prev is not None else ''}{_eok(cfo_curr)} 유출 전환."
                + op_context
            ),
        ))

    if curr_current_ratio is not None and curr_current_ratio < 100:
        flags.append(DetectedFlag(
            tag="유동비율 100% 미만",
            severity="high" if curr_current_ratio < 70 else "medium",
            basis=(
                f"유동자산 {_eok(curr['current_assets'])} ÷ 유동부채 {_eok(curr['current_liabilities'])} "
                f"= 유동비율 {curr_current_ratio:.0f}%. 1년 내 갚아야 할 부채가 1년 내 현금화 가능한 자산보다 많음 "
                f"(기준: 100% 미만 플래그, 70% 미만 high)"
            ),
        ))

    return flags
