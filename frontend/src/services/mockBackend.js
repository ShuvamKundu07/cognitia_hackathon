/**
 * Mock Backend Simulator for Autonomous Hazard Alerting.
 * Completely separated from the WebSocket service.
 * Simulates real-time detection streams, hazard alerts, audio events,
 * OCR, conversational assistant responses, and system failures.
 */

import { isWakePhrase, isExitPhrase } from '../utils/geneConfig';
import { defaultAlertManager } from '../utils/alertManager';

class MockBackendService {
  constructor() {
    this.listeners = new Map();
    this.statusListeners = new Set();
    this.isRunning = false;
    this.tickInterval = null;
    this.frameCounter = 0;
    this.alertManager = defaultAlertManager;
    
    // Scenario state variables
    this.carProgress = 0;
    this.cameraBlocked = false;
    this.hasActiveCameraStream = false;
    this.lastFrameTime = 0;
    this._lastProcessTime = 0;
    this._lastAlertTime = 0;
    this._lastObjAlertTime = 0;
  }

  on(type, callback) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type).add(callback);
    return () => {
      const set = this.listeners.get(type);
      if (set) {
        set.delete(callback);
        if (set.size === 0) this.listeners.delete(type);
      }
    };
  }

  onStateChange(cb) {
    this.statusListeners.add(cb);
    cb(this.isRunning ? 'CONNECTED' : 'DISCONNECTED');
    return () => this.statusListeners.delete(cb);
  }

  emit(type, data) {
    const payload = { type, ...data };
    if (this.listeners.has(type)) {
      this.listeners.get(type).forEach((cb) => cb(payload));
    }
    if (this.listeners.has('*')) {
      this.listeners.get('*').forEach((cb) => cb(payload));
    }
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.statusListeners.forEach((cb) => cb('CONNECTED'));

    // Emit initial system status
    this.emit('system_status', {
      camera: 'ACTIVE',
      microphone: 'ACTIVE',
      backend: 'CONNECTED',
      vision_ai: 'ACTIVE',
      audio_ai: 'ACTIVE',
      ocr: 'READY',
      assistant: 'READY',
      camera_quality: 'good',
    });

    // Start simulation loop
    this.tickInterval = setInterval(() => {
      this.tick();
    }, 600);
  }

  stop() {
    this.isRunning = false;
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.statusListeners.forEach((cb) => cb('DISCONNECTED'));
  }

  tick() {
    this.frameCounter++;

    // If live camera frames are streaming, let real camera frame analysis drive detections
    if (this.hasActiveCameraStream && this.lastFrameTime && Date.now() - this.lastFrameTime < 2500) {
      return;
    }

    const objects = [];

    // 1. Pothole in walking path ahead
    objects.push({
      id: 'pothole_3',
      label: 'pothole',
      confidence: 0.89,
      bbox: {
        x: 0.42,
        y: 0.65,
        width: 0.16,
        height: 0.12,
      },
      direction: 'ahead',
      urgency: 'high',
    });

    // 2. Pedestrian on left
    const pedY = 0.35 + Math.sin(this.frameCounter * 0.1) * 0.05;
    objects.push({
      id: 'ped_12',
      label: 'pedestrian',
      confidence: 0.85,
      bbox: {
        x: 0.15,
        y: pedY,
        width: 0.12,
        height: 0.30,
      },
      direction: 'left',
      urgency: 'medium',
    });

    // 3. Approaching car from right
    const carCycle = this.frameCounter % 30;
    if (carCycle > 8 && carCycle < 24) {
      const carX = 0.75 - (carCycle - 8) * 0.02;
      const carUrgency = carX < 0.60 ? 'critical' : 'high';
      
      const carObj = {
        id: 'car_17',
        label: 'vehicle',
        confidence: 0.94,
        bbox: {
          x: carX,
          y: 0.32,
          width: 0.22,
          height: 0.20,
        },
        direction: 'right',
        urgency: carUrgency,
      };
      objects.push(carObj);

      if (carUrgency === 'critical' && carCycle === 16) {
        this.emit('hazard_alert', {
          hazard_id: 'car_17',
          hazard_type: 'vehicle',
          message: 'Stop. Vehicle detected on the right. Move left.',
          action: 'STOP & STEP LEFT',
          direction: 'right',
          movement_direction: 'left',
          urgency: 'critical',
          confidence: 0.94,
          timestamp: Date.now(),
        });
      }
    } else if (carCycle === 24) {
      this.emit('hazard_resolved', {
        hazard_id: 'car_17',
        timestamp: Date.now(),
      });
    }

    this.emit('detection', {
      objects,
      walking_path: {
        x: 0.30,
        y: 0.45,
        width: 0.40,
        height: 0.55,
      },
      timestamp: Date.now(),
    });

    if (this.frameCounter % 40 === 10) {
      this.emit('audio_event', {
        sound: 'Car Horn',
        direction: 'Right',
        confidence: 0.92,
        timestamp: Date.now(),
      });
    }
  }

  triggerCriticalCar() {
    this.emit('detection', {
      objects: [
        {
          id: 'car_manual',
          label: 'fast vehicle',
          confidence: 0.96,
          bbox: { x: 0.52, y: 0.30, width: 0.28, height: 0.24 },
          direction: 'right',
          urgency: 'critical',
        },
      ],
      walking_path: { x: 0.30, y: 0.45, width: 0.40, height: 0.55 },
      timestamp: Date.now(),
    });

    this.emit('hazard_alert', {
      hazard_id: 'car_manual',
      hazard_type: 'vehicle',
      message: 'Stop. Vehicle detected on the right. Move left.',
      action: 'STOP & STEP LEFT',
      direction: 'right',
      movement_direction: 'left',
      urgency: 'critical',
      confidence: 0.96,
      timestamp: Date.now(),
    });

    if (this._carTimeout) clearTimeout(this._carTimeout);
    this._carTimeout = setTimeout(() => {
      this.emit('hazard_resolved', {
        hazard_id: 'car_manual',
        timestamp: Date.now(),
      });
      this.emit('detection', {
        objects: [],
        walking_path: { x: 0.30, y: 0.45, width: 0.40, height: 0.55 },
        timestamp: Date.now(),
      });
    }, 7000);
  }

  triggerPotholeAhead() {
    this.emit('detection', {
      objects: [
        {
          id: 'pothole_manual',
          label: 'deep pothole',
          confidence: 0.91,
          bbox: { x: 0.40, y: 0.60, width: 0.20, height: 0.16 },
          direction: 'ahead',
          urgency: 'high',
        },
      ],
      walking_path: { x: 0.30, y: 0.45, width: 0.40, height: 0.55 },
      timestamp: Date.now(),
    });

    this.emit('hazard_alert', {
      hazard_id: 'pothole_manual',
      hazard_type: 'surface',
      message: 'Caution. Pothole detected straight ahead. Step right to bypass.',
      action: 'STEP RIGHT',
      direction: 'ahead',
      movement_direction: 'right',
      urgency: 'high',
      confidence: 0.91,
      timestamp: Date.now(),
    });

    if (this._potholeTimeout) clearTimeout(this._potholeTimeout);
    this._potholeTimeout = setTimeout(() => {
      this.emit('hazard_resolved', {
        hazard_id: 'pothole_manual',
        timestamp: Date.now(),
      });
      this.emit('detection', {
        objects: [],
        walking_path: { x: 0.30, y: 0.45, width: 0.40, height: 0.55 },
        timestamp: Date.now(),
      });
    }, 7000);
  }

  triggerMultipleCars() {
    const cars = [
      { id: 'car_group_1', label: 'car', confidence: 0.94, bbox: { x: 0.42, y: 0.28, width: 0.18, height: 0.16 }, direction: 'ahead', urgency: 'high' },
      { id: 'car_group_2', label: 'vehicle', confidence: 0.91, bbox: { x: 0.62, y: 0.32, width: 0.20, height: 0.18 }, direction: 'ahead', urgency: 'high' },
      { id: 'car_group_3', label: 'sedan', confidence: 0.89, bbox: { x: 0.22, y: 0.30, width: 0.16, height: 0.15 }, direction: 'ahead', urgency: 'medium' },
      { id: 'car_group_4', label: 'truck', confidence: 0.88, bbox: { x: 0.78, y: 0.36, width: 0.19, height: 0.22 }, direction: 'ahead', urgency: 'medium' },
    ];

    this.emit('detection', {
      objects: cars,
      walking_path: { x: 0.30, y: 0.45, width: 0.40, height: 0.55 },
      timestamp: Date.now(),
    });

    this.emit('hazard_alert', {
      hazard_id: 'car_group_1',
      hazard_type: 'vehicle',
      message: 'Multiple cars detected ahead. Step right to bypass.',
      action: 'STEP RIGHT',
      direction: 'ahead',
      movement_direction: 'right',
      urgency: 'high',
      confidence: 0.94,
      timestamp: Date.now(),
      groupedCount: 4,
    });

    if (this._multiCarTimeout) clearTimeout(this._multiCarTimeout);
    this._multiCarTimeout = setTimeout(() => {
      this.emit('hazard_resolved', { hazard_id: 'car_group_1', timestamp: Date.now() });
      this.emit('detection', { objects: [], walking_path: { x: 0.30, y: 0.45, width: 0.40, height: 0.55 }, timestamp: Date.now() });
    }, 7000);
  }

  triggerMultiplePedestrians() {
    const peds = [
      { id: 'ped_group_1', label: 'pedestrian', confidence: 0.92, bbox: { x: 0.35, y: 0.32, width: 0.10, height: 0.28 }, direction: 'ahead', urgency: 'medium' },
      { id: 'ped_group_2', label: 'pedestrian', confidence: 0.90, bbox: { x: 0.48, y: 0.34, width: 0.09, height: 0.26 }, direction: 'ahead', urgency: 'medium' },
      { id: 'ped_group_3', label: 'pedestrian', confidence: 0.87, bbox: { x: 0.25, y: 0.30, width: 0.10, height: 0.25 }, direction: 'ahead', urgency: 'medium' },
      { id: 'ped_group_4', label: 'pedestrian', confidence: 0.85, bbox: { x: 0.60, y: 0.35, width: 0.09, height: 0.27 }, direction: 'ahead', urgency: 'low' },
      { id: 'ped_group_5', label: 'person', confidence: 0.83, bbox: { x: 0.15, y: 0.33, width: 0.08, height: 0.24 }, direction: 'ahead', urgency: 'low' },
    ];

    this.emit('detection', {
      objects: peds,
      walking_path: { x: 0.30, y: 0.45, width: 0.40, height: 0.55 },
      timestamp: Date.now(),
    });

    this.emit('hazard_alert', {
      hazard_id: 'ped_group_1',
      hazard_type: 'pedestrian',
      message: 'Multiple pedestrians detected ahead. Step left to bypass.',
      action: 'STEP LEFT',
      direction: 'ahead',
      movement_direction: 'left',
      urgency: 'medium',
      confidence: 0.92,
      timestamp: Date.now(),
      groupedCount: 5,
    });

    if (this._multiPedTimeout) clearTimeout(this._multiPedTimeout);
    this._multiPedTimeout = setTimeout(() => {
      this.emit('hazard_resolved', { hazard_id: 'ped_group_1', timestamp: Date.now() });
      this.emit('detection', { objects: [], walking_path: { x: 0.30, y: 0.45, width: 0.40, height: 0.55 }, timestamp: Date.now() });
    }, 7000);
  }

  triggerCarAndMultipleObstacles() {
    const mixed = [
      { id: 'car_mixed', label: 'car', confidence: 0.95, bbox: { x: 0.65, y: 0.30, width: 0.24, height: 0.20 }, direction: 'right', motion: 'approaching', urgency: 'high' },
      { id: 'obs_mixed_1', label: 'pothole', confidence: 0.88, bbox: { x: 0.42, y: 0.65, width: 0.16, height: 0.12 }, direction: 'ahead', urgency: 'medium' },
      { id: 'obs_mixed_2', label: 'traffic cone', confidence: 0.82, bbox: { x: 0.32, y: 0.55, width: 0.12, height: 0.18 }, direction: 'ahead', urgency: 'low' },
    ];

    this.emit('detection', {
      objects: mixed,
      walking_path: { x: 0.30, y: 0.45, width: 0.40, height: 0.55 },
      timestamp: Date.now(),
    });

    this.emit('hazard_alert', {
      hazard_id: 'car_mixed',
      hazard_type: 'multi_hazard',
      message: 'Warning: car approaching from the right. Multiple obstacles ahead. Stop and step left.',
      action: 'STOP & STEP LEFT',
      direction: 'right',
      movement_direction: 'left',
      urgency: 'high',
      confidence: 0.95,
      timestamp: Date.now(),
      groupedCount: 3,
    });

    if (this._mixedTimeout) clearTimeout(this._mixedTimeout);
    this._mixedTimeout = setTimeout(() => {
      this.emit('hazard_resolved', { hazard_id: 'car_mixed', timestamp: Date.now() });
      this.emit('detection', { objects: [], walking_path: { x: 0.30, y: 0.45, width: 0.40, height: 0.55 }, timestamp: Date.now() });
    }, 7000);
  }

  triggerHornAudio() {
    this.emit('audio_event', {
      sound: 'Vehicle Horn',
      direction: 'Right',
      confidence: 0.94,
      timestamp: Date.now(),
    });
  }

  triggerSirenAudio() {
    this.emit('audio_event', {
      sound: 'Emergency Siren',
      direction: 'Ahead',
      confidence: 0.98,
      timestamp: Date.now(),
    });
  }

  toggleCameraVisibilityFailure() {
    this.cameraBlocked = !this.cameraBlocked;
    if (this.cameraBlocked) {
      this.emit('system_failure', {
        component: 'camera',
        message: 'WARNING: Camera visibility is poor. Hazard detection may be unreliable.',
      });
      this.emit('system_status', {
        camera: 'DEGRADED',
        microphone: 'ACTIVE',
        backend: 'CONNECTED',
        vision_ai: 'DEGRADED',
        audio_ai: 'ACTIVE',
        ocr: 'DEGRADED',
        assistant: 'READY',
        camera_quality: 'poor',
      });
    } else {
      this.emit('system_status', {
        camera: 'ACTIVE',
        microphone: 'ACTIVE',
        backend: 'CONNECTED',
        vision_ai: 'ACTIVE',
        audio_ai: 'ACTIVE',
        ocr: 'READY',
        assistant: 'READY',
        camera_quality: 'good',
      });
    }
  }

  sendWakeWord(_text = 'hey bro') {
    this.emit('conversation_status', { state: 'ACTIVATING' });
    setTimeout(() => {
      this.emit('assistant_response', {
        text: 'Yes, how can I help you?',
        status: 'wake_word_ack',
      });
      this.emit('conversation_status', { state: 'SPEAKING' });
    }, 200);
    return true;
  }

  sendConversationStatus(state) {
    this.emit('conversation_status', { state });
    return true;
  }

  simulateConversationQuery(queryText) {
    const q = (queryText || '').toLowerCase();

    // Check Wake Word
    if (isWakePhrase(queryText)) {
      this.emit('conversation_status', { state: 'ACTIVATING' });
      setTimeout(() => {
        this.emit('assistant_response', {
          text: 'Yes, how can I help you?',
          status: 'wake_word_ack',
        });
        this.emit('conversation_status', { state: 'SPEAKING' });
      }, 200);
      return;
    }

    // Check Termination / Exit Phrase
    if (isExitPhrase(queryText)) {
      this.emit('conversation_status', { state: 'PROCESSING' });
      setTimeout(() => {
        this.emit('assistant_response', {
          text: "You're welcome. I'll keep monitoring your surroundings.",
          status: 'completed',
          is_exit: true,
        });
        this.emit('conversation_status', { state: 'IDLE' });
      }, 300);
      return;
    }

    this.emit('conversation_status', { state: 'PROCESSING' });

    setTimeout(() => {
      if (q.includes('sign') || q.includes('text') || q.includes('read') || q.includes('say')) {
        this.emit('ocr_result', {
          text: 'NO PARKING ANYTIME - TOW AWAY ZONE',
          confidence: 0.93,
          object_id: 'sign_street_4',
        });
        this.emit('assistant_response', {
          text: 'The sign on your right says "No Parking Anytime - Tow Away Zone".',
          status: 'completed',
        });
      } else if (q.includes('cross') || q.includes('safe')) {
        this.emit('assistant_response', {
          text: 'Traffic signal is currently Red. Vehicle approaching on your right. Do not cross yet.',
          status: 'completed',
        });
      } else if (q.includes('ahead') || q.includes('in front') || q.includes('front') || q.includes('curb') || q.includes('what')) {
        this.emit('assistant_response', {
          text: 'Directly ahead is a level sidewalk with a shallow pothole in two meters. Pedestrian on your left is moving away.',
          status: 'completed',
        });
      } else if (q.includes('where is it') || q.includes('where')) {
        this.emit('assistant_response', {
          text: 'The vehicle is on your right, currently moving away.',
          status: 'completed',
        });
      } else {
        this.emit('assistant_response', {
          text: `I heard: "${queryText}". The walking path ahead is unobstructed for approximately three meters.`,
          status: 'completed',
        });
      }
      this.emit('conversation_status', { state: 'SPEAKING' });
    }, 700);
  }

  sendFrame(base64Frame) {
    if (!base64Frame) return true;
    this.hasActiveCameraStream = true;
    this.lastFrameTime = Date.now();
    this.processLiveCameraFrame(base64Frame);
    return true;
  }

  processLiveCameraFrame(base64Frame) {
    const now = Date.now();
    // Throttle to 3-4 fps in mock/client mode to keep UI buttery smooth
    if (this._lastProcessTime && now - this._lastProcessTime < 280) {
      return;
    }
    this._lastProcessTime = now;

    if (!this._offscreenCanvas && typeof document !== 'undefined') {
      this._offscreenCanvas = document.createElement('canvas');
      this._offscreenCanvas.width = 160;
      this._offscreenCanvas.height = 90;
      this._offscreenCtx = this._offscreenCanvas.getContext('2d', { willReadFrequently: true });
      this._offscreenImg = new Image();
    }

    if (!this._offscreenCanvas || !this._offscreenImg) return;

    this._offscreenImg.onload = () => {
      try {
        const w = 160;
        const h = 90;
        this._offscreenCtx.drawImage(this._offscreenImg, 0, 0, w, h);
        const imgData = this._offscreenCtx.getImageData(0, 0, w, h);
        const data = imgData.data;

        const objects = [];

        // 1. Analyze Road Surface / Walking Corridor for Potholes (strictly lower 30% ground plane)
        const roadTop = Math.floor(h * 0.70);
        let roadLumSum = 0;
        let roadCount = 0;
        let roadSatSum = 0;
        let skinPixels = 0;

        for (let y = roadTop; y < h; y += 2) {
          for (let x = 0; x < w; x += 2) {
            const idx = (y * w + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            const maxC = Math.max(r, g, b);
            const minC = Math.min(r, g, b);
            const sat = maxC === 0 ? 0 : ((maxC - minC) / maxC) * 255;
            
            // Skin tone detection
            if (r > g && g > b && sat > 40 && r > 60) {
              skinPixels++;
            }
            roadSatSum += sat;
            roadLumSum += lum;
            roadCount++;
          }
        }
        const avgRoadLum = roadCount > 0 ? roadLumSum / roadCount : 128;
        const avgRoadSat = roadCount > 0 ? roadSatSum / roadCount : 0;
        const skinRatio = roadCount > 0 ? skinPixels / roadCount : 0;

        // Only detect potholes if the ground surface looks like genuine achromatic pavement (not skin/clothes/room)
        const isPavement = avgRoadSat < 50 && skinRatio < 0.08 && avgRoadLum > 40;

        if (isPavement) {
          // Scan localized spatial patches across pavement to identify sharp contrast depressions
          const cellW = 18;
          const cellH = 10;
          let lowestLum = avgRoadLum;
          let bestCellX = -1;
          let bestCellY = -1;

          for (let cy = roadTop; cy <= h - cellH; cy += 4) {
            for (let cx = 15; cx <= w - cellW - 15; cx += 6) {
              let cSum = 0;
              let cCount = 0;
              for (let dy = 0; dy < cellH; dy += 2) {
                for (let dx = 0; dx < cellW; dx += 2) {
                  const idx = ((cy + dy) * w + (cx + dx)) * 4;
                  const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
                  cSum += lum;
                  cCount++;
                }
              }
              const cAvg = cCount > 0 ? cSum / cCount : avgRoadLum;
              if (cAvg < lowestLum) {
                lowestLum = cAvg;
                bestCellX = cx;
                bestCellY = cy;
              }
            }
          }

          // Distinct localized dark depression on the ground -> Pothole
          const contrastDrop = avgRoadLum - lowestLum;
          if (bestCellX >= 0 && contrastDrop > 35 && lowestLum < 110) {
            const normX = Number((bestCellX / w).toFixed(3));
            const normY = Number((bestCellY / h).toFixed(3));
            const normW = Number(Math.min(0.22, Math.max(0.12, (cellW * 1.2) / w)).toFixed(3));
            const normH = Number(Math.min(0.16, Math.max(0.08, (cellH * 1.2) / h)).toFixed(3));
            const cx = normX + normW / 2;
            const dir = cx < 0.35 ? 'left' : cx > 0.65 ? 'right' : 'ahead';
            const inPath = (normX + normW > 0.30) && (normX < 0.70);

            const potholeObj = {
              id: 'live_pothole',
              label: 'pothole',
              confidence: Number(Math.min(0.92, 0.70 + (contrastDrop / 100) * 0.20).toFixed(2)),
              bbox: {
                x: normX,
                y: normY,
                width: normW,
                height: normH,
              },
              direction: dir,
              urgency: inPath && normY > 0.75 ? 'critical' : inPath ? 'high' : 'medium',
            };
            objects.push(potholeObj);
          }
        }

        // 2. Upper/Middle Scene Analysis (Pedestrians, Cars, Obstacles)
        // Detect significant contrast clusters in upper/middle frame
        const midTop = Math.floor(h * 0.15);
        const midBottom = Math.floor(h * 0.75);
        let midVarianceSum = 0;
        let midCount = 0;
        for (let y = midTop; y < midBottom; y += 4) {
          for (let x = 10; x < w - 10; x += 4) {
            const idx = (y * w + x) * 4;
            const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            midVarianceSum += Math.abs(lum - avgRoadLum);
            midCount++;
          }
        }
        const avgMidDiff = midCount > 0 ? midVarianceSum / midCount : 0;

        // If high variance in upper-mid frame, identify object bounding box
        if (avgMidDiff > 35) {
          let objHits = 0;
          let minX = w, maxX = 0, minY = h, maxY = 0;

          for (let y = midTop; y < midBottom; y += 3) {
            for (let x = 10; x < w - 10; x += 3) {
              const idx = (y * w + x) * 4;
              const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
              if (Math.abs(lum - avgRoadLum) > 38) {
                objHits++;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
              }
            }
          }

          if (objHits > 18) {
            const bboxW = Math.max(0.12, (maxX - minX) / w);
            const bboxH = Math.max(0.18, (maxY - minY) / h);
            const normX = Math.max(0.02, Math.min(0.85, minX / w));
            const normY = Math.max(0.08, Math.min(0.75, minY / h));
            const cx = normX + bboxW / 2;
            const dir = cx < 0.35 ? 'left' : cx > 0.65 ? 'right' : 'ahead';

            // Aspect ratio classification: tall/vertical -> pedestrian (man); wide/horizontal -> vehicle (car)
            const aspectRatio = bboxW / bboxH;
            const isVehicle = aspectRatio > 1.15 || bboxW > 0.35;
            const label = isVehicle ? 'vehicle' : 'pedestrian';
            const urgency = isVehicle && dir === 'ahead' ? 'critical' : dir === 'ahead' ? 'high' : 'medium';

            objects.push({
              id: isVehicle ? 'live_vehicle' : 'live_pedestrian',
              label,
              confidence: 0.88,
              bbox: {
                x: Number(normX.toFixed(3)),
                y: Number(normY.toFixed(3)),
                width: Number(bboxW.toFixed(3)),
                height: Number(bboxH.toFixed(3)),
              },
              direction: dir,
              urgency,
            });
          }
        }

        // Consolidated alert generation to prevent simultaneous alert spam
        const consolidatedAlert = this.alertManager.consolidateDetections(objects, {
          timestamp: now,
          cooldownMs: 8000,
          walkingPath: {
            x: 0.30,
            y: 0.45,
            width: 0.40,
            height: 0.55,
          },
        });

        if (consolidatedAlert) {
          this.emit('hazard_alert', consolidatedAlert);
        }

        // Emit real-time live camera detections
        this.emit('detection', {
          objects,
          walking_path: {
            x: 0.30,
            y: 0.45,
            width: 0.40,
            height: 0.55,
          },
          timestamp: now,
        });
      } catch (err) {
        console.error('Error in mockBackend live camera processing:', err);
      }
    };

    this._offscreenImg.src = base64Frame;
  }

  sendAudioChunk() {
    return true;
  }

  sendConversation(text) {
    this.simulateConversationQuery(text);
    return true;
  }

  sendOCRRequest(query) {
    this.simulateConversationQuery(query || 'What does that sign say?');
    return true;
  }

  sendSettings(_settings) {
    return true;
  }
}

export const mockBackend = new MockBackendService();

