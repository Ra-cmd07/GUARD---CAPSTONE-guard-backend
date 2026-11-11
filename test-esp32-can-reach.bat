@echo off
echo ================================================
echo TESTING IF ESP32 CAN REACH YOUR COMPUTER
echo ================================================
echo.
echo Your computer IP: 10.194.43.63
echo Backend port: 5000
echo ESP32 IP: 10.194.43.57
echo.

echo Testing if backend responds...
curl -s http://10.194.43.63:5000/api/gsm/pending?kiosk_id=1

echo.
echo ================================================
echo If you see JSON data above, backend is working!
echo If ESP32 shows "Waiting", it can't reach this IP
echo ================================================
pause
