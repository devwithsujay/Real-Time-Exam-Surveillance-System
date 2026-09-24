# Chapter 2 — Methodology: Architectural Diagrams and Flowcharts

This document compiles all **5 formal methodology figures** for Chapter 2 of the **ARGUS Surveillance Platform** report/thesis.

> [!TIP]
> **How to copy and use these figures:**
> - **In Markdown / Obsidian / GitHub**: The diagrams below will automatically render into interactive, scalable graphics.
> - **For Word / LaTeX / Google Docs**: Open [mermaid.live](https://mermaid.live), paste any code block below, and click **Download PNG (High Res)** or **Download SVG** to insert directly into your document.

---

## Figure 2.1: End-to-End System Architecture of ARGUS Surveillance Platform

```mermaid
flowchart LR
    %% Main Input
    subgraph SENSORS["Sensors"]
        CAM["RTSP / Webcam"]
        MIC["Microphone"]
    end

    %% Core Pipeline
    subgraph BACKEND["Backend AI Pipeline (FastAPI)"]
        DET["YOLOv8 + ByteTrack"]
        MP["MediaPipe (478 3D Mesh)"]
        VLM["Dual-Provider VLM\n(LM Studio / Ollama)"]
        ANOMALY["Anomaly Detection Engine\n(8 Rules + State Machine)"]
        
        DET --> ANOMALY
        MP --> ANOMALY
        ANOMALY <--> VLM
    end

    %% Side Branches
    subgraph SIDE["Side Branches"]
        REC["SessionVideoRecorder"] --> FULL_MP4["Full-Session MP4"]
        LOGGER["EventLogger\n(45s Ring Buffer)"] --> EVIDENCE["15s Clips +\nScreenshots"] --> PDF["ReportLab PDF Dossier"]
    end

    %% Storage & Network
    subgraph STORE["Persistence & Broadcast"]
        DB[("SQLite (WAL) +\nRedis")]
        WS["WebSocket & REST API"]
        DB --> WS
    end

    %% Frontend HUD
    subgraph FRONTEND["Proctor HUD (React 18)"]
        MONITOR["ExamMonitor\n(Live Feed)"]
        ALERTS["AlertPanel\n(Triage Badges)"]
        TIMELINE["EventTimeline\n(Audit Trail)"]
    end

    %% Connections
    CAM --> DET
    CAM --> MP
    CAM -.-> REC
    CAM -.-> LOGGER
    MIC --> ANOMALY

    ANOMALY --> DB
    ANOMALY -.-> LOGGER

    WS ==> MONITOR
    WS ==> ALERTS
    WS ==> TIMELINE
```

**Figure Caption:**  
*Figure 2.1: End-to-End System Architecture of ARGUS Surveillance Platform. Illustrating multi-stream sensor ingestion, real-time edge AI inference, decoupled background session recording, rolling 45-second forensic ring buffer, write-ahead logging persistence, and low-latency token-authenticated WebSocket broadcasting to the tactical React 18 HUD.*

---

## Figure 2.2: Thread-Safe Video Frame Queue and Audio Decibel Ingestion Flowchart

```mermaid
flowchart TB
    %% Video Pipeline
    subgraph VIDEO["Video Stream Ingestion (CameraManager)"]
        V_IN["RTSP / USB Video Stream\n(30 FPS)"] --> CAP_THREAD["Dedicated Background\nCapture Thread"]
        CAP_THREAD --> QUEUE{"FIFO Frame Queue\n(Buffer Size = 15)"}
        QUEUE -->|"If Queue Full"| DROP["Discard Stale Frame\n(Zero Latency)"]
        QUEUE -->|"Pop Frame"| PREP["Frame Preprocessing\n(Resize to 640x480, BGR->RGB, Norm [0,1])"]
        
        PREP --> DET_IN["YOLOv8 & MediaPipe\nDetection Engine"]
        PREP -.-> RING["45s JPEG Ring Buffer\n(Quality 80, ~19MB RAM)"]
        PREP -.-> SESS["SessionVideoRecorder\n(Queue capacity 180)"]
    end

    %% Audio Pipeline
    subgraph AUDIO["Acoustic Telemetry Ingestion (AudioLevelService)"]
        A_IN["Hall Microphone\n(16 kHz Mono Input)"] --> BLOCKS["100 ms Sample Blocks\n(1,600 Samples per Window)"]
        BLOCKS --> RMS["Compute Root Mean Square\nRMS = sqrt(sum(x^2)/N)"]
        RMS --> DB["Decibel Conversion\ndB = 20 * log10(RMS / Ref)"]
        DB --> EMA["Exponential Moving Average\nSmoothing Filter"]
        EMA --> TELEM["Broadcast Live dB\nTelemetry to HUD"]
        EMA --> AUDIO_CHECK{"Smoothed dB > 65 dB\nfor > 2.0 Seconds?"}
        AUDIO_CHECK -->|"Yes"| AUD_ALERT["Raise AUDIO_ANOMALY\n(Severity: HIGH)"]
        AUDIO_CHECK -->|"No"| AUD_PASS["Normal Ambient Room Level"]
    end
```

**Figure Caption:**  
*Figure 2.2: Thread-Safe Video Frame Queue and Audio Decibel Ingestion Flowchart. Showing non-blocking FIFO queueing with automatic frame-drop on saturation, dual fan-out to the ring buffer and session recorder, and dynamic 100 ms acoustic window RMS computation with exponential smoothing.*

---

## Figure 2.3: Multi-Tier Anomaly Escalation and Verification Flow

```mermaid
flowchart TB
    FRAME["Captured Video Frame"] --> TIER1

    %% Tier 1
    subgraph T1["Tier 1: Continuous Computer Vision (~20-40 ms)"]
        TIER1["YOLOv8 Candidate Tracking + MediaPipe 3D Mesh\n(Bboxes, Track IDs, Gaze Vectors, Head Pose)"]
        PERSIST{"Geometric Trigger Persists\n>= N Frames Threshold?"}
        TIER1 --> PERSIST
    end

    PERSIST -->|"No"| RESET["Reset Counter / Normal Routine"]
    PERSIST -->|"Yes"| TIER2

    %% Tier 2
    subgraph T2["Tier 2: Semantic VLM Verification (~1.0 s)"]
        TIER2["Async Single-Frame VLM Query\n(Qwen3-VL / LLaVA via LM Studio / Ollama)"]
        VLM_CHECK{"VLM Confirms\nCheating Intent?"}
        TIER2 --> VLM_CHECK
    end

    VLM_CHECK -->|"False Alarm / Benign"| CLEARED["Status: AI_CLEARED\n(Auto-filtered, kept in audit)"]
    VLM_CHECK -->|"Ambiguous"| REVIEW["Status: NEEDS_REVIEW\n(Surfaced to Proctor)"]
    VLM_CHECK -->|"Violation Confirmed"| TIER3

    %% Tier 3
    subgraph T3["Tier 3: Temporal Evidence Synthesis"]
        TIER3["Slice 45s JPEG Ring Buffer\nExtract 15s H.264 Clip + Keyframe"]
        PRELIM["Create Event in Database\nStatus: PRELIMINARY -> AI_CONFIRMED"]
        TIER3 --> PRELIM
    end

    %% Human Proctor Tier
    subgraph HUMAN["Human Review & Lifecycle Sign-Off"]
        WS_ALERT["WebSocket Alert Broadcast to AlertPanel\n(Crimson / Amber / Purple Badges)"]
        PROCTOR_ACT{"Proctor Decision Action\n(Sign Off / Flag / Dismiss)"}
        RESOLVED["Status: HUMAN_RESOLVED\n(PATCH /api/events/{id}/status)"]

        PRELIM --> WS_ALERT
        REVIEW --> WS_ALERT
        WS_ALERT --> PROCTOR_ACT
        PROCTOR_ACT --> RESOLVED
    end
```

**Figure Caption:**  
*Figure 2.3: Multi-Tier Anomaly Escalation and Verification Flow. Illustrating high-recall Tier 1 CV triggers, asynchronous Tier 2 semantic VLM filtering, Tier 3 15-second temporal evidence slicing, and the formal AnomalyStatus lifecycle leading to proctor resolution.*

---

## Figure 2.4: 3D Head Pose Euler Vector Computation and Neighbour Peeking Spatial Geometry

```mermaid
flowchart TB
    %% Head Pose
    subgraph POSE["1. 3D Head Pose Computation (solvePnP)"]
        MESH["MediaPipe 478 3D Facial Mesh"] --> LANDMARKS["Extract 6 Anthropometric Landmarks\n(Nose tip, Chin, Eye corners, Mouth corners)"]
        LANDMARKS --> PNP["Perspective-n-Point Solver\n(cv2.solvePnP with 3D Face Model)"]
        PNP --> EULER["Recover Euler Angles\n(Yaw, Pitch, Roll in Degrees)"]
    end

    %% Peeking Detection
    subgraph PEEKING["2. Multi-Track Spatial Peeking Rule (_check_neighbor_peeking)"]
        CANDIDATE["Track i: Candidate Position\n& Head Yaw Angle"]
        NEIGHBOR["Locate Neighbor Track j in Same Row\n(Within 3.5 Bounding-Box Widths)"]
        
        CANDIDATE --> SPATIAL{"Spatial Geometry Test:\nIs |Yaw| > 22 deg OR Gaze LEFT/RIGHT\nDirected Toward Neighbor?"}
        NEIGHBOR --> SPATIAL

        SPATIAL -->|"No"| PASS["Normal Posture"]
        SPATIAL -->|"Yes"| TIMER{"Alignment Persists\n>= 16 Consecutive Frames (~1.6s)\nOR Corroborated by VLM?"}
        
        TIMER -->|"No"| BRIEF["Transient Head Turn (Ignore)"]
        TIMER -->|"Yes"| EVENT["Trigger PEEKING_NEIGHBOR_PAPER\n(Severity: HIGH, Log Yaw/Pitch Angles)"]
    end

    EULER --> CANDIDATE
```

**Figure Caption:**  
*Figure 2.4: 3D Head Pose Euler Vector Computation and Neighbour Peeking Spatial Geometry. Demonstrating Perspective-n-Point facial landmark orientation solver and multi-track spatial row adjacency filtering for neighbour peeking detection.*

---

## Figure 2.5: Phone Detection Pipeline Combining Bounding Box Intersection and VLM Verification

```mermaid
flowchart TB
    IN_FRAME["Input Video Frame"] --> YOLO

    %% Geometric Trigger
    subgraph GEO["1. Geometric CV Trigger (Tier 1)"]
        YOLO["YOLOv8 Inference\n(Detect Person [0] & Cell Phone [67])"]
        OVERLAP{"Spatial Bbox Overlap:\nDoes Phone Bbox Intersect\nHand, Lap, or Torso Region?"}
        GAZE{"MediaPipe Gaze Check:\nCandidate Looking Downward?"}
        
        YOLO --> OVERLAP
        OVERLAP -->|"Yes"| GAZE
        OVERLAP -->|"No"| NO_PHONE["No Contraband Detected"]
    end

    GAZE -->|"No"| NO_PHONE
    GAZE -->|"Yes (Geometric Trigger)"| VLM_STAGE

    %% Semantic Verification
    subgraph VLM_AUDIT["2. Asynchronous Semantic VLM Verification (Tier 2)"]
        VLM_STAGE["Extract Desk / Hand Region Crop"] --> DISPATCH["Dispatch to UnifiedVLMClient\n(Non-Blocking Async Worker)"]
        DISPATCH --> PROMPT["VLM Prompt Check:\nDistinguish Phone from Calculator,\nPen, ID Card, or Exam Paper"]
        PROMPT --> PARSE["Parse JSON Schema\n(Fallback to Keyword Heuristic)"]
        
        PARSE --> VERDICT{"phone_detected == true\n& confidence >= threshold?"}
    end

    VERDICT -->|"False (Calculator / Pen / Benign)"| CLEAR["Fast-Clear / Suppress Alert\n(Prevent False Alarm)"]
    VERDICT -->|"True (Confirmed Mobile Device)"| ALERT["Raise CRITICAL PHONE_DETECTED Alert\nSlice 15s Evidence MP4 Clip\nBroadcast to Proctor AlertPanel"]
```

**Figure Caption:**  
*Figure 2.5: Phone Detection Pipeline Combining Bounding Box Intersection and VLM Verification. Combining COCO class-67 bounding box overlap with candidate hand/lap coordinates, downward optical gaze confirmation, and targeted VLM visual differentiation.*
