# Next Session Handoff

## 1. 진행 상황 요약
* **월말결산 (Monthly Settlement) 및 분기결산 기능 구현 완료**
  * 메뉴 구성: `결산양식`, `참여현황 및 주요관리항목 지출`, `주간보고자료`, `분기별 결산보고`
  * **백엔드 구현 완료**:
    * [settlement_service.py](file:///d:/AccountingApp/backend/app/services/settlement_service.py): 계정 그룹 매핑 및 기간별(전월/당월, 월별 누적, 주간별 1~5주차) 수입/지출 데이터 집계 로직. (5주차 계산 시 월의 마지막 주에 해당하는 모든 잔여 일수가 누락 없이 5주차 버킷에 담기도록 경계값 보정 적용)
    * **예산(Budget) 데이터 및 차이 계산 매핑**: 엑셀 시트 3의 고정 예산 데이터를 백엔드 내에 HSL(원 단위)로 바인딩하고 차이 수식(수입: `누적 - 예산`, 지출: `예산 - 누적`)을 데이터 집계 로직에 반영 완료.
    * [api/settlement.py](file:///d:/AccountingApp/backend/app/api/settlement.py): 각 결산 양식의 JSON 데이터 API 및 엑셀 다운로드 API (`form.xlsx`, `participation.xlsx`, `weekly-report.xlsx`, `quarterly.xlsx`). 예산 및 차이 컬럼 엑셀 다운로드 연동 완료.
    * [main.py](file:///d:/AccountingApp/backend/app/main.py): `/api/settlement` 라우터 등록 완료.
  * **프론트엔드 구현 완료**:
    * [lib/appMenus.js](file:///d:/AccountingApp/frontend/lib/appMenus.js): `settlementMenuItems` 설정 추가.
    * [components/Nav.js](file:///d:/AccountingApp/frontend/components/Nav.js): 네비게이션 바에 '월말결산' 대메뉴 추가.
    * [components/SettlementTabs.js](file:///d:/AccountingApp/frontend/components/SettlementTabs.js): 월말결산 내의 탭 전환 컴포넌트 추가.
    * [app/settlement/page.js](file:///d:/AccountingApp/frontend/app/settlement/page.js): 첫 서브메뉴(결산양식)로의 자동 redirect 추가.
    * [app/settlement/form/page.js](file:///d:/AccountingApp/frontend/app/settlement/form/page.js) (결산양식): 계정 그룹별 수입/지출 대조 및 전월/당월 이월금 계산 테이블 렌더링.
    * [app/settlement/participation/page.js](file:///d:/AccountingApp/frontend/app/settlement/participation/page.js) (참여현황 및 주요관리항목 지출): 월별 헌금 참여 인원/금액 추이 및 주요 관리항목(전기요금 등) 지출 추이 렌더링.
    * [app/settlement/weekly-report/page.js](file:///d:/AccountingApp/frontend/app/settlement/weekly-report/page.js) (주간보고자료): 1~5주차별 주간 결산, 누적/예산/차이(수입: `누적 - 예산`, 지출: `예산 - 누적`) 및 계정별 누적 잔액(running balance) 렌더링.
    * [app/settlement/quarterly/page.js](file:///d:/AccountingApp/frontend/app/settlement/quarterly/page.js) (분기별 결산보고): 분기 단위 집계(수지현황, 지출내역, 교회운영비, 잔고현황) 및 엑셀 다운로드 연동 완료.

* **특수 숫자 포맷팅 및 우측 정렬 일괄 적용 완료**
  * **포맷터 구현 (`formatMoney`)**: [lib/api.js](file:///d:/AccountingApp/frontend/lib/api.js)에 처음 천 단위 구분은 소수점(`.`)으로, 백만 단위 등 그 이상의 구분은 콤마(`,`)로 구분하는 포맷팅 유틸리티 구현 완료. (예: `1200000` -> `1,200.000`, `12345` -> `12.345`)
  * **주간 헌금 일괄 등록 특수 입력 규칙 반영**: 주간 헌금 일괄 등록 화면에서는 `1000원 -> 1.000`, `100원 -> 0.100`, `10원 -> 0.010`과 같이 항상 뒤의 3자리가 소수점 뒤로 들어가도록 하는 특수 소수점 입력 규칙 및 포맷팅(`formatCustomWeekly`) 구현 완료.
  * **전체 화면 적용**:
    * 대시보드(일반 회계 요약, 헌금 통계 분석)
    * 9개 회계 장부([ledger/[category]/page.js](file:///d:/AccountingApp/frontend/app/ledger/[category]/page.js))
    * 주간헌금 일괄 등록 폼([components/WeeklyOfferingForm.js](file:///d:/AccountingApp/frontend/components/WeeklyOfferingForm.js))
    * 일반 전표 입력 폼([components/VoucherForm.js](file:///d:/AccountingApp/frontend/components/VoucherForm.js))
    * 헌금현황 하위 화면(누계, 회별 참여자수, 참여금액, 개인별 내역, 입금전표 출력)
    * 월말/분기결산 하위 화면(결산양식, 참여현황, 주간보고, 분기보고)
  * **우측 정렬 적용**: 수치 데이터 테이블 셀(`td`, `th`) 및 금액 입력창(`input`)에 `text-align: right` 스타일 일괄 반영 완료.

* **계정코드 관리 및 헌금 통계 분석 개선 완료**
  * **중복 계정명 처리**: 대시보드의 '헌금 통계 분석' 및 조회 필터 드롭다운에서 한글 계정명이 중복될 경우 중분류/보고분류 정보를 괄호 안에 함께 표시하도록 개선 완료.
  * **계정코드 관리 레이아웃 개선**: 검색창 카드 분리 및 우측 리스트 단일화로 완벽한 좌우 비대칭 레이아웃 해결 및 안전한 삭제 조건 적용 완료.

* **도커(Docker) 이관 시 API 통신 및 CORS 버그 수정 완료**
  * **동적 호스트 주소 바인딩**: 프론트엔드가 환경변수가 없을 경우 `window.location.hostname`과 포트 `8500`을 사용해 자동으로 접속 중인 도메인으로 API를 조회하도록 개선.
  * **CORS 허용 오리진 추가**: [docker-compose.yml](file:///d:/AccountingApp/docker-compose.yml)의 `ALLOWED_ORIGINS`에 실서버 주소인 `http://jbchow.com:3010`을 추가하여 크로스 오리진 요청 허용.

* **테스트 하네스 및 최적화 설정 구축 완료**
  * **백엔드 테스트 하네스 (`pytest`)**: API 통합 테스트 코드를 구축하여 8개 케이스의 100% 통과 확인.
  * **어플리케이션 원클릭 구동 배치 파일 생성 완료**: 프로젝트 루트에 [run.bat](file:///d:/AccountingApp/run.bat) 및 [build_for_nas.bat](file:///d:/AccountingApp/build_for_nas.bat) 작성 완료.

* **회계 장부 하위 계정 편집 기능 추가 및 계정코드 필터링 구현 완료**
  * **하위 계정 편집 기능 활성화**: 기존에 조회 전용(Read-only)이던 `일반계정`, `교회학교후원회비`, `사랑의 헌금`, `선교회비` 장부를 직접 등록/수정/삭제가 가능한 편집형 장부로 전환 완료. ([appMenus.js](file:///d:/AccountingApp/frontend/lib/appMenus.js), [ledger.py](file:///d:/AccountingApp/backend/app/api/ledger.py))
  * **계정코드 자동 필터링**: 각 장부별로 지정된 유효 계정코드 목록만 드롭다운에 노출되도록 `GET /api/ledger/accounts` API와 프론트엔드 연동 구현. ([page.js](file:///d:/AccountingApp/frontend/app/ledger/[category]/page.js))
  * **유효성 검증**: 전표 등록 및 수정 시 선택한 계정코드가 해당 장부 카테고리에 속하는지 검사하는 유효성 검증 로직 추가 (`400 Bad Request` 에러 처리).
  * **통합계정 자동 합산**: 하위 계정에서 직접 등록한 수동 전표들이 상위 계정인 `통합계정` 조회 및 집계 시 누락 없이 통합 취합되도록 백엔드 조회 쿼리 보완 완료.
  * **테스트 코드 보강**: 하위 계정 전표 등록/수정 및 계정코드 필터링 동작을 검증하는 API 통합 테스트 케이스 2종을 신설하여 총 10개 케이스 100% 통과 확인. ([test_api_vouchers.py](file:///d:/AccountingApp/backend/tests/test_api_vouchers.py))

---

## 2. 별도 기록 및 관리 문서
* **하네스 명세서 (`harness_config.md`)**:
  * MCP 서버 연동 규격, 외부 API(OpenAI GPT) 통신 사양, SQLite DB 스키마 자동 마이그레이션 메커니즘, Docker Compose의 마운트 구조 등 시스템 통합/배포와 관련된 핵심 아키텍처는 [harness_config.md](file:///d:/AccountingApp/harness_config.md) 파일에 별도로 상세히 기록되어 관리되고 있습니다.
