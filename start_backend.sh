#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR/backend"
echo "========================================================"
echo "  Starting Pedestrian Shield AI Backend (Real YOLO & Audio)"
echo "  Models: models/yolov8n.pt & models/best.pt"
echo "========================================================"
venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

