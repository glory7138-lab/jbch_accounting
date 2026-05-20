# AccountingApp 다음 작업용 인계 메모

최종 업데이트: 2026-05-20

## 1. 프로젝트 개요
- 교회 회계 프로그램 초안 프로젝트
- 구조
  - `backend/`: FastAPI + SQLAlchemy + pandas/openpyxl
  - `frontend/`: Next.js App Router
- DB 파일: `backend/accounting.db`
- 스키마 브리핑: `docs/schema-brief.md`

## 2. 실제 기준 엑셀 파일
프로젝트 루트(`D:\AccountingApp`)에 있는 실제 파일명은 아래 3개입니다.
- `월말결산_SAMPLE.xlsx`
- `헌금현황_SAMPLE.xlsx`
- `회계장부_SAMPLE2.xlsx`

주의: 예전에 `현금현황_SAMPLE.xlsx`로 잘못 적힌 문서/대화가 있었는데, 실제 파일명은 **`헌금현황_SAMPLE.xlsx`** 입니다.

## 3. 엑셀 시트 구성 요약
### 월말결산_SAMPLE.xlsx
- `결산양식`
- `참여현황 및 주요관리항목 지출`
- `주간보고자료`
- `회계결산 표지`
- `Sheet1`

### 헌금현황_SAMPLE.xlsx
- `주별 헌금 장부기록 1-7`
- `2026년 헌금 전체 누계`
- `인원집계`
- `헌금 봉투 번호 (2026)`
- `입금전표 (수요집금)`
- `입금전표`

### 회계장부_SAMPLE2.xlsx
- `Sheet3`
- `통합계정`
- `일반계정`
- `교회학교후원회비`
- `사랑의헌금`
- `선교회비`
- `건축계정`
- `승강기계정`
- `해외후원`
- `국내선교`
- `계정코드`
- `장부작성시 주의사항`

## 4. 최근에 확인/수정한 핵심 내용
### 가장 중요한 이슈
프론트엔드의 API 주소와 백엔드 실행 포트가 달라서 `Failed to fetch`가 발생했음.

- 프론트가 보던 주소: `http://127.0.0.1:8000/api`
- 실제 백엔드 실행 포트: `8500`

### 수정한 내용
아래를 `8500` 기준으로 맞춤.
- `README.md`
- `frontend/lib/api.js`
- `frontend/.env.local.example`
- 로컬 실행 파일 `frontend/.env.local`도 `8500`으로 맞춤
- 문서의 샘플 파일명도 `헌금현황_SAMPLE.xlsx` 기준으로 정리
- `backend/app/services/excel_analysis.py` 설명 문구도 정리

## 5. 최근 커밋
- `d337a7e` Align frontend API port with backend
- `8277b1a` Convert weekly offering entry to batch grid
- `a98f7d4` Add weekly offering quick entry screen

## 6. 지금 바로 실행할 때 명령어
### 백엔드
```bash
cd D:\AccountingApp\backend
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8500
```

### 프론트엔드
```bash
cd D:\AccountingApp\frontend
npm run dev
```

### 접속 주소
- 프론트: `http://localhost:3000`
- 헬스체크: `http://127.0.0.1:8500/health`
- 샘플 분석 API: `http://127.0.0.1:8500/api/imports/sample-analysis`

## 7. 다음에 열면 먼저 볼 파일
1. `NEXT_SESSION_HANDOFF.md` (이 파일)
2. `README.md`
3. `docs/schema-brief.md`
4. `backend/app/services/excel_analysis.py`

## 8. 현재 남아 있는 로컬 변경사항
아래 2개 파일은 이미 수정 흔적이 있지만 아직 이번 커밋에는 포함되지 않았음.
- `frontend/app/globals.css`
- `frontend/components/WeeklyOfferingForm.js`

즉, 다음 작업 전에 `git status`로 이 두 파일 상태를 먼저 확인하는 게 좋음.

## 9. 다음 작업 추천 순서
1. 백엔드/프론트 다시 실행
2. 브라우저 새로고침
3. 대시보드 로딩 확인
4. 최근 전표 목록 로딩 확인
5. 여전히 오류가 있으면 브라우저 개발자도구 Network 탭에서 실패한 API URL 확인

## 10. 참고 메모
- `backend/.env`의 `ALLOWED_ORIGINS`는 `http://localhost:3000`
- 샘플 데이터 기준 디렉토리는 `D:/AccountingApp`
- 앱 시작 시 DB가 비어 있으면 샘플 엑셀 기준으로 `funds`, `accounts`, `members`를 자동 적재하도록 되어 있음

---
다음 작업 때는 이 파일부터 읽고 시작하면, 포트 문제와 파일명 혼선을 다시 찾느라 시간을 쓰지 않아도 됨.
