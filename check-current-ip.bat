@echo off
echo ====================================
echo CHECKING YOUR CURRENT IP ADDRESS
echo ====================================
echo.

ipconfig | findstr /i "IPv4"

echo.
echo ====================================
echo CHECKING IF BACKEND IS RUNNING
echo ====================================
echo.

netstat -an | findstr ":5000"

echo.
echo ====================================
echo UPDATE ARDUINO SKETCH WITH THIS IP!
echo ====================================
pause
