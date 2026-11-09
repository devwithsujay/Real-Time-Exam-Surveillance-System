# ARGUS Automated Verification Test Suite — Guide

This document describes the automated empirical test suite integrated into the **ARGUS Autonomous AI Exam Surveillance Platform**.

---

## 📑 Overview

The test suite runs **10 realistic, empirical test cases** covering every critical subsystem of the platform:

| Test ID | Category | Test Case Name | Target Subsystem |
| :--- | :--- | :--- | :--- |
| `TC-CORE-01` | Core Functionality | YOLOv8 Candidate Detection & Bounding Box Extraction | `DetectionEngine` (YOLOv8 + ByteTrack) |
| `TC-CORE-02` | Core Functionality | MediaPipe 3D Face Landmarker & Gaze Angle Estimation | `MediaPipeAnalyzer` (478-point mesh) |
| `TC-CORE-03` | Core Functionality | Anomaly State Machine Temporal Threshold & Alert Dispatch | `AnomalyDetector` rule state machine |
| `TC-CORE-04` | Core Functionality | Exam & Candidate Attendance Lifecycle CRUD | Database ORM, Candidate Seeding & Check-in |
| `TC-EDGE-01` | Edge Cases & Bad Input | Degenerate, Blank & Corrupt Frame Robustness | All-zero, 1x1, and saturated image matrices |
| `TC-EDGE-02` | Edge Cases & Bad Input | Acoustic Boundary Conditions & Decibel Dynamic Range | Decibel RMS audio telemetry & clipping logic |
| `TC-EDGE-03` | Edge Cases & Bad Input | Anomaly Cooldown Throttling & Alert Deduplication | 100-frame rapid-fire alert throttling |
| `TC-ERR-01` | Error Recovery | Multimodal VLM Offline Graceful Degradation | `LMStudioVLM` offline endpoint fallback |
| `TC-PERF-01` | Performance | YOLOv8 Inference Latency Distribution & FPS Throughput | 15-iteration GPU benchmark (Mean, P95, FPS) |
| `TC-PERF-02` | Performance | Surveillance Dataset Integrity & System Resource Profiling | SQLite 500+ event triage audit & RSS Memory/CPU |

---

## 🚀 How to Run

### 1. Automatic Startup Run (Default)
Whenever the ARGUS FastAPI backend initializes (via `start_project.bat`, `run_backend.bat`, or `uvicorn app.main:app`), the test suite automatically triggers as a **decoupled background daemon thread** after a 3-second initialization delay.

- **Non-blocking**: Server startup and port binding are never blocked.
- **Fail-safe**: Test exceptions or assertions can never crash the main backend application.

### 2. Manual CLI Run
You can run the full suite at any time from the terminal:

```bash
# From the project root
python run_tests.py

# Or targeting a custom report destination
python run_tests.py --output ./reports
```

Using the project virtual environment directly:
```powershell
& "C:\Users\sujay\.gemini\antigravity\playground\GEN AI Project\.venv\Scripts\python.exe" run_tests.py
```

---

## ⚙️ How to Disable Startup Testing

Startup execution is controlled by the `RUN_STARTUP_TESTS` setting. You can disable it using any of the following methods:

### Method A: In `.env` file
Open `.env` (or `.env.example`) in the project root and set:
```dotenv
RUN_STARTUP_TESTS=False
```

### Method B: Environment Variable
```powershell
# Windows PowerShell
$env:RUN_STARTUP_TESTS="false"

# Windows Command Prompt
set RUN_STARTUP_TESTS=false
```

---

## 📊 How to Read Reports

Reports are automatically generated and saved to the `reports/` folder:
- **Markdown Dossier**: `reports/test_report_<TIMESTAMP>.md` and `reports/LATEST_TEST_REPORT.md`
- **JSON Telemetry**: `reports/test_report_<TIMESTAMP>.json`
- **HTML Dashboard**: `reports/test_report_<TIMESTAMP>.html` and `reports/latest_test_report.html`

### Report Sections
1. **Executive Summary**: Total tests, passed, failed, duration, and overall status.
2. **Experimental & Runtime Environment**: Machine specifications, OS build, CPU model, RAM, GPU device name, and exact versions of PyTorch, CUDA, OpenCV, Ultralytics, MediaPipe, and FastAPI.
3. **Test Results Matrix**: High-level table formatted for direct copying into academic research papers or technical project reports.
4. **Per-Test Forensic Breakdown**: Detailed inputs, expected vs actual outputs, execution time in milliseconds, and raw JSON telemetry per test.
5. **Statistical Latency & Throughput Benchmark**: Statistical distribution of inference latency (Mean, Median, P95, Min, Max, Standard Deviation, Effective FPS).
6. **Surveillance Dataset Audit**: Real distribution of anomaly events (`AI_CONFIRMED`, `AI_CLEARED`, `PRELIMINARY`, `NEEDS_REVIEW`, `HUMAN_RESOLVED`) alongside process RAM (RSS MB) and CPU load.

---

## 🛠️ Files Created & Modified

- **[automated_test_suite.py](file:///c:/Users/sujay/Downloads/Real%20Time%20ESS/backend/tests/automated_test_suite.py)**: Test suite implementation and report generator.
- **[run_tests.py](file:///c:/Users/sujay/Downloads/Real%20Time%20ESS/run_tests.py)**: Root workspace CLI runner.
- **[backend/app/config.py](file:///c:/Users/sujay/Downloads/Real%20Time%20ESS/backend/app/config.py)**: Added `RUN_STARTUP_TESTS` and `STARTUP_TESTS_DELAY_SECONDS`.
- **[backend/app/main.py](file:///c:/Users/sujay/Downloads/Real%20Time%20ESS/backend/app/main.py)**: Integrated background daemon thread execution into the FastAPI `lifespan` hook.
- **[.env](file:///c:/Users/sujay/Downloads/Real%20Time%20ESS/.env)** & **[.env.example](file:///c:/Users/sujay/Downloads/Real%20Time%20ESS/.env.example)**: Documented `RUN_STARTUP_TESTS=True`.
- **[reports/](file:///c:/Users/sujay/Downloads/Real%20Time%20ESS/reports/)**: Directory containing timestamped and latest Markdown, JSON, and HTML benchmark reports.
