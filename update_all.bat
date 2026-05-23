@echo off
title AccountingApp 통합 업데이트 스크립트
chcp 65001 > nul

echo ======================================================
echo 🚀 AccountingApp 통합 자동 업데이트를 시작합니다.
echo ======================================================
echo.

:: D드라이브 프로젝트 폴더로 확실하게 이동
cd /d D:\AccountingApp

echo ------------------------------------------------------
echo 🐋 1. 도커 컨테이너 최신화 및 재빌드 중...
echo ------------------------------------------------------
:: 기존 컨테이너를 내리고, 새로 수정된 프론트/백엔드 코드를 반영해 다시 빌드합니다.
docker compose down
docker compose up --build -d

if %errorlevel% neq 0 (
    echo ❌ 도커 빌드 중 오류가 발생했습니다. 스크립트를 중단합니다.
    pause
    exit /b %errorlevel%
)
echo      ㄴ [성공] 도커 컨테이너가 최신 코드로 재구동되었습니다!
echo.

echo ------------------------------------------------------
echo 🐙 2. 깃허브(GitHub) 소스 코드 백업 및 업데이트 중...
echo ------------------------------------------------------
:: 수정한 파일들을 스테이징 영역에 추가합니다. (.gitignore에 등록된 DB 등은 알아서 제외됩니다)
git add .

:: 업데이트 날짜와 시간을 커밋 메시지에 자동으로 넣어줍니다.
for /f "tokens=1-3 delims=- " %%a in ('date /t') do (set mydate=%%a-%%b-%%c)
for /f "tokens=1-2 delims=: " %%a in ('time /t') do (set mytime=%%a:%%b)
git commit -m "자동 업데이트 백업 (%mydate% %mytime%)"

:: 깃허브 원격 저장소로 코드를 밀어 넣습니다.
git push origin main

if %errorlevel% neq 0 (
    echo ❌ 깃허브 업로드 중 오류가 발생했습니다. (원격 저장소 설정을 확인하세요)
    pause
    exit /b %errorlevel%
)
echo      ㄴ [성공] 최신 소스 코드가 깃허브에 안전하게 백업되었습니다!
echo.

echo ======================================================
echo 🎉 모든 업데이트가 완료되었습니다! 
echo 브라우저에서 http://localhost:3010 으로 접속해 보세요.
echo ======================================================
pause