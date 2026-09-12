#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=================================================================="
echo "  Pedestrian Shield AI: Launching Local AI Backend & Public Tunnel"
echo "=================================================================="

cleanup() {
    echo ""
    echo "[!] Stopping backend and tunnel..."
    kill $BACKEND_PID 2>/dev/null
    exit 0
}
trap cleanup SIGINT SIGTERM

# 1. Start Backend in background
cd "$DIR/backend"
venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

sleep 2

# 2. Start Cloudflare Tunnel
echo ""
echo "[✓] Local backend running on http://localhost:8000 (ws://localhost:8000/ws)"
echo "[+] Starting Cloudflare Public Tunnel..."
echo "    Copy the generated 'https://*.trycloudflare.com' URL below and"
echo "    add it to your deployed site (Vercel) as VITE_BACKEND_URL!"
echo "=================================================================="
/opt/homebrew/bin/cloudflared tunnel --url http://localhost:8000

