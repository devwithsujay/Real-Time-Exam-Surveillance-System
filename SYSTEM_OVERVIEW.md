# ARGUS Exam Surveillance Platform — Complete System Overview

## Executive Summary

**ARGUS** (named after **Argus Panoptes**, the all-seeing hundred-eyed giant and watchful guardian of Greek mythology) is a production-grade autonomous proctoring and surveillance command platform. It combines YOLOv8 multi-class detection (person + cell phone + unauthorized items), MediaPipe 478-point 3D face landmark and eye gaze tracking, microphone decibel audio telemetry, and local Vision-Language Model (VLM) reasoning to detect exam integrity violations in real-time. 

Built on a decoupled architecture with FastAPI (backend) and React 18 (frontend) powered by SQLite/PostgreSQL and Redis, the platform captures multi-stream video and audio, evaluates an 8-rule anomaly detection matrix with anti-spam cooldowns, records forensic evidence (timecoded screenshots, 15-second MP4 incident clips extracted from a 45s JPEG-compressed ring buffer, optional continuous full-exam session MP4 recordings, and structured forensic audit logs), and streams low-latency annotated video feeds to a tactical browser dashboard via token-authenticated WebSockets. 

The system features complete JWT role-based access control (`ADMIN`, `AUDITOR`, `PROCTOR`), a two-person rule approval workflow for sensitive actions, automated candidate cohort seeding with dynamic computer vision check-in, runtime threshold configuration APIs, and automated ReportLab PDF forensic compliance dossier generation.

---

## 1. File Structure Diagram

```
Real-Time-Exam-Surveillance-System/
├── backend/
│   ├── app/
│   │   ├── main.py                  (~2,160 lines) — FastAPI app, REST endpoints, WebSocket pipeline, RBAC, session recording & re-analysis
│   │   ├── config.py                (128 lines)   — Pydantic settings, audio block config, ring buffer (45s), clip duration (15s), recording toggle
│   │   ├── database.py              (75 lines)    — SQLAlchemy engine, auto-init, WAL mode, non-destructive migrations (status, recording_path)
│   │   ├── models/
│   │   │   └── __init__.py          (254 lines)   — ORM models: Exam (with recording_path), Participant, Event (with AnomalyStatus), User, VideoAudit
│   │   ├── schemas/
│   │   │   └── __init__.py          (395 lines)   — Pydantic validation schemas (AnomalyStatus, ExamReanalyze, Config, Events, Exams)
│   │   ├── crud/
│   │   │   └── __init__.py          (485 lines)   — Database CRUD, state transitions (update_event_status), attendance, two-man rule
│   │   └── services/
│   │       ├── camera_manager.py    (264 lines)   — Thread-safe camera frame capture queue with demo fallback
│   │       ├── session_recorder.py  (175 lines)   — Asynchronous continuous exam session MP4 recorder (thread-decoupled queue + H.264 remux)
│   │       ├── detection_engine.py  (304 lines)   — YOLOv8 inference & ByteTrack multi-candidate tracking
│   │       ├── mediapipe_analyzer.py(310 lines)   — 478-point 3D face mesh, optical gaze vectors, calibrated pitch/yaw angles
│   │       ├── anomaly_detector.py  (672 lines)   — 8-rule heuristic anomaly engine, debouncing, and VLM routing
│   │       ├── audio_level.py       (120 lines)   — Configurable microphone RMS decibel capture (dynamic 100ms window)
│   │       ├── auth.py              (240 lines)   — JWT authentication, PBKDF2 hashing, RBAC dependencies
│   │       ├── vlm_client.py        (410 lines)   — Multi-provider VLM client (LM Studio + Ollama), dynamic model discovery, JSON parser
│   │       ├── video_audit_service.py(430 lines)  — Post-hoc full exam video forensic audit & timeline engine
│   │       ├── report_generator.py  (310 lines)   — ReportLab PDF generation for forensic compliance dossiers
│   │       ├── redis_client.py      (95 lines)    — Redis caching, pub/sub, rate limiting fail-open client
│   │       └── event_logger.py      (330 lines)   — 45s JPEG circular ring buffer, 15s MP4 evidence clip synthesis & screenshots
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
│   ├── clips/                       — Captured 15-second MP4 evidence video clips (extracted from 45s ring buffer)
│   └── recordings/                  — Full continuous exam session MP4 recordings (thread-decoupled capture)
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
┌──────────────┐     ┌───────────────────┐                ├─────────────────────────────┐
│  Microphone  │────>│ AudioLevelService │────────┐       │                             │
└──────────────┘     │(100ms / 1,600 spl)│        │       │                             │
                     └───────────────────┘        │       │                             │
                                                  v       v                             v
┌─────────────────────────────────────────────────────────────────────────────┐   ┌───────────────────────────┐
│                          run_pipeline() [asyncio]                           │   │  SessionVideoRecorder     │
│                                                                             │   │  (Asynchronous Worker)    │
│  ┌─────────────────────────┐         ┌─────────────────────────────────┐    │   │  • queue.Queue(180)       │
│  │   DetectionEngine       │────────>│ ByteTrack Spatial Tracking      │    │   │  • Zero-drop display loop │
│  │   (YOLOv8 Person+Phone) │         │ (Stable Candidate Track IDs)    │    │   │  • Faststart H.264 MP4    │
│  └─────────────────────────┘         └────────────────┬────────────────┘    │   │  • Global & Exam Toggle   │
│                                                       │                     │   └─────────────┬─────────────┘
│                                                       v                     │                 │
│  ┌───────────────────────────────────────────────────────────────────────┐  │                 │
│  │ Multi-Layer Per-Track Analysis:                                       │  │                 │
│  │  1. MediaPipeAnalyzer: 478 3D landmarks, calibrated optical gaze      │  │                 │
│  │  2. Phone Overlap: Spatial bbox intersection (Person x Cell Phone)    │  │                 │
│  │  3. Multi-Provider VLM: LM Studio + Ollama visual reasoning           │  │                 │
│  │  4. Audio Level: Decibel threshold breaches (> 65 dB)                 │  │                 │
│  │  5. AnomalyDetector: Rule checks, debouncing & AnomalyStatus state    │  │                 │
│  │  6. EventLogger: 45s JPEG ring buffer -> 15s MP4 clips & screenshots  │  │                 │
│  └───────────────────────────────────────────────────────────────────────┘  │                 │
│                                  │                                          │                 │
│                                  v                                          │                 │
│  ┌───────────────────────────────────────────────────────────────────────┐  │                 │
│  │ WebSocket Broadcast (Token Authenticated)                             │  │                 │
│  │  • Alert Dispatch       — State transitions (PRELIMINARY -> RESOLVED) │  │                 │
│  │  • Tactical Video Feed  — Base64 frames with track bounding metadata  │  │                 │
│  │  • Telemetry Telecast   — Risk distribution, active cohort metrics    │  │                 │
│  └───────────────────────────────────────────────────────────────────────┘  │                 │
└──────────────────────────────────┬──────────────────────────────────────────┘                 │
                                   │                                                            │
                                   v                                                            │
┌──────────────────────────────────────────────────┐                                            │
│                 FastAPI REST API                 │                                            │
│  • /api/auth/login, /api/auth/me                 │                                            │
│  • /api/exams (CRUD, /start [toggle], /end)      │                                            │
│  • /api/exams/{id}/recording (Session MP4 stream)│◄───────────────────────────────────────────┘
│  • /api/exams/{id}/reanalyze (1-click AI audit)  │────> VideoAuditService (Timeline Heatmap)
│  • /api/events/{id}/status (Lifecycle triage)    │
│  • /api/events/{id}/clip (15s MP4 evidence)      │
│  • /api/participants, /api/config (GET/PUT)      │
│  • /api/exams/{id}/report (PDF & JSON Dossier)   │
└─────────────────────────┬────────────────────────┘
                          │
                          v
┌───────────────────────────────────────────────────────────────────────────┐
│                 React Tactical Proctoring HUD (Port 3000)                 │
│                                                                           │
│   App.js ─── Unified State Engine & Role Context                          │
│     ├── Command Header (Identity badge, role indicators, quick switches)  │
│     ├── ExamMonitor (Live surveillance canvas, track bounding overlays)   │
│     ├── AlertPanel (State machine badges, quick triage, severity filter)  │
│     ├── AnalyticsBoard (Real-time telemetry, risk gauge, violation charts)│
│     ├── EventTimeline (Audit timeline, human proctor review workflow)     │
│     ├── IncidentViewer (Forensic video player, 15s clip scrub & downloads)│
│     ├── RosterView (Candidate attendance, desk status, batch check-in)    │
│     ├── Session Controls (Continuous recording toggle & 1-click Re-audit) │
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
| **3D Calibrated Gaze Vector** | ✅ VERIFIED | Computes 3D eyeball approximate center from canthi landmarks (33, 133, 362, 263); calculates optical gaze vector with calibrated pitch ($\theta_{\text{pitch}}$) and yaw ($\theta_{\text{yaw}}$) angles in degrees. |
| **3D head pose estimation** | ✅ VERIFIED | Calculates 3D yaw, pitch, and roll angles to detect side-glancing, peering, and desk abandonment. |
| **Face obscuring detection** | ✅ VERIFIED | Triggers alert when a tracked candidate's face landmarks disappear for > 3 consecutive seconds while their body track remains present. |

---

### D. 8-Rule Anomaly Detection Engine & State Machine Triage
| Rule / Capability | Status | Implementation Details |
| :--- | :--- | :--- |
| **Phone Detection** | ✅ OPERATIONAL | Dual-layer: YOLOv8 COCO class 67 bounding box overlap + VLM visual confirmation. |
| **Cheat Sheet / Notes** | ✅ OPERATIONAL | Sustained downward gaze deviation combined with VLM visual assessment. |
| **Unauthorized Communication**| ✅ OPERATIONAL | Extreme head rotation (> 45°) combined with mouth aspect ratio (MAR) movement. |
| **Sustained Gaze Deviation** | ✅ OPERATIONAL | Continuous gaze off-screen/off-desk exceeding configured frame duration threshold. |
| **Abnormal Posture** | ✅ OPERATIONAL | Torso and neck bend angle exceeding threshold for extended durations. |
| **Face Obscured / Absent** | ✅ OPERATIONAL | Candidate track visible but facial landmarker confidence drops to 0 for > 3 seconds. |
| **Configurable Audio Anomaly** | ✅ OPERATIONAL | Real-time `AudioLevelService` with dynamic 100ms sampling window (1,600 samples at 16 kHz) monitoring microphone RMS dB against threshold (65 dB). |
| **Multi-Provider VLM Reasoning**| ✅ OPERATIONAL | Unified client supporting LM Studio (`/v1`) and Ollama (`/api/generate`), automated model discovery (`/models`, `/api/tags`), and structured JSON response parsing. |
| **Anomaly State Machine** | ✅ OPERATIONAL | Strict lifecycle states: `PRELIMINARY` (pulsing amber), `AI_CONFIRMED` (crimson), `AI_CLEARED` (emerald), `NEEDS_REVIEW` (purple), `HUMAN_RESOLVED` (blue), and `ERROR`. |

---

### E. Candidate Roster & Dynamic Biometric Check-In
| Capability | Status | Implementation Details |
| :--- | :--- | :--- |
| **Automated Cohort Seeding** | ✅ OPERATIONAL | Exam hall creation automatically enrolls candidate records (`REG-2024001` to `REG-2024030`). |
| **CV Dynamic Check-In** | ✅ OPERATIONAL | Detection engine automatically binds YOLO tracking IDs to enrolled candidate records, marking them `CHECKED_IN` upon entry. |
| **Proctor Attendance Desk** | ✅ OPERATIONAL | Dedicated `/roster` view with search, filter chips, 1-click check-in/out, and batch **"Mark All Present"** verification. |
| **Sidebar Telemetry Meter** | ✅ OPERATIONAL | Live verified ratio progress bar (`29/30 Verified · 97%`) displayed globally across the HUD. |

---

### F. SQLite Event Logging, Session Recording & Forensics
| Capability | Status | Implementation Details |
| :--- | :--- | :--- |
| **Relational Data Persistence**| ✅ OPERATIONAL | Tables: `exams` (with `recording_path`), `participants`, `events` (with `status`), `users`, `pending_actions`, and `video_audits`. |
| **Non-Destructive Migrations** | ✅ OPERATIONAL | Automatic schema auto-detection via `PRAGMA table_info` executing safe `ALTER TABLE` additions without data loss. |
| **JPEG Ring Buffer** | ✅ OPERATIONAL | 45-second circular ring buffer in RAM storing compressed JPEG bytes, reducing memory usage by **99.46%** (~14.68 KB per frame). |
| **15-Second Evidence MP4 Clips**| ✅ OPERATIONAL | Rolling 15-second MP4 evidence clips compiled from ring buffer on infraction triggers (configurable up to 20s via `EVENT_CLIP_DURATION_SECONDS`). |
| **Continuous Session Recording**| ✅ OPERATIONAL | Thread-decoupled `SessionVideoRecorder` with `queue.Queue(180)` capturing entire exam into browser-playable faststart H.264 MP4 with UI toggle. |
| **1-Click Forensic Re-Analysis**| ✅ OPERATIONAL | Post-hoc audit engine (`POST /api/exams/{id}/reanalyze`) delegating to `VideoAuditService` for automated whole-video timeline scans. |
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
| **POST** | `/api/exams/{id}/start` | Admin/Proctor | Start surveillance pipeline (`?record_full_session=true` toggle) |
| **POST** | `/api/exams/{id}/end` | Admin/Proctor (Two-Man Rule) | End exam & shutdown pipeline |
| **GET** | `/api/exams/{id}/recording` | Proctor/Auditor/Admin | Stream or download complete session MP4 recording |
| **POST** | `/api/exams/{id}/reanalyze` | Admin/Proctor | Launch 1-click asynchronous forensic video audit scan |
| **GET** | `/api/exams/{id}/participants` | Proctor/Auditor/Admin | List candidate roster with desk assignments |
| **POST** | `/api/participants/{id}/checkin` | Proctor | Check in candidate |
| **POST** | `/api/participants/{id}/checkout` | Proctor | Check out candidate |
| **POST** | `/api/exams/{id}/participants/batch-checkin` | Proctor | Batch check-in all enrolled candidates |
| **GET** | `/api/exams/{id}/events` | Proctor/Auditor/Admin | List exam events with severity & status filtering |
| **GET** | `/api/events/{id}` | Proctor/Auditor/Admin | Get single event details & VLM reasoning |
| **PATCH**| `/api/events/{id}/status` | Proctor/Auditor/Admin | Transition anomaly status (`PRELIMINARY`, `CONFIRMED`, `RESOLVED`, etc.) |
| **PUT** | `/api/events/{id}/review` | Proctor/Auditor/Admin | Submit human review verification & notes |
| **GET** | `/api/events/{id}/screenshot` | Proctor/Auditor/Admin | Download evidentiary keyframe JPEG |
| **GET** | `/api/events/{id}/clip` | Proctor/Auditor/Admin | Download 15s evidentiary MP4 video clip |
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
- *(Optional)* Local Vision Model via LM Studio (`http://127.0.0.1:1234`) or Ollama (`http://localhost:11434`)
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

Run the automated test suites:

```bash
# 1. Run unit test suite covering all architecture upgrades (Phases 1, 3, 4, 5, 6 & Session Recording)
python -m pytest backend/tests/test_planned_upgrades.py -v

# 2. Run system integration and benchmark test suite
python test_surveillance_system.py --url http://127.0.0.1:8000

# 3. Run frontend build verification
cd frontend && npm run build
```
