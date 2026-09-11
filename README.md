# OmniSurv Enterprise — Autonomous AI Exam Surveillance System

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104%2B-009688.svg)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18.0%2B-61DAFB.svg)](https://reactjs.org/)
[![YOLOv8](https://img.shields.io/badge/YOLOv8-Ultralytics-FF6F00.svg)](https://ultralytics.com/)
[![MediaPipe](https://img.shields.io/badge/MediaPipe-FaceLandmarker-007FFF.svg)](https://developers.google.com/mediapipe)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An enterprise-grade, autonomous exam surveillance and proctoring platform. OmniSurv monitors exam environments in real-time, detects behavioral anomalies using state-of-the-art computer vision and Vision-Language Models (VLMs), manages live candidate attendance, and generates tamper-evident forensic compliance dossiers for academic institutions and certification centers.

---

## 🌟 Key Capabilities

### 1. Tactical Multi-Person Computer Vision
- **YOLOv8 + ByteTrack**: Real-time multi-candidate detection, bounding-box tracking, and persistent spatial tracking IDs across frame drops.
- **Unauthorized Item Detection**: Autonomous detection of mobile phones, concealed cheat sheets, smart devices, and books.
- **MediaPipe 3D Face Landmarker**: High-fidelity 478-point facial mesh tracking head pose (pitch, yaw, roll), abnormal posture departures, eye gaze vectors, and face obscuration.
- **Decibel Audio Telemetry**: Microphone RMS sound level capture (dB) for speech and room disturbance alerting.

### 2. Multimodal VLM Behavioral Reasoning
- **Deep Contextual Inspection**: Suspicious candidate crops are routed to Vision-Language Models (Qwen3-VL / Moondream) to eliminate false positives and verify cheating intent (e.g., hidden earpieces, whispering, peeking at neighbor's paper).
- **Forensic Reasoning Logs**: Every flagged infraction includes natural language proctor notes and VLM rationales attached to the incident record.

### 3. Live Dynamic Candidate Roster & Attendance Desk
- **Automated Cohort Seeding**: Instantly generates enrolled student cohorts with registration IDs, roll numbers, and seat coordinates.
- **Biometric CV Auto Check-In**: When a candidate enters the camera frame, the detection engine automatically binds the detection track to the student record, marks them `CHECKED_IN`, and records their arrival timestamp.
- **Proctor Attendance Desk**: Search candidates by name or seat, toggle check-ins, or trigger 1-click **"Mark All Present"** batch verification.
- **Global Attendance Telemetry**: Live verified ratio meters (e.g., `29 of 30 Verified · 97%`) visible across the top command bar and workspace tabs.

### 4. Obsidian Dark Command Center
- **Enterprise Design System**: Linear/Vercel-inspired dark theme (`#09090b` / `#0f0f12`), frosted glass cards (`.glass-panel`), and custom dark scrollbars.
- **Tactical Camera Monitor HUD**: High-tech feed framing with resolution badges (`LIVE 1080p · 30 FPS`), tactical bounding box overlays (`TRK #...`), and live stream latency pills.
- **Auditor Video Inspection Desk**: Scrub recorded evidence clips frame-by-frame with custom timecode playback and speed controls.

### 5. Forensic Compliance Dossiers & Media Exports
- **Exportable PDF Compliance Dossiers**: Server-side ReportLab document synthesis including session telemetry, infraction breakdowns, candidate risk scorecards, and keyframe evidence snapshots.
- **Media Evidence Exports**: 1-click downloads for individual `.mp4` video clips, high-resolution `.jpg` keyframes, and raw structured `.json` telemetry.

### 6. Role-Based Access Control (RBAC) & Governance
- **Three Tiered Profiles**: `Administrator` (system settings & staff management), `Chief Auditor` (forensic reviews & compliance downloads), and `Exam Proctor` (live monitoring & flags).
- **Two-Man Rule Governance**: Sensitive actions (e.g., candidate disqualification or audit log overrides) require secondary sign-off.

---

## 🏛️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│               OMNISURV ENTERPRISE ARCHITECTURE              │
└─────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                    INPUT LAYER                               │
├──────────────────────────────────────────────────────────────┤
│  • Camera feeds (USB / RTSP / IP cameras / Video files)      │
│  • Microphone audio capture (RMS dB level monitoring)        │
│  • System clock synchronization (UTC)                        │
└──────────────────────────────────────────────────────────────┘
                               ↓
┌──────────────────────────────────────────────────────────────┐
│                AI COMPUTER VISION PIPELINE                   │
├──────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ DETECTION & OBJECT TRACKING (YOLOv8 + ByteTrack)        │ │
│  │ • Person detection, phone & cheat sheet bounding boxes  │ │
│  │ • Track ID assignment & Candidate Roster Auto Check-In  │ │
│  └─────────────────────────────────────────────────────────┘ │
│                              ↓                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ FACIAL & GAZE ANALYSIS (MediaPipe FaceLandmarker)       │ │
│  │ • 478-point 3D face mesh, gaze vector estimation        │ │
│  │ • Head pose yaw/pitch/roll, abnormal posture tracking   │ │
│  └─────────────────────────────────────────────────────────┘ │
│                              ↓                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ MULTIMODAL REASONING (Vision-Language Model)            │ │
│  │ • Target region crop analysis                           │ │
│  │ • Hidden device, collaboration, and whispering audit    │ │
│  └─────────────────────────────────────────────────────────┘ │
│                              ↓                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ ANOMALY DETECTOR & EVENT RECORDER                       │ │
│  │ • Multi-rule heuristic thresholds & debouncing          │ │
│  │ • Automatic MP4 video clip synthesis & snapshot capture │ │
│  │ • Real-time WebSocket broadcasting                      │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                               ↓
┌──────────────────────────────────────────────────────────────┐
│              ENTERPRISE DASHBOARD & REPORTING                │
├──────────────────────────────────────────────────────────────┤
│  • Tactical Camera Monitor HUD (Real-time binary JPEG stream)│
│  • Candidate Roster & Attendance Desk (Live check-in/out)    │
│  • Anomaly Alert Feed & VLM Reasoning Dossier                │
│  • Telemetry & Risk Analytics (Interactive Recharts charts)  │
│  • Searchable Chronological Audit Timeline                   │
│  • Forensic Video Inspection Desk with custom timecode scrub │
│  • Exportable PDF Compliance Dossier & MP4 Evidence Clips    │
└──────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites
- Python 3.10+ (managed via `pip`, `uv`, or virtual environment)
- Node.js 18+ and npm
- USB webcam, RTSP stream, or test video file
- *(Optional)* NVIDIA GPU with CUDA for accelerated YOLOv8 & MediaPipe inference

---

### Option A: 1-Click Launch (Windows)

The repository includes a pre-configured automation script that auto-detects Python, ensures the local SQLite database directory exists, initializes `.env` from `.env.example`, and launches both Backend and Frontend servers:

```cmd
# 1. Clone your repository
git clone https://github.com/devwithsujay/Real-Time-Exam-Surveillance-System.git
cd Real-Time-Exam-Surveillance-System

# 2. Install dependencies (First-time only)
pip install -r requirements.txt
cd frontend && npm install && cd ..

# 3. Double-click or run:
start_project.bat
```
* **Frontend Dashboard**: Launches automatically at `http://localhost:3000`
* **Backend API Docs**: Running at `http://127.0.0.1:8000/docs`
* **Stop all services**: Run `stop_project.bat`

---

### Option B: Manual Step-by-Step Launch

#### 1. Backend Server
```bash
# Install Python dependencies
pip install -r requirements.txt

# Start FastAPI backend
uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

#### 2. Frontend Dashboard
```bash
cd frontend
npm install
npm start
```

---

### Default Test Staff Accounts

Staff accounts are automatically seeded into the database on first run:

| Role | Username | Default Password | Permissions |
| :--- | :--- | :--- | :--- |
| **Administrator** | `admin` | `Admin@12345` | Full system governance, staff management, exam hall creation |
| **Chief Auditor** | `auditor1` | `Auditor@12345` | Forensic evidence inspection, PDF compliance export, audit logs |
| **Exam Proctor** | `proctor1` | `Proctor@12345` | Live video HUD, attendance desk, real-time infraction flags |

---

## 📡 API Reference

### Exams & Sessions
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/exams` | Configure and initialize a new exam hall session |
| `GET` | `/api/exams` | List all exam sessions with pagination |
| `GET` | `/api/exams/{id}` | Get session details, duration, and status |
| `PUT` | `/api/exams/{id}` | Update session configuration |
| `DELETE`| `/api/exams/{id}` | Delete an exam session |
| `POST` | `/api/exams/{id}/start` | Begin AI computer vision proctoring pipeline |
| `POST` | `/api/exams/{id}/end` | Terminate session and compile final statistics |
| `GET` | `/api/exams/{id}/analytics`| Real-time aggregated telemetry and metrics |
| `GET` | `/api/exams/{id}/report` | Export Forensic Dossier (`?format=pdf` or `?format=json`) |
| `WS` | `/ws/exam/{id}` | Low-latency binary video and event WebSocket |

### Candidates & Attendance
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/exams/{id}/participants` | List enrolled candidate roster with attendance status |
| `POST` | `/api/exams/{id}/participants` | Register a candidate with seat and camera assignment |
| `POST` | `/api/exams/{id}/participants/batch-checkin` | 1-click batch check-in for all pending candidates |
| `POST` | `/api/participants/{id}/checkin` | Verify and check in individual candidate |
| `POST` | `/api/participants/{id}/checkout`| Check out candidate from exam hall |
| `GET` | `/api/participants/{id}/analytics`| Individual candidate integrity and flag history |

### Incidents & Forensics
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/exams/{id}/events` | Query chronological audit log with severity/type filters |
| `GET` | `/api/events/{id}` | Get incident details and analysis payload |
| `PUT` | `/api/events/{id}/review` | Human review: override severity or approve flag |
| `GET` | `/api/events/{id}/clip` | Stream or download evidentiary MP4 video clip |
| `GET` | `/api/events/{id}/screenshot`| Download incident evidentiary keyframe screenshot |

### Authentication & Governance
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/login` | Authenticate staff account and obtain JWT token |
| `GET` | `/api/auth/me` | Retrieve profile of current authenticated user |
| `GET` | `/api/auth/users` | List staff directory (Administrator only) |
| `POST` | `/api/auth/users` | Create staff account with role permissions |
| `GET` | `/api/auth/pending-actions` | View actions requiring dual authorization |
| `POST` | `/api/auth/pending-actions/{id}/approve` | Approve or reject pending dual-authorization action |

---

## 🗂️ Project Structure

```
Real-Time-Exam-Surveillance-System/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI application, WebSockets & REST routes
│   │   ├── config.py                # Environment configuration & Pydantic settings
│   │   ├── database.py              # SQLite / PostgreSQL engine & auto-initializer
│   │   ├── models/                  # SQLAlchemy ORM models (Exam, Participant, Event, User)
│   │   ├── schemas/                 # Pydantic v2 validation schemas
│   │   ├── crud/                    # Database operations & dynamic attendance logic
│   │   └── services/
│   │       ├── camera_manager.py     # Multi-threaded camera frame capture
│   │       ├── detection_engine.py   # YOLOv8 candidate & item inference
│   │       ├── mediapipe_analyzer.py # Gaze vectors & head pose estimation
│   │       ├── anomaly_detector.py   # Heuristic rule checks & debouncing
│   │       ├── vlm_client.py         # Multimodal reasoning client (Qwen3-VL / Moondream)
│   │       ├── event_logger.py       # Evidence clip & screenshot recorder
│   │       ├── report_generator.py   # ReportLab PDF dossier compiler
│   │       ├── audio_level.py        # Real-time microphone dB level monitor
│   │       └── auth.py               # JWT authentication & RBAC guards
│   ├── rerun_analysis.py            # Offline VLM re-analysis utility
│   ├── launch.bat                   # Backend isolated launcher
│   └── Dockerfile                   # Backend container definition
├── frontend/
│   ├── public/
│   │   ├── index.html               # Google Fonts, Tailwind config & Obsidian theme
│   │   └── mockup.html              # Reference enterprise mockup
│   ├── src/
│   │   ├── App.js                   # Enterprise dashboard shell, nav & WebSocket
│   │   ├── index.css                # Obsidian design tokens, glass panels & scrollbars
│   │   ├── context/
│   │   │   └── AuthContext.js       # Authentication state & role checks
│   │   ├── services/
│   │   │   └── api.js               # Centralized REST API service
│   │   └── components/
│   │       ├── ExamMonitor.js       # Tactical camera monitor HUD
│   │       ├── RosterView.js        # Candidate Roster & Live Attendance Desk
│   │       ├── AnalyticsBoard.js    # Telemetry, risk distribution & area charts
│   │       ├── AlertPanel.js        # Segmented anomaly cards & VLM reasoning
│   │       ├── EventTimeline.js     # Searchable chronological audit timeline
│   │       ├── IncidentViewer.js    # Forensic video inspection desk
│   │       ├── LoginModal.js        # Role-based login with 1-click test roles
│   │       ├── CreateExamModal.js   # Session hall configuration modal
│   │       └── StaffManagementModal.js # Staff RBAC directory modal
│   ├── package.json                 # Frontend dependencies
│   ├── package-lock.json            # Deterministic npm tree
│   └── Dockerfile                   # Frontend container definition
├── models/                          # Pre-trained AI weights (Zero-setup)
│   ├── yolov8n.pt                   # YOLOv8 object & candidate detector
│   └── face_landmarker.task         # MediaPipe 478-point 3D Face Landmarker
├── nginx/                           # Reverse proxy configuration
│   ├── nginx.conf
│   └── Dockerfile
├── requirements.txt                 # Backend Python package requirements
├── pyproject.toml / uv.lock         # Project dependencies & modern package lock
├── start_project.bat                # 1-click launcher (Backend + Frontend + Browser)
├── stop_project.bat                 # 1-click service shutdown
├── run_all.bat                      # Unified test & launch script
├── test_surveillance_system.py      # Full test runner & benchmark suite
├── SYSTEM_OVERVIEW.md               # Detailed system architecture document
├── .env.example                     # Environment configuration template
├── .gitignore                       # Production gitignore rules
└── README.md                        # Enterprise documentation
```

---

## 🧪 Testing & Verification

Run the comprehensive end-to-end integration and benchmark test suite:

```bash
# Run system integration test suite
python test_surveillance_system.py --url http://127.0.0.1:8000

# Verify clean production frontend build
cd frontend
npm run build
```

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.