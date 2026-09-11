# Real-Time Autonomous Hazard Alerting & Conversational Assistant for Low-Vision Pedestrians

This repository contains the complete full-stack implementation for the **Autonomous Hazard Alerting & Conversational Assistant for Low-Vision Pedestrians**.

## Project Structure

```
.
├── frontend/             # React 19 + Vite + Tailwind CSS Accessible Web App
│   ├── src/
│   │   ├── components/   # HazardOverlay, PriorityAlert, Camera, Conversation, etc.
│   │   ├── hooks/        # useCamera, useSpeech, useMicrophone, useWebSocket, etc.
│   │   ├── services/     # websocket.js, mockBackend.js, api.js
│   │   ├── utils/        # hazardPriority.js, audioUtils.js, formatting.js
│   │   └── pages/        # Dashboard, Evaluation, SettingsPage
│   ├── package.json
│   ├── .env
│   └── README.md         # Detailed Frontend Documentation
│
└── backend/              # Python FastAPI Real-Time Multi-Modal AI Backend
    ├── app/              # Vision, audio, fusion, OCR, risk, safety, assistant, API
    ├── data/             # Ground truth benchmark datasets
    ├── models/           # YOLO / custom neural model weights
    ├── tests/            # 31 Pytest unit & integration test suites
    ├── requirements.txt  # Backend dependencies
    ├── .env.example      # Environment configuration template
    └── README.md         # Complete Backend Documentation & Protocols
```

## Quick Start (Backend)

```bash
# Enter backend directory
cd backend

# Create & activate virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run all automated unit and integration tests (31 tests)
pytest -v tests/

# Start FastAPI server on port 8000
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Backend endpoints:
- Swagger Docs: [http://localhost:8000/docs](http://localhost:8000/docs)
- Health Check: [http://localhost:8000/health](http://localhost:8000/health)
- Persistent WebSocket: `ws://localhost:8000/ws`

## Quick Start (Frontend)

```bash
# In a separate terminal, enter frontend directory
cd frontend

# Install dependencies
npm install

# Run Vite dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser. Toggle between Live AI backend and Mock mode anytime using the switch in the top header.

See [backend/README.md](backend/README.md) and [frontend/README.md](frontend/README.md) for full architectural documentation.
