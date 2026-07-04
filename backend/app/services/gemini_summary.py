"""Turns a rule-detected flag's raw `basis` numbers into a natural Korean
sentence via Gemini. The prompt explicitly forbids introducing any figure
that isn't already in `basis` -- this is summarization/phrasing only, never
a source of new "facts". If no GEMINI_API_KEY is configured, falls back to
a plain deterministic sentence built from the same basis string so /api/sync
still works end-to-end without the key."""

import google.generativeai as genai

from app.config import get_settings

_PROMPT_TEMPLATE = """당신은 회계법인 딜본부의 재무 스크리닝 보조 도구입니다.
아래 "산출 근거"에 있는 수치와 계산 과정을 바탕으로, 실무자가 바로 이해할 수 있는
한국어 요약을 2~3문장으로 작성하세요.

구성:
1. 무엇이 감지되었는지 (핵심 수치 포함)
2. 이 수치가 왜 위험 신호로 분류되는지 (산출 근거에 명시된 기준/맥락 활용)

규칙:
- 산출 근거에 없는 숫자나 사실을 새로 만들어내지 마세요.
- 산출 근거에 이미 적힌 점검 포인트 외의 추측성 원인 분석은 덧붙이지 마세요.
- 산출 근거를 그대로 복사하지 말고, 문장으로 풀어서 서술하세요.
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
        model = genai.GenerativeModel("gemini-3.5-flash")
        response = model.generate_content(_PROMPT_TEMPLATE.format(tag=tag, basis=basis))
        text = (response.text or "").strip()
        return text or _template_fallback(tag, basis)
    except Exception:
        # Never let an LLM/network hiccup break the sync job.
        return _template_fallback(tag, basis)
