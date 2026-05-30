# AccountingApp Harness Configuration Guide

이 문서는 `AccountingApp` 프로젝트의 인프라 구성, 연동 코드 사양 및 시스템 아키텍처 개요를 기록하고 관리하는 하네스(Harness) 명세서입니다. 새로운 인프라 수정이나 연동 방식 변경 시 이 문서에 지속적으로 업데이트를 진행합니다.

---

## 1. 인프라 및 패키지 설정 파일

### 1) Docker Compose 설정
프로젝트는 로컬 개발용과 NAS 배포용의 이원화된 Compose 환경을 사용합니다.

* **로컬 개발용 (`docker-compose.yml`)**
  - 소스코드 디렉터리(`frontend`, `backend`)를 컨테이너 내부에 직접 볼륨 마운트하여 실시간 코드 수정 사항(Hot Reload)이 즉시 반영되도록 구성되었습니다.
* **NAS 배포용 (`docker-compose.nas.yml`)**
  - 소스코드 노출 없이 사전에 빌드된 Docker 이미지만을 사용하며, 데이터 유지를 위한 데이터베이스 파일(`accounting.db`)만을 볼륨 마운트하여 영속화합니다.

### 2) Dockerfile 사양
* **Backend (`backend/Dockerfile`)**
  - Base Image: `python:3.11-slim`
  - 한국 시간대(`Asia/Seoul`) 설정 반영.
  - `requirements.txt` 기반 의존성 설치 후 Uvicorn을 통해 8500 포트로 FastAPI 앱 구동.
* **Frontend (`frontend/Dockerfile`)**
  - Base Image: `node:18-alpine`
  - 빌드 타임 환경변수 주입을 위한 `ARG NEXT_PUBLIC_API_BASE_URL` 설정.
  - Next.js 프로덕션 빌드 후 3000 포트(외부 바인딩 3010)로 구동.

### 3) 패키지 의존성 (Dependencies)
* **Backend (`requirements.txt`)**
  - `FastAPI`, `Uvicorn`, `SQLAlchemy` (ORM)
  - `Pandas`, `Openpyxl` (엑셀 데이터 파싱 및 분석용)
  - `OpenAI` (AI 스마트 분류 및 엑셀 데이터 자연어 Q&A용)
* **Frontend (`package.json`)**
  - `Next.js 14.2.30`, `React 18.3.1`, `Recharts` (대시보드 차트 시각화용)

---

## 2. 플러그인 및 도구 연동 코드

### 1) External API (OpenAI API) 연동
* **역할**: AI 스마트 분류 및 엑셀 자연어 분석 질의응답
* **연동 모델**: `gpt-4.1-nano` (혹은 설정된 GPT 모델)
* **설정 방식**: 
  - 백엔드 구동 시 환경변수 `OPENAI_API_KEY`를 시스템 환경변수 또는 `.env` 파일로부터 주입받아 사용합니다.
  - API 키가 설정되지 않은 경우 일반적인 회계 및 입력 기능은 정상 작동하되, AI 분류/분석 요청 시에만 에러를 반환하도록 설계되어 있습니다.

### 2) Frontend-Backend 통신 연동
* **API 호출 부 (`frontend/lib/api.js`)**
  - 빌드 타임에 환경변수 `NEXT_PUBLIC_API_BASE_URL`가 주입되는 구조입니다.
  - 주입되지 않은 브라우저 환경에서는 현재 접속 호스트를 기반으로 자동 포트 탐지(`window.location.hostname:8500/api`)를 시도하며, 서버사이드 렌더링(SSR) 환경에서는 `http://127.0.0.1:8500/api`를 기본값으로 사용합니다.

---

## 3. 시스템 아키텍처 개요

### 1) 데이터베이스 연동 방식 (SQLite ORM)
* **ORM 엔진**: `SQLAlchemy 2.0`을 사용해 선언적 모델([models.py](file:///d:/AccountingApp/backend/app/models.py))을 관리합니다.
* **경로 및 관리**: `sqlite:///accounting.db` 단일 파일로 동작합니다.
* **자동 마이그레이션 (`app/seed.py`)**:
  - 백엔드 컨테이너 실행 시 (`lifespan` 구문) 자동으로 `Base.metadata.create_all`이 호출되어 신규 테이블을 자동 생성합니다.
  - `_ensure_column()` 헬퍼를 통해 기존 운영 중인 DB 스키마에 새로운 컬럼이 누락되었는지를 체크하여 자동으로 추가(`ALTER TABLE`)해 줍니다. 따라서 DB 파일의 덮어쓰기 없이도 안전하게 릴리즈가 가능합니다.

### 2) 시스템 간 통신 구조 및 CORS 정책
* **통신 구조**:
  - User Browser -> Frontend (Port 3010) -> Backend FastAPI (Port 8500) -> SQLite DB
* **보안 및 CORS 설정**:
  - FastAPI 미들웨어 수준에서 `ALLOWED_ORIGINS`를 환경변수로 주입받아 통제합니다. 
  - 배포 환경에 따라 `http://jbchcw.com:3010` 및 `http://localhost:3010`에서의 CORS 요청을 안전하게 허용하도록 설정되어 있습니다.

---

## 4. 작업 히스토리 (Harness Updates)
* **2026-05-24**: 
  - 최초 NAS 배포용 `build_for_nas.bat` 및 `docker-compose.nas.yml` 구성 완료.
  - Next.js의 빌드 타임 환경변수(`NEXT_PUBLIC_API_BASE_URL`) 주입 문제를 해결하기 위해 `Dockerfile` 내 `ARG` 주입 프로세스 적용 완료.
* **2026-05-25**: 
  - 최적의 하네스 구성을 위한 `harness_config.md` 파일 최초 수립.
* **2026-05-26**:
  - 배치 스크립트(`update_all.bat`, `build_for_nas.bat`) 내의 하드코딩된 절대 경로를 상대 경로(`%~dp0`)로 치환하여 임의의 폴더에서도 압축 해제 시 즉각 구동될 수 있도록 인프라 구조 최적화.

