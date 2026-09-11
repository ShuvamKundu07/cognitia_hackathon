"""FastAPI main application entrypoint for Pedestrian Shield AI Backend."""

from contextlib import asynccontextmanager
import logging
import sys
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import api_router
from app.api.websocket import ws_router
from app.config import settings

# ------------------------------------------------------------------------------
# Structured Logging Configuration (Never log API keys or credentials)
# ------------------------------------------------------------------------------
logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown events."""
    logger.info("==================================================================")
    logger.info("Pedestrian Shield AI Backend starting up...")
    logger.info("Operational Mode: %s", "MOCK SIMULATION" if settings.mock_mode else "REAL AI INFERENCE")
    logger.info("Host: %s | Port: %d | Processing FPS: %d", settings.host, settings.port, settings.processing_fps)
    logger.info("Walking Corridor: x=%.2f, y=%.2f, w=%.2f, h=%.2f",
                settings.walking_path_x, settings.walking_path_y, settings.walking_path_width, settings.walking_path_height)
    logger.info("==================================================================")
    yield
    logger.info("Pedestrian Shield AI Backend shutting down...")


# Create FastAPI application
app = FastAPI(
    title="Pedestrian Shield AI Backend",
    description="Real-Time Autonomous Hazard Alerting & Conversational Assistant for Low-Vision Pedestrians",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS configuration for React frontend
allowed_origins = [orig.strip() for orig in settings.allowed_origins.split(",") if orig.strip()]
if not allowed_origins or "*" in allowed_origins:
    allowed_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routes and WebSocket endpoint
app.include_router(api_router)
app.include_router(ws_router)


@app.get("/")
async def root():
    return {
        "project": "Real-Time Autonomous Hazard Alerting & Conversational Assistant for Low-Vision Pedestrians",
        "docs_url": "/docs",
        "websocket_endpoint": "/ws",
        "health_check": "/health",
        "status": "/status",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level="info",
    )

