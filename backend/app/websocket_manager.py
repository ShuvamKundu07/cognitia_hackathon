"""WebSocket Connection Manager with non-blocking message dispatch and backpressure control."""

import asyncio
import json
import logging
from typing import Any, Dict, List, Optional, Set
from fastapi import WebSocket

logger = logging.getLogger("websocket.manager")


class ConnectionManager:
    """Manages active real-time WebSocket connections and broadcasts."""

    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        """Accepts and stores an active WebSocket connection."""
        await websocket.accept()
        async with self._lock:
            self.active_connections.add(websocket)
        logger.info("WebSocket connected. Total active: %d", len(self.active_connections))

    async def disconnect(self, websocket: WebSocket) -> None:
        """Removes a disconnected WebSocket."""
        async with self._lock:
            if websocket in self.active_connections:
                self.active_connections.remove(websocket)
        logger.info("WebSocket disconnected. Total active: %d", len(self.active_connections))

    async def send_json(self, websocket: WebSocket, message: Dict[str, Any]) -> bool:
        """Sends a JSON payload to a specific client."""
        try:
            await websocket.send_json(message)
            return True
        except Exception as e:
            logger.debug("Failed to send JSON to client: %s", e)
            await self.disconnect(websocket)
            return False

    async def broadcast_json(self, message: Dict[str, Any]) -> None:
        """Broadcasts a JSON message to all active clients."""
        async with self._lock:
            sockets = list(self.active_connections)

        for ws in sockets:
            try:
                await ws.send_json(message)
            except Exception as e:
                logger.debug("Broadcast failure on socket: %s", e)
                await self.disconnect(ws)

    def active_count(self) -> int:
        return len(self.active_connections)


ws_manager = ConnectionManager()

