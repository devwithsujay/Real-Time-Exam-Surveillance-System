@echo off
cd /d C:\Users\sujay\Downloads\Real Time ESS\backend
set PYTHONPATH=.;..
"C:\Users\sujay\.gemini\antigravity\playground\GEN AI Project\.venv\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8000
