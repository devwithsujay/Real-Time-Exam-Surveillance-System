# Real-Time Exam Surveillance System — Complete System Overview

## Executive Summary

The Real-Time Exam Surveillance System is an enterprise-grade proctoring command platform that combines YOLOv8 multi-class detection (person + cell phone), MediaPipe high-precision face landmark/gaze tracking, audio decibel capture, and local Vision-Language Model (VLM) reasoning to detect suspicious exam behavior in real-time. Built on FastAPI (backend) + React (frontend) with SQLite/Redis, the system captures video and audio streams, applies multi-layered anomaly detection rules, logs forensic evidence (screenshots, 5-second video clips, and cryptographic audit logs), and streams telemetry and live annotated video to a tactical browser dashboard via authenticated WebSockets. The platform includes full JWT role-based access control (`ADMIN`, `AUDITOR`, `PROCTOR`), a two-person rule approval system for destructive actions, automated participant attendance management, dynamic runtime configuration APIs, and comprehensive forensic PDF dossier generation.

---

## 1. File Structure Diagram

```
Real Time ESS/
├── backend/
│   ├── app/
│   │   ├── __init__.py              (empty)
│   │   ├── main.py                  (~1,640 lines) — FastAPI app, REST endpoints, WebSocket, surveillance pipeline, RBAC
│   │   ├── config.py                (116 lines)   — Pydantic settings, .env loading, Redis/VLM/Auth configs
│   │   ├── database.py              (46 lines)    — SQLAlchemy engine, SQLite connection pool, sessions
│   │   ├── models/
│   │   │   └── __init__.py          (175 lines)   — ORM models: Exam, Participant, Event, User, PendingAction + enums
│   │   ├── schemas/
│   │   │   └── __init__.py          (305 lines)   — Pydantic request/response schemas (Auth, Config, Events, Exams)
│   │   ├── crud/
│   │   │   └── __init__.py          (475 lines)   — Database CRUD operations, analytics, attendance, users, two-man rule
│   │   └── services/
│   │       ├── camera_manager.py    (394 lines)   — Thread-safe webcam capture with queue, normalize, demo fallback
│   │       ├── detection_engine.py  (304 lines)   — YOLOv8 inference & ByteTrack (person + cell phone detection)
│   │       ├── tracking_engine.py   (273 lines)   — Kalman filter multi-object tracker (SORT fallback)
│   │       ├── mediapipe_analyzer.py(239 lines)   — Face landmark detection + 3D gaze & head pose estimation
│   │       ├── anomaly_detector.py  (672 lines)   — Rule-based anomaly engine (gaze, posture, phone, audio, face obscuring)
│   │       ├── audio_level.py       (120 lines)   — Real-time microphone RMS decibel capture service
│   │       ├── auth.py              (240 lines)   — JWT authentication, PBKDF2 hashing, RBAC dependencies, WS token auth
│   │       ├── vlm_client.py        (160 lines)   — Async LM Studio Vision-Language Model client (Qwen2-VL / Moondream)
│   │       ├── report_generator.py  (310 lines)   — ReportLab PDF generation for forensic compliance dossiers
│   │       ├── redis_client.py      (95 lines)    — Redis caching, pub/sub, rate limiting fail-open client
│   │       └── event_logger.py      (270 lines)   — Event DB logging + video clip buffer + screenshot capture
│   ├── data/
│   │   ├── exam_surveillance.db     (SQLite database)
│   │   ├── clips/                   (Evidence MP4 video clips)
│   │   └── screenshots/             (Evidence JPEG screenshots)
│   ├── models/
│   │   ├── yolov8n.pt               (YOLOv8 Nano weights, ~6MB)
│   │   └── face_landmarker.task     (MediaPipe FaceLandmarker model, ~4MB)
│   └── server.log                   (runtime log output)
├── frontend/
│   ├── public/
│   │   └── index.html               (Modern fonts, styling, meta tags)
│   ├── src/
│   │   ├── index.js                 (10 lines)    — React entry point
│   │   ├── App.js                   (520 lines)   — Root component, tactical HUD layout, state, WS/API integration
│   │   ├── setupProxy.js            (11 lines)    — CRA dev proxy to backend
│   │   ├── services/
│   │   │   └── api.js               (140 lines)   — Unified API client (Auth, Exams, Roster, Config, PDF/JSON Dossier)
│   │   └── components/
│   │       ├── ExamMonitor.js       (320 lines)   — Tactical HUD camera feed + live track bounding boxes & confidence
│   │       ├── AlertPanel.js        (240 lines)   — Threat matrix alert list with severity filters & dismissals
│   │       ├── AnalyticsBoard.js    (260 lines)   — Real-time telemetry, risk distributions, charts (recharts)
│   │       ├── EventTimeline.js     (290 lines)   — Forensic audit timeline with human review verification workflow
│   │       ├── IncidentViewer.js    (360 lines)   — Incident dossier playback, evidence clips & screenshots
│   │       ├── RosterView.js        (280 lines)   — Real-time exam candidate roster, desk status, batch check-in
│   │       ├── StaffManagementModal.js (190 lines)— User management & RBAC configuration modal
│   │       ├── PendingActionsModal.js (170 lines) — Two-person rule dual-authorization verification modal
│   │       ├── LoginModal.js        (130 lines)   — Tactical authentication modal with demo credentials
│   │       └── CreateExamModal.js   (110 lines)   — Exam creation form with auto candidate seeding
│   └── build/                       (production build output)
├── .env.example                     (184 lines)   — Environment variable reference
├── .env                             (active config)
├── pyproject.toml                   (85 lines)    — Python dependencies (Poetry/uv)
├── frontend/package.json            (37 lines)    — npm dependencies
└── README.md
```

### Line Count Summary

| Layer | Files | Lines |
|-------|-------|-------|
| Backend (Python) | 18 | ~5,680 |
| Frontend (JavaScript) | 14 | ~3,150 |
| Config/Setup | 4 | ~350 |
| **Total** | **36** | **~9,180** |

---

## 2. Data Flow Architecture

```
┌──────────────┐     ┌───────────────────┐     ┌──────────────────────┐
│  Webcam (cv2)│────>│   CameraManager   │────>│     Frame Queue      │
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
│  │   DetectionEngine       │────────>│ ByteTrack Tracking              │    │
│  │   (YOLOv8 Person+Phone) │         │ (Stable Candidate Track IDs)    │    │
│  └─────────────────────────┘         └────────────────┬────────────────┘    │
│                                                       │                     │
│                                                       v                     │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ Multi-Layer Per-Track Analysis:                                       │  │
│  │  1. MediaPipeAnalyzer: 468 face landmarks, iris gaze, head pose       │  │
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
│     ├── PendingActionsModal (Two-person rule dual authorization)          │
│     └── Report Export (Direct high-fidelity PDF forensic dossier)         │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Component Verification & Current Status

### A. Real-Time Video Capture & Frame Processing

| Check | Status | Verification Detail |
|-------|--------|---------------------|
| Camera source initialized | ✅ VERIFIED | `camera_manager.py:59` initializes `cv2.VideoCapture(self.camera_source)`. |
| Target FPS configurable | ✅ VERIFIED | Configurable via `CAMERA_FPS` in `.env` (defaults to 30 FPS). |
| FPS measurement & logging | ✅ VERIFIED | Measured every 30 frames; logged in real-time. |
| Frame preprocessing | ✅ VERIFIED | Resizes cleanly to target resolution (1280x720) with aspect preservation. |
| Frame buffering | ✅ VERIFIED | Non-blocking thread queue with max size 15. Discards oldest on saturation to guarantee zero latency. |
| Demo mode fallback | ✅ VERIFIED | Automatically falls back to synthetic test pattern if camera hardware is detached or occupied. |

**Verdict:** ✅ Fully operational.

---

### B. YOLOv8 Multi-Class Object Detection & Tracking

| Check | Status | Verification Detail |
|-------|--------|---------------------|
| Model loading | ✅ VERIFIED | `DetectionEngine` loads `yolov8n.pt` with automatic CUDA GPU acceleration or CPU fallback. |
| Multi-class detection | ✅ VERIFIED | Configured with `target_classes = [0, 67]` detecting both `person` and `cell phone`. |
| Tracking algorithm | ✅ VERIFIED | ByteTrack persistence (`bytetrack.yaml`) preserves stable candidate track IDs across frames. |
| Spatial overlap analysis | ✅ VERIFIED | `_bbox_overlap()` in `main.py` detects when a phone is held or placed within candidate bounding box. |
| Alert generation | ✅ VERIFIED | Generates `PHONE_DETECTED` high-severity alert with candidate track assignment. |

**Verdict:** ✅ Fully operational — previously noted limitation regarding phone detection has been completely resolved.

---

### C. MediaPipe Facial Landmark & Gaze Tracking

| Check | Status | Verification Detail |
|-------|--------|---------------------|
| Landmarker model | ✅ VERIFIED | Loads `face_landmarker.task` model (468 3D landmarks + iris blendshapes). |
| Gaze direction estimation | ✅ VERIFIED | Computes iris deviation vector: classifies `LEFT`, `RIGHT`, `UP`, `DOWN`, `CENTER`. |
| Head pose estimation | ✅ VERIFIED | Calculates 3D yaw, pitch, and roll angles to detect side-glancing and desk abandonment. |
| Face obscuring detection | ✅ VERIFIED | Triggers alert when a tracked student's face landmarks disappear for > 3 consecutive seconds. |
| Multi-face support | ✅ VERIFIED | Analyzes up to 5 simultaneous candidate faces per frame. |

**Verdict:** ✅ Fully operational for facial analysis and gaze tracking.

---

### D. Behavior Analysis & 8-Rule Anomaly Engine

| Rule | Status | Implementation Details |
|------|--------|------------------------|
| **Phone Detection** | ✅ OPERATIONAL | Dual-layer: YOLOv8 COCO class 67 bounding box overlap + LM Studio VLM verification. |
| **Cheat Sheet / Notes** | ✅ OPERATIONAL | Sustained downward gaze deviation combined with VLM visual assessment. |
| **Unauthorized Communication** | ✅ OPERATIONAL | Extreme head rotation (> 45°) combined with mouth aspect ratio (MAR) movement. |
| **Sustained Gaze Deviation** | ✅ OPERATIONAL | Continuous gaze off-screen/off-desk exceeding configured frame duration threshold. |
| **Abnormal Posture** | ✅ OPERATIONAL | Torso and neck bend angle exceeding threshold for extended durations. |
| **Face Obscured / Absent** | ✅ OPERATIONAL | Candidate track visible but facial landmarker confidence drops to 0 for > 3 seconds. |
| **Audio Anomaly** | ✅ OPERATIONAL | Real-time `AudioLevelService` monitoring microphone RMS dB against threshold (65 dB). |
| **Visual Reasoning (VLM)** | ✅ OPERATIONAL | Local LM Studio endpoint (`http://127.0.0.1:1234/v1`) analyzes suspicious frame crops. |

**Verdict:** ✅ All 8 anomaly detection rules are fully functional with configurable temporal smoothing and anti-spam cooldowns.

---

### E. SQLite Event Logging & Evidence Persistence

| Check | Status | Verification Detail |
|-------|--------|---------------------|
| Relational schema | ✅ VERIFIED | Tables: `exams`, `participants`, `events`, `users`, `pending_actions` with indexed foreign keys. |
| Screenshot evidence | ✅ VERIFIED | Full-resolution JPEG evidence snapshot saved to `data/screenshots/` upon every anomaly. |
| Video clip buffering | ✅ VERIFIED | Rolling 5-second MP4 evidence video clip rendered and saved to `data/clips/`. |
| Human review workflow | ✅ VERIFIED | Proctors can review events, add notes, and record reviewer credentials via `PUT /api/events/{id}/review`. |
| Connection pooling | ✅ VERIFIED | Thread-safe `StaticPool` prevents SQLite lock contention. |

**Verdict:** ✅ Fully operational.

---

### F. Authentication & Role-Based Access Control (RBAC)

| Feature | Status | Implementation Details |
|---------|--------|------------------------|
| **JWT Authentication** | ✅ OPERATIONAL | Cryptographically signed tokens (HS256) issued at `/api/auth/login`. |
| **Role Hierarchy** | ✅ OPERATIONAL | 3 roles: `ADMIN` (full control), `AUDITOR` (read-only audit), `PROCTOR` (live monitoring & review). |
| **Default Seed Accounts** | ✅ OPERATIONAL | Auto-seeds `admin`, `auditor1`, and `proctor1` with PBKDF2 password hashing on startup. |
| **Two-Person Rule** | ✅ OPERATIONAL | Destructive operations (such as ending an exam or deleting logs) generate a `PendingAction` requiring separate approval. |
| **WebSocket Security** | ✅ OPERATIONAL | `/ws/exam/{id}?token=<jwt>` validates token validity and proctor permissions before connection upgrade. |

**Verdict:** ✅ Fully operational enterprise security.

---

### G. Runtime Configuration API (`GET/PUT /api/config`)

| Feature | Status | Implementation Details |
|---------|--------|------------------------|
| **`GET /api/config`** | ✅ OPERATIONAL | Returns active thresholds: `audio_threshold_db`, `gaze_deviation_frames`, `gaze_deviation_angle`, `head_pose_extreme_angle`, `posture_bend_threshold`, `frame_skip_ratio`, `vlm_enabled`. |
| **`PUT /api/config`** | ✅ OPERATIONAL | Admin-authenticated endpoint that dynamically modifies live thresholds in `Settings` and `AnomalyDetector` in memory without restarting the server. |
| **Integration** | ✅ OPERATIONAL | Verified via live test queries; changes take effect immediately on subsequent video frames. |

**Verdict:** ✅ Fully operational — previously noted limitation regarding runtime config updates is resolved.

---

### H. Forensic Dossier & Reporting

| Feature | Status | Implementation Details |
|---------|--------|------------------------|
| **PDF Dossier** | ✅ OPERATIONAL | ReportLab generates formatted PDF compliance dossiers with summary statistics, participant tables, risk scores, and full event logs at `/api/exams/{id}/report?format=pdf`. |
| **JSON Export** | ✅ OPERATIONAL | Full structured JSON telemetry available at `/api/exams/{id}/report?format=json`. |
| **Frontend Integration** | ✅ OPERATIONAL | One-click download button in the command header and incident viewer downloads PDF evidence directly. |

**Verdict:** ✅ Fully operational.

---

### I. Frontend React Tactical Command Center

| Component | Status | Verification Detail |
|-----------|--------|---------------------|
| **Command Header** | ✅ VERIFIED | Live status pills, exam switcher, active user role badge, two-person rule alerts, PDF dossier button. |
| **Defense HUD (ExamMonitor)**| ✅ VERIFIED | Live video canvas with bounding box overlays, confidence chips, track IDs, and resolution telemetry. |
| **Threat Matrix (AlertPanel)** | ✅ VERIFIED | Real-time threat feed with severity filters (CRITICAL, HIGH, MEDIUM, LOW) and audio alert toggles. |
| **Telemetry Analytics** | ✅ VERIFIED | Risk gauges, hourly violation trends, distribution charts (recharts), and active candidate metrics. |
| **Roster Desk (RosterView)** | ✅ VERIFIED | Full candidate roll call desk, check-in status, desk assignment, risk scores, and batch check-in. |
| **Audit Timeline** | ✅ VERIFIED | Searchable, paginated event log with human review verification modal and inspector. |
| **Incident Viewer** | ✅ VERIFIED | Split-screen evidence playback for saved 5-second video clips and high-res screenshots. |
| **Bug Fixes** | ✅ VERIFIED | Download icon import error fixed, duplicate style props eliminated, WebSocket auto-reconnect active. |

**Verdict:** ✅ Clean build, 0 console errors, premium aesthetic.

---

## 4. REST API Endpoint Inventory

| Method | Path | Auth / Role | Purpose |
|--------|------|-------------|---------|
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
| **GET** | `/api/actions/pending` | Admin | List two-person rule pending approval requests |
| **POST** | `/api/actions/pending/{id}/approve` | Admin (Second Approver) | Approve or reject pending destructive action |
| **WS** | `/ws/exam/{id}?token=<jwt>` | Authenticated Token | Real-time telemetry, alert, & video streaming |

---

## 5. Audit of Previously Reported Issues & Resolutions

| Issue Reported in Earlier Version | Previous Severity | Current Status | Resolution |
|-----------------------------------|-------------------|----------------|------------|
| **No Authentication / RBAC** | HIGH | ✅ **RESOLVED** | Full JWT auth, PBKDF2 hashing, 3 roles (`ADMIN`, `AUDITOR`, `PROCTOR`), two-person approval rule, WebSocket token verification. |
| **No Phone / Object Detection** | HIGH | ✅ **RESOLVED** | Added COCO class 67 (`cell phone`) to YOLOv8 inference, spatial bbox intersection analysis, and local VLM visual reasoning. |
| **Moondream VLM Incompatibility** | MEDIUM | ✅ **RESOLVED** | Implemented `LMStudioVLM` connecting to local OpenAI-compatible endpoint (`http://127.0.0.1:1234/v1`) running vision models. |
| **No Audio Capture** | MEDIUM | ✅ **RESOLVED** | Added `AudioLevelService` capturing microphone RMS dB in real-time, triggering alerts above threshold. |
| **No Runtime Config Updates** | LOW | ✅ **RESOLVED** | Added `GET /api/config` and `PUT /api/config` to read and adjust thresholds dynamically in memory. |
| **Frontend Download Icon ReferenceError** | LOW | ✅ **RESOLVED** | Imported `Download` icon in `App.js`; verified with clean compile. |
| **Duplicate Style Prop in ExamMonitor** | LOW | ✅ **RESOLVED** | Refactored into clean tactical surveillance canvas HUD. |
| **WebSocket Reconnect Fragility** | LOW | ✅ **RESOLVED** | Added token preservation, connection state checking, and auto-reconnect handling. |
| **Missing PDF Report Generation** | MEDIUM | ✅ **RESOLVED** | Implemented ReportLab engine producing multi-page forensic compliance PDF dossiers. |
| **Attendance / Roster Desynchronization** | MEDIUM | ✅ **RESOLVED** | Dynamic track-to-participant resolution, auto cohort seeding, dedicated Roster Desk UI, and batch check-in. |

---

## 6. Deployment & Operation

### Prerequisites
- Python 3.11+
- Node.js 18+
- Webcam & Microphone
- Optional: LM Studio with Vision Model (e.g. Qwen2-VL or Moondream) on `http://127.0.0.1:1234`
- Optional: Redis on `localhost:6379` (system fails open gracefully to memory if absent)

### Backend Startup
```bash
cd "Real Time ESS"
uv run --directory backend uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### Frontend Startup
```bash
cd "Real Time ESS/frontend"
npm start
```

### Default Credentials
| Username | Password | Role | Permissions |
|----------|----------|------|-------------|
| `admin` | `Admin@12345` | **ADMIN** | Full system control, threshold tuning, two-person rule approval |
| `auditor1` | `Auditor@12345` | **AUDITOR** | Read-only access to events, telemetry, and forensic reports |
| `proctor1` | `Proctor@12345` | **PROCTOR** | Live exam surveillance, candidate check-in, alert review |

---

## 7. Remaining Roadmap (Future Enhancements)

| Priority | Item | Description |
|----------|------|-------------|
| **P2** | Multi-Camera RTSP Aggregator | Ingest multiple IP camera streams into a centralized proctoring matrix. |
| **P2** | Alembic DB Migrations | Formal migration versioning for SQLite/PostgreSQL databases. |
| **P3** | WebRTC Video Streaming | Ultra-low latency H.264 video streaming over WebRTC as alternative to WebSocket JPEG frames. |
| **P3** | Audio Speech-to-Text Analysis | Whisper AI transcription for real-time speech content detection. |
