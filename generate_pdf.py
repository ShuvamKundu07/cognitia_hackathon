#!/usr/bin/env python3
"""Generates an executive, publication-quality PDF report for Pedestrian Shield AI."""

import os
import sys
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


class NumberedCanvas(canvas.Canvas):
    """Canvas that computes total page count dynamically for professional footers."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count: int):
        self.saveState()
        self.setFont("Helvetica", 9)
        self.setFillColor(colors.HexColor("#64748B"))

        # Running Header (pages > 1)
        if self._pageNumber > 1:
            self.drawString(
                54,
                letter[1] - 36,
                "Pedestrian Shield AI — Complete Project Summary & Tech Stack Specification",
            )
            self.setStrokeColor(colors.HexColor("#CBD5E1"))
            self.setLineWidth(0.5)
            self.line(54, letter[1] - 42, letter[0] - 54, letter[1] - 42)

        # Running Footer (all pages)
        self.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.setLineWidth(0.5)
        self.line(54, 45, letter[0] - 54, 45)

        footer_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(letter[0] - 54, 32, footer_text)
        self.drawString(
            54,
            32,
            "Cognitia Hackathon • Autonomous Assistive System for Low-Vision Pedestrians",
        )
        self.restoreState()


def create_pdf(output_filename: str):
    doc = SimpleDocTemplate(
        output_filename,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54,
    )

    styles = getSampleStyleSheet()

    # Custom typography styles
    title_style = ParagraphStyle(
        "DocTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=24,
        leading=28,
        textColor=colors.HexColor("#0F172A"),
        spaceAfter=4,
    )

    subtitle_style = ParagraphStyle(
        "DocSubTitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#2563EB"),
        spaceAfter=14,
    )

    h1_style = ParagraphStyle(
        "Heading1_Custom",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=15,
        leading=19,
        textColor=colors.HexColor("#0F172A"),
        spaceBefore=14,
        spaceAfter=6,
        keepWithNext=True,
    )

    h2_style = ParagraphStyle(
        "Heading2_Custom",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#1E3A8A"),
        spaceBefore=10,
        spaceAfter=4,
        keepWithNext=True,
    )

    body_style = ParagraphStyle(
        "Body_Custom",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9.5,
        leading=13.5,
        textColor=colors.HexColor("#334155"),
        spaceAfter=6,
    )

    bullet_style = ParagraphStyle(
        "Bullet_Custom",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#334155"),
        leftIndent=14,
        firstLineIndent=-10,
        spaceAfter=3,
    )

    callout_style = ParagraphStyle(
        "CalloutText",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#1E293B"),
    )

    table_header_style = ParagraphStyle(
        "TableHeader",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=11,
        textColor=colors.white,
    )

    table_cell_tech = ParagraphStyle(
        "TableCellTech",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#0F172A"),
    )

    table_cell_role = ParagraphStyle(
        "TableCellRole",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=10.5,
        textColor=colors.HexColor("#2563EB"),
    )

    table_cell_desc = ParagraphStyle(
        "TableCellDesc",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#334155"),
    )

    story = []

    # --------------------------------------------------------------------------
    # Document Header Banner
    # --------------------------------------------------------------------------
    story.append(Paragraph("Pedestrian Shield AI", title_style))
    story.append(
        Paragraph(
            "Autonomous Real-Time Hazard Alerting &amp; Conversational Assistant for Low-Vision Pedestrians",
            subtitle_style,
        )
    )

    meta_table_data = [
        [
            Paragraph("<b>Architecture:</b> Decoupled Layered System (FastAPI + React 19)", callout_style),
            Paragraph("<b>Network Link:</b> Sub-100ms Persistent WebSocket (/ws)", callout_style),
        ],
        [
            Paragraph("<b>Target Audience:</b> Blind &amp; Low-Vision Pedestrians", callout_style),
            Paragraph("<b>Deployment:</b> Local Host / Cloudflare Tunnel / Render", callout_style),
        ],
    ]
    meta_table = Table(meta_table_data, colWidths=[250, 254])
    meta_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F1F5F9")),
                ("PADDING", (0, 0), (-1, -1), 6),
                ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#CBD5E1")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    story.append(meta_table)
    story.append(Spacer(1, 10))

    # --------------------------------------------------------------------------
    # Section 1: Executive Summary
    # --------------------------------------------------------------------------
    story.append(Paragraph("1. Executive Summary &amp; Core Mission", h1_style))
    story.append(
        HRFlowable(
            width="100%",
            thickness=1.5,
            color=colors.HexColor("#2563EB"),
            spaceBefore=1,
            spaceAfter=8,
        )
    )

    story.append(
        Paragraph(
            "<b>Pedestrian Shield</b> is an end-to-end, multi-modal autonomous safety system engineered "
            "to grant blind and low-vision pedestrians safe, independent navigation through dense urban environments. "
            "Traditional mobility aids (such as white canes and guide dogs) are physically limited to obstacles "
            "within immediate ground reach, leaving pedestrians exposed to fast-moving vehicles, overhead and waist-high obstacles, "
            "pavement cavities (potholes), and acoustic hazards arriving from outside the line of sight.",
            body_style,
        )
    )

    story.append(
        Paragraph(
            "Pedestrian Shield turns standard commodity mobile hardware—a standard monocular smartphone or laptop camera "
            "and microphone running inside a modern web browser—into a comprehensive safety shield. It continuously performs "
            "deep visual obstacle detection, estimates trajectory expansion vectors and walking corridor collisions without "
            "metric depth sensors, classifies environmental safety acoustics (horns, sirens, tire squeals), fuses sensor streams "
            "to detect dangerous blindspots, enforces safety preemption to interrupt conversational speech for life-critical "
            "threats, and offers a wake-word enabled conversational AI assistant to read street signs and clarify environmental context.",
            body_style,
        )
    )

    # Core Principles Callout Box
    principles_data = [
        [
            Paragraph(
                "<b>Guiding Architectural Principles:</b><br/>"
                "• <b>Sub-100ms Latency:</b> Freshness queues with <code>maxsize=1</code> drop backlogged frames to prevent latency buildup.<br/>"
                "• <b>100% Deterministic Safety:</b> The LLM is strictly isolated from safety hazard scoring to prevent hallucinations.<br/>"
                "• <b>Preemptive Arbitration:</b> <code>CRITICAL &gt; HIGH &gt; MEDIUM &gt; LOW &gt; CONVERSATION</code>. Critical alerts immediately silence voice chat.<br/>"
                "• <b>360° Multi-Modal Fusion:</b> Acoustic cues from outside the camera view are escalated as Critical Blindspot threats.",
                callout_style,
            )
        ]
    ]
    principles_table = Table(principles_data, colWidths=[504])
    principles_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#EFF6FF")),
                ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#3B82F6")),
                ("PADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story.append(principles_table)
    story.append(Spacer(1, 10))

    # --------------------------------------------------------------------------
    # Section 2: Core Subsystems
    # --------------------------------------------------------------------------
    story.append(Paragraph("2. Subsystem Architecture &amp; Capabilities", h1_style))
    story.append(
        HRFlowable(
            width="100%",
            thickness=1.5,
            color=colors.HexColor("#2563EB"),
            spaceBefore=1,
            spaceAfter=8,
        )
    )

    # 2.1 Computer Vision
    story.append(Paragraph("A. Real-Time Vision &amp; Corridor Collision Engine", h2_style))
    story.append(
        Paragraph(
            "• <b>Dual-Engine Neural Detection:</b> Employs Ultralytics YOLOv8/YOLOv11 for identifying people, vehicles, "
            "bicycles, and street furniture, combined with a custom fine-tuned neural model (<code>best.pt</code>) "
            "specifically trained on road defects, potholes, curbs, and sidewalk depressions.<br/>"
            "• <b>Monocular Motion &amp; Expansion Rate:</b> In the absence of LiDAR or metric depth sensors, the pipeline calculates "
            "the bounding box area expansion rate (dA/dt) and centroid trajectory over time to determine relative velocity "
            "and time-to-collision.<br/>"
            "• <b>Dynamic Walking Corridor:</b> Defines a normalized central path (30% to 70% width, lower 55% height). "
            "Objects entering this walking corridor automatically receive elevated threat weights.<br/>"
            "• <b>Temporal Tracking &amp; Grace Period:</b> IoU-based tracking maintains unique track IDs across dropouts "
            "with a 1.5-second grace period, eliminating flickering alerts when obstacles are temporarily occluded.",
            bullet_style,
        )
    )

    # 2.2 Acoustic AI
    story.append(Paragraph("B. Acoustic AI &amp; 360° Blindspot Sensor Fusion", h2_style))
    story.append(
        Paragraph(
            "• <b>Acoustic Threat Classifier:</b> Incorporates a YAMNet deep neural network trained on AudioSet to classify "
            "safety-critical sounds (vehicle horns, emergency sirens, tire screeches, engine revs, warning bells), "
            "backed by an FFT spectral-energy fallback when offline.<br/>"
            "• <b>Spatial Direction &amp; Approach:</b> Computes sound direction via Interaural Level Difference (ILD) across stereo "
            "channels and estimates approach vectors via 3-frame rising RMS sound pressure levels (Delta SPL).<br/>"
            "• <b>360° Multi-Modal Decision Matrix:</b> If an acoustic threat is detected on the left or right, but the forward-facing "
            "camera does not detect a vehicle, the system flags a <b>CRITICAL BLINDSPOT</b> threat (approaching vehicle outside FOV). "
            "If both audio and visual cues align in direction, confidence is boosted additively.",
            bullet_style,
        )
    )

    # 2.3 Priority Arbitration
    story.append(Paragraph("C. Safety Controller &amp; Voice Interruption Queue", h2_style))
    story.append(
        Paragraph(
            "• <b>Absolute Safety Preemption:</b> Safety warnings always supersede informational dialogue. If the pedestrian is "
            "listening to a street sign reading and a vehicle approaches, <code>window.speechSynthesis.cancel()</code> aborts the TTS "
            "instantaneously, triggers a dual-tone earcon alarm via Web Audio API, and announces: <i>'STOP. Vehicle approaching from your right.'</i><br/>"
            "• <b>Smart Deduplication &amp; Cooldown:</b> Implements an 8-second cooldown (customizable in settings) to prevent repetitive auditory fatigue "
            "for the same obstacle. However, if an obstacle escalates to CRITICAL urgency, the cooldown is bypassed immediately.",
            bullet_style,
        )
    )

    # 2.4 Conversational Assistant
    story.append(Paragraph("D. Conversational Assistant ('Bro') &amp; Scene OCR", h2_style))
    story.append(
        Paragraph(
            "• <b>Hands-Free Interaction:</b> Activated via wake-word (<i>'Hey Bro'</i>), push-to-talk button (Spacebar), or accessible text input.<br/>"
            "• <b>Spatial Reference Resolution:</b> Grounded deterministic reference resolver decodes spatial queries (<i>'What does that sign say?'</i>, "
            "<i>'Is it safe to cross?'</i>) by mapping bounding boxes, traffic lights, and scene memory before prompting the LLM.<br/>"
            "• <b>Scene OCR:</b> PaddleOCR enhanced with CLAHE contrast equalization and Otsu binarization extracts text from storefronts and parking signs.<br/>"
            "• <b>Google Gemini Integration:</b> Invocations of <code>gemini-2.5-flash</code> synthesize ultra-concise, 1-2 sentence spoken answers "
            "free of markdown syntax or formatting clutter. If offline, the deterministic rule-based local assistant takes over seamlessly.",
            bullet_style,
        )
    )

    # 2.5 Failure Detection
    story.append(Paragraph("E. Hardware Quality Audits &amp; Evaluation Benchmark", h2_style))
    story.append(
        Paragraph(
            "• <b>Optical Diagnostic Audits:</b> OpenCV Laplacian variance and brightness histograms detect pitch-black darkness, blinding glare, "
            "severe motion blur, or camera occlusions, triggering assertive audio warnings to the pedestrian.<br/>"
            "• <b>Ground-Truth Benchmark Evaluator:</b> Includes a video replay engine and benchmark suite computing Precision, Recall, F1 Score, "
            "False Alarm Rate, and Average Alert Latency against annotated urban pedestrian crossing datasets.",
            bullet_style,
        )
    )

    story.append(PageBreak())

    # --------------------------------------------------------------------------
    # Section 3: Comprehensive Tech Stack Breakdown
    # --------------------------------------------------------------------------
    story.append(Paragraph("3. Comprehensive Tech Stack Breakdown &amp; Rationale", h1_style))
    story.append(
        HRFlowable(
            width="100%",
            thickness=1.5,
            color=colors.HexColor("#2563EB"),
            spaceBefore=1,
            spaceAfter=8,
        )
    )

    story.append(
        Paragraph(
            "The following tables detail every technology, library, model, and framework utilized in Pedestrian Shield, "
            "along with the explicit technical rationale for its selection.",
            body_style,
        )
    )

    # Table 1: Frontend
    story.append(Paragraph("A. Frontend Client &amp; Accessibility (Browser Layer)", h2_style))
    frontend_data = [
        [
            Paragraph("Technology", table_header_style),
            Paragraph("Role in System", table_header_style),
            Paragraph("Technical Rationale &amp; Benefits", table_header_style),
        ],
        [
            Paragraph("React 19", table_cell_tech),
            Paragraph("Core Reactive UI Framework", table_cell_role),
            Paragraph(
                "Provides fine-grained state management and concurrent rendering. Essential for rendering "
                "local 60fps video alongside real-time bounding box overlays, radar visualizers, and priority alert queues "
                "without UI thread freezing.",
                table_cell_desc,
            ),
        ],
        [
            Paragraph("Vite 8", table_cell_tech),
            Paragraph("Build Tool &amp; Dev Server", table_cell_role),
            Paragraph(
                "Instant Hot Module Replacement (HMR) and optimized Rollup-based tree-shaking producing an ultra-lightweight "
                "production client bundle that loads instantly on mobile web browsers.",
                table_cell_desc,
            ),
        ],
        [
            Paragraph("Tailwind CSS", table_cell_tech),
            Paragraph("Accessible Design System", table_cell_role),
            Paragraph(
                "Enables rapid development of WCAG-compliant high-contrast dark themes. Features dedicated urgency classes "
                "(Critical Red, High Orange, Medium Yellow, Cyan) and custom high-contrast accessibility styles.",
                table_cell_desc,
            ),
        ],
        [
            Paragraph("HTML5 Canvas API", table_cell_tech),
            Paragraph("Offscreen Frame Capture", table_cell_role),
            Paragraph(
                "Captures raw video frames from the local stream, scales them down to 640x360 at 0.65 JPEG compression, "
                "and throttles transmission to 8–15 FPS to conserve cellular bandwidth while keeping latency minimal.",
                table_cell_desc,
            ),
        ],
        [
            Paragraph("Web Audio API", table_cell_tech),
            Paragraph("RMS Monitor &amp; Earcon Synthesizer", table_cell_role),
            Paragraph(
                "Uses <code>AudioContext</code> and <code>AnalyserNode</code> to visualize mic energy and synthesize "
                "immediate dual-tone warning earcons (880Hz / 440Hz) with 0ms network latency.",
                table_cell_desc,
            ),
        ],
        [
            Paragraph("Web Speech API", table_cell_tech),
            Paragraph("TTS &amp; Voice Input", table_cell_role),
            Paragraph(
                "Zero-dependency speech synthesis with instant <code>speechSynthesis.cancel()</code> for safety interruptions, "
                "plus <code>webkitSpeechRecognition</code> for hands-free conversational voice commands.",
                table_cell_desc,
            ),
        ],
        [
            Paragraph("WAI-ARIA", table_cell_tech),
            Paragraph("Screen Reader Protocol", table_cell_role),
            Paragraph(
                "Implements <code>role='alert'</code> and <code>aria-live='assertive'</code> for life-critical hazards and "
                "<code>polite</code> for conversational answers, ensuring full compatibility with VoiceOver, TalkBack, and NVDA.",
                table_cell_desc,
            ),
        ],
        [
            Paragraph("Lucide React", table_cell_tech),
            Paragraph("Accessible UI Iconography", table_cell_role),
            Paragraph(
                "Lightweight, clean vector SVG icons for radar status, camera controls, volume levels, and settings toggles.",
                table_cell_desc,
            ),
        ],
    ]

    t1 = Table(frontend_data, colWidths=[90, 114, 300])
    t1.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1E293B")),
                ("PADDING", (0, 0), (-1, -1), 4),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story.append(t1)
    story.append(Spacer(1, 10))

    # Table 2: Backend
    story.append(Paragraph("B. Backend Server &amp; Orchestration (Python ASGI Layer)", h2_style))
    backend_data = [
        [
            Paragraph("Technology", table_header_style),
            Paragraph("Role in System", table_header_style),
            Paragraph("Technical Rationale &amp; Benefits", table_header_style),
        ],
        [
            Paragraph("Python 3.10–3.13", table_cell_tech),
            Paragraph("Core Backend Runtime", table_cell_role),
            Paragraph(
                "Primary language for modern AI, computer vision, and neural network runtimes (PyTorch, OpenCV, TensorFlow, Ultralytics), "
                "providing seamless hardware acceleration on Apple Silicon, CUDA, and Linux.",
                table_cell_desc,
            ),
        ],
        [
            Paragraph("FastAPI", table_cell_tech),
            Paragraph("Asynchronous ASGI Framework", table_cell_role),
            Paragraph(
                "High-performance async framework supporting concurrent WebSocket endpoints, background tasks, "
                "REST routes, and automatic interactive OpenAPI/Swagger documentation.",
                table_cell_desc,
            ),
        ],
        [
            Paragraph("Uvicorn[standard]", table_cell_tech),
            Paragraph("Production ASGI Server", table_cell_role),
            Paragraph(
                "Built on <code>uvloop</code> and <code>httptools</code>, delivering ultra-low-latency asynchronous execution "
                "capable of handling continuous high-frequency video frame payloads.",
                table_cell_desc,
            ),
        ],
        [
            Paragraph("WebSockets", table_cell_tech),
            Paragraph("Persistent Duplex Protocol", table_cell_role),
            Paragraph(
                "Maintains a single persistent bi-directional connection over <code>/ws</code>. Client pushes camera frames and audio chunks; "
                "server pushes detected bounding boxes, acoustic radar hits, and audio alerts in sub-100ms real time.",
                table_cell_desc,
            ),
        ],
        [
            Paragraph("Pydantic v2", table_cell_tech),
            Paragraph("Schema &amp; Config Validation", table_cell_role),
            Paragraph(
                "Fast Rust-backed schema validation and serialization for hazard models, bounding boxes, settings, "
                "and environment configurations via <code>pydantic-settings</code>.",
                table_cell_desc,
            ),
        ],
        [
            Paragraph("SQLite3", table_cell_tech),
            Paragraph("Audit &amp; Benchmark Persistence", table_cell_role),
            Paragraph(
                "Zero-configuration embedded SQL database storing historical hazard events, dispatches, system failures, "
                "and offline benchmark evaluation records via a clean repository pattern.",
                table_cell_desc,
            ),
        ],
    ]

    t2 = Table(backend_data, colWidths=[90, 114, 300])
    t2.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1E293B")),
                ("PADDING", (0, 0), (-1, -1), 4),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story.append(t2)

    story.append(PageBreak())

    # Table 3: Computer Vision & AI Models
    story.append(Paragraph("C. Computer Vision, Machine Learning &amp; Audio AI", h2_style))
    ai_data = [
        [
            Paragraph("Model / Library", table_header_style),
            Paragraph("Role in System", table_header_style),
            Paragraph("Technical Rationale &amp; Benefits", table_header_style),
        ],
        [
            Paragraph("Ultralytics YOLO (v8/v11)", table_cell_tech),
            Paragraph("Real-Time Object Detection", table_cell_role),
            Paragraph(
                "Pretrained state-of-the-art detector identifying pedestrians, vehicles, buses, bicycles, and street obstacles. "
                "Operates at 10–30+ FPS on commodity hardware with high spatial accuracy.",
                table_cell_desc,
            ),
        ],
        [
            Paragraph("Custom YOLO (best.pt)", table_cell_tech),
            Paragraph("Pavement Hazard Model", table_cell_role),
            Paragraph(
                "Custom fine-tuned 44MB neural checkpoint specialized in ground-level hazards: potholes, sidewalk cracks, "
                "curbs, and tripping hazards critical for low-vision walking safety.",
                table_cell_desc,
            ),
        ],
        [
            Paragraph("OpenCV (Headless)", table_cell_tech),
            Paragraph("Image Processing &amp; Quality", table_cell_role),
            Paragraph(
                "Decodes base64 frames to BGR arrays, assesses image blur via Laplacian variance, detects under/overexposure, "
                "and applies CLAHE contrast enhancement for text extraction.",
                table_cell_desc,
            ),
        ],
        [
            Paragraph("NumPy &amp; SciPy", table_cell_tech),
            Paragraph("Math, Signals &amp; Spatial IoU", table_cell_role),
            Paragraph(
                "Computes bounding box IoU metrics, area expansion rates, centroid distance vectors, FFT audio frequencies, "
                "and RMS sound pressure level calculations.",
                table_cell_desc,
            ),
        ],
        [
            Paragraph("YAMNet (TensorFlow)", table_cell_tech),
            Paragraph("Environmental Sound Classifier", table_cell_role),
            Paragraph(
                "Deep acoustic classifier trained on AudioSet to identify vehicle horns, emergency sirens, tire squeals, "
                "and engine acceleration from incoming audio chunks.",
                table_cell_desc,
            ),
        ],
        [
            Paragraph("PaddleOCR", table_cell_tech),
            Paragraph("Scene Text &amp; Sign Reader", table_cell_role),
            Paragraph(
                "High-accuracy deep learning OCR engine with angle classification, extracting text from storefront signs, "
                "parking notices, and street names.",
                table_cell_desc,
            ),
        ],
        [
            Paragraph("Google Gemini API", table_cell_tech),
            Paragraph("Conversational AI (gemini-2.5-flash)", table_cell_role),
            Paragraph(
                "Understands and synthesizes spoken natural language responses to user inquiries about the surrounding scene, "
                "grounded strictly in real-time scene memory. Strictly excluded from the safety alert path.",
                table_cell_desc,
            ),
        ],
        [
            Paragraph("Roboflow Inference", table_cell_tech),
            Paragraph("Hosted Cloud YOLO Fallback", table_cell_role),
            Paragraph(
                "Optional remote inference provider enabling deployment on low-memory servers (e.g., Render free tier) "
                "by offloading GPU compute to cloud endpoints.",
                table_cell_desc,
            ),
        ],
    ]

    t3 = Table(ai_data, colWidths=[100, 114, 290])
    t3.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1E293B")),
                ("PADDING", (0, 0), (-1, -1), 4),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story.append(t3)
    story.append(Spacer(1, 10))

    # Table 4: Testing & Deployment
    story.append(Paragraph("D. Testing, DevOps &amp; Cloud Deployment", h2_style))
    devops_data = [
        [
            Paragraph("Tool", table_header_style),
            Paragraph("Role in System", table_header_style),
            Paragraph("Technical Rationale &amp; Benefits", table_header_style),
        ],
        [
            Paragraph("Pytest &amp; Asyncio", table_cell_tech),
            Paragraph("Automated Test Framework", table_cell_role),
            Paragraph(
                "31 automated unit and integration tests verifying alert deduplication, motion expansion estimation, "
                "sensor fusion logic, failure detectors, and WebSocket lifecycle.",
                table_cell_desc,
            ),
        ],
        [
            Paragraph("Cloudflare Tunnel", table_cell_tech),
            Paragraph("Zero-Config Public WSS Link", table_cell_role),
            Paragraph(
                "Exposes the local backend over secure HTTPS/WSS (<code>*.trycloudflare.com</code>) via <code>start_all.sh</code>, "
                "allowing physical smartphones in real-world street conditions to connect to the development server.",
                table_cell_desc,
            ),
        ],
        [
            Paragraph("Render Config", table_cell_tech),
            Paragraph("Cloud Container Deployment", table_cell_role),
            Paragraph(
                "<code>render.yaml</code> infrastructure-as-code specification for deploying the backend as a cloud container "
                "with automated environment variable injection.",
                table_cell_desc,
            ),
        ],
    ]

    t4 = Table(devops_data, colWidths=[90, 114, 300])
    t4.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1E293B")),
                ("PADDING", (0, 0), (-1, -1), 4),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story.append(t4)
    story.append(Spacer(1, 10))

    # --------------------------------------------------------------------------
    # Section 4: Data Flow & Safety Guarantees Summary
    # --------------------------------------------------------------------------
    story.append(Paragraph("4. End-to-End Latency &amp; Safety Guarantees", h1_style))
    story.append(
        HRFlowable(
            width="100%",
            thickness=1.5,
            color=colors.HexColor("#2563EB"),
            spaceBefore=1,
            spaceAfter=8,
        )
    )

    summary_box_data = [
        [
            Paragraph(
                "<b>Key Architectural Guarantees for Pedestrian Safety:</b><br/>"
                "1. <b>Zero Hallucination Safety Path:</b> All safety scoring, corridor collision evaluations, and priority sorting "
                "rely on deterministic mathematical algorithms. The generative AI model is only consulted for conversational inquiries.<br/>"
                "2. <b>Freshness Over Completion:</b> Asynchronous frame queue drops stale frames (<code>stale_frame_drop_ms=250</code>), ensuring "
                "alerts reflect the exact physical state of the environment without buffering delays.<br/>"
                "3. <b>Full Sensory Redundancy:</b> Visual bounding boxes, directional acoustic radar, spoken speech synthesis, and dual-tone Web Audio earcons "
                "ensure that pedestrians receive alerts regardless of ambient noise or visual acuity.<br/>"
                "4. <b>Offline Simulation Fallback:</b> Both frontend and backend feature deterministic simulation engines, allowing testing and demonstrations "
                "even when hardware cameras, microphones, or network connections are unavailable.",
                callout_style,
            )
        ]
    ]
    summary_box = Table(summary_box_data, colWidths=[504])
    summary_box.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F0FDF4")),
                ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#16A34A")),
                ("PADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story.append(summary_box)

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Successfully generated {output_filename}")


if __name__ == "__main__":
    out_pdf = "Pedestrian_Shield_Project_Summary_and_Tech_Stack.pdf"
    if len(sys.argv) > 1:
        out_pdf = sys.argv[1]
    create_pdf(out_pdf)

