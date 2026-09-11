"""Integration tests for FastAPI REST routes and WebSocket communication."""

import json
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "online"
    assert data["service"] == "pedestrian-shield-ai-backend"


def test_status_endpoint():
    response = client.get("/status")
    assert response.status_code == 200
    data = response.json()
    assert data["backend"] == "CONNECTED"
    assert "camera" in data
    assert "vision_ai" in data


def test_settings_get_and_post():
    # GET settings
    get_res = client.get("/settings")
    assert get_res.status_code == 200
    initial_settings = get_res.json()
    assert "sensitivity" in initial_settings

    # POST settings update
    post_res = client.post("/settings", json={"sensitivity": "HIGH", "alert_frequency": "HIGH"})
    assert post_res.status_code == 200
    updated = post_res.json()
    assert updated["sensitivity"] == "HIGH"
    assert updated["alert_frequency"] == "HIGH"


def test_websocket_heartbeat_ping_pong():
    with client.websocket_connect("/ws") as ws:
        # Expect initial system_status message
        initial_msg = ws.receive_json()
        assert initial_msg["type"] == "system_status"
        assert initial_msg["backend"] == "CONNECTED"

        # Send ping
        ws.send_json({"type": "ping", "timestamp": 12345})
        pong_msg = ws.receive_json()
        assert pong_msg["type"] == "pong"


def test_websocket_conversation_query():
    with client.websocket_connect("/ws") as ws:
        # Read initial system_status
        ws.receive_json()

        # Send conversation question
        ws.send_json({"type": "conversation", "text": "Is it safe to cross?", "timestamp": 12345})

        # Expect conversation_status PROCESSING
        msg1 = ws.receive_json()
        assert msg1["type"] == "conversation_status"
        assert msg1["state"] == "PROCESSING"

        # Expect assistant_response
        msg2 = ws.receive_json()
        assert msg2["type"] == "assistant_response"
        assert len(msg2["text"]) > 0

        # Expect conversation_status SPEAKING
        msg3 = ws.receive_json()
        assert msg3["type"] == "conversation_status"
        assert msg3["state"] == "SPEAKING"


def test_websocket_video_frame_and_detection():
    import base64
    import cv2
    import numpy as np

    # Generate a dummy 640x360 test JPEG frame
    img = np.full((360, 640, 3), 120, dtype=np.uint8)
    _, buf = cv2.imencode(".jpg", img)
    b64_frame = "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode("utf-8")

    with client.websocket_connect("/ws") as ws:
        # Read initial system_status
        init_msg = ws.receive_json()
        assert init_msg["type"] == "system_status"

        # Send video frame
        ws.send_json({"type": "video_frame", "frame": b64_frame, "timestamp": 12345})

        # Expect detection message from worker
        det_msg = ws.receive_json()
        assert det_msg["type"] in ("detection", "system_failure", "hazard_alert")
        if det_msg["type"] == "detection":
            assert "objects" in det_msg
            assert "walking_path" in det_msg


def test_websocket_ocr_request():
    with client.websocket_connect("/ws") as ws:
        # Read initial system_status
        ws.receive_json()

        # Send ocr_request
        ws.send_json({"type": "ocr_request", "query": "What does that sign say?", "timestamp": 12345})

        # Should receive conversation_status PROCESSING, ocr_result, assistant_response, conversation_status SPEAKING
        received_types = []
        for _ in range(4):
            m = ws.receive_json()
            received_types.append(m["type"])

        assert "conversation_status" in received_types
        assert "ocr_result" in received_types or "assistant_response" in received_types

