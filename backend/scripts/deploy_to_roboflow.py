#!/usr/bin/env python3
"""Utility script to deploy local YOLO weights (e.g. best.pt) to Roboflow.

Usage:
    python backend/scripts/deploy_to_roboflow.py [--api-key YOUR_API_KEY] [--project PROJECT_NAME] [--version 1]
"""

import argparse
import os
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(
        description="Deploy custom YOLO weights (best.pt) to Roboflow for hosted cloud inference."
    )
    parser.add_argument(
        "--api-key",
        default=os.environ.get("ROBOFLOW_API_KEY", ""),
        help="Your Roboflow Private API Key (starts with rf_...)",
    )
    parser.add_argument(
        "--project",
        default=os.environ.get("ROBOFLOW_PROJECT_NAME", ""),
        help="Your Roboflow project ID/slug (e.g., pedestrian-hazard-shield)",
    )
    parser.add_argument(
        "--version",
        type=int,
        default=int(os.environ.get("ROBOFLOW_VERSION", "1")),
        help="Model version number (default: 1)",
    )
    parser.add_argument(
        "--model-path",
        default="backend/models/best.pt",
        help="Path to your local trained YOLO weights (default: backend/models/best.pt)",
    )

    args = parser.parse_args()

    # Resolve paths relative to repo root
    repo_root = Path(__file__).resolve().parent.parent.parent
    model_path = Path(args.model_path)
    if not model_path.is_absolute():
        model_path = repo_root / args.model_path

    print("==================================================================")
    print("  Pedestrian Shield AI: Deploy YOLO to Roboflow Inference API")
    print("==================================================================")

    if not model_path.exists():
        print(f"[!] Error: Model weights not found at: {model_path}")
        print("    Please check the path or ensure 'best.pt' is in backend/models/")
        sys.exit(1)

    print(f"[✓] Found model weights: {model_path} ({model_path.stat().st_size / (1024*1024):.1f} MB)")

    api_key = args.api_key.strip()
    if not api_key:
        api_key = input("\nEnter your Roboflow Private API Key (rf_...): ").strip()

    if not api_key:
        print("[!] No API key provided. Exiting.")
        sys.exit(1)

    project_name = args.project.strip()
    if not project_name:
        project_name = input("Enter your Roboflow Project Name/ID: ").strip()

    if not project_name:
        print("[!] No project name provided. Exiting.")
        sys.exit(1)

    try:
        from roboflow import Roboflow
    except ImportError:
        print("\n[!] The 'roboflow' Python package is required to upload weights automatically.")
        print("    You can install it with:")
        print("        pip install roboflow")
        print("\nAlternatively, you can deploy directly from your browser:")
        print("    1. Go to https://app.roboflow.com")
        print("    2. Open your project -> Deploy -> Upload Weights")
        print(f"    3. Select: {model_path}")
        sys.exit(1)

    try:
        print(f"\n[+] Connecting to Roboflow with API key...")
        rf = Roboflow(api_key=api_key)
        workspace = rf.workspace()
        project = workspace.project(project_name)
        version = project.version(args.version)

        print(f"[+] Uploading {model_path.name} to {project_name}/{args.version} (YOLOv8 format)...")
        version.deploy("yolov8", str(model_path))

        print("\n==================================================================")
        print("  Deployment Successful!")
        print("==================================================================")
        print("Add the following to your backend/.env (and Render environment variables):")
        print(f"YOLO_PROVIDER=roboflow")
        print(f"ROBOFLOW_API_KEY={api_key}")
        print(f"ROBOFLOW_MODEL_ID={project_name}")
        print(f"ROBOFLOW_VERSION={args.version}")
        print("==================================================================")

    except Exception as e:
        print(f"\n[!] Deployment error: {e}")
        print("Please verify your API key and that the project and version exist in your workspace.")
        sys.exit(1)


if __name__ == "__main__":
    main()

