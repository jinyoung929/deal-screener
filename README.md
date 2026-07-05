# DealScreener — DART 공시 기반 M&A 조기경보 스크리닝

> 전자공시(DART) 재무데이터로 상장사의 재무 부실 징후와 잠재 M&A 타겟을 자동 스크리닝하는 웹 애플리케이션.
> 개별 사업보고서를 일일이 읽지 않고도, 수백 개 기업의 위험 신호를 한 화면에서 우선순위화할 수 있도록 설계했습니다.

**🔗 Live Demo:** https://deal-screener.onrender.com

## 화면 이미지

<img width="1433" height="807" alt="스크린샷 2026-07-05 오후 8 21 37" src="https://github.com/user-attachments/assets/962e7901-b3e4-4787-b210-2d0cb8303bac" />


<img width="1440" height="815" alt="스크린샷 2026-07-05 오후 8 21 59" src="https://github.com/user-attachments/assets/009ae685-93f4-489a-a4cf-f8f37f1fe922" />

<img width="1438" height="812" alt="스크린샷 2026-07-05 오후 8 22 29" src="https://github.com/user-attachments/assets/e0922a4c-16b5-4245-b43d-e6b6e067e1a9" />

---

## 1. 문제 정의

M&A 딜 소싱과 타겟 스크리닝은 애널리스트가 사업보고서를 손으로 읽으며 재무 악화 징후를 감으로 잡아내는 방식이라, 물리적으로 한 번에 다룰 수 있는 기업 수가 제한적입니다. DealScreener는 이 과정을 두 단계로 자동화합니다.

1. **정량 스크리닝** — DART에서 실제 재무제표를 가져와 위험 지표를 계산하고 0~100 위험 스코어로 순위화
2. **정성 보조** — 규칙 기반으로 탐지한 이상 징후(Red Flag)를 LLM이 자연어로 요약하고, 소송·지급보증·특수관계자 관련 최근 뉴스를 함께 수집

> **설계 원칙 — 데이터 무결성:** 모든 수치는 DART 공시에서 계산한 실제 값이며, 확보하지 못한 항목은 임의로 채우지 않고 "데이터 부족"으로 명시합니다.

---

## 2. 핵심 기능

| 화면 | 내용 |
| --- | --- |
| **스크리닝 대시보드** | 전체 기업 위험 스코어 순위, KPI 요약(위험/주의/안전 분포), 업종·위험도 필터, 다중 정렬, CSV·인쇄 내보내기 |
| **기업 상세 · 정량 지표** | 매출액·부채비율·영업이익률·유동비율 5개년 추이 차트 |
| **기업 상세 · AI 정성 분석** | 규칙 기반으로 탐지한 Red Flag를 Gemini가 자연어로 요약 |
| **기업 상세 · 기사분석** | 소송 / 지급보증 / 약정사항 / 특수관계자 카테고리별 최근 6개월 뉴스 수집(출처 링크 포함) |
| **기업 상세 · 보고서 정보** | 감사인, 대상 보고서, DART 공시 접수일·원문 링크, 주주 구성 |
| **워치리스트 / 알림** | Google 로그인 사용자별 관심 기업 추적, 스코어 임계값 알림 설정 |
| **기업 직접 추가** | 종목코드(6자리)만 입력하면 DART에서 실제 회사명·재무데이터를 조회해 즉시 스크리닝 대상에 편입 |

---

## 3. 위험 스코어링 모델

공시된 재무 수치에서 **직접 계산되는 지표**와 **규칙 기반 Red Flag**만으로 가중 합산해 0~100 스코어를 산출합니다.

| 구성 요소 | 가중치 | 산식 |
| --- | --- | --- |
| 부채비율 | 30% | 부채총계 ÷ 자본총계 |
| 영업이익률 | 25% | 영업이익 ÷ 매출액 |
| 유동비율 | 15% | 유동자산 ÷ 유동부채 |
| 스코어 추이 | 15% | 전년 대비 재무 방향성 |
| Red Flag 수 | 15% | 탐지된 이상 징후 건수 |

**규칙 기반 Red Flag 예시:** 매출채권 급증(매출 성장 대비), 영업손실 전환, 부채비율 급등, 재고자산 이상 증가, 영업현금흐름 유출 전환, 유동비율 100% 미만, 완전자본잠식. 각 Flag는 "당기 자본총계 -X억원 < 0 → 자본잠식" 처럼 **원자료·산식·판정 기준을 모두 담은 근거 문자열**을 생성하고, 이를 LLM이 다시 문장으로 풀어 설명합니다.

---

## 4. 아키텍처

```
┌──────────────────────────────────────────────────────────────┐
│  Render (단일 Docker 서비스)                                   │
│                                                                │
│   FastAPI (Python)                                             │
│    ├─ /api/*   REST 엔드포인트 (companies, watchlist, alerts) │
│    ├─ /auth/*  Google OAuth 2.0                               │
│    ├─ /api/sync  DART 동기화 (토큰 보호)                       │
│    └─ /         빌드된 React SPA 정적 서빙 (StaticFiles)       │
│                                                                │
└───────────────┬───────────────────────────┬──────────────────┘
                │                           │
      ┌─────────▼─────────┐       ┌─────────▼─────────┐
      │  Neon (Postgres)  │       │  외부 API          │
      │  companies /      │       │  · DART Open API   │
      │  metrics /flags / │       │  · Gemini API      │
      │  users /watchlist │       │  · Google News RSS │
      └───────────────────┘       └────────────────────┘
                ▲
                │ 매일 1회 동기화 트리거 + 10분마다 헬스핑
      ┌─────────┴─────────┐
      │   cron-job.org    │
      └───────────────────┘
```

- **단일 서비스 배포:** 프론트엔드를 빌드해 FastAPI가 함께 서빙하므로 배포 대상과 도메인이 하나 (`Dockerfile` 멀티스테이지 빌드).
- **동기화 스케줄링:** GitHub Actions 대신 외부 HTTP 크론(cron-job.org)을 채택. 무료 인스턴스의 슬립 해제와 일일 데이터 동기화를 한 번의 호출로 처리.

---

## 5. 기술 스택

| 영역 | 사용 기술 |
| --- | --- |
| **Frontend** | React, TypeScript, Vite, Recharts|
| **Backend** | Python, FastAPI |
| **Database** | Neon (Serverless PostgreSQL) |
| **AI** | Google Gemini API (재무 이상 징후 자연어 요약) |
| **Auth** | Google OAuth 2.0 |
| **External APIs** | DART Open API, Google News RSS |
| **Deployment** | Render |

---

## 6. 엔지니어링 하이라이트

실서비스로 운영하며 마주친 문제들과 해결 방식입니다.

- **DART 원화 단위 처리:** DART가 원 단위(14자리) 원자료를 반환해 차트 축이 깨지던 문제를, 억원 단위 변환 + 조 단위 축 포매터로 해결.
- **"기업 추가" 응답 지연:** 매 요청마다 전체 기업 등록부(corpCode.xml)를 재다운로드하던 것을 인메모리 캐시(24h)로 전환 → 두 번째 추가부터 9.2초 → 0.00초.
- **LLM 쿼터 소진 대응:** Gemini 호출이 실패하면 규칙 기반 템플릿 문장으로 자동 폴백하고, 한 번 실패 시 해당 실행에서는 재호출을 건너뛰어 지연을 제거. LLM은 어디까지나 표현 보조이며 스코어·근거는 항상 결정론적으로 계산.

---

## 7. 로컬 개발

### 백엔드
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # 아래 환경변수 채우기
alembic upgrade head           # 또는 SQLite 기본값으로 최초 실행 시 자동 생성
uvicorn app.main:app --reload --port 8000
```
`DATABASE_URL` 미설정 시 로컬 SQLite(`backend/dealscreener.db`)로 동작합니다.

### 프론트엔드
```bash
cd frontend
npm install
npm run dev    # http://localhost:5173, /api·/auth는 8000 백엔드로 프록시
```

### 최초 데이터 동기화
```bash
curl -X POST http://localhost:8000/api/sync -H "X-Sync-Token: <SYNC_SECRET_TOKEN>"
```

### 환경변수 (`backend/.env`)
| 변수 | 필수 | 설명 |
| --- | --- | --- |
| `DART_API_KEY` | 필수 | opendart.fss.or.kr 무료 발급 |
| `SYNC_SECRET_TOKEN` | 필수 | `/api/sync` 호출 보호용 토큰 |
| `DATABASE_URL` | 선택 | 미설정 시 로컬 SQLite, 프로덕션은 Neon Postgres |
| `GEMINI_API_KEY` | 선택 | 미설정 시 Red Flag 요약이 템플릿 문장으로 대체 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 선택 | 미설정 시 로그인·워치리스트·알림 비활성 |
| `JWT_SECRET` | 권장 | 세션 토큰 서명 키, 프로덕션 필수 변경 |

---

## 8. 배포 (Render)

1. GitHub 저장소를 Render에 연결 → `render.yaml` 자동 인식 (Docker 빌드, 프론트 빌드 + 백엔드 실행을 단일 서비스로 묶음)
2. 위 환경변수를 Render 대시보드에 등록
3. cron-job.org에 두 개의 잡 등록
   - `POST /api/sync` (헤더 `X-Sync-Token`) — 매일 1회 데이터 동기화
   - `GET /api/health` — 10분마다 헬스핑(무료 인스턴스 슬립 방지)

---

## 9. 한계 및 향후 계획

- **시가총액:** DART API 미제공 항목(별도 시세 API 필요) — UI에 "—"로 표시
- **뉴스 스크리닝:** 검색 기반 수집이라 무관한 기사가 섞일 수 있음 — 출처 링크로 검증 전제
- **알림 발송:** 현재 알림 "설정" 저장까지 구현, 실제 이메일/슬랙 발송은 향후 과제
- **무료 인프라 특성:** Render 무료 인스턴스 콜드스타트 시 첫 요청에 지연 발생(헬스핑으로 완화)

---

*본 서비스가 산출하는 위험 스코어와 Red Flag는 스크리닝 보조 지표이며, 투자 판단이나 실제 딜 의사결정을 대체하지 않습니다.*
