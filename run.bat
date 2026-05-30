@echo off
title Accounting Application Launcher
echo ===================================================
echo   Starting Accounting Application...
echo ===================================================
echo.

setlocal enabledelayedexpansion

:: Detect local private IPv4 address
set LOCAL_IP=127.0.0.1
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /i "IPv4"') do (
    set temp_ip=%%i
    set temp_ip=!temp_ip: =!
    if not "!temp_ip!"=="" (
        if "!temp_ip:~0,8!"=="192.168." set LOCAL_IP=!temp_ip!
        if "!temp_ip:~0,3!"=="10." set LOCAL_IP=!temp_ip!
        if "!temp_ip:~0,4!"=="172." set LOCAL_IP=!temp_ip!
    )
)

:: Start Backend in a new window bound to 0.0.0.0 for external PC access
echo Starting Backend (FastAPI on http://0.0.0.0:8500)...
start "Accounting Backend" /D "%~dp0backend" cmd /k "python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8500"

:: Start Frontend in a new window bound to 0.0.0.0 for external PC access
echo Starting Frontend (Next.js on http://0.0.0.0:3000)...
start "Accounting Frontend" /D "%~dp0frontend" cmd /k "npm run dev -- -H 0.0.0.0"

:: Wait 3 seconds for servers to start, then open the browser automatically
echo Opening browser at http://localhost:3000 ...
timeout /t 3 /nobreak >nul
start http://localhost:3000

echo.
echo ===================================================
echo   Application started successfully!
echo   - Local Host: http://localhost:3000
echo   - Backend Host: http://127.0.0.1:8500
echo.
echo   [Access URLs for other PCs on the same network]
echo   - Frontend: http://!LOCAL_IP!:3000
echo   - Backend:  http://!LOCAL_IP!:8500
echo ===================================================
echo.
pause
