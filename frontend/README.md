# Pedestrian Shield
## Autonomous Real-Time Hazard Alerting & Conversational Assistant for Low-Vision Pedestrians

An accessibility-first, high-contrast real-time web frontend engineered for blind and low-vision pedestrians. The application captures a live camera feed and microphone stream, connects to a FastAPI AI backend via a persistent WebSocket, visualizes detected hazards with normalized bounding boxes, enforces a safety-first TTS alert queue with critical interruption, supports conversational voice interaction with speech-to-text, performs scene OCR reading, and provides an evaluation dashboard with staged video testing.

---

## 1. Complete Folder Structure

```
3ambug/
├── public/
├── src/
│   ├── components/
│   │   ├── AlertHistory.jsx          # Event log with urgency filters & timestamps
│   │   ├── AudioStatus.jsx           # Acoustic hazard radar & mic level visualizer
│   │   ├── Camera.jsx                # Live 60fps camera container with throttled AI capture
│   │   ├── Conversation.jsx          # Push-to-talk voice assistant & query interface
│   │   ├── EvaluationDashboard.jsx   # AI precision, recall, latency & benchmark metrics
│   │   ├── HazardCard.jsx            # Individual item card in the prioritized queue
│   │   ├── HazardList.jsx            # Sequential prioritized hazard queue
│   │   ├── HazardOverlay.jsx         # Normalized bounding boxes & walking path corridor
│   │   ├── OCRResult.jsx             # Detected scene text/sign viewer & TTS reader
│   │   ├── PriorityAlert.jsx         # Highest-urgency hazard card with assertive alert
│   │   ├── RecordedVideoPlayer.jsx   # Staged video evaluation & ground-truth comparison
│   │   ├── Settings.jsx              # Sensitivity, alert frequency & accessibility toggles
│   │   ├── SystemStatus.jsx          # Diagnostics grid & failure alert banners
│   │   └── VoiceButton.jsx           # High-contrast accessible push-to-talk button
│   │
│   ├── hooks/
│   │   ├── useCamera.js              # MediaDevices stream & offscreen canvas frame capture
│   │   ├── useMicrophone.js          # Audio input, volume analysis & audio chunk capture
│   │   ├── useSpeech.js              # Priority TTS engine with safety interruption
│   │   ├── useSpeechRecognition.js   # Browser Web Speech API wrapper with fallbacks
│   │   └── useWebSocket.js           # Persistent connection & mock engine switcher
│   │
│   ├── services/
│   │   ├── api.js                    # REST API client for diagnostics & evaluation
│   │   ├── mockBackend.js            # Standalone pedestrian simulator & demo triggers
│   │   └── websocket.js              # WebSocket client with heartbeat & exponential backoff
│   │
│   ├── utils/
│   │   ├── audioUtils.js             # Web Audio API synthesized sound cues
│   │   ├── formatting.js             # Formatting for time, direction, and confidence
│   │   └── hazardPriority.js         # Scoring, walking-path intersection & deduplication
│   │
│   ├── pages/
│   │   ├── Dashboard.jsx             # Main real-time operational dashboard
│   │   ├── Evaluation.jsx            # Evaluation metrics & video testing tabs
│   │   └── SettingsPage.jsx          # Dedicated settings and preferences view
│   │
│   ├── App.jsx                       # Root coordinator, global state & accessible layout
│   ├── index.css                     # Tailwind directives, high-contrast & focus styles
│   └── main.jsx                      # React 19 entry point
│
├── .env                              # Environment configuration (VITE_BACKEND_WS_URL)
├── .env.example                      # Example template
├── eslint.config.js                  # ESLint configuration
├── index.html                        # HTML5 entry with accessible dark theme meta
├── package.json                      # Dependencies and scripts
├── postcss.config.js                 # PostCSS configuration
├── tailwind.config.js                # Tailwind CSS custom colors & animations
└── vite.config.js                    # Vite build configuration
```

---

## 2. How Each Component Works

### Core Hardware & Display Components
- **`Camera.jsx` & `useCamera.js`**:
  Requests user camera permission using `navigator.mediaDevices.getUserMedia()`. Displays smooth 60fps local video for the user. In the background, an offscreen canvas captures downscaled JPEG frames (640x360 at 0.65 quality) at a configurable 8–15 FPS (default 10 FPS) and dispatches them over the WebSocket.
- **`HazardOverlay.jsx`**:
  Renders normalized coordinates (`0.0` to `1.0`) as responsive bounding boxes over the camera view. Each urgency tier (`critical`, `high`, `medium`, `low`) receives distinct visual treatments, badges, and direction arrows. Also renders the walking path corridor (`LEFT | WALKING PATH | RIGHT`) and highlights objects directly intersecting the path.
- **`PriorityAlert.jsx`**:
  Prominently displays the current highest-priority hazard requiring pedestrian action (e.g., `"STOP. Vehicle approaching from your right."`). In critical mode, it visually interrupts lower-priority UI elements with a flashing red border and announces immediately via `aria-live="assertive"`. Includes a "Hear Alert" button to re-vocalize the alert.
- **`HazardCard.jsx` & `HazardList.jsx`**:
  Presents the sequential prioritized queue of all active hazards. Sorted by urgency (`critical` > `high` > `medium` > `low`), walking path collision, and detection confidence.
- **`Conversation.jsx` & `VoiceButton.jsx`**:
  Push-to-talk conversational interface. Features user transcript display, AI assistant reply, quick inquiry chips (*"What does that sign say?"*, *"Is it safe to cross?"*), and an accessible keyboard text fallback. Operates asynchronously without interrupting hazard monitoring.
- **`OCRResult.jsx`**:
  Displays text detected in the environment (storefront signs, parking restrictions, crosswalk signals) along with confidence and an anchor object ID. Offers a "Read Aloud" button for low-vision users.
- **`AudioStatus.jsx` & `useMicrophone.js`**:
  Monitors microphone volume levels using the Web Audio API (`AnalyserNode`) and displays detected acoustic hazards (e.g., horns, sirens, screeching tires) with directional cues and confidence.
- **`SystemStatus.jsx`**:
  Grid monitoring hardware and backend subsystems: Camera, Microphone, Backend, Vision AI, Audio AI, OCR, and Assistant. Renders prominent warning banners if the camera visibility is degraded or if the backend disconnects.
- **`AlertHistory.jsx`**:
  Chronological audit log of all safety alerts with timestamps, direction, urgency, confidence, and active/resolved status. Supports urgency filtering and one-click log clearing.
- **`Settings.jsx` & `SettingsPage.jsx`**:
  User-configurable safety controls: Detection sensitivity (`LOW`, `NORMAL`, `HIGH`), alert frequency, TTS speed (`0.75x` to `1.5x`), high-contrast display mode, and channel toggles. Synchronizes settings directly to the backend.
- **`EvaluationDashboard.jsx` & `RecordedVideoPlayer.jsx`**:
  Displays benchmark precision, recall, F1 score, false alarm rates, and latencies. Allows uploading recorded video files (MP4/WebM) to test the detection pipeline and compare results with staged ground-truth events.

---

## 3. WebSocket Protocol & Message Contract

The application maintains **one persistent WebSocket connection** to `VITE_BACKEND_WS_URL` with automatic exponential backoff reconnection (1s–10s) and a 5-second heartbeat ping/pong.

### Client → Server Messages
| Type | Payload Example | Description |
| :--- | :--- | :--- |
| `video_frame` | `{"type": "video_frame", "frame": "data:image/jpeg;base64,...", "timestamp": 1720000000}` | Base64-encoded frame downscaled to 640x360 at 8–15 FPS |
| `audio_chunk` | `{"type": "audio_chunk", "data": "data:audio/webm;base64,...", "timestamp": 1720000000}` | 1-second audio chunk for acoustic hazard classification |
| `conversation` | `{"type": "conversation", "text": "What does that sign say?", "timestamp": 1720000000}` | Voice or typed query to the assistant |
| `ocr_request` | `{"type": "ocr_request", "query": "that sign", "timestamp": 1720000000}` | Targeted sign reading query |
| `settings_update` | `{"type": "settings_update", "settings": {"sensitivity": "high", "alert_frequency": "normal"}}` | Updated pedestrian safety parameters |
| `ping` | `{"type": "ping", "timestamp": 1720000000}` | Periodic heartbeat keep-alive |

### Server → Client Messages
| Type | Payload Example | Description |
| :--- | :--- | :--- |
| `detection` | `{"type": "detection", "objects": [{"id": "car_17", "label": "car", "confidence": 0.93, "bbox": {"x": 0.55, "y": 0.35, "width": 0.20, "height": 0.18}, "direction": "right", "urgency": "critical"}], "walking_path": {"x": 0.3, "y": 0.45, "width": 0.4, "height": 0.55}}` | Live object bounding boxes and walking path corridor |
| `hazard_alert` | `{"type": "hazard_alert", "hazard_id": "car_17", "hazard_type": "vehicle", "message": "Stop. Car approaching from your right.", "direction": "right", "urgency": "critical", "confidence": 0.94, "timestamp": 1720000000}` | Immediate hazard alert requiring pedestrian action |
| `hazard_resolved` | `{"type": "hazard_resolved", "hazard_id": "car_17", "timestamp": 1720000000}` | Notification that a tracked obstacle has cleared |
| `audio_event` | `{"type": "audio_event", "sound": "Horn", "direction": "Right", "confidence": 0.89, "timestamp": 1720000000}` | Acoustic sound classification |
| `system_status` | `{"type": "system_status", "camera": "ACTIVE", "microphone": "ACTIVE", "backend": "CONNECTED", "vision_ai": "ACTIVE", "camera_quality": "good"}` | Diagnostics health update |
| `system_failure` | `{"type": "system_failure", "component": "camera", "message": "WARNING: Camera visibility is poor."}` | Prominent component failure notification |
| `ocr_result` | `{"type": "ocr_result", "text": "NO PARKING", "confidence": 0.91, "object_id": "sign_4"}` | Extracted text from scene |
| `assistant_response` | `{"type": "assistant_response", "text": "The sign says No Parking.", "status": "completed"}` | Conversational LLM answer |
| `conversation_status` | `{"type": "conversation_status", "state": "LISTENING"}` | Assistant lifecycle state |
| `evaluation_result` | `{"type": "evaluation_result", "metrics": {"precision": 0.914, "recall": 0.887, "f1_score": 0.900, "avg_detection_latency_ms": 280}}` | Staged evaluation benchmark metrics |
| `pong` | `{"type": "pong"}` | Heartbeat response |

---

## 4. How to Install & Run

### Prerequisites
- Node.js 18+ (tested on Node v22)
- npm 9+

### Installation
```bash
# Clone and enter directory
cd 3amBug

# Install dependencies
npm install
```

### Running Locally
```bash
# Start Vite development server
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in Chrome, Edge, or Safari.

### Production Build & Linting
```bash
# Run ESLint validation
npm run lint

# Build production bundle
npm run build

# Preview production build
npm run preview
```

---

## 5. Connecting to the Backend vs. Mock Mode

### Connecting to Real FastAPI Backend
1. Ensure the Python FastAPI server is running on `http://localhost:8000` with WebSocket support at `ws://localhost:8000/ws`.
2. Configure `.env`:
   ```env
   VITE_BACKEND_URL=http://localhost:8000
   VITE_BACKEND_WS_URL=ws://localhost:8000/ws
   ```
3. In the application header, verify that the Backend badge indicates `CONNECTED` (green).

### Using the Built-In Mock Simulator
If the Python backend is not active, click the **"Enable Mock"** button in the top-right header:
- The WebSocket client disconnects and the `MockBackendService` activates.
- The interactive simulation toolbar appears above the dashboard with 4 manual triggers:
  1. **Critical Approaching Car**: Injects `car_17` moving rapidly from the right. Triggers an assertive alert, red bounding box, and immediate TTS interruption.
  2. **Pothole in Walk Path**: Spawns an obstacle directly intersecting the walking path corridor with high urgency.
  3. **Car Horn Sound**: Emits a 94% confidence acoustic radar event on the right.
  4. **Toggle Camera Warning**: Simulates poor camera visibility / obstruction, testing the hardware diagnostic alert banner.

---

## 6. Safety Interruption & Priority TTS Engine

The application implements a strict, multi-tiered safety priority queue:

$$\text{CRITICAL} > \text{HIGH} > \text{MEDIUM} > \text{LOW} > \text{CONVERSATION}$$

### Interruption Scenario
1. The user asks: *"What does that sign say?"*
2. The assistant begins reading: *"The sign on your right says..."*
3. The backend (or mock simulator) detects a **Critical Approaching Vehicle**.
4. **Immediate Action**:
   - `window.speechSynthesis.cancel()` is invoked instantaneously.
   - The conversational state transitions to `INTERRUPTED`.
   - The Web Audio dual-tone alarm plays.
   - The critical warning is voiced immediately: *"STOP. Vehicle approaching from your right."*
   - Once the safety warning finishes, conversation is permitted to resume.
5. **Deduplication**: Alerts for the same `hazard_id` are subject to an 8-second cooling-off period (configurable in Settings), preventing continuous repetitive vocal loops. If an obstacle escalates to `CRITICAL`, the cooldown is bypassed immediately.

---

## 7. Accessibility (A11y) Implementation

Designed specifically for blind and low-vision pedestrians:
- **WAI-ARIA Live Regions**:
  - `role="alert" aria-live="assertive"` for `CRITICAL` hazards (immediate screen-reader announcement).
  - `aria-live="polite"` for assistant responses, OCR updates, and camera status changes.
- **High-Contrast Dark Theme**: Dark slate/black backgrounds with bright `#EF4444` (Critical), `#F97316` (High), `#EAB308` (Medium), and `#38BDF8` (Informational) accents. Maximum Contrast mode available in Settings.
- **Keyboard Navigation**:
  - `Spacebar`: Toggle Push-to-Talk voice recording.
  - `Escape`: Instantly halt active text-to-speech.
  - `Alt + 1`: Jump to Dashboard.
  - `Alt + 2`: Jump to Evaluation & Testing.
  - `Alt + 3`: Jump to Settings.
  - Visible 3px `#38BDF8` focus rings on all interactive controls.
- **Semantic HTML5**: Native `<header>`, `<main>`, `<section>`, `<article>`, `<nav>`, and `<footer>` elements.
- **Multi-Modal Feedback**: Every visual cue is paired with acoustic tones (Web Audio API) and spoken synthesis (TTS). Color is never used as the sole conveyor of information.

---

## 8. Browser Compatibility & Limitations

- **Speech Recognition (`webkitSpeechRecognition`)**: Supported in Google Chrome, Chromium browsers, Edge, and Safari (iOS 14.5+). For browsers without native speech recognition, an accessible keyboard text input is provided.
- **Text-to-Speech (`window.speechSynthesis`)**: Supported across all modern desktop and mobile browsers.
- **Camera Access (`navigator.mediaDevices.getUserMedia`)**: Requires HTTPS in production (or `localhost` during development). On mobile devices, rear-facing camera is requested via `facingMode: 'environment'`.
- **Autoplay / AudioContext**: Browsers require a user interaction (such as clicking anywhere or pressing a button) before the Web Audio API can emit synthesized tones.
