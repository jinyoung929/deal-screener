"""Company news screening via Google News RSS (no API key required).

Used by the 기사분석 tab: for each risk category (소송, 지급보증,
약정사항, 특수관계자) we run a "{company name} {keyword}" news search,
keep articles from the last 6 months, and return title/source/date/link
so every item is verifiable at its source. Results are cached in-process
for an hour -- news doesn't change fast enough to justify hitting the
RSS endpoint on every tab click, and it keeps us polite to Google.
"""

import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

import httpx

RSS_URL = "https://news.google.com/rss/search"

CATEGORIES: dict[str, str] = {
    "소송": "소송",
    "지급보증": "지급보증",
    "약정사항": "약정",
    "특수관계자": "특수관계자",
}

LOOKBACK = timedelta(days=183)  # ~6 months
MAX_PER_CATEGORY = 8
CACHE_TTL_SECONDS = 3600

_cache: dict[str, tuple[float, list[dict]]] = {}


def _clean_company_name(name: str) -> str:
    """DART corp names often carry a (주) suffix/prefix that hurts news
    search relevance -- '삼성전자(주)' finds less than '삼성전자'."""
    return name.replace("(주)", "").replace("주식회사", "").strip()


def _fetch_category(company_name: str, keyword: str) -> list[dict]:
    cache_key = f"{company_name}:{keyword}"
    now = time.time()
    cached = _cache.get(cache_key)
    if cached and now - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]

    params = {"q": f'"{company_name}" {keyword}', "hl": "ko", "gl": "KR", "ceid": "KR:ko"}
    resp = httpx.get(RSS_URL, params=params, timeout=15, follow_redirects=True)
    resp.raise_for_status()

    root = ET.fromstring(resp.text)
    cutoff = datetime.now(timezone.utc) - LOOKBACK
    articles: list[dict] = []
    for item in root.iter("item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        pub_raw = item.findtext("pubDate")
        source = (item.findtext("source") or "").strip()
        if not title or not link:
            continue
        try:
            published = parsedate_to_datetime(pub_raw) if pub_raw else None
        except (TypeError, ValueError):
            published = None
        if published is not None and published < cutoff:
            continue
        articles.append({
            "title": title,
            "link": link,
            "source": source or None,
            "publishedAt": published.date().isoformat() if published else None,
        })
        if len(articles) >= MAX_PER_CATEGORY:
            break

    _cache[cache_key] = (now, articles)
    return articles


def fetch_company_news(company_name: str) -> dict[str, list[dict]]:
    """Returns {category: [articles]} for all four risk categories. A
    category that errors comes back empty rather than failing the whole
    response -- the tab should degrade gracefully."""
    name = _clean_company_name(company_name)
    out: dict[str, list[dict]] = {}
    for category, keyword in CATEGORIES.items():
        try:
            out[category] = _fetch_category(name, keyword)
        except Exception:
            out[category] = []
    return out
