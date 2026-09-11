# Graph Report - .  (2026-07-28)

## Corpus Check
- Corpus is ~29,733 words - fits in a single context window. You may not need a graph.

## Summary
- 416 nodes · 975 edges · 21 communities (14 shown, 7 thin omitted)
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 101 edges (avg confidence: 0.57)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Backend API & Data Layer
- Detection & Testing
- Anomaly Detection & Alerting
- Frontend Configuration
- Camera Management
- Event Logging & Video
- System Documentation
- Frontend UI Components
- Object Tracking
- Test Reports & Dashboards
- Configuration & Database
- Face Analysis (MediaPipe)
- OpenCode Config
- Test Implementation Status
- Dev Proxy Setup
- Security & Compliance
- Package Metadata
- Encryption
- Project Overview
- Processing Pipeline
- System Overview

## God Nodes (most connected - your core abstractions)
1. `TestSuite` - 32 edges
2. `TestResult` - 26 edges
3. `AnomalyDetector` - 25 edges
4. `CameraManager` - 23 edges
5. `FaceAnalysis` - 22 edges
6. `TestRunner` - 22 edges
7. `Alert` - 19 edges
8. `DetectionEngine` - 19 edges
9. `main()` - 18 edges
10. `TestStatus` - 17 edges

## Surprising Connections (you probably didn't know these)
- `YOLOv8 Slow Inference Warning` --conceptually_related_to--> `DetectionEngine (YOLOv8)`  [INFERRED]
  test_output/TEST_REPORT.md → SYSTEM_OVERVIEW.md
- `HTML Test Results Dashboard` --semantically_similar_to--> `HTML Test Report Dashboard`  [INFERRED] [semantically similar]
  test_results.html → test_output/test_report.html
- `test_config()` --calls--> `get_settings()`  [INFERRED]
  test_surveillance_system.py → backend/app/config.py
- `test_database()` --calls--> `init_db()`  [INFERRED]
  test_surveillance_system.py → backend/app/database.py
- `test_database()` --calls--> `get_db()`  [INFERRED]
  test_surveillance_system.py → backend/app/database.py

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Per-Frame Processing Pipeline** — system_overview_camera_manager, system_overview_detection_engine, system_overview_tracking_engine, system_overview_mediapipe_analyzer, system_overview_anomaly_detector, system_overview_event_logger, system_overview_connection_manager [EXTRACTED 1.00]
- **Security and Compliance Features** — readme_rbac, readme_gdpr_compliance, system_overview_no_auth [INFERRED 0.75]
- **Known Frontend Bugs** — test_results_app_js_download_bug, test_results_exam_monitor_duplicate_style, test_results_websocket_reconnect_bug [EXTRACTED 1.00]

## Communities (21 total, 7 thin omitted)

### Community 0 - "Backend API & Data Layer"
Cohesion: 0.08
Nodes (88): checkin_participant(), checkout_participant(), create_event(), create_exam(), create_participant(), end_exam(), get_event(), get_events() (+80 more)

### Community 1 - "Detection & Testing"
Cohesion: 0.09
Nodes (36): FrameData, Detection, DetectionEngine, DetectionResult, Any, ndarray, Parse YOLO results into Detection objects., Run detection on multiple frames (batch inference). (+28 more)

### Community 2 - "Anomaly Detection & Alerting"
Cohesion: 0.11
Nodes (28): ConnectionManager, websocket_endpoint(), Alert, AlertSeverity, AlertType, AnomalyDetector, MoondreamAnalysis, Any (+20 more)

### Community 3 - "Frontend Configuration"
Cohesion: 0.06
Nodes (34): browserslist, development, production, dependencies, http-proxy-middleware, lucide-react, react, react-dom (+26 more)

### Community 4 - "Camera Management"
Cohesion: 0.08
Nodes (17): CameraManager, MultiCameraManager, Any, ndarray, Background thread for frame capture., Generate synthetic demo frames with animated content., Manages camera input with configurable FPS and resolution.     Thread-safe frame, Normalize frame to target resolution. (+9 more)

### Community 5 - "Event Logging & Video"
Cohesion: 0.08
Nodes (20): init_db(), Initialize database tables., lifespan(), EventLogger, get_event_logger(), datetime, ndarray, Capture and save screenshots for evidence. (+12 more)

### Community 6 - "System Documentation"
Cohesion: 0.12
Nodes (27): Anomaly Detection Layer, ByteTrack Multi-Object Tracking, Docker Compose Deployment, MediaPipe + Moondream VLM Analysis Layer, Output & Reporting Layer, Processing Pipeline Architecture, WebSocket Real-Time Streaming, YOLOv8 Auto-Download Design (+19 more)

### Community 7 - "Frontend UI Components"
Cohesion: 0.10
Nodes (8): App(), AlertPanel(), AnalyticsBoard(), CreateExamModal(), EventTimeline(), ExamMonitor(), IncidentViewer(), root

### Community 8 - "Object Tracking"
Cohesion: 0.14
Nodes (8): KalmanBoxTracker, Any, Update tracker with new detections.          Args:             detections: List, Associate detections to trackers using IoU., Calculate IoU between two boxes., Kalman filter for single object tracking., Simple SORT-style multi-object tracker., TrackingEngine

### Community 9 - "Test Reports & Dashboards"
Cohesion: 0.15
Nodes (15): index.html Entry Point, FastAPI REST API, Missing Authentication, React Dashboard, 2 Tests Warned, 56 Tests Passed, 5 Tests Failed, API Endpoint 404 Failures (+7 more)

### Community 10 - "Configuration & Database"
Cohesion: 0.24
Nodes (8): get_settings(), Settings, get_db(), get_db_session(), Session, Dependency for FastAPI to get DB session., Get a new database session for background tasks., BaseSettings

### Community 11 - "Face Analysis (MediaPipe)"
Cohesion: 0.29
Nodes (3): MediaPipeAnalyzer, Any, ndarray

### Community 12 - "OpenCode Config"
Cohesion: 0.50
Nodes (3): plugin, $schema, @dietrichgebert/ponytail

### Community 13 - "Test Implementation Status"
Cohesion: 0.67
Nodes (3): 3 Not Implemented Features, 4 Partially Implemented Features, 6 Fully Implemented Features

## Knowledge Gaps
- **42 isolated node(s):** `name`, `version`, `private`, `http-proxy-middleware`, `lucide-react` (+37 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `CameraManager` connect `Camera Management` to `Backend API & Data Layer`, `Detection & Testing`, `Anomaly Detection & Alerting`, `Event Logging & Video`, `Configuration & Database`?**
  _High betweenness centrality (0.100) - this node is a cross-community bridge._
- **Why does `AnomalyDetector` connect `Anomaly Detection & Alerting` to `Backend API & Data Layer`, `Detection & Testing`, `Event Logging & Video`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Why does `TrackingEngine` connect `Object Tracking` to `Backend API & Data Layer`, `Detection & Testing`, `Anomaly Detection & Alerting`, `Event Logging & Video`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Are the 14 inferred relationships involving `TestSuite` (e.g. with `Alert` and `AlertSeverity`) actually correct?**
  _`TestSuite` has 14 INFERRED edges - model-reasoned connections that need verification._
- **Are the 14 inferred relationships involving `TestResult` (e.g. with `Alert` and `AlertSeverity`) actually correct?**
  _`TestResult` has 14 INFERRED edges - model-reasoned connections that need verification._
- **Are the 7 inferred relationships involving `AnomalyDetector` (e.g. with `ConnectionManager` and `FaceAnalysis`) actually correct?**
  _`AnomalyDetector` has 7 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `CameraManager` (e.g. with `ConnectionManager` and `test_camera_manager()`) actually correct?**
  _`CameraManager` has 6 INFERRED edges - model-reasoned connections that need verification._