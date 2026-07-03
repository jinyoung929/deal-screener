"""Turns a rule-detected flag's raw `basis` numbers into a natural Korean
sentence via Gemini. The prompt explicitly forbids introducing any figure
that isn't already in `basis` -- this is summarization/phrasing only, never
a source of new "facts". If no GEMINI_API_KEY is configured, falls back to
a plain deterministic sentence built from the same basis string so /api/sync
still works end-to-end without the key."""

import google.generativeai as genai

from app.config import get_settings

_PROMPT_TEMPLATE = """당신은 회계법인 딜본부의 재무 스크리닝 보조 도구입니다.
아래 "산출 근거"에 있는 숫자만 사용해서, 실무자가 한눈에 이해할 수 있는
한국어 요약 문장 1~2개를 작성하세요.

규칙:
- 산출 근거에 없는 숫자나 사실을 새로 만들어내지 마세요.
- 추측이나 원인 분석을 덧붙이지 말고, 감지된 현상만 담백하게 서술하세요.
- 문장만 출력하고 다른 설명은 하지 마세요.

Red Flag 태그: {tag}
산출 근거: {basis}
"""


def _template_fallback(tag: str, basis: str) -> str:
    return f"{tag}: {basis}"


def summarize_flag(tag: str, basis: str) -> str:
    settings = get_settings()
    if not settings.gemini_api_key:
        return _template_fallback(tag, basis)

    try:
        genai.configure(api_key=settings.gemini_api_key)
        model = genai.GenerativeModel("gemini-2.0-flash")
        response = model.generate_content(_PROMPT_TEMPLATE.format(tag=tag, basis=basis))
        text = (response.text or "").strip()
        return text or _template_fallback(tag, basis)
    except Exception:
        # Never let an LLM/network hiccup break the sync job.
        return _template_fallback(tag, basis)
