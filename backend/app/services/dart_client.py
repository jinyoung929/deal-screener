"""Thin client around DART Open API (opendart.fss.or.kr).

Only the two endpoints DealScreener needs:
- corpCode.xml: one-time ticker -> corp_code mapping (zipped XML)
- fnlttSinglAcntAll.json: standard financial statement line items for a
  company/year, used to compute the quant risk metrics.
"""

import io
import xml.etree.ElementTree as ET
import zipfile

import httpx

from app.config import get_settings

BASE_URL = "https://opendart.fss.or.kr/api"

# reprt_code=11011 -> annual business report (사업보고서)
ANNUAL_REPORT_CODE = "11011"


class DartApiError(RuntimeError):
    pass


def _api_key() -> str:
    key = get_settings().dart_api_key
    if not key:
        raise DartApiError("DART_API_KEY is not configured")
    return key


def fetch_corp_code_map(tickers: set[str]) -> dict[str, str]:
    """Download the full corp_code registry once and return ticker -> corp_code
    for just the tickers we care about."""
    resp = httpx.get(f"{BASE_URL}/corpCode.xml", params={"crtfc_key": _api_key()}, timeout=30)
    resp.raise_for_status()
    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        xml_bytes = zf.read("CORPCODE.xml")

    root = ET.fromstring(xml_bytes)
    result: dict[str, str] = {}
    for node in root.findall("list"):
        stock_code = (node.findtext("stock_code") or "").strip()
        if stock_code in tickers:
            result[stock_code] = (node.findtext("corp_code") or "").strip()
    return result


def fetch_company_name(corp_code: str) -> str | None:
    """company.json (기업개황) -- used to get the real company name when a
    user adds a new ticker, so we never ask them to type it themselves."""
    resp = httpx.get(f"{BASE_URL}/company.json", params={"crtfc_key": _api_key(), "corp_code": corp_code}, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    if data.get("status") != "000":
        return None
    return data.get("corp_name")


def fetch_auditor(corp_code: str, bsns_year: str) -> str | None:
    """accnutAdtorNmNdAdtOpinion.json (회계감사인의 명칭 및 감사의견) --
    the auditor's name as disclosed in the annual report."""
    params = {
        "crtfc_key": _api_key(),
        "corp_code": corp_code,
        "bsns_year": bsns_year,
        "reprt_code": ANNUAL_REPORT_CODE,
    }
    resp = httpx.get(f"{BASE_URL}/accnutAdtorNmNdAdtOpinion.json", params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    if data.get("status") != "000":
        return None
    for item in data.get("list", []):
        name = (item.get("adtor") or "").strip()
        if name:
            return name
    return None


def fetch_account_items(corp_code: str, bsns_year: str, fs_div: str = "CFS") -> list[dict]:
    """Fetch one year of standard-account financial statement line items.
    fs_div: CFS(연결) or OFS(별도). Falls back to OFS if CFS has no rows."""
    params = {
        "crtfc_key": _api_key(),
        "corp_code": corp_code,
        "bsns_year": bsns_year,
        "reprt_code": ANNUAL_REPORT_CODE,
        "fs_div": fs_div,
    }
    resp = httpx.get(f"{BASE_URL}/fnlttSinglAcntAll.json", params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    if data.get("status") != "000":
        if fs_div == "CFS":
            return fetch_account_items(corp_code, bsns_year, fs_div="OFS")
        return []

    return data.get("list", [])


def fetch_multi_year_items(corp_code: str, years: list[str]) -> dict[str, list[dict]]:
    """fnlttSinglAcntAll returns 당기/전기/전전기 (3 periods) per call, but we
    call once per requested year for simplicity/predictability and let the
    caller dedupe. `years` should be descending, e.g. ["2024", "2022", "2020"]."""
    out: dict[str, list[dict]] = {}
    for year in years:
        out[year] = fetch_account_items(corp_code, year)
    return out
