@echo off
title ARGUS Backend (FastAPI :8000)
cd /d "%~dp0backend"
set "PYTHONPATH=%~dp0backend;%~dp0"
if exist "C:\Users\sujay\.gemini\antigravity\playground\GEN AI Project\.venv\Scripts\python.exe" (
    set "PY_EXE=C:\Users\sujay\.gemini\antigravity\playground\GEN AI Project\.venv\Scripts\python.exe"
) else if exist "%~dp0.venv\Scripts\python.exe" (
    set "PY_EXE=%~dp0.venv\Scripts\python.exe"
) else (
    set "PY_EXE=python"
)
echo [*] Starting ARGUS FastAPI Backend on port 8000...
"%PY_EXE%" -u -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --log-level info
pause
