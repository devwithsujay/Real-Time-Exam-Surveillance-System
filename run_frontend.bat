@echo off
title ARGUS Frontend (React :3000)
cd /d "%~dp0frontend"
set "BROWSER=none"
echo [*] Starting ARGUS React Frontend on port 3000...
call npm start
pause
