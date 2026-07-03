# DealScreener

DART 공시 데이터를 기반으로 상장사의 재무 부실 징후와 잠재 M&A 타겟을 스크리닝하는 대시보드. 정량 지표(Altman Z, Beneish M, 부채비율, 영업이익률)와 규칙 기반 Red Flag 탐지는 모두 DART Open API에서 실시간으로 가져온 실제 재무제표 수치로 계산되며, 값을 확보하지 못한 항목은 "데이터 부족"으로 표시하고 절대 임의로 채우지 않습니다.

## 구조

- `frontend/` — Vite + React + TypeScript (원본 Figma Make 프로토타입 UI를 실데이터 연동으로 전환)
- `backend/` — FastAPI. DART 동기화, 정량 스코어링, 규칙기반 Red Flag 탐지, Gemini 기반 자연어 요약, REST API, Google OAuth
- 배포 시 `backend`가 `frontend`의 빌드 결과물을 함께 서빙하는 단일 서비스로 동작 (`backend/app/main.py`)

## 로컬 개발

### 백엔드

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # 아래 환경변수 채우기
alembic upgrade head    # 또는 SQLite 기본값으로 앱 최초 실행 시 자동 생성됨
uvicorn app.main:app --reload --port 8000
```

DB를 따로 설정하지 않으면 `backend/dealscreener.db` (SQLite)로 자동 동작합니다. Neon 등 Postgres를 쓰려면 `.env`의 `DATABASE_URL`만 채우면 됩니다.

### 프론트엔드

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173, /api, /auth는 8000 백엔드로 프록시됨 (vite.config.ts)
```

### 최초 데이터 동기화

DART 실데이터를 채우려면 서버가 뜬 상태에서 한 번 호출:

```bash
curl -X POST http://localhost:8000/api/sync -H "X-Sync-Token: <SYNC_SECRET_TOKEN>"
```

## 환경변수 (`backend/.env`)

| 변수 | 필수 여부 | 설명 |
| --- | --- | --- |
| `DART_API_KEY` | 필수 | opendart.fss.or.kr 에서 무료 발급 |
| `SYNC_SECRET_TOKEN` | 필수 | `/api/sync` 호출 보호용 임의 문자열 |
| `DATABASE_URL` | 선택 | 미설정 시 로컬 SQLite. 프로덕션은 Neon Postgres 권장 |
| `GEMINI_API_KEY` | 선택 | 미설정 시 Red Flag 요약이 규칙 기반 템플릿 문장으로 대체됨(정상 동작, AI 문장만 못 씀) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 선택 | 미설정 시 로그인 버튼은 뜨지만 실제 로그인은 실패 — 워치리스트/알림 쓰기 기능만 비활성 |
| `JWT_SECRET` | 권장 | 세션 토큰 서명 키, 프로덕션에서는 반드시 변경 |

## 배포 (Render)

1. 이 레포를 GitHub에 push
2. Render에서 "New Web Service" → 이 레포 선택 → `render.yaml` 자동 인식 (Docker 빌드, `Dockerfile`이 frontend 빌드 + backend 실행을 한 서비스로 묶음)
3. 위 환경변수들을 Render 대시보드에 등록 (`DATABASE_URL`은 Neon에서 발급한 connection string)
4. 배포 후 [cron-job.org](https://cron-job.org)(무료)에서 매일 1회 `POST https://<render-url>/api/sync` 요청을 등록, 헤더에 `X-Sync-Token: <SYNC_SECRET_TOKEN>` 추가
   - Render 무료 인스턴스는 15분간 요청이 없으면 슬립 상태가 되는데, 이 외부 크론 호출이 슬립 해제와 동기화를 동시에 처리함 (GitHub Actions 스케줄러는 트리거 누락이 잦아 채택하지 않음)

## 알려진 한계 (의도적으로 채우지 않은 값)

- **시가총액**: DART API로는 제공되지 않음(별도 시세 API 필요) — UI에 "—"로 표시
- **감사인**: 현재 동기화 로직에서 가져오지 않음 — "정보 없음"으로 표시
- **Beneish M-Score**: 감가상각비/영업활동현금흐름 등이 DART 표준계정에 태깅되지 않은 기업은 계산 불가 — "데이터 부족"으로 표시 (허위 추정치를 채우지 않음)
- **이메일/슬랙 알림 발송**: 알림 "설정"까지만 구현되어 있고 실제 발송 로직은 없음 (Phase 2)
