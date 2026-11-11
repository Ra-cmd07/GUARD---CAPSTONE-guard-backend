@echo off
echo ========================================
echo Backend HTTPS Setup
echo ========================================
echo.

echo Creating SSL certificates for backend...
echo.

REM Create certs directory
if not exist "certs" mkdir certs

REM Check if mkcert is installed
where mkcert >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ mkcert not found!
    echo.
    echo Please run SETUP_HTTPS.bat in the frontend folder first.
    echo That will install mkcert.
    pause
    exit /b
)

REM Generate certificates for backend
mkcert -cert-file certs/localhost.pem -key-file certs/localhost-key.pem localhost 192.168.1.29 127.0.0.1 ::1

echo.
echo ========================================
echo ✅ Backend certificates created!
echo ========================================
echo.
echo Files created:
echo   - certs/localhost.pem
echo   - certs/localhost-key.pem
echo.
echo The backend server.ts file needs to be updated manually.
echo See HTTPS_SETUP_GUIDE.md for instructions.
echo.
pause
