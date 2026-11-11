@echo off
echo Stopping all Node processes...
taskkill /F /IM node.exe 2>nul
timeout /t 3 /nobreak >nul

echo Starting backend...
npm run dev
