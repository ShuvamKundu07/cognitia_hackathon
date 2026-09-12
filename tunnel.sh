#!/bin/bash
echo "========================================================"
echo "  Starting Cloudflare Public Tunnel for Pedestrian Shield"
echo "  Connects your local AI backend to your deployed site"
echo "========================================================"
/opt/homebrew/bin/cloudflared tunnel --url http://localhost:8000

