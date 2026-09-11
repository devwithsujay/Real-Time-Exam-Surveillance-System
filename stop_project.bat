@echo off
title Stop ARGUS Surveillance System
cls

echo ======================================================================
echo              STOPPING ARGUS SURVEILLANCE SERVICES
echo ======================================================================
echo.

echo [*] Stopping Backend on port 8000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a 2>nul
)

echo [*] Stopping Frontend on port 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a 2>nul
)

echo.
echo [*] Done! All ARGUS services stopped.
timeout /t 3
exit
