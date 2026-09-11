@echo off
title ARGUS Surveillance System Launcher
chcp 65001 >nul
cls

echo ======================================================================
echo             ARGUS - AUTONOMOUS AI EXAM SURVEILLANCE
echo ======================================================================
echo.

:: Auto-create .env from .env.example if missing on fresh clone
if not exist "%~dp0.env" (
    if exist "%~dp0.env.example" (
        echo [*] Initializing .env from .env.example...
        copy "%~dp0.env.example" "%~dp0.env" >nul
    )
)

:: Auto-create data directory if missing
if not exist "%~dp0data" (
    mkdir "%~dp0data" >nul 2>&1
)

:: Detect Python Environment with all AI & Backend dependencies
if exist "C:\Users\sujay\.gemini\antigravity\playground\GEN AI Project\.venv\Scripts\python.exe" (
    set "PY_CMD=C:\Users\sujay\.gemini\antigravity\playground\GEN AI Project\.venv\Scripts\python.exe"
) else if exist "%~dp0.venv\Scripts\python.exe" (
    set "PY_CMD=%~dp0.venv\Scripts\python.exe"
) else (
    set "PY_CMD=python"
)

echo [*] Python Interpreter: "%PY_CMD%"
echo [*] Launching FastAPI Backend (Port 8000)...
start "ARGUS Backend (FastAPI :8000)" /D "%~dp0backend" cmd /k "set PYTHONPATH=.;..& call "%PY_CMD%" -u -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --log-level info"

echo [*] Waiting for Backend to initialize...
ping 127.0.0.1 -n 5 >nul

echo [*] Launching React Frontend Dashboard (Port 3000)...
start "ARGUS Frontend (React :3000)" /D "%~dp0frontend" cmd /k "npm start"

echo.
echo ======================================================================
echo   [+] Services launched successfully:
echo       - Frontend Dashboard : http://localhost:3000
echo       - Backend API Docs   : http://127.0.0.1:8000/docs
echo       - Backend API Root   : http://127.0.0.1:8000
echo.
echo   [+] Opening browser in 3 seconds...
echo ======================================================================
ping 127.0.0.1 -n 4 >nul
start http://localhost:3000
exit
