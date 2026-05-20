# AccountingApp

기존 엑셀 장부(`월말결산_SAMPLE.xlsx`, `헌금현황_SAMPLE.xlsx`, `회계장부_SAMPLE2.xlsx`)를 분석해 만든 웹 기반 회계 프로그램 초안입니다.

## 구성

- `backend/`: FastAPI + SQLAlchemy + pandas/openpyxl
- `frontend/`: Next.js App Router
- `docs/schema-brief.md`: 엑셀 분석 결과와 DB 스키마 브리핑

## 주요 기능

- 대시보드: 총 수입/지출/순손익, 월별 그래프
- 전표 관리: 수입/지출 전표 입력 및 조회
- AI 스마트 분류: 적요 입력 시 계정과목 추천
- 엑셀 분석/기준정보 적재: 샘플 파일 구조 분석 및 기초 마스터 생성
- 내보내기: 전표 데이터를 Excel / Markdown으로 추출

## 백엔드 실행

```bash
cd D:\AccountingApp\backend
python -m pip install -r requirements.txt
copy .env.example .env
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8500
```

## 프론트엔드 실행

```bash
cd D:\AccountingApp\frontend
copy .env.local.example .env.local
npm install
npm run dev
```

브라우저에서 `http://localhost:3000` 접속.

## API 예시

- 헬스체크: `GET http://127.0.0.1:8500/health`
- 샘플 분석: `GET http://127.0.0.1:8500/api/imports/sample-analysis`
- 전표 엑셀 다운로드: `GET http://127.0.0.1:8500/api/exports/vouchers.xlsx`

## 참고

- 앱 시작 시 DB가 비어 있으면 샘플 엑셀에서 `funds`, `accounts`, `members`를 자동 적재합니다.
- OpenAI API를 쓰려면 `backend/.env`에 `OPENAI_API_KEY`를 추가하세요.
- AI 추천 모델은 `backend/.env`의 `OPENAI_MODEL`로 기본값을 정할 수 있고, 현재 `gpt-4.1-nano`, `gpt-4o`, `o1-mini`를 지원합니다.
