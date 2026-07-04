"""Maps DART's raw fnlttSinglAcntAll line items onto the normalized fields
DealScreener's scoring engine needs.

DART returns items with both a standardized IFRS taxonomy `account_id`
(reliable but not always populated) and a free-text Korean `account_nm`
(always present but varies by company/GAAP mapping). We match on
`account_id` first and fall back to a Korean substring match on
`account_nm`. Any field we can't find stays `None` -- callers must treat
missing fields as "insufficient data" rather than guessing.
"""

# account_id -> normalized field name
ACCOUNT_ID_MAP: dict[str, str] = {
    "ifrs-full_Liabilities": "total_liabilities",
    "ifrs-full_Equity": "total_equity",
    "ifrs-full_EquityAttributableToOwnersOfParent": "total_equity",
    "ifrs-full_Revenue": "revenue",
    "dart_OperatingIncomeLoss": "operating_income",
    "ifrs-full_TradeAndOtherCurrentReceivables": "receivables",
    "ifrs-full_Inventories": "inventories",
    "ifrs-full_CashFlowsFromUsedInOperatingActivities": "cfo",
}

# Korean substring fallback, checked in order (first match wins) when
# account_id is missing/unmapped. Keys are normalized field names.
ACCOUNT_NAME_FALLBACK: dict[str, list[str]] = {
    "total_liabilities": ["부채총계"],
    "total_equity": ["자본총계"],
    "revenue": ["매출액", "수익(매출액)", "영업수익"],
    "operating_income": ["영업이익"],
    "receivables": ["매출채권"],
    "inventories": ["재고자산"],
    "cfo": ["영업활동현금흐름", "영업활동으로인한현금흐름"],
}

NORMALIZED_FIELDS = list(ACCOUNT_NAME_FALLBACK.keys())


def _to_float(raw: str | None) -> float | None:
    if raw is None:
        return None
    raw = raw.strip().replace(",", "")
    if raw in ("", "-"):
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def parse_year(items: list[dict]) -> dict[str, float | None]:
    """Reduce one year's worth of raw DART line items to normalized fields."""
    result: dict[str, float | None] = {field: None for field in NORMALIZED_FIELDS}

    # Pass 1: account_id (reliable, unambiguous)
    for item in items:
        field = ACCOUNT_ID_MAP.get(item.get("account_id", ""))
        if field and result[field] is None:
            result[field] = _to_float(item.get("thstrm_amount"))

    # Pass 2: Korean name fallback for anything still missing
    remaining = {field for field, val in result.items() if val is None}
    if remaining:
        for item in items:
            name = item.get("account_nm", "").replace(" ", "")
            for field in list(remaining):
                if any(alias in name for alias in ACCOUNT_NAME_FALLBACK[field]):
                    result[field] = _to_float(item.get("thstrm_amount"))
                    remaining.discard(field)
            if not remaining:
                break

    return result
