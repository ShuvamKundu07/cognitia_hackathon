/**
 * Intelligent Alert Management Engine.
 * Provides:
 * 1. Multi-hazard grouping (e.g. 4 cars -> "Multiple cars detected ahead.")
 * 2. Urgency-based multi-hazard combination (e.g. "Warning: car approaching from the right. Multiple obstacles ahead.")
 * 3. Stateful deduplication, disappearance/reappearance tracking, direction shift detection, and cooldown management.
 */

import { isIntersectingWalkingPath, DEFAULT_WALKING_PATH } from './hazardPriority.js';

export function normalizeCategory(obj) {
  const lbl = (obj.label || '').toLowerCase();
  const ht = (obj.hazard_type || '').toLowerCase();
  const combined = `${lbl} ${ht}`;

  if (combined.includes('car') || combined.includes('vehicle') || combined.includes('bus') || combined.includes('truck') || combined.includes('motorcycle')) {
    return 'vehicle';
  }
  if (combined.includes('pedestrian') || combined.includes('person') || combined.includes('man') || combined.includes('woman')) {
    return 'pedestrian';
  }
  if (combined.includes('pothole') || combined.includes('surface') || combined.includes('curb') || combined.includes('stairs') || combined.includes('hole')) {
    return 'surface';
  }
  return 'obstacle';
}

export function formatDirectionPhrase(direction) {
  const d = (direction || 'ahead').toLowerCase().trim();
  if (d === 'right' || d === 'on the right' || d === 'on your right') return 'on the right';
  if (d === 'left' || d === 'on the left' || d === 'on your left') return 'on the left';
  return 'straight ahead';
}

/**
 * Calculates recommended movement evasion direction and phrasing.
 * Returns: { movementDirection, evasionPhrase, actionText }
 */
export function determineEvasionGuidance(topHazard, allObjects = []) {
  const dir = (topHazard?.direction || 'ahead').toLowerCase();
  const urgency = (topHazard?.urgency || 'high').toLowerCase();
  const isCrit = urgency === 'critical';

  let res;

  // 1. Critical head-on collision threat or drop-off ahead
  if (isCrit && (dir === 'ahead' || dir === 'center')) {
    res = {
      movementDirection: 'stop',
      evasionPhrase: 'Stop immediately.',
      actionText: 'STOP IMMEDIATELY',
    };
  } else if (dir.includes('right')) {
    // 2. Hazard is on the right -> Move away to the LEFT
    res = {
      movementDirection: 'left',
      evasionPhrase: isCrit ? 'Stop and step left.' : 'Move left.',
      actionText: isCrit ? 'STOP & STEP LEFT' : 'MOVE LEFT',
    };
  } else if (dir.includes('left')) {
    // 3. Hazard is on the left -> Move away to the RIGHT
    res = {
      movementDirection: 'right',
      evasionPhrase: isCrit ? 'Stop and step right.' : 'Move right.',
      actionText: isCrit ? 'STOP & STEP RIGHT' : 'MOVE RIGHT',
    };
  } else {
    // 4. Hazard is straight ahead in walking corridor
    const otherObjects = (allObjects || []).filter((o) => o.id !== topHazard?.id);
    const hasRightBlock = otherObjects.some((o) => (o.direction || '').toLowerCase().includes('right'));
    const hasLeftBlock = otherObjects.some((o) => (o.direction || '').toLowerCase().includes('left'));

    if (hasRightBlock && !hasLeftBlock) {
      res = {
        movementDirection: 'left',
        evasionPhrase: 'Move left.',
        actionText: 'MOVE LEFT',
      };
    } else if (hasLeftBlock && !hasRightBlock) {
      res = {
        movementDirection: 'right',
        evasionPhrase: 'Move right.',
        actionText: 'MOVE RIGHT',
      };
    } else {
      // Center-of-mass check on bounding box
      const bbox = topHazard?.bbox;
      const cx = bbox ? (bbox.x + bbox.width / 2) : 0.5;

      if (cx >= 0.50) {
        // Threat occupies right half of walking corridor -> step left
        res = {
          movementDirection: 'left',
          evasionPhrase: isCrit ? 'Stop and step left.' : 'Step left to bypass.',
          actionText: isCrit ? 'STOP & STEP LEFT' : 'STEP LEFT',
        };
      } else {
        // Threat occupies left half of walking corridor -> step right
        res = {
          movementDirection: 'right',
          evasionPhrase: isCrit ? 'Stop and step right.' : 'Step right to bypass.',
          actionText: isCrit ? 'STOP & STEP RIGHT' : 'STEP RIGHT',
        };
      }
    }
  }

  return res;
}

export class AlertManager {
  constructor(defaultCooldownMs = 8000) {
    this.defaultCooldownMs = defaultCooldownMs;
    // Cache: key -> { timestamp, urgency, direction, inPath, motion }
    this.alertCache = new Map();
    // Short-term detection history for tracking disappearance & reappearance (hazardId -> lastSeenTimestamp)
    this.lastSeenTimes = new Map();
    // Global inter-alert spacing timestamp to prevent multiple alerts coming at the same time
    this.lastGlobalAlertTime = 0;
  }

  setCooldown(ms) {
    this.defaultCooldownMs = ms;
  }

  reset() {
    this.alertCache.clear();
    this.lastSeenTimes.clear();
    this.lastGlobalAlertTime = 0;
  }

  /**
   * Evaluates whether an individual or grouped alert should trigger based on:
   * 1. Low urgency filter: LOW urgency items are silent (UI-only)
   * 2. Global calm throttle: Enforce minimum delay between consecutive alerts unless CRITICAL
   * 3. New hazard / category never alerted -> allow
   * 4. Hazard disappeared and reappeared (> 3.0s absent) -> allow
   * 5. Urgency escalated (e.g. medium -> high, high -> critical) -> allow
   * 6. Hazard newly entered walking corridor -> allow
   * 7. Direction changed significantly (e.g. ahead -> right, left -> right) -> allow
   * 8. Cooldown elapsed -> allow
   * 9. Otherwise -> suppress to prevent repetitive audio spam
   */
  shouldTrigger(key, currentRecord, cooldownMs = this.defaultCooldownMs) {
    const now = currentRecord.timestamp || Date.now();
    const urgency = (currentRecord.urgency || 'low').toLowerCase();

    // 1. Filter out LOW urgency from generating audio alerts
    if (urgency === 'low') {
      return false;
    }

    // 2. Global calm throttle: Unless CRITICAL, enforce minimum inter-alert delay (5-8s)
    const minDelay = Math.min(cooldownMs, 6000);
    if (urgency !== 'critical' && now - this.lastGlobalAlertTime < minDelay) {
      return false;
    }

    const lastRecord = this.alertCache.get(key);

    if (!lastRecord) {
      return true;
    }

    // Check reappearance
    if (currentRecord.id && this.lastSeenTimes.has(currentRecord.id)) {
      const absenceGap = now - this.lastSeenTimes.get(currentRecord.id);
      if (absenceGap > 3000) {
        return true;
      }
    }

    // Urgency escalation check
    const urgencyRanks = { critical: 4, high: 3, medium: 2, low: 1 };
    const currRank = urgencyRanks[urgency] || 1;
    const lastRank = urgencyRanks[(lastRecord.urgency || 'low').toLowerCase()] || 1;
    if (currRank > lastRank) {
      return true;
    }

    // Newly entered walking corridor
    if (currentRecord.inPath && !lastRecord.inPath) {
      return true;
    }

    // Direction shift check
    const currDir = (currentRecord.direction || '').toLowerCase();
    const lastDir = (lastRecord.direction || '').toLowerCase();
    if (currDir && lastDir && currDir !== lastDir && currDir !== 'unknown') {
      return true;
    }

    // Cooldown check
    const elapsed = now - lastRecord.timestamp;
    return elapsed >= cooldownMs;
  }

  /**
   * Consolidates a list of active hazards detected in the current frame or temporal window.
   * Returns a single concise, prioritized alert object or null if suppressed.
   */
  consolidateDetections(objects = [], options = {}) {
    if (!Array.isArray(objects) || objects.length === 0) {
      return null;
    }

    const now = options.timestamp || Date.now();
    const cooldownMs = options.cooldownMs || this.defaultCooldownMs;
    const walkingPath = options.walkingPath || DEFAULT_WALKING_PATH;

    // Filter out low confidence noise (< 0.50) and silent low-urgency items
    const validObjects = objects.filter((o) => {
      const urg = (o.urgency || '').toLowerCase();
      if (urg === 'low') return false; // Informational only in UI, no audio alert
      return (o.confidence == null || o.confidence >= 0.50);
    });
    if (validObjects.length === 0) return null;

    // Map each object with in-path status and category
    const analyzed = validObjects.map((obj) => {
      const inPath = obj.bbox ? isIntersectingWalkingPath(obj.bbox, walkingPath) : false;
      const category = normalizeCategory(obj);
      return {
        ...obj,
        inPath,
        category,
        urgency: (obj.urgency || 'low').toLowerCase(),
        direction: (obj.direction || 'ahead').toLowerCase(),
      };
    });

    // Check which objects qualify for alert
    const eligible = analyzed.filter((obj) => {
      const semKey = `sem_${obj.category}_${obj.direction}`;
      const rec = {
        id: obj.id,
        timestamp: now,
        urgency: obj.urgency,
        direction: obj.direction,
        inPath: obj.inPath,
      };
      return this.shouldTrigger(obj.id || semKey, rec, cooldownMs);
    });

    // Update last seen times for all active objects
    for (const obj of analyzed) {
      if (obj.id) {
        this.lastSeenTimes.set(obj.id, now);
      }
    }

    // If all detected objects are currently suppressed by cooldown without state changes, return null
    if (eligible.length === 0) {
      return null;
    }

    // Sort eligible by priority: Critical > High > Medium > Low, then inPath, then confidence
    const urgencyRanks = { critical: 4, high: 3, medium: 2, low: 1 };
    eligible.sort((a, b) => {
      const uA = urgencyRanks[a.urgency] || 1;
      const uB = urgencyRanks[b.urgency] || 1;
      if (uB !== uA) return uB - uA;
      if (b.inPath !== a.inPath) return b.inPath ? 1 : -1;
      return (b.confidence || 0) - (a.confidence || 0);
    });

    const topHazard = eligible[0];
    const topCategory = topHazard.category;
    const dirPhrase = formatDirectionPhrase(topHazard.direction);

    // Count occurrences per category across all analyzed objects
    const categoryCounts = {};
    for (const obj of analyzed) {
      categoryCounts[obj.category] = (categoryCounts[obj.category] || 0) + 1;
    }

    const { movementDirection, evasionPhrase, actionText: evasionAction } = determineEvasionGuidance(topHazard, analyzed);

    let alertMessage;
    let actionText;

    // SCENARIO 1: Multiple detections of the SAME category (e.g. 4 cars, 5 pedestrians, 6 obstacles)
    if (categoryCounts[topCategory] >= 2 && Object.keys(categoryCounts).length === 1) {
      if (topCategory === 'vehicle') {
        const dirSpec = (topHazard.direction === 'left' || topHazard.direction === 'right') ? ` ${dirPhrase}` : ' ahead';
        if (topHazard.urgency === 'critical') {
          alertMessage = `Stop. Multiple vehicles detected${dirSpec}. ${evasionPhrase}`.trim();
          actionText = evasionAction;
        } else if (topHazard.urgency === 'high') {
          if (topHazard.direction === 'right') {
            alertMessage = 'Warning: multiple cars approaching from the right. Move left.';
            actionText = 'MOVE LEFT';
          } else if (topHazard.direction === 'left') {
            alertMessage = 'Warning: multiple cars approaching from the left. Move right.';
            actionText = 'MOVE RIGHT';
          } else {
            alertMessage = `Warning: multiple cars detected${dirSpec}. ${evasionPhrase}`.trim();
            actionText = evasionAction;
          }
        } else {
          alertMessage = `Multiple cars detected${dirSpec}. ${evasionPhrase}`.trim();
          actionText = evasionAction;
        }
      } else if (topCategory === 'pedestrian') {
        if (topHazard.direction === 'left') {
          alertMessage = 'Multiple pedestrians detected on the left. Keep right.';
          actionText = 'KEEP RIGHT';
        } else if (topHazard.direction === 'right') {
          alertMessage = 'Multiple pedestrians detected on the right. Keep left.';
          actionText = 'KEEP LEFT';
        } else {
          const pfx = (topHazard.urgency === 'critical' || topHazard.urgency === 'high') ? 'Caution. ' : '';
          alertMessage = `${pfx}Multiple pedestrians detected ahead. ${evasionPhrase}`.trim();
          actionText = evasionAction;
        }
      } else {
        alertMessage = `Multiple obstacles detected nearby. ${evasionPhrase}`.trim();
        actionText = evasionAction;
      }
    }
    // SCENARIO 2: Multiple DIFFERENT categories detected simultaneously
    else if (analyzed.length > 1) {
      const isApproaching = (topHazard.motion === 'approaching') || (topHazard.relative_speed && topHazard.relative_speed > 0);
      const topLabel = topCategory === 'vehicle' ? 'car' : topCategory === 'pedestrian' ? 'pedestrian' : (topHazard.label || 'obstacle');

      let prefix = 'Notice:';
      if (topHazard.urgency === 'critical') prefix = 'Warning:';
      else if (topHazard.urgency === 'high') prefix = 'Warning:';

      const motionPhrase = isApproaching && (topHazard.direction === 'right')
        ? 'approaching from the right'
        : isApproaching && (topHazard.direction === 'left')
        ? 'approaching from the left'
        : isApproaching
        ? 'approaching ahead'
        : `detected ${dirPhrase}`;

      const secondaryObjects = analyzed.filter((o) => o.id !== topHazard.id);
      let secPhrase = '';
      if (secondaryObjects.length >= 2) {
        secPhrase = 'Multiple obstacles ahead.';
      } else if (secondaryObjects.length === 1) {
        const sec = secondaryObjects[0];
        const secDir = formatDirectionPhrase(sec.direction);
        if (sec.category === 'pedestrian') secPhrase = `Pedestrian detected ${secDir}.`;
        else if (sec.category === 'surface') secPhrase = `Pothole detected ${secDir}.`;
        else if (sec.category === 'vehicle') secPhrase = `Vehicle detected ${secDir}.`;
        else secPhrase = `Obstacle detected ${secDir}.`;
      }

      alertMessage = `${prefix} ${topLabel} ${motionPhrase}. ${secPhrase} ${evasionPhrase}`.trim();
      actionText = evasionAction;
    }
    // SCENARIO 3: Single primary hazard
    else {
      const pfx = topHazard.urgency === 'critical' ? 'Stop. ' : topHazard.urgency === 'high' ? 'Caution. ' : '';
      const topName = topCategory === 'vehicle' ? 'Vehicle' : topCategory === 'pedestrian' ? 'Pedestrian' : topCategory === 'surface' ? 'Pothole' : 'Obstacle';
      alertMessage = `${pfx}${topName} detected ${dirPhrase}. ${evasionPhrase}`.trim();
      actionText = evasionAction;
    }

    const highestUrgency = topHazard.urgency;

    // Cache records for all active objects to suppress repetitive spam
    for (const obj of analyzed) {
      const semKey = `sem_${obj.category}_${obj.direction}`;
      const rec = {
        id: obj.id,
        timestamp: now,
        urgency: obj.urgency,
        direction: obj.direction,
        inPath: obj.inPath,
      };
      if (obj.id) {
        this.alertCache.set(obj.id, rec);
      }
      this.alertCache.set(semKey, rec);
    }
    this.alertCache.set(`msg_${alertMessage.trim().toLowerCase()}`, {
      timestamp: now,
      urgency: highestUrgency,
      direction: topHazard.direction,
      inPath: topHazard.inPath,
    });

    this.lastGlobalAlertTime = now;

    return {
      hazard_id: topHazard.id || `consolidated_${Date.now()}`,
      hazard_type: Object.keys(categoryCounts).length > 1 ? 'multi_hazard' : topHazard.hazard_type || topCategory,
      label: topHazard.label,
      message: alertMessage,
      action: actionText,
      direction: topHazard.direction.charAt(0).toUpperCase() + topHazard.direction.slice(1),
      movement_direction: movementDirection,
      urgency: highestUrgency.toUpperCase(),
      confidence: Math.max(...analyzed.map((o) => o.confidence || 0.85)),
      timestamp: now,
      interrupt: highestUrgency === 'critical',
      inPath: topHazard.inPath,
      groupedCount: analyzed.length,
    };
  }
}

// Global default instance
export const defaultAlertManager = new AlertManager();
