# ARGUS — Technical Implementation Plan (Planned Upgrades)

This document specifies the technical implementation roadmap to align the codebase with the full architecture specification and university project report requirements.

---

## 1. Upgrade Matrix & Status

| # | Component / Upgrade | Target Module(s) | Current / Implemented State | Status |
|---|---------------------|-------------------|-----------------------------|:------:|
| **1** | **Anomaly State Machine** | `models/__init__.py`<br>`schemas/__init__.py`<br>`crud/__init__.py`<br>`main.py`<br>`AlertPanel.js`<br>`api.js` | Full `AnomalyStatus` lifecycle (`PRELIMINARY`, `AI_CONFIRMED`, `AI_CLEARED`, `NEEDS_REVIEW`, `HUMAN_RESOLVED`, `ERROR`). DB column migration, `PATCH /api/events/{id}/status` endpoint, WebSocket broadcasting, and interactive proctor triage UI with dynamic badges and filter dropdown. | ✅ **Completed** |
| **2** | **Dual Database Support (SQLite + PostgreSQL)** | `database.py`<br>`config.py`<br>`.env.example` | Hardcoded to SQLite `exam_surveillance.db`. Planned: Dynamic switch via `DATABASE_URL` (PostgreSQL QueuePool + SQLite WAL). | ⏳ Planned |
| **3** | **JPEG-Compressed Ring Buffer & Dynamic Retention** | `event_logger.py`<br>`config.py` | Configurable `BUFFER_DURATION_SECONDS = 30` and `BUFFER_JPEG_QUALITY = 80`. Frames stored in memory as JPEG byte buffers, reducing memory footprint by **99.46%** (from 2.64 MB down to ~14.68 KB per frame). | ✅ **Completed** |
| **4** | **Configurable Audio Sampling Window** | `audio_level.py`<br>`config.py` | Dynamic `AUDIO_BLOCK_SECONDS: float = 0.1` (100ms) and `AUDIO_SAMPLE_RATE: int = 16000` (1,600 samples) loaded from Pydantic `settings`. | ✅ **Completed** |
| **5** | **3D Calibrated Eye Gaze Vector Computation** | `mediapipe_analyzer.py` | 3D eyeball approximate center estimation from canthi landmarks (33, 133, 362, 263); optical gaze vector calculation with pitch ($\theta_p$) and yaw ($\theta_y$) angles in degrees. | ✅ **Completed** |
| **6** | **Multi-VLM Provider Support (LM Studio + Ollama / LLaVA)** | `vlm_client.py`<br>`config.py` | Multi-provider architecture supporting `VLM_PROVIDER = "lmstudio"` and `"ollama"`, dynamic model discovery (`/api/tags` and `/models`), prompt formatting, and unified JSON parsing. | ✅ **Completed** |
| **7** | **Continuous Session Recording & Re-Analysis Engine** | `session_recorder.py`<br>`config.py`<br>`models/__init__.py`<br>`database.py`<br>`main.py`<br>`App.js`<br>`api.js` | Thread-decoupled async session video recorder (`queue.Queue`) producing faststart H.264 MP4. Global & per-exam recording toggle, `Exam.recording_path` auto-migration, `GET /api/exams/{id}/recording` download/stream, and `POST /api/exams/{id}/reanalyze` 1-click forensic audit scan. | ✅ **Completed** |

---

## 2. Detailed Technical Specifications

### Phase 1: Anomaly State Machine Implementation [COMPLETED]

#### Models & Schema Changes
1. Defined `AnomalyStatus` in `backend/app/models/__init__.py`:
   ```python
   class AnomalyStatus(str, enum.Enum):
       PRELIMINARY = "PRELIMINARY"
       AI_CONFIRMED = "AI_CONFIRMED"
       AI_CLEARED = "AI_CLEARED"
       NEEDS_REVIEW = "NEEDS_REVIEW"
       HUMAN_RESOLVED = "HUMAN_RESOLVED"
       ERROR = "ERROR"
   ```
2. Added `status` column to `Event` model:
   ```python
   status = Column(SQLEnum(AnomalyStatus), default=AnomalyStatus.PRELIMINARY, nullable=False, index=True)
   ```
3. Auto-migration in `database.py`:
   `init_db()` inspects SQLite tables via `PRAGMA table_info(events)`. If `status` column is absent, it executes `ALTER TABLE events ADD COLUMN status VARCHAR(20) DEFAULT 'PRELIMINARY'`.
4. REST API Endpoint:
   - `PATCH /api/events/{event_id}/status`: Updates event state, stores review notes and reviewer title, logs timestamps, and broadcasts the transition via WebSocket to all connected proctors.
5. Frontend Visual Badging & Actions:
   - Updated `frontend/src/components/AlertPanel.js`:
     - Status Filter dropdown (`All Statuses`, `Preliminary`, `AI Confirmed`, `AI Cleared`, `Needs Review`, `Resolved`).
     - Dynamic badges:
       - `PRELIMINARY`: Pulsing amber badge with spinner (*"Verifying with AI..."*).
       - `AI_CONFIRMED`: Crimson badge (*"AI Confirmed"*).
       - `AI_CLEARED`: Emerald badge (*"AI Cleared — Benign"*).
       - `NEEDS_REVIEW`: Purple badge (*"Needs Human Review"*).
       - `HUMAN_RESOLVED`: Blue badge (*"Signed Off by Proctor"*).
     - Quick lifecycle action buttons: "Sign Off", "Flag Review", "Re-open".
     - Connected to `api.events.updateStatus()` in `frontend/src/services/api.js`.

---

### Phase 2: Dual Database Engine (SQLite + PostgreSQL)

1. Update `backend/app/config.py`:
   ```python
   DATABASE_URL: Optional[str] = None  # e.g. postgresql://user:pass@localhost:5432/argus_db
   ```
2. Update `backend/app/database.py`:
   - Inspect `settings.DATABASE_URL`.
   - If starting with `postgresql://` or `postgres://`:
     ```python
     engine = create_engine(
         settings.DATABASE_URL,
         pool_size=10,
         max_overflow=20,
         pool_pre_ping=True
     )
     ```
   - If `None` or `sqlite:///`:
     Maintain SQLite engine with `check_same_thread=False` and the SQLite `PRAGMA journal_mode=WAL` listener.

---

### Phase 3: JPEG Rolling Ring Buffer & Dynamic Retention [COMPLETED]

1. Updated `backend/app/config.py`:
   ```python
   BUFFER_DURATION_SECONDS: int = 45        # 45s circular buffer in RAM (~19 MB)
   BUFFER_JPEG_QUALITY: int = 80             # Compression quality (1-100)
   EVENT_CLIP_DURATION_SECONDS: float = 15.0 # 15s forensic incident clips (configurable to 20s)
   ```
2. Updated `backend/app/services/event_logger.py`:
   - Circular buffer stores `(timestamp, encoded_jpeg_bytes)` tuples.
   - Slices dynamic duration (`duration_seconds=getattr(settings, "EVENT_CLIP_DURATION_SECONDS", 15.0)`) on anomaly triggers.
   - On-demand decoding (`cv2.imdecode`) and faststart H.264 remuxing.
   - **Verification**: Verified 99.46% frame memory reduction and valid multi-second clip extraction.

---

### Phase 4: Configurable Audio Sampling Window [COMPLETED]

1. Updated `backend/app/config.py`:
   ```python
   AUDIO_BLOCK_SECONDS: float = 0.1  # 100ms sampling window
   AUDIO_SAMPLE_RATE: int = 16000
   ```
2. Updated `backend/app/services/audio_level.py`:
   - Dynamically loads `settings.AUDIO_SAMPLE_RATE` and `settings.AUDIO_BLOCK_SECONDS`.
   - `block_size` property dynamically yields 1,600 samples for the 100ms window.
   - **Verification**: Verified dynamic properties and buffer calculations.

---

### Phase 5: 3D Calibrated Eye Gaze Vector Computation [COMPLETED]

1. In `backend/app/services/mediapipe_analyzer.py`:
   - Extracted 3D depth landmarks $(x, y, z)$.
   - Eyeball center estimation using canthi landmarks (33, 133 for left eye; 362, 263 for right eye) + physiological depth offset.
   - Optical axis gaze vector calculation: $\vec{g} = \vec{p}_{\text{iris}} - \vec{p}_{\text{eyeball\_center}}$.
   - Calibrated pitch ($\theta_{\text{pitch}} = \arctan2(-g_y, \sqrt{g_x^2 + g_z^2})$) and yaw ($\theta_{\text{yaw}} = \arctan2(g_x, -g_z)$) in degrees.
   - Updated `FaceAnalysis` dataclass with `gaze_yaw`, `gaze_pitch`, and `gaze_vector_3d`.
   - Updated `draw_visualization()` overlay with 3D yaw and pitch degree readouts.
   - **Verification**: Verified synthetic 3D gaze computation without errors/NaNs.

---

### Phase 6: Multi-VLM Provider Support (LM Studio + Ollama) [COMPLETED]

1. Updated `backend/app/config.py`:
   ```python
   VLM_PROVIDER: str = "lmstudio"  # "lmstudio" | "ollama"
   OLLAMA_BASE_URL: str = "http://localhost:11434"
   OLLAMA_MODEL: str = "llava:latest"
   ```
2. Updated `backend/app/services/vlm_client.py`:
   - Dual-provider dispatching (`_query_ollama` and `_query_lm_studio`).
   - Dynamic model listing (`/api/tags` for Ollama, `/models` for LM Studio).
   - Unified structured JSON response parsing.
   - Added runtime provider switching via `set_provider()`.
   - Exposed alias `UnifiedVLMClient` and singleton `get_vlm_client()`.
   - **Verification**: Verified provider switching and JSON schema extraction.

---

### Phase 7: Continuous Session Recording & Re-Analysis Engine [COMPLETED]

1. Created `backend/app/services/session_recorder.py`:
   - `SessionVideoRecorder` using an internal `queue.Queue(maxsize=180)` consumed by an isolated background worker thread.
   - Decoupled ingestion ensures 30 FPS display loop and real-time YOLO/MediaPipe inference never drop frames.
   - Automatically remuxes completed recording into browser-playable faststart H.264 MP4 using bundled `imageio-ffmpeg`.
2. Updated `backend/app/config.py`:
   - `RECORD_FULL_SESSION: bool = False` (global default toggle).
   - `BUFFER_DURATION_SECONDS: int = 45` (ring buffer capacity expanded).
   - `EVENT_CLIP_DURATION_SECONDS: float = 15.0` (anomaly clip duration upgraded from 5s to 15s, configurable up to 20s).
3. Schema & Database Auto-Migration:
   - Added `recording_path` to `Exam` model in `models/__init__.py`.
   - Auto-migration in `database.py`: checks `PRAGMA table_info(exams)` and applies `ALTER TABLE exams ADD COLUMN recording_path VARCHAR(500)` if missing.
   - Updated `ExamResponse`, `ExamStartRequest`, `ExamStartResponse`, `ExamEndResponse`, `ExamReanalyzeRequest`, and `ExamReanalyzeResponse` in `schemas/__init__.py`.
4. REST API Endpoints in `backend/app/main.py`:
   - `POST /api/exams/{id}/start?record_full_session=true`: Runtime per-session toggle.
   - `GET /api/exams/{id}/recording`: Download or stream full-length MP4 with HTTP range request support.
   - `POST /api/exams/{id}/reanalyze`: Trigger a full post-hoc forensic audit scan using `VideoAuditService.launch_audit()`.
5. Frontend UI Integration in `frontend/src/App.js` & `api.js`:
   - "Record Full Session Video" toggle checkbox in Exam Lifecycle panel.
   - "Full Video Recording" download button and "Re-Analyze Whole Exam" button with direct transition to forensic audit desk.

---

## 3. Verification & Testing Matrix

- [x] **Phase 1 Unit Test**: `test_phase1_anomaly_state_machine` passed (verified enum lifecycle, DB transition, and query filter).
- [x] **Phase 3 Unit Test**: `test_phase3_jpeg_ring_buffer` passed (verified 99.46% RAM compression).
- [x] **Phase 4 Unit Test**: `test_phase4_audio_sampling_config` passed (1,600 samples dynamic window).
- [x] **Phase 5 Unit Test**: `test_phase5_3d_gaze_angles` passed (pitch/yaw angles and 3D unit vector verified).
- [x] **Phase 6 Unit Test**: `test_phase6_multi_vlm_provider` passed (dual-provider dispatch & JSON parsing).
- [x] **Automated Suite**: `python -m pytest backend/tests/test_planned_upgrades.py` (6/6 passed).
- [x] **Continuous Session Recording**: `test_continuous_session_recording_and_reanalyze` passed (verified asynchronous queue, MP4 generation, H.264 remuxing, and DB linkage).
- [x] **SQLite Migration**: Verified non-destructive `ALTER TABLE events ADD COLUMN status` and `ALTER TABLE exams ADD COLUMN recording_path` checks on startup.
- [x] **WebSocket Notification Payload**: Integrated `status` into `_event_to_response` and `broadcast_event`.
- [x] **Frontend Alert Badging**: Implemented dynamic badges (`PRELIMINARY` pulsing amber, `AI_CONFIRMED` crimson, `AI_CLEARED` emerald, `NEEDS_REVIEW` purple, `HUMAN_RESOLVED` blue) and proctor action buttons in `AlertPanel.js`.
- [ ] Dual database switch verification with PostgreSQL connection string (Phase 2).

---

## 4. Future Implementation Roadmap

### Multi-Camera (Multicam) Support & Multi-Angle VLM
- **Target Components**: `camera_manager.py`, `main.py`, `config.py`, `ExamMonitor.js`.
- **Scope**:
  - `MultiCameraManager` orchestrating concurrent capture threads for multiple RTSP / USB webcams.
  - Multi-camera binary WebSocket multiplexing with camera ID framing.
  - Hierarchical event-driven routing and 2x2 composite tiling for multi-angle VLM evaluation (cross-referencing desk vs. face cameras).
  - Frontend auto-adapting grid layout with independent tracking overlays per node.
