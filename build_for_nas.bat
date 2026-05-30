@echo off
echo ============================================
echo  AccountingApp - NAS Deploy Package Builder
echo ============================================
echo.

cd /d "%~dp0"

echo [1/4] Building Docker images (with NAS API URL baked in)...
docker build --build-arg NEXT_PUBLIC_API_BASE_URL=http://jbchcw.com:8500/api -t accountingapp-frontend ./frontend
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Frontend build failed!
    pause
    exit /b 1
)
docker build -t accountingapp-backend ./backend
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Backend build failed!
    pause
    exit /b 1
)
echo Build done.
echo.

echo [2/4] Creating nas_deploy folder...
if not exist "nas_deploy" mkdir "nas_deploy"
echo Folder ready.
echo.

echo [3/4] Saving Docker images to tar... (this may take a few minutes)
docker save accountingapp-frontend accountingapp-backend -o "nas_deploy\accountingapp_images.tar"
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: docker save failed!
    pause
    exit /b 1
)
echo Image saved.
echo.

echo [4/4] Copying config files...
copy /y "docker-compose.nas.yml" "nas_deploy\docker-compose.yml"
copy /y "backend\accounting.db" "nas_deploy\accounting.db"
echo Files copied.
echo.

echo ============================================
echo  DONE! Files in nas_deploy\ folder:
echo   - accountingapp_images.tar
echo   - docker-compose.yml
echo   - accounting.db
echo.
echo  Upload ALL files to:
echo  /volume1/docker/AccountingApp/  on NAS
echo  Then: docker load + docker compose up -d
echo ============================================
echo.
pause
