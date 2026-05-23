@echo off
title Accounting Application Launcher
echo ===================================================
echo   Starting Accounting Application...
echo ===================================================
echo.

:: Start Backend in a new window (uses /D to set start directory cleanly)
echo Starting Backend (FastAPI on http://127.0.0.1:8500)...
start "Accounting Backend" /D "%~dp0backend" cmd /k "python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8500"

:: Start Frontend in a new window (uses /D to set start directory cleanly)
echo Starting Frontend (Next.js on http://localhost:3000)...
start "Accounting Frontend" /D "%~dp0frontend" cmd /k "npm run dev"

echo.
echo ===================================================
echo   Application started successfully!
echo   - Backend: http://127.0.0.1:8500
echo   - Frontend: http://localhost:3000
echo ===================================================
echo.
pause
