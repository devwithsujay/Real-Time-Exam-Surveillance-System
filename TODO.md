# ARGUS — Enterprise Production Roadmap & Implementation Guide

This document outlines the architectural roadmap and concrete step-by-step implementation guides required to transition **ARGUS** from a mid-market testing platform (1–10 concurrent cameras) to a **Hyperscale Fortune-500 Proctoring Infrastructure** (500+ simultaneous exam halls, 10,000+ concurrent students).

---

## 📋 High-Level Roadmap Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                ARGUS HYPERSCALE ROADMAP                                 │
├─────────────────┬─────────────────┬─────────────────┬─────────────────┬─────────────────┤
│     PHASE 1     │     PHASE 2     │     PHASE 3     │     PHASE 4     │     PHASE 5     │
│   PostgreSQL    │  Decoupled AI   │ WebRTC Video    │ Acoustic AI &   │ Cloud-Native    │
│  & Alembic DB   │ Inference Queue │ Streaming (SFU) │ Whisper VAD     │ K8s Auto-Scale  │
├─────────────────┼─────────────────┼─────────────────┼─────────────────┼─────────────────┤
│ High-throughput │ Offload GPU     │ H.264/AV1       │ Real-time voice │ Multi-node Helm │
│ relational pool │ workers to      │ sub-150ms       │ transcription & │ clustering with │
│ with migrations │ Celery/Redis    │ streaming       │ whisper alert   │ KEDA & Grafana  │
└─────────────────┴─────────────────┴─────────────────┴─────────────────┴─────────────────┘
```

---

## Phase 1: High-Concurrency PostgreSQL & Alembic Migration Engine

### Problem & Objective
SQLite works reliably for single-room setups, but locks under high-concurrency writes from 50+ simultaneous exam halls. We need a distributed PostgreSQL cluster with connection pooling and schema versioning via Alembic.

### Implementation Checklist
- [ ] Add `psycopg2-binary` and `alembic` to `requirements.txt`.
- [ ] Initialize Alembic directory structure.
- [ ] Configure `alembic/env.py` to auto-detect SQLAlchemy ORM models from `backend.app.models`.
- [ ] Add PostgreSQL connection pooling (`pool_size=20`, `max_overflow=40`) in `backend/app/database.py`.
- [ ] Generate initial schema migration and verify upgrade/downgrade commands.

### Step-by-Step Implementation Guide

1. **Install Dependencies**:
   ```bash
   pip install psycopg2-binary alembic
   ```

2. **Initialize Alembic in Backend**:
   ```bash
   cd backend
   alembic init migrations
   ```

3. **Configure `migrations/env.py`**:
   ```python
   # Import application models and Base
   from app.models import Base
   from app.config import get_settings

   settings = get_settings()
   config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)
   target_metadata = Base.metadata
   ```

4. **Update `backend/app/database.py`**:
   ```python
   # Dynamic support for SQLite in dev, PostgreSQL in enterprise staging/prod
   if settings.DATABASE_URL.startswith("postgresql"):
       engine = create_engine(
           settings.DATABASE_URL,
           pool_size=20,
           max_overflow=40,
           pool_pre_ping=True,
           pool_recycle=3600,
       )
   ```

5. **Generate & Run Initial Migration**:
   ```bash
   alembic revision --autogenerate -m "Initial enterprise schema"
   alembic upgrade head
   ```

---

## Phase 2: Decoupled AI Inference Worker Pool (Celery + Redis)

### Problem & Objective
Currently, YOLOv8, MediaPipe, and VLM inference run on the FastAPI backend process. Under 20+ feeds, this saturates the CPU/GPU, causing API degradation. We must decouple inference into background GPU worker nodes.

### Implementation Checklist
- [ ] Add `celery` and `redis` task queuing dependencies.
- [ ] Create `backend/app/tasks/inference_tasks.py` for headless GPU workers.
- [ ] Refactor `CameraManager` to push frames to a Redis Stream (`XADD camera:frames`).
- [ ] Dedicated Celery workers consume frames, run YOLO + MediaPipe, and push detections to Redis Pub/Sub.
- [ ] FastAPI WebSockets subscribe to Redis Pub/Sub channels to broadcast detections without executing inference directly.

### Step-by-Step Implementation Guide

1. **Worker Task Definition (`backend/app/tasks/inference_tasks.py`)**:
   ```python
   from celery import Celery
   from app.services.detection_engine import DetectionEngine
   from app.services.mediapipe_analyzer import MediaPipeAnalyzer

   celery_app = Celery("argus_tasks", broker="redis://localhost:6379/0", backend="redis://localhost:6379/1")
   detector = DetectionEngine()
   mediapipe = MediaPipeAnalyzer()

   @celery_app.task(queue="gpu_inference")
   def process_frame_task(frame_bytes: bytes, exam_id: str, camera_id: int):
       # 1. Decode frame
       frame = cv2.imdecode(np.frombuffer(frame_bytes, np.uint8), cv2.IMREAD_COLOR)
       
       # 2. Run YOLO & MediaPipe on dedicated GPU worker
       annotated_frame, detections = detector.process_frame(frame)
       face_results = mediapipe.analyze(frame, detections)
       
       # 3. Publish results back to Redis pub/sub
       redis_client.publish(f"exam:{exam_id}:telemetry", json.dumps({
           "camera_id": camera_id,
           "detections": detections,
           "face_results": face_results
       }))
   ```

2. **Launch GPU Worker Node**:
   ```bash
   celery -A app.tasks.inference_tasks worker --loglevel=info --concurrency=1 -Q gpu_inference
   ```

---

## Phase 3: Ultra-Low-Latency WebRTC Streaming Cluster (LiveKit / MediaSoup)

### Problem & Objective
Streaming binary JPEGs over WebSockets consumes ~800 KB/s per client. WebRTC with H.264 / AV1 hardware encoding reduces bandwidth to ~150–250 KB/s per stream with sub-100ms latency, adaptive bitrates, and packet loss resilience.

### Implementation Checklist
- [ ] Deploy LiveKit Server container via Docker (`livekit/livekit-server`).
- [ ] Ingest RTSP / USB camera frames via GStreamer / PyAV into LiveKit WebRTC video tracks.
- [ ] Replace WebSocket base64 canvas rendering in `ExamMonitor.js` with `@livekit/components-react` (`<VideoTrack />`).
- [ ] Enable Adaptive Stream and Simulcast for automatic quality step-down on poor proctor connections.

### Step-by-Step Implementation Guide

1. **Deploy LiveKit SFU (Selective Forwarding Unit)**:
   ```yaml
   # docker-compose.livekit.yml
   services:
     livekit:
       image: livekit/livekit-server:latest
       command: --config /etc/livekit.yaml
       ports:
         - "7880:7880"
         - "7881:7881"
         - "7882:7882/udp"
   ```

2. **Backend Video Publisher (`backend/app/services/webrtc_publisher.py`)**:
   ```python
   from livekit import api, rtc

   async def publish_camera_stream(room_name: str, frame_generator):
       room = rtc.Room()
       await room.connect("ws://localhost:7880", token)
       source = rtc.VideoSource(1280, 720)
       track = rtc.LocalVideoTrack.create_video_track("tactical_hud", source)
       await room.local_participant.publish_track(track)
       
       async for frame in frame_generator:
           source.capture_frame(frame)
   ```

3. **Frontend Consumer (`frontend/src/components/ExamMonitor.js`)**:
   ```jsx
   import { LiveKitRoom, VideoTrack } from "@livekit/components-react";

   function ExamMonitor({ token }) {
     return (
       <LiveKitRoom serverUrl="ws://localhost:7880" token={token} connect={true}>
         <VideoTrack trackName="tactical_hud" className="tactical-video-element" />
       </LiveKitRoom>
     );
   }
   ```

---

## Phase 4: Acoustic Intelligence: Whisper AI Speech Transcription

### Problem & Objective
The current audio monitor only checks RMS decibel levels (which can trigger on paper shuffling or coughing). Integrating real-time speech-to-text allows ARGUS to detect whispered phrases, cheating keywords, and collaborative verbal communication.

### Implementation Checklist
- [ ] Add `faster-whisper` and `silero-vad` (Voice Activity Detection) to `requirements.txt`.
- [ ] Create `AudioAnalysisWorker` that buffers audio chunks only when voice activity is detected.
- [ ] Transcribe speech segments using the lightweight `tiny.en` or `base.en` CTranslate2 model (~60ms latency).
- [ ] Regex keyword matching against examination integrity wordlists ("question 5", "option B", "help me", "look here").
- [ ] Dispatch `VERBAL_COMMUNICATION` alert with the exact transcribed snippet.

### Step-by-Step Implementation Guide

1. **Implement Voice Activity & Whisper Worker**:
   ```python
   import torch
   from faster_whisper import WhisperModel

   model = WhisperModel("base.en", device="cuda" if torch.cuda.is_available() else "cpu", compute_type="int8")
   SUSPICIOUS_KEYWORDS = ["answer", "question", "option", "number", "cheat", "send", "photo"]

   def analyze_audio_chunk(audio_float32_array):
       # 1. Transcribe with Whisper
       segments, _ = model.transcribe(audio_float32_array, beam_size=1)
       for segment in segments:
           text = segment.text.lower()
           # 2. Check for integrity violation keywords
           for kw in SUSPICIOUS_KEYWORDS:
               if kw in text:
                   return {
                       "type": "VERBAL_COMMUNICATION",
                       "confidence": 0.88,
                       "transcription": segment.text.strip(),
                       "matched_keyword": kw
                   }
       return None
   ```

---

## Phase 5: Cloud-Native Kubernetes & Elastic Autoscaling (Helm + KEDA)

### Problem & Objective
Deploying across multiple institutional data centers requires container orchestration, zero-downtime rolling upgrades, and automatic GPU pod scaling during peak examination hours.

### Implementation Checklist
- [ ] Write standardized Helm charts for `argus-backend`, `argus-frontend`, `redis`, and `gpu-workers`.
- [ ] Configure KEDA (Kubernetes Event-driven Autoscaling) to scale inference pods based on Redis stream length.
- [ ] Implement NVIDIA GPU Operator configuration for multi-instance GPU (MIG) slicing.
- [ ] Deploy Prometheus metrics endpoint (`/metrics`) exposing FPS, inference latency, and queue latency.
- [ ] Pre-configure Grafana monitoring dashboards with threat matrix alert rates.

### Step-by-Step Implementation Guide

1. **KEDA ScaledObject (`deploy/keda-scaledobject.yaml`)**:
   ```yaml
   apiVersion: keda.sh/v1alpha1
   kind: ScaledObject
   metadata:
     name: argus-gpu-worker-scaler
   spec:
     scaleTargetRef:
       name: argus-inference-worker
     minReplicaCount: 1
     maxReplicaCount: 10
     triggers:
       - type: redis
         metadata:
           address: redis:6379
           listName: camera:frames:queue
           listLength: "15" # Scale up when frames back up
   ```

2. **Prometheus Metrics Collector (`backend/app/main.py`)**:
   ```python
   from prometheus_fastapi_instrumentator import Instrumentator

   # Expose standard Prometheus telemetry for Grafana dashboards
   Instrumentator().instrument(app).expose(app, endpoint="/metrics")
   ```

---

## 🎯 Implementation Priority Matrix

| Phase | Upgrade | Business Impact | Technical Complexity | Recommended Timeline |
| :--- | :--- | :--- | :--- | :--- |
| **1** | PostgreSQL + Alembic | Zero-lock multi-hall concurrency | Moderate | Sprint 1 |
| **2** | Decoupled AI Inference Queue | Multiplies concurrent camera capacity by 10x | High | Sprint 2 |
| **3** | LiveKit WebRTC Streaming | Cuts streaming bandwidth by 70% | High | Sprint 3 |
| **4** | Whisper Audio Transcription | Eliminates ambient noise false alarms | Moderate | Sprint 4 |
| **5** | Kubernetes Helm + KEDA | Elastic multi-institution scaling | High | Sprint 5 |
