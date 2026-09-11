# Real-Time Exam Surveillance System (OmniSurv Enterprise)

An AI-powered, autonomous proctoring and exam surveillance platform that monitors exam environments in real-time, detects suspicious behavior using computer vision and Vision-Language Models (VLMs), tracks live candidate attendance, and generates forensic compliance dossiers for academic institutions and certification centers.

---

## 🚀 Recent Updates & Enhancements

### 1. Sleek Minimalist Enterprise UI/UX Overhaul
- **Obsidian Dark Design System**: Redesigned from the ground up using a Linear/Vercel-inspired dark theme (`#09090b` / `#0f0f12`), hairline subtle zinc borders (`rgba(255,255,255,0.07)`), frosted glass cards (`.glass-panel`, `.glass-card`), and custom dark scrollbars.
- **Enterprise Typography**: Integrated Google Fonts (`Inter` 300–800 for clean enterprise hierarchy, `JetBrains Mono` for real-time telemetry metrics, timecodes, and tracking IDs).
- **Iconography & Micro-Interactions**: Eliminated all raw emojis in favor of Lucide feather icons with glowing badge containers and status indicators.
- **Tactical Camera Monitor HUD**: High-tech camera card framing with resolution/FPS badges (`LIVE 1080p · 30 FPS`), tactical bounding box overlays (`TRK #...`), signal status badges, and rapid proctoring controls.
- **Top Command Bar**: Live WebSocket connectivity indicators with glowing pulse, stream latency pills, active exam hall breadcrumb, role status tags, and quick-action toolbars.

### 2. Live Dynamic Attendance & Candidate Roster Desk
- **Automated Cohort Seeding**: When an exam hall is initialized with an enrolled capacity, candidate records (`REG-2024001` to `REG-2024030`, `Candidate 01`...) are automatically enrolled and linked to the session hall.
- **Computer Vision Dynamic Check-In**: When YOLO detects a candidate in the camera feed, the backend automatically binds the detection to an enrolled student, marks them `CHECKED_IN`, sets their live track ID (`TRK #...`), and records `check_in_time`.
- **Candidate Roster & Attendance Desk (`/roster`)**:
  - Live attendance telemetry cards (`Enrolled Capacity`, `Present / Checked In`, `Pending`, `Departed`).
  - Real-time Attendance Ratio progress bar (e.g., `29 of 30 Verified · 97%`).
  - Search candidates by Name, Roll Number, or Seat Number with status filter chips.
  - 1-click candidate Check-In and Check-Out.
  - 1-click **"Mark All Present"** batch check-in (`POST /api/exams/{id}/participants/batch-checkin`).
- **Sidebar Live Telemetry Footer**: Real-time attendance meter and animated progress bar (e.g. `29/30 (97%)`) visible across all workspace tabs.

### 3. Forensic Evidence Dossier & Media Downloads
- **Export Forensic Dossier (`.pdf`)**: Server-side ReportLab document generation (`/api/exams/{id}/report?format=pdf`), including:
  - Session metadata (hall name, location, scheduled times, duration).
  - Telemetry summary statistics and infraction percentages.
  - Violation distribution breakdown table.
  - Candidate attendance and risk score roster.
  - Chronological incident evidence screenshots with timecodes, severity badges, and Vision-Language Model (VLM) reasoning notes.
- **Individual Incident Media Downloads**:
  - Evidence video clips download as **`.mp4`** files (`/api/events/{id}/clip`).
  - High-resolution evidentiary keyframes download as **`.jpg`** / **`.png`** (`/api/events/{id}/screenshot`).
  - Structured raw telemetry export as **`.json`** (`/api/exams/{id}/report?format=json`).

### 4. Stability & Build Cleanliness
- Configured IDE settings to suppress unknown CSS at-rule warnings and removed redundant client directives.
- Resolved all React Hook dependency lint warnings for clean production builds (`npm run build` exits 0 with zero warnings).
- Fixed Python backend name bindings (`uuid`, `utcnow`) and eliminated redundant string conversions.

---

## Features

- **Multi-person detection & tracking** across exam halls using YOLOv8 + ByteTrack
- **Real-time behavior analysis** - eye gaze, head pose, facial expressions via MediaPipe FaceLandmarker
- **Suspicious activity detection** - phone usage, cheat sheets, unauthorized items, abnormal posture, talking
- **VLM-powered contextual analysis** - Moondream / Qwen-VL for multimodal behavior reasoning
- **Live proctor dashboard** - multi-camera feeds, live HUD overlays, alerts, telemetry analytics
- **Live Candidate Attendance Desk** - biometric tracking, automated CV check-in, manual proctor controls
- **Forensic Evidence Dossiers** - downloadable timestamped PDF compliance reports and MP4 evidence clips
- **Audio anomaly detection** - microphone RMS level capture (dB) for speech and ambient disturbance detection
- **Role-Based Access Control (RBAC)** - Administrator, Chief Auditor, and Exam Proctor profiles

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│               OMNISURV ENTERPRISE ARCHITECTURE              │
└─────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                    INPUT LAYER                               │
├──────────────────────────────────────────────────────────────┤
│  • Camera feeds (USB / RTSP / IP cameras / Video files)      │
│  • Microphone audio capture (RMS dB level monitoring)        │
│  • System clock synchronization (NTP / UTC)                  │
└──────────────────────────────────────────────────────────────┘
                               ↓
┌──────────────────────────────────────────────────────────────┐
│                AI COMPUTER VISION PIPELINE                   │
├──────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ DETECTION & POSE (YOLOv8)                               │ │
│  │ • Person detection, bounding boxes,cell phone detection │ │
│  │ • Pose keypoint extraction                              │ │
│  └─────────────────────────────────────────────────────────┘ │
│                              ↓                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ TRACKING & IDENTITY (ByteTrack)                         │ │
│  │ • Consistent track IDs across frames                    │ │
│  │ • Dynamic binding to Candidate Roster / Auto Check-In   │ │
│  └─────────────────────────────────────────────────────────┘ │
│                              ↓                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ FACIAL & GAZE ANALYSIS (MediaPipe)                      │ │
│  │ • 468-point face mesh, eye gaze vector estimation       │ │
│  │ • Head pose yaw/pitch/roll, abnormal posture tracking   │ │
│  └─────────────────────────────────────────────────────────┘ │
│                              ↓                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ MULTIMODAL REASONING (Vision-Language Model)            │ │
│  │ • Cropped candidate region analysis                     │ │
│  │ • Cheating, earbud, communication detection             │ │
│  └─────────────────────────────────────────────────────────┘ │
│                              ↓                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ ANOMALY DETECTOR & EVENT LOGGER                         │ │
│  │ • Multi-rule heuristics, cooldown debouncing            │ │
│  │ • Evidence video clipping & screenshot generation       │ │
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

## Technology Stack

### Backend
- **Python 3.10+ / 3.11** with **FastAPI**
- **YOLOv8** (Ultralytics) - Real-time candidate & object detection
- **ByteTrack** - High-performance multi-object tracking
- **MediaPipe** - 468-point Face Landmarker & head pose estimation
- **Vision-Language Models (VLM)** - Moondream2 / Qwen3-VL for multimodal behavior reasoning
- **ReportLab** - Automated PDF forensic report generation
- **SQLAlchemy + SQLite / PostgreSQL** - Enterprise data persistence
- **SoundDevice** - Microphone RMS audio level monitoring
- **OpenCV & imageio-ffmpeg** - Frame processing and MP4 video clip synthesis

### Frontend
- **React 18** with functional components & hooks
- **Tailwind CSS + Custom Obsidian Theme** - Dark enterprise SaaS design system
- **Lucide React** - Modern vector iconography
- **Recharts** - Dynamic telemetry and anomaly area charts
- **Native WebSockets** - Low-latency binary video streaming and event pub/sub

---

## Quick Start

### 1. Prerequisites
- Python 3.10+ (managed via `uv` or standard virtual environment)
- Node.js 18+ and npm
- USB webcam, RTSP stream, or test video file
- (Optional) NVIDIA GPU with CUDA for accelerated YOLOv8 and MediaPipe inference

### 2. Backend Setup
```bash
# Clone repository
git clone https://github.com/sujay-dev/exam-surveillance.git
cd exam-surveillance

# Launch backend with uv
uv run --directory backend uvicorn app.main:app --host 127.0.0.1 --port 8000
```
* Backend API documentation: `http://127.0.0.1:8000/docs`
* Default staff accounts are seeded on first launch (`admin`, `auditor1`, `proctor1` with password `<Role>@12345`).

### 3. Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm start
```
* Dashboard will be live at `http://localhost:3000`
* Proxy configured to route `/api` and `/ws` to `http://localhost:8000`.

---

## API Endpoints Reference

### Exams & Sessions
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/exams` | Configure and initialize new exam hall session |
| `GET` | `/api/exams` | List all exam sessions with pagination |
| `GET` | `/api/exams/{id}` | Get session details, duration, and status |
| `PUT` | `/api/exams/{id}` | Update session configuration |
| `DELETE`| `/api/exams/{id}` | Delete exam session |
| `POST` | `/api/exams/{id}/start` | Begin AI computer vision proctoring pipeline |
| `POST` | `/api/exams/{id}/end` | Terminate session and compile final statistics |
| `GET` | `/api/exams/{id}/analytics`| Real-time aggregated telemetry and metrics |
| `GET` | `/api/exams/{id}/report` | Export Forensic Dossier (`?format=pdf` or `?format=json`) |
| `WS` | `/ws/exam/{id}` | Low-latency binary video and event WebSocket |

### Candidates & Attendance
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/exams/{id}/participants` | List enrolled candidate roster with attendance status |
| `POST` | `/api/exams/{id}/participants` | Register candidate with seat and camera assignment |
| `POST` | `/api/exams/{id}/participants/batch-checkin` | 1-click batch check-in for all pending students |
| `POST` | `/api/participants/{id}/checkin` | Verify and check in individual candidate |
| `POST` | `/api/participants/{id}/checkout`| Check out candidate from hall |
| `GET` | `/api/participants/{id}/analytics`| Individual candidate integrity and flag history |

### Incidents & Audit
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/exams/{id}/events` | Query chronological audit log with severity/type filters |
| `GET` | `/api/events/{id}` | Get incident details and analysis payload |
| `PUT` | `/api/events/{id}/review` | Human review: override severity or approve flag |
| `GET` | `/api/events/{id}/clip` | Stream or download evidentiary MP4 video clip |
| `GET` | `/api/events/{id}/screenshot`| Download incident evidentiary keyframe screenshot |

### Authentication & RBAC
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/login` | Authenticate staff account and obtain JWT Bearer token |
| `GET` | `/api/auth/me` | Retrieve profile of authenticated user |
| `GET` | `/api/auth/users` | List staff directory (Administrator only) |
| `POST` | `/api/auth/users` | Create staff account with role permissions |
| `GET` | `/api/auth/pending-actions` | View two-man rule sensitive actions requiring approval |
| `POST` | `/api/auth/pending-actions/{id}/approve` | Approve or reject pending dual-authorization action |

---

## Project Structure

```
exam-surveillance/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI application, WebSockets & routes
│   │   ├── config.py                # Environment configuration
│   │   ├── database.py              # SQLite / PostgreSQL engine & session
│   │   ├── models/                  # SQLAlchemy ORM models (Exam, Participant, Event, User)
│   │   ├── schemas/                 # Pydantic v2 validation schemas
│   │   ├── crud/                    # Database operations & attendance logic
│   │   └── services/
│   │       ├── camera_manager.py     # Multi-threaded camera frame capture
│   │       ├── detection_engine.py   # YOLOv8 candidate & item inference
│   │       ├── mediapipe_analyzer.py # Gaze vectors & head pose estimation
│   │       ├── anomaly_detector.py   # Heuristic rule checks & cooldowns
│   │       ├── vlm_client.py         # Multimodal reasoning client
│   │       ├── event_logger.py       # Evidence clip & screenshot recorder
│   │       ├── report_generator.py   # ReportLab PDF dossier compiler
│   │       ├── audio_level.py        # Real-time microphone dB level monitor
│   │       └── auth.py               # JWT authentication & RBAC guards
│   └── tests/                       # Automated unit & integration tests
├── frontend/
│   ├── public/
│   │   └── index.html               # Google Fonts, Tailwind config & Obsidian theme
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
│   └── package.json
├── models/                          # YOLOv8 and MediaPipe model files
├── test_surveillance_system.py      # Full test runner & benchmark suite
├── pyproject.toml                   # Project dependencies and tool configurations
└── README.md
```

---

## Testing & Quality Assurance

```bash
# Run complete test suite and benchmarks
python test_surveillance_system.py --url http://127.0.0.1:8000

# Run frontend build verification
cd frontend
npm run build
```

---

## License

MIT License — see [LICENSE](LICENSE) for details.