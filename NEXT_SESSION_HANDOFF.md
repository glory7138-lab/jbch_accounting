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

### 2026-05-20 추가 작업
전표 관리 화면의 주간 헌금 일괄 입력 UI를 다시 손봤음.

- 봉투번호뿐 아니라 **이름 일부 입력**으로도 헌금자 자동 조회되게 수정
- 조회되면 **이름 / 회별 / 구역**까지 자동 채움
- `members` 테이블과 API 응답에 `district_name`(구역) 반영
- 헌금현황 샘플 파일의 `구역` 컬럼을 멤버 기준정보로 다시 적재하도록 보완
- 기존처럼 항목이 가로로 길게 늘어지지 않게, 헌금 항목 입력칸을 **한 셀 안의 그리드**로 묶어서 한 화면에서 보이게 변경
- `회별`, `구역`, `봉투` 컬럼 폭도 더 줄여서 탭 입력에 맞게 조정
- 백엔드 부팅 시 `district_name` 컬럼을 자동 보정하고, 샘플 데이터 재부트스트랩 시 기존 멤버 정보도 업데이트되게 수정
- 프론트 `next build`까지 통과 확인 완료

### 2026-05-20 AI 모델 추가
AI 추천 화면과 백엔드 추천 API에 모델 선택을 추가했음.

- 선택 가능 모델
  - `gpt-4.1-nano`
  - `gpt-4o`
  - `o1-mini`
- `backend/.env`, `backend/.env.example`에 `OPENAI_MODEL` 기본값 추가
- AI 결과에 실제 사용 모델(`used_model`) 표시
- OpenAI API 키가 없으면 기존처럼 fallback 규칙 사용

### 2026-05-20 주간 헌금 화면 재구성
사용자 요청에 맞춰 주간 헌금 일괄 등록 흐름을 날짜 중심으로 다시 바꿨음.

- `/vouchers`는 이제 레거시 진입점이고 `/offerings` 쪽으로 넘김
- 실제 주간 헌금 화면은 `/offerings/weekly/[voucherDate]`
- 일반 전표 입력은 `/vouchers/manual`로 분리
- 기준 날짜를 바꾸면 새 화면으로 이동하면서 해당 날짜 저장 내역을 바로 불러옴
- 날짜별 저장은 개별 row append 방식이 아니라 **그 날짜 전체 시트 동기화 방식**으로 변경
- 다른 사람 행으로 이동하면 현재 입력 상태를 자동 저장하도록 프론트 동작 수정
- 저장 버튼을 눌러도 화면을 비우거나 최근 전표 목록으로 내려가지 않고 그대로 유지
- 하단 최근 전표 목록 섹션은 제거
- 봉투번호 입력 시 이름/회별/구역 자동 채움
- 이름 일부 입력 시 봉투번호/회별/구역 자동 채움
- 회별/구역은 read only 처리
- 총액/현금합계는 화면 하단에도 표시
- 백엔드에 날짜별 주간헌금 조회 API(`GET /api/vouchers/weekly-offering?voucherDate=...`) 추가
- 백엔드에 날짜별 주간헌금 저장 API(`PUT /api/vouchers/weekly-offering`) 추가
- 현재 날짜 화면 엑셀 다운로드 API(`GET /api/vouchers/weekly-offering.xlsx?voucherDate=...`) 추가

### 2026-05-20 헌금현황/회계장부 메뉴 확장
사용자 요청에 맞춰 대메뉴/서브메뉴 구조와 화면별 엑셀 다운로드 기반을 추가했음.

#### 프론트 메뉴 구조
- 상단 대메뉴
  - `헌금현황` → `/offerings`
  - `회계장부` → `/ledger`
  - `전표입력` → `/vouchers/manual`
- 헌금현황 서브메뉴
  - `/offerings/weekly/[voucherDate]` 주간헌금현황
  - `/offerings/cumulative` 주간헌금현황 누계
  - `/offerings/department-counts` 회별 참여자 수
  - `/offerings/department-amounts` 회별 참여금액
  - `/offerings/envelopes` 헌금봉투 번호 조회/수정/등록
- 회계장부 서브메뉴
  - `/ledger/integrated` 통합계정
  - `/ledger/general` 일반계정
  - `/ledger/school-support` 교회학교후원회비
  - `/ledger/love-offering` 사랑의 헌금
  - `/ledger/mission-fee` 선교회비
  - `/ledger/building` 건축계정
  - `/ledger/elevator` 승강기계정
  - `/ledger/overseas` 해외후원
  - `/ledger/domestic-mission` 국내선교
  - `/ledger/account-codes` 계정코드

#### 새 백엔드 API
- 헌금현황 누계 조회/엑셀
  - `GET /api/offerings/weekly-cumulative`
  - `GET /api/offerings/weekly-cumulative.xlsx`
- 회별 참여자/금액 집계 및 엑셀
  - `GET /api/offerings/department-summary`
  - `GET /api/offerings/department-summary-counts.xlsx`
  - `GET /api/offerings/department-summary-amounts.xlsx`
- 헌금봉투 번호 조회/등록/수정/엑셀
  - `GET /api/offerings/envelopes`
  - `POST /api/offerings/envelopes`
  - `PUT /api/offerings/envelopes/{member_id}`
  - `GET /api/offerings/envelopes.xlsx`
- 회계장부 공통 조회/등록/수정/엑셀
  - `GET /api/ledger/entries`
  - `POST /api/ledger/entries`
  - `PUT /api/ledger/entries/{voucher_id}`
  - `GET /api/ledger/entries.xlsx`
- 계정코드 조회/등록/수정/업로드/엑셀
  - `GET /api/ledger/account-codes`
  - `POST /api/ledger/account-codes`
  - `PUT /api/ledger/account-codes/{account_id}`
  - `POST /api/ledger/account-codes/upload`
  - `GET /api/ledger/account-codes.xlsx`

#### 검증
- 백엔드 새 API 함수 직접 호출 확인 완료
- 프론트 `next build` 통과 완료

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
