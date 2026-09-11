# Real-Time Exam Surveillance System (OmniSurv Enterprise) — Complete System Overview

## Executive Summary

The Real-Time Exam Surveillance System (OmniSurv Enterprise) is a production-grade autonomous proctoring and surveillance command platform. It combines YOLOv8 multi-class detection (person + cell phone + unauthorized items), MediaPipe 478-point 3D face landmark and eye gaze tracking, microphone decibel audio telemetry, and local Vision-Language Model (VLM) reasoning to detect exam integrity violations in real-time. 

Built on a decoupled architecture with FastAPI (backend) and React 18 (frontend) powered by SQLite/PostgreSQL and Redis, the platform captures multi-stream video and audio, evaluates an 8-rule anomaly detection matrix with anti-spam cooldowns, records forensic evidence (timecoded screenshots, 5-second MP4 video clips, and cryptographic audit logs), and streams low-latency annotated video feeds to a tactical browser dashboard via token-authenticated WebSockets. 

The system features complete JWT role-based access control (`ADMIN`, `AUDITOR`, `PROCTOR`), a two-person rule approval workflow for sensitive actions, automated candidate cohort seeding with dynamic computer vision check-in, runtime threshold configuration APIs, and automated ReportLab PDF forensic compliance dossier generation.

---

## 1. File Structure Diagram

```
Real-Time-Exam-Surveillance-System/
├── backend/
│   ├── app/
│   │   ├── main.py                  (~1,680 lines) — FastAPI app, REST endpoints, WebSocket pipeline, RBAC
│   │   ├── config.py                (116 lines)   — Pydantic settings, .env loading, threshold defaults
│   │   ├── database.py              (53 lines)    — SQLAlchemy engine, SQLite auto-init, connection pool, WAL mode
│   │   ├── models/
│   │   │   └── __init__.py          (175 lines)   — ORM models: Exam, Participant, Event, User, PendingAction
│   │   ├── schemas/
│   │   │   └── __init__.py          (305 lines)   — Pydantic request/response schemas (Auth, Config, Events, Exams)
│   │   ├── crud/
│   │   │   └── __init__.py          (475 lines)   — Database CRUD operations, analytics, attendance, two-man rule
│   │   └── services/
│   │       ├── camera_manager.py    (394 lines)   — Thread-safe camera frame capture queue with demo fallback
│   │       ├── detection_engine.py  (304 lines)   — YOLOv8 inference & ByteTrack multi-candidate tracking
│   │       ├── mediapipe_analyzer.py(239 lines)   — 478-point 3D face mesh, gaze vectors & head pose estimation
│   │       ├── anomaly_detector.py  (672 lines)   — 8-rule heuristic anomaly engine, debouncing, and VLM routing
│   │       ├── audio_level.py       (120 lines)   — Real-time microphone RMS decibel capture service
│   │       ├── auth.py              (240 lines)   — JWT authentication, PBKDF2 hashing, RBAC dependencies
│   │       ├── vlm_client.py        (160 lines)   — Async LM Studio Vision-Language Model client (Qwen3-VL / Moondream)
│   │       ├── report_generator.py  (310 lines)   — ReportLab PDF generation for forensic compliance dossiers
│   │       ├── redis_client.py      (95 lines)    — Redis caching, pub/sub, rate limiting fail-open client
│   │       └── event_logger.py      (270 lines)   — Event DB logging, MP4 video clip synthesis & screenshot capture
│   ├── rerun_analysis.py            (271 lines)   — Offline VLM batch re-analysis forensic utility
│   ├── launch.bat                   (35 lines)    — Backend standalone launcher
│   └── Dockerfile                   (32 lines)    — Backend containerization definition
├── frontend/
│   ├── public/
│   │   ├── index.html               (Modern Google Fonts, Inter, JetBrains Mono, meta tags)
│   │   └── mockup.html              (Static HTML prototype reference)
│   ├── src/
│   │   ├── index.js                 (10 lines)    — React DOM root entry point
│   │   ├── App.js                   (520 lines)   — Root component, Obsidian layout, navigation, WebSocket sync
│   │   ├── index.css                (650 lines)   — Obsidian design tokens, glass panels, tactical scrollbars
│   │   ├── setupProxy.js            (11 lines)    — CRA dev proxy routing /api and /ws to port 8000
│   │   ├── context/
│   │   │   └── AuthContext.js       (85 lines)    — Global auth state, JWT token storage, user roles
│   │   ├── services/
│   │   │   └── api.js               (140 lines)   — Unified Axios REST API client
│   │   └── components/
│   │       ├── ExamMonitor.js       (320 lines)   — Tactical camera monitor HUD with live track bounding overlays
│   │       ├── AlertPanel.js        (240 lines)   — Anomaly threat matrix with severity filtering & VLM reasoning
│   │       ├── AnalyticsBoard.js    (260 lines)   — Real-time telemetry, risk distributions, Recharts area graphs
│   │       ├── EventTimeline.js     (290 lines)   — Forensic chronological audit log with human review verification
│   │       ├── IncidentViewer.js    (360 lines)   — Forensic video player with timecode scrub & keyframe downloads
│   │       ├── RosterView.js        (280 lines)   — Candidate roster desk, biometric check-in, 1-click batch check-in
│   │       ├── StaffManagementModal.js (190 lines)— User management & RBAC configuration modal
│   │       ├── LoginModal.js        (130 lines)   — Role-based authentication modal with quick test logins
│   │       └── CreateExamModal.js   (110 lines)   — Exam hall creation form with auto-cohort enrollment
│   ├── package.json                 (37 lines)    — Frontend npm dependencies
│   ├── package-lock.json            — Deterministic npm dependency lock
│   └── Dockerfile                   (25 lines)    — Frontend containerization definition
├── models/                          — Pre-trained AI weights (Zero-setup tracking)
│   ├── yolov8n.pt                   (6.5 MB)      — YOLOv8 Nano object & candidate detector
│   └── face_landmarker.task         (3.7 MB)      — MediaPipe 478-point 3D Face Landmarker
├── nginx/                           — Reverse proxy & production gateway
│   ├── nginx.conf                   (45 lines)
│   └── Dockerfile                   (12 lines)
├── data/                            — Runtime data directory (Excluded from git, auto-created)
│   ├── exam_surveillance.db         — SQLite transactional database (auto-initialized)
│   ├── screenshots/                 — Captured incident evidentiary keyframes
│   └── clips/                       — Captured 5-second MP4 evidence video clips
├── archive/                         — Local developer backup (Excluded from git)
│   ├── agents/                      — Antigravity IDE custom agent skills
│   ├── test_output/                 — Generated test reports and sample dossiers
│   ├── graphify-out/                — AST code graph analyzer outputs
│   └── mockups_and_design_drafts/   — Static prototype mockups and early design notes
├── requirements.txt                 (30 lines)    — Standard Python package dependencies
├── pyproject.toml / uv.lock         (85 lines)    — Modern Python project & dependency specifications
├── start_project.bat                (45 lines)    — 1-click launcher (Python detect, .env setup, dual servers)
├── stop_project.bat                 (25 lines)    — 1-click service shutdown
├── run_all.bat                      (15 lines)    — Unified batch runner
├── test_surveillance_system.py      (1,100 lines) — End-to-end integration and benchmark test suite
├── SYSTEM_OVERVIEW.md               — Technical architecture and component verification
├── README.md                        — Enterprise documentation & setup guide
├── .env.example                     (184 lines)   — Production environment configuration template
└── .gitignore                       (88 lines)    — Git exclusion rules
```

### Layer Summary

| Layer | Primary Tech | Tracked Files | Total Code Volume |
| :--- | :--- | :--- | :--- |
| **Backend** | Python 3.10+, FastAPI, YOLOv8, MediaPipe, SQLAlchemy | 18 files | ~5,680 lines |
| **Frontend** | React 18, Tailwind CSS, Lucide, Recharts | 15 files | ~3,200 lines |
| **Automation & Infrastructure** | Batch, Shell, Nginx, Docker | 8 files | ~250 lines |
| **Pre-trained AI Models** | YOLOv8n (`.pt`), MediaPipe Landmarker (`.task`) | 2 binary models | ~10.2 MB |
| **Configuration & Specs** | `pyproject.toml`, `requirements.txt`, `.env.example` | 4 files | ~350 lines |

---

## 2. Data Flow Architecture

```
┌──────────────┐     ┌───────────────────┐     ┌──────────────────────┐
│  Webcam/RTSP │────>│   CameraManager   │────>│     Frame Queue      │
└──────────────┘     │   (thread, 30fps) │     │     (buffer=15)      │
                     └───────────────────┘     └──────────┬───────────┘
                                                          │
┌──────────────┐     ┌───────────────────┐                │
│  Microphone  │────>│ AudioLevelService │────────┐       │
└──────────────┘     │ (real-time RMS dB)│        │       │
                     └───────────────────┘        │       │
                                                  v       v
┌─────────────────────────────────────────────────────────────────────────────┐
│                          run_pipeline() [asyncio]                           │
│                                                                             │
│  ┌─────────────────────────┐         ┌─────────────────────────────────┐    │
│  │   DetectionEngine       │────────>│ ByteTrack Spatial Tracking      │    │
│  │   (YOLOv8 Person+Phone) │         │ (Stable Candidate Track IDs)    │    │
│  └─────────────────────────┘         └────────────────┬────────────────┘    │
│                                                       │                     │
│                                                       v                     │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ Multi-Layer Per-Track Analysis:                                       │  │
│  │  1. MediaPipeAnalyzer: 478 face landmarks, iris gaze, head pose       │  │
│  │  2. Phone Overlap: Spatial bbox intersection (Person x Cell Phone)    │  │
│  │  3. LM Studio VLM: Deep visual reasoning on suspicious crops          │  │
│  │  4. Audio Level: Decibel threshold breaches (> 65 dB)                 │  │
│  │  5. AnomalyDetector: Temporal smoothing, rule evaluation, cooldown    │  │
│  │  6. EventLogger: SQLite transaction, evidence screenshot + clip MP4   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                  │                                          │
│                                  v                                          │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ WebSocket Broadcast (Token Authenticated)                             │  │
│  │  • Alert Dispatch       — Real-time anomaly alerts with sound FX      │  │
│  │  • Tactical Video Feed  — Base64 frames with track metadata           │  │
│  │  • Telemetry Telecast   — Risk distribution, active cohort metrics    │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   v
┌───────────────────────────┐           ┌───────────────────────────────────┐
│     FastAPI REST API      │           │    WebSocket /ws/exam/{id}?token  │
│  • /api/auth/login        │           │    (Token-verified broadcast)     │
│  • /api/exams             │           │                                   │
│  • /api/participants      │           │                                   │
│  • /api/config (GET/PUT)  │           │                                   │
│  • /api/events/review     │           │                                   │
│  • /api/exams/*/report    │           │                                   │
│    (PDF & JSON Dossier)   │           │                                   │
└─────────────┬─────────────┘           └─────────────────┬─────────────────┘
              │                                           │
              v                                           v
┌───────────────────────────────────────────────────────────────────────────┐
│                 React Tactical Proctoring HUD (Port 3000)                 │
│                                                                           │
│   App.js ─── Unified State Engine & Role Context                          │
│     ├── Command Header (Identity badge, role indicators, quick switches)  │
│     ├── ExamMonitor (Live surveillance canvas, track bounding overlays)   │
│     ├── AlertPanel (Threat matrix, severity filtering, dismissal)         │
│     ├── AnalyticsBoard (Real-time telemetry, risk gauge, violation charts)│
│     ├── EventTimeline (Audit timeline, human proctor review workflow)     │
│     ├── IncidentViewer (Forensic video player, clipping review)           │
│     ├── RosterView (Candidate attendance, desk status, batch check-in)    │
│     ├── StaffManagementModal (User management, RBAC controls)             │
│     └── Report Export (Direct high-fidelity PDF forensic dossier)         │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Component Verification & Current Status

### A. Real-Time Video Capture & Frame Processing
| Capability | Status | Verification Detail |
| :--- | :--- | :--- |
| **Camera source initialization** | ✅ VERIFIED | `camera_manager.py` initializes `cv2.VideoCapture(self.camera_source)`. Supports USB, RTSP, and test files. |
| **Target FPS configurable** | ✅ VERIFIED | Configurable via `CAMERA_FPS` in `.env` (defaults to 30 FPS). |
| **Frame buffering & latency control** | ✅ VERIFIED | Non-blocking thread queue (buffer size 15). Automatically discards stale frames on saturation to guarantee zero latency. |
| **Demo mode fallback** | ✅ VERIFIED | Automatically falls back to synthetic video patterns if no physical camera hardware is detected. |

---

### B. YOLOv8 Multi-Class Object Detection & ByteTrack
| Capability | Status | Verification Detail |
| :--- | :--- | :--- |
| **Model loading** | ✅ VERIFIED | `DetectionEngine` loads pre-packaged `models/yolov8n.pt` with automatic CUDA GPU acceleration or CPU fallback. |
| **Multi-class inference** | ✅ VERIFIED | Configured with `target_classes = [0, 67]` detecting both candidates (`person`) and mobile devices (`cell phone`). |
| **Spatial tracking persistence** | ✅ VERIFIED | ByteTrack algorithm maintains persistent integer tracking IDs (`TRK #...`) across temporary candidate occlusions. |
| **Bounding box intersection** | ✅ VERIFIED | `_bbox_overlap()` calculates spatial intersection of candidate torso/desk region with detected contraband. |

---

### C. MediaPipe Facial Landmark & Gaze Tracking
| Capability | Status | Verification Detail |
| :--- | :--- | :--- |
| **Landmarker model** | ✅ VERIFIED | Loads pre-packaged `models/face_landmarker.task` (478 3D landmarks + iris blendshapes). |
| **Gaze direction vector** | ✅ VERIFIED | Computes iris deviation vector: classifies `LEFT`, `RIGHT`, `UP`, `DOWN`, `CENTER`. |
| **3D head pose estimation** | ✅ VERIFIED | Calculates 3D yaw, pitch, and roll angles to detect side-glancing, peering, and desk abandonment. |
| **Face obscuring detection** | ✅ VERIFIED | Triggers alert when a tracked candidate's face landmarks disappear for > 3 consecutive seconds while their body track remains present. |

---

### D. 8-Rule Anomaly Detection Engine
| Rule | Status | Implementation Details |
| :--- | :--- | :--- |
| **Phone Detection** | ✅ OPERATIONAL | Dual-layer: YOLOv8 COCO class 67 bounding box overlap + LM Studio VLM verification. |
| **Cheat Sheet / Notes** | ✅ OPERATIONAL | Sustained downward gaze deviation combined with VLM visual assessment. |
| **Unauthorized Communication**| ✅ OPERATIONAL | Extreme head rotation (> 45°) combined with mouth aspect ratio (MAR) movement. |
| **Sustained Gaze Deviation** | ✅ OPERATIONAL | Continuous gaze off-screen/off-desk exceeding configured frame duration threshold. |
| **Abnormal Posture** | ✅ OPERATIONAL | Torso and neck bend angle exceeding threshold for extended durations. |
| **Face Obscured / Absent** | ✅ OPERATIONAL | Candidate track visible but facial landmarker confidence drops to 0 for > 3 seconds. |
| **Audio Anomaly** | ✅ OPERATIONAL | Real-time `AudioLevelService` monitoring microphone RMS dB against threshold (65 dB). |
| **Visual Reasoning (VLM)** | ✅ OPERATIONAL | Local LM Studio endpoint (`http://127.0.0.1:1234/v1`) analyzes suspicious frame crops. |

---

### E. Candidate Roster & Dynamic Biometric Check-In
| Capability | Status | Implementation Details |
| :--- | :--- | :--- |
| **Automated Cohort Seeding** | ✅ OPERATIONAL | Exam hall creation automatically enrolls candidate records (`REG-2024001` to `REG-2024030`). |
| **CV Dynamic Check-In** | ✅ OPERATIONAL | Detection engine automatically binds YOLO tracking IDs to enrolled candidate records, marking them `CHECKED_IN` upon entry. |
| **Proctor Attendance Desk** | ✅ OPERATIONAL | Dedicated `/roster` view with search, filter chips, 1-click check-in/out, and batch **"Mark All Present"** verification. |
| **Sidebar Telemetry Meter** | ✅ OPERATIONAL | Live verified ratio progress bar (`29/30 Verified · 97%`) displayed globally across the HUD. |

---

### F. SQLite Event Logging & Forensic Evidence
| Capability | Status | Implementation Details |
| :--- | :--- | :--- |
| **Relational Data Persistence**| ✅ OPERATIONAL | Tables: `exams`, `participants`, `events`, `users`, `pending_actions` with indexed foreign keys. |
| **Auto-Initialization** | ✅ OPERATIONAL | Database directory `data/` and `exam_surveillance.db` are automatically created on first boot. |
| **Screenshot Evidence** | ✅ OPERATIONAL | High-resolution evidentiary keyframe snapshots saved to `data/screenshots/`. |
| **Rolling MP4 Video Clips** | ✅ OPERATIONAL | Rolling 5-second MP4 evidence clips compiled and saved to `data/clips/`. |
| **ReportLab PDF Dossiers** | ✅ OPERATIONAL | Complete multi-page forensic compliance dossiers generated server-side at `/api/exams/{id}/report?format=pdf`. |

---

### G. Security, RBAC & Two-Person Governance
| Capability | Status | Implementation Details |
| :--- | :--- | :--- |
| **JWT Authentication** | ✅ OPERATIONAL | Signed tokens (HS256) issued at `/api/auth/login`. |
| **Role Hierarchy** | ✅ OPERATIONAL | 3 roles: `ADMIN` (system & staff control), `AUDITOR` (read-only audit & reports), `PROCTOR` (live monitoring & review). |
| **Default Seed Accounts** | ✅ OPERATIONAL | Auto-seeds `admin`, `auditor1`, and `proctor1` with PBKDF2 password hashing on startup. |
| **Two-Person Rule** | ✅ OPERATIONAL | Destructive operations (such as ending an exam or deleting logs) generate a `PendingAction` requiring separate approval. |
| **WebSocket Security** | ✅ OPERATIONAL | `/ws/exam/{id}?token=<jwt>` validates token validity and proctor permissions before connection upgrade. |

---

## 4. REST API Endpoint Inventory

| Method | Path | Auth / Role | Purpose |
| :--- | :--- | :--- | :--- |
| **POST** | `/api/auth/login` | Public | Authenticate user credentials & receive JWT |
| **GET** | `/api/auth/me` | Authenticated | Get current user profile and role |
| **GET** | `/health` | Public | Health status of camera, YOLO, MediaPipe, DB |
| **GET** | `/health/cameras` | Public | Frame rate, resolution, and camera status |
| **GET** | `/api/config` | Public / Proctor | View active surveillance thresholds |
| **PUT** | `/api/config` | Admin | Update thresholds dynamically at runtime |
| **GET** | `/api/exams` | Proctor/Auditor/Admin | List all exams |
| **POST** | `/api/exams` | Admin/Proctor | Create exam & auto-seed candidate cohort |
| **GET** | `/api/exams/{id}` | Proctor/Auditor/Admin | Get exam details & statistics |
| **POST** | `/api/exams/{id}/start` | Admin/Proctor | Start surveillance pipeline |
| **POST** | `/api/exams/{id}/end` | Admin/Proctor (Two-Man Rule) | End exam & shutdown pipeline |
| **GET** | `/api/exams/{id}/participants` | Proctor/Auditor/Admin | List candidate roster with desk assignments |
| **POST** | `/api/participants/{id}/checkin` | Proctor | Check in candidate |
| **POST** | `/api/participants/{id}/checkout` | Proctor | Check out candidate |
| **POST** | `/api/exams/{id}/participants/batch-checkin` | Proctor | Batch check-in all enrolled candidates |
| **GET** | `/api/exams/{id}/events` | Proctor/Auditor/Admin | List exam events with severity filtering |
| **GET** | `/api/events/{id}` | Proctor/Auditor/Admin | Get single event details |
| **PUT** | `/api/events/{id}/review` | Proctor/Auditor/Admin | Submit human review verification |
| **GET** | `/api/events/{id}/screenshot` | Proctor/Auditor/Admin | Download evidence JPEG |
| **GET** | `/api/events/{id}/clip` | Proctor/Auditor/Admin | Download evidence MP4 video clip |
| **GET** | `/api/exams/{id}/analytics` | Proctor/Auditor/Admin | Real-time aggregate telemetry & risk stats |
| **GET** | `/api/exams/{id}/report` | Proctor/Auditor/Admin | Export forensic report (`format=pdf` or `json`) |
| **GET** | `/api/auth/pending-actions` | Admin | List two-person rule pending approval requests |
| **POST** | `/api/auth/pending-actions/{id}/approve` | Admin (Second Approver) | Approve or reject pending destructive action |
| **WS** | `/ws/exam/{id}?token=<jwt>` | Authenticated Token | Real-time telemetry, alert, & video streaming |

---

## 5. Deployment & Operation

### Prerequisites
- Python 3.10+
- Node.js 18+
- Webcam & Microphone
- *(Optional)* Local Vision Model via LM Studio (`http://127.0.0.1:1234`)
- *(Optional)* Redis server (gracefully falls back to local memory if absent)

### 1-Click Startup (Windows)
```cmd
start_project.bat
```

### Manual CLI Startup
```bash
# Terminal 1: Backend
pip install -r requirements.txt
uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload

# Terminal 2: Frontend
cd frontend
npm install
npm start
```

### Seeded Staff Credentials
| Username | Password | Role | Permissions |
| :--- | :--- | :--- | :--- |
| `admin` | `Admin@12345` | **ADMIN** | Full system control, threshold tuning, two-person rule approval |
| `auditor1` | `Auditor@12345` | **AUDITOR** | Read-only access to events, telemetry, and forensic reports |
| `proctor1` | `Proctor@12345` | **PROCTOR** | Live exam surveillance, candidate check-in, alert review |

---

## 6. Testing & Quality Assurance

Run the automated integration and benchmark test suite:

```bash
# Run system integration test suite
python test_surveillance_system.py --url http://127.0.0.1:8000

# Run frontend build verification
cd frontend && npm run build
```
