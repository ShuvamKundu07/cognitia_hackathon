# Pedestrian Shield AI Backend
## Autonomous Real-Time Hazard Alerting & Conversational Assistant for Low-Vision Pedestrians

High-performance, low-latency Python FastAPI backend engineered specifically for blind and low-vision pedestrians. The system processes live monocular camera frames and acoustic microphone input over a persistent WebSocket, tracks obstacle persistence, computes relative approach vectors and walking path collisions without depth sensors, fuses audio-visual signals, arbitrates safety-critical alerts with voice interruption, deterministically resolves spatial conversational inquiries, audits camera feed quality, and evaluates benchmark accuracy on staged urban datasets.

---

## 1. Project Architecture

The backend follows a clean, decoupled, layered architecture:

```
backend/
├── app/
│   ├── main.py                     # FastAPI application factory, CORS, router mounting, lifespan
│   ├── config.py                   # Pydantic Settings, environment variables, sensitivity profiles
│   ├── websocket_manager.py        # Connection manager, frame drop queue, async broadcast
│   │
│   ├── api/
│   │   ├── routes.py               # REST endpoints: /health, /status, /settings, /api/evaluation
│   │   └── websocket.py            # /ws endpoint: video_frame, audio_chunk, conversation, etc.
│   │
│   ├── vision/
│   │   ├── detector.py             # Pluggable detector (YOLO + custom hazard heuristics + mock fallback)
│   │   ├── tracker.py              # Temporal tracker maintaining track IDs across dropouts
│   │   ├── motion.py               # Motion estimator (relative velocity, area expansion rate)
│   │   ├── path.py                 # Camera-coordinate walking path corridor (30%-70%) and collision
│   │   └── preprocessing.py        # OpenCV frame decoder, normalization, quality diagnostics
│   │
│   ├── hazards/
│   │   ├── models.py               # BoundingBox, DetectedObject, TrackedHazard, UrgencyLevel models
│   │   ├── memory.py               # HazardMemory with configurable grace period (1.5s) & resolution
│   │   ├── priority.py             # Deterministic PriorityEngine (CRITICAL > HIGH > MEDIUM > LOW)
│   │   ├── risk.py                 # Deterministic RiskEngine (type weight, approach speed, collision risk)
│   │   └── alerts.py               # Templated alert generator, non-repetitive deduplication & cooldown
│   │
│   ├── audio/
│   │   ├── classifier.py           # Environmental sound classifier (horn, siren, vehicle, bell)
│   │   ├── preprocessing.py        # WebM/WAV/PCM audio decoder, volume RMS, spectral features
│   │   └── direction.py            # Multi-channel ITD/phase direction estimator (honestly UNKNOWN for mono)
│   │
│   ├── fusion/
│   │   └── sensor_fusion.py        # Multi-modal fusion boosting confidence on direction/modality alignment
│   │
│   ├── ocr/
│   │   ├── detector.py             # Scene text & sign region of interest detector
│   │   └── reader.py               # Preprocessing, contrast enhancement, OCR engine with mock fallback
│   │
│   ├── assistant/
│   │   ├── scene_memory.py         # Rolling 10-30s cache of recently detected objects, signs, and hazards
│   │   ├── reference_resolution.py # Deterministic reference resolver ("that sign", "is it safe to cross?")
│   │   ├── llm.py                  # LLM connector (Gemini / OpenAI / rule-based fallback)
│   │   └── conversation.py         # Conversation state manager (IDLE, PROCESSING, SPEAKING, INTERRUPTED)
│   │
│   ├── safety/
│   │   ├── controller.py           # Master safety controller (ALERT > FAILURE > CONVERSATION, interrupt flag)
│   │   ├── failure_detection.py    # Camera quality (dark, bright, blurry, blocked), low FPS, backlog detection
│   │   └── confidence.py           # Calibration and confidence thresholding
│   │
│   ├── db/
│   │   ├── models.py               # SQLite schema for hazard events, alerts, failures, evaluation runs
│   │   └── repository.py           # Clean repository pattern for event persistence
│   │
│   └── evaluation/
│       ├── metrics.py              # Precision, Recall, F1, False Alarm Rate, Latency calculations
│       ├── replay.py               # Production pipeline video replay runner
│       └── evaluator.py            # Ground-truth comparison and benchmark engine
│
├── models/                         # Model weights directory (yolov8n.pt, custom hazard models)
├── data/                           # Sample staged evaluation video & ground truth annotations
├── tests/                          # 31 unit and integration pytest test suites
├── requirements.txt                # Production Python dependencies
├── .env.example                    # Environment variable template
└── README.md                       # Complete backend documentation
```

---

## 2. Installation

```bash
# Enter backend directory
cd backend

# Create Python virtual environment
python3 -m venv venv

# Activate virtual environment
# macOS / Linux:
source venv/bin/activate
# Windows:
# .\venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

---

## 3. Python Environment

- **Python Version**: Python 3.10 to Python 3.13 supported.
- **Operating Systems**: macOS (Apple Silicon / Intel), Linux (Ubuntu 20.04+), Windows 10/11.
- **Virtual Environment**: Recommended in `backend/venv`.

---

## 4. Requirements

Key dependencies specified in `requirements.txt`:
- `fastapi>=0.110.0`: Async ASGI web framework.
- `uvicorn[standard]>=0.28.0`: High-performance ASGI production server.
- `pydantic>=2.6.0` & `pydantic-settings>=2.2.0`: Type validation & settings management.
- `opencv-python-headless>=4.9.0.80`: Fast image transformation, decoding, and quality audits.
- `numpy>=1.26.0`: Array and signal mathematics.
- `websockets>=12.0`: Real-time duplex socket transport.
- `pytest>=8.0.0` & `pytest-asyncio>=0.23.0`: Unit testing framework.

Optional neural libraries (plugged in automatically when available):
- `ultralytics`: YOLOv8/YOLOv11 object detection (`pip install ultralytics`).
- `paddleocr`: Scene text and street sign reader (`pip install paddleocr`).

---

## 5. Model Installation

To download the default lightweight YOLO model:
```bash
# Ultralytics will auto-download yolov8n.pt on first run if ultralytics is installed,
# or you can download weights directly into the models/ folder:
mkdir -p models
curl -L -o models/yolov8n.pt https://github.com/ultralytics/assets/releases/download/v8.2.0/yolov8n.pt
```

If model weights or `ultralytics` are not installed, the backend automatically switches to the built-in deterministic simulation detector without crashing.

---

## 6. Environment Variables

Configure via `backend/.env` (copy from `.env.example`):

| Variable | Default | Description |
| :--- | :--- | :--- |
| `HOST` | `0.0.0.0` | Bind IP address |
| `PORT` | `8000` | HTTP and WebSocket port |
| `DEBUG` | `false` | Enable reload and verbose logging |
| `MOCK_MODE` | `false` | `true` forces mock simulation; `false` runs live AI |
| `MODEL_PATH` | `models/yolov8n.pt` | Path to YOLO weights |
| `CONFIDENCE_THRESHOLD` | `0.50` | Minimum bounding box confidence |
| `PROCESSING_FPS` | `10` | Target frame rate (8-15 recommended) |
| `STALE_FRAME_DROP_MS` | `250` | Maximum frame latency before drop |
| `WALKING_PATH_X` | `0.30` | Left bound of walking corridor (0.0 to 1.0) |
| `WALKING_PATH_WIDTH` | `0.40` | Corridor width (30% to 70% of frame) |
| `TRACK_GRACE_PERIOD` | `1.5` | Seconds to retain track after detection loss |
| `ALERT_COOLDOWN_SECONDS`| `8.0` | Cooldown between identical hazard alerts |
| `LLM_PROVIDER` | `rule_based` | `rule_based` or `gemini` |
| `LLM_API_KEY` | `""` | Google Gemini API key (optional) |
| `DATABASE_URL` | `sqlite:///./data/pedestrian_safety.db` | SQLite database URI |

---

## 7. Running FastAPI

### Start the development server:
```bash
# From backend directory with venv activated:
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Or run directly with Python:
```bash
python -m app.main
```

The server opens on `http://localhost:8000`.
- Swagger API documentation: `http://localhost:8000/docs`
- Health check: `http://localhost:8000/health`
- Real-time WebSocket: `ws://localhost:8000/ws`

---

## 8. WebSocket Protocol

The WebSocket endpoint `/ws` is the primary high-throughput communication link.

### Client → Server Messages:
```json
// Video Frame (base64 JPEG/WEBP or raw binary)
{
  "type": "video_frame",
  "frame": "data:image/jpeg;base64,...",
  "timestamp": 1720000000000
}

// Audio Chunk (base64 WebM/WAV)
{
  "type": "audio_chunk",
  "data": "data:audio/webm;base64,...",
  "timestamp": 1720000000000
}

// Conversational Question
{
  "type": "conversation",
  "text": "What does that sign say?",
  "timestamp": 1720000000000
}

// Targeted OCR Request
{
  "type": "ocr_request",
  "query": "that sign",
  "timestamp": 1720000000000
}

// Settings Update
{
  "type": "settings_update",
  "settings": {
    "sensitivity": "HIGH",
    "alert_frequency": "NORMAL"
  },
  "timestamp": 1720000000000
}

// Heartbeat Keepalive
{
  "type": "ping",
  "timestamp": 1720000000000
}
```

### Server → Client Messages:
```json
// Visual Detections & Walking Corridor
{
  "type": "detection",
  "objects": [
    {
      "id": "car_17",
      "label": "vehicle",
      "confidence": 0.94,
      "bbox": { "x": 0.55, "y": 0.35, "width": 0.20, "height": 0.18 },
      "direction": "right",
      "urgency": "critical",
      "motion": "approaching",
      "relative_speed": 0.74
    }
  ],
  "walking_path": { "x": 0.30, "y": 0.45, "width": 0.40, "height": 0.55 },
  "timestamp": 1720000000000
}

// Immediate Spoken Safety Alert
{
  "type": "hazard_alert",
  "hazard_id": "car_17",
  "hazard_type": "vehicle",
  "message": "Stop. Vehicle approaching from your right.",
  "action": "STOP IMMEDIATELY",
  "direction": "Right",
  "urgency": "CRITICAL",
  "confidence": 0.94,
  "timestamp": 1720000000000,
  "interrupt": true
}

// Obstacle Cleared
{
  "type": "hazard_resolved",
  "hazard_id": "car_17",
  "timestamp": 1720000000000
}

// Acoustic Event
{
  "type": "audio_event",
  "sound": "Vehicle Horn",
  "direction": "Right",
  "confidence": 0.92,
  "timestamp": 1720000000000
}

// System Status Diagnostics
{
  "type": "system_status",
  "camera": "ACTIVE",
  "microphone": "ACTIVE",
  "backend": "CONNECTED",
  "vision_ai": "ACTIVE",
  "camera_quality": "good",
  "timestamp": 1720000000000
}

// System Failure Warning
{
  "type": "system_failure",
  "component": "camera",
  "severity": "high",
  "message": "WARNING: Camera visibility is poor. Hazard detection may be degraded.",
  "timestamp": 1720000000000
}

// OCR Text Result
{
  "type": "ocr_result",
  "text": "NO PARKING ANYTIME - TOW AWAY ZONE",
  "confidence": 0.93,
  "object_id": "sign_street_4",
  "timestamp": 1720000000000
}

// Conversational Reply
{
  "type": "assistant_response",
  "text": "The sign on your right says \"No Parking Anytime - Tow Away Zone\".",
  "status": "completed",
  "timestamp": 1720000000000
}

// Heartbeat Pong
{
  "type": "pong",
  "timestamp": 1720000000000
}
```

---

## 9. Mock Mode

Set `MOCK_MODE=true` in `backend/.env` or toggle via REST `POST /settings {"mock_mode": true}`.

Mock mode simulates realistic pedestrian scenarios without needing GPU or camera hardware:
- Approaching vehicle expanding from right corridor.
- Deep pothole in central walking path.
- Pedestrian walking on left sidewalk.
- Vehicle horn and emergency siren acoustic events.
- Scene text reading for traffic signs.
- Camera occlusion / degradation toggles.

---

## 10. Real AI Mode

Set `MOCK_MODE=false`.
When configured with `ultralytics`:
1. Uses real YOLO neural inference on camera frames.
2. Tracks objects frame-by-frame with centroid and area expansion estimators.
3. Classifies environmental audio via FFT spectral bands and peak detection.
4. Performs CLAHE contrast-enhanced OCR text recognition on sign regions.
5. Fuses audio and visual data dynamically.

---

## 11. Frontend Integration

The backend is 100% interoperable with the React frontend in `frontend/`:
1. Start backend: `uvicorn app.main:app --port 8000`
2. Start frontend: `cd frontend && npm run dev`
3. The frontend connects to `ws://localhost:8000/ws`. Toggle the "Mock Simulator / Live AI" switch on the frontend header to "Live AI".
4. Camera stream and audio stream will immediately flow into the backend, rendering normalized bounding boxes on the frontend `HazardOverlay` and playing priority safety alerts.

---

## 12. Evaluation Framework

To evaluate pipeline performance against recorded ground truth footage:
```python
from app.evaluation.replay import ReplayEngine
from app.evaluation.evaluator import BenchmarkEvaluator

evaluator = BenchmarkEvaluator()
gt = evaluator.load_ground_truth("data/ground_truth_sample.json")

replay = ReplayEngine()
metrics = replay.run_replay("path/to/test_footage.mp4", ground_truth=gt)

print(f"Precision: {metrics.precision}")
print(f"Recall:    {metrics.recall}")
print(f"F1 Score:  {metrics.f1_score}")
print(f"Avg Alert Latency: {metrics.avg_alert_latency_ms} ms")
```

Also accessible via REST:
- `GET /api/evaluation`: Retrieves latest benchmark metrics.
- `POST /api/evaluate-video`: Upload a video file via multipart form-data to run replay evaluation automatically.

---

## 13. Dataset Format

Benchmark datasets are formatted in JSON:
```json
{
  "dataset_name": "Urban Pedestrian Crossing Benchmark v1",
  "duration_seconds": 60.0,
  "annotations": [
    {
      "hazard_type": "surface",
      "label": "pothole",
      "start_time": 1.0,
      "end_time": 18.0,
      "direction": "ahead",
      "urgency": "high",
      "description": "Deep asphalt pothole in central walking corridor"
    },
    {
      "hazard_type": "vehicle",
      "label": "vehicle",
      "start_time": 10.0,
      "end_time": 24.0,
      "direction": "right",
      "urgency": "critical",
      "description": "Approaching car turning right into pedestrian crosswalk"
    }
  ]
}
```

---

## 14. Known Limitations & Safety Disclaimers

> [!CAUTION]
> **ASSISTIVE RESEARCH PROTOTYPE ONLY**
> 1. **No Metric Distance Claims**: Monocular RGB cameras cannot measure physical metric distance without depth sensors or calibrated stereoscopy. All motion vectors and time-to-conflict estimates are derived strictly from image-space bounding box expansion and trajectory.
> 2. **Mono Microphone Localization**: Single-channel (mono) microphone inputs cannot physically determine left vs. right sound direction. Direction is marked `UNKNOWN` unless true multi-channel stereo or microphone array audio is supplied.
> 3. **Environmental Variability**: Severe backlighting, heavy rain, fog, lens smudges, and pitch darkness can degrade optical detection. The system detects and warns of low visibility, but cannot guarantee 100% obstacle detection under degraded conditions.
> 4. **No LLM in Critical Safety Path**: The LLM is used strictly for conversational assistance and scene clarification. Frame-by-frame hazard detection, priority, risk scoring, and emergency stop alerts are 100% deterministic to guarantee sub-100ms latency.

