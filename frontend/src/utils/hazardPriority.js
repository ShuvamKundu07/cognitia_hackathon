/**
 * Utility functions for hazard scoring, priority sorting,
 * walking path intersection, and alert deduplication.
 */

export const URGENCY_LEVELS = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
};

export const URGENCY_WEIGHTS = {
  [URGENCY_LEVELS.CRITICAL]: 1000,
  [URGENCY_LEVELS.HIGH]: 500,
  [URGENCY_LEVELS.MEDIUM]: 200,
  [URGENCY_LEVELS.LOW]: 50,
};

export const DEFAULT_WALKING_PATH = {
  x: 0.30,
  y: 0.45,
  width: 0.40,
  height: 0.55,
};

/**
 * Checks if a normalized bounding box overlaps with the walking path corridor.
 * @param {{ x: number, y: number, width: number, height: number }} bbox 
 * @param {{ x: number, y: number, width: number, height: number }} [path]
 * @returns {boolean}
 */
export function isIntersectingWalkingPath(bbox, path = DEFAULT_WALKING_PATH) {
  if (!bbox || typeof bbox.x !== 'number') return false;
  const p = path || DEFAULT_WALKING_PATH;

  const bboxRight = bbox.x + bbox.width;
  const bboxBottom = bbox.y + bbox.height;
  const pathRight = p.x + p.width;
  const pathBottom = p.y + p.height;

  // Check axis-aligned bounding box collision
  return !(
    bboxRight < p.x ||
    bbox.x > pathRight ||
    bboxBottom < p.y ||
    bbox.y > pathBottom
  );
}

/**
 * Calculates a numerical priority score for sorting hazards.
 * @param {Object} hazard
 * @param {Object} [walkingPath]
 * @returns {number}
 */
export function calculateHazardScore(hazard, walkingPath = DEFAULT_WALKING_PATH) {
  if (!hazard) return 0;
  const urgency = (hazard.urgency || '').toLowerCase();
  const baseWeight = URGENCY_WEIGHTS[urgency] || 0;
  
  const inPath = isIntersectingWalkingPath(hazard.bbox, walkingPath);
  const pathBonus = inPath ? 300 : 0;
  
  const confidenceScore = (Number(hazard.confidence) || 0) * 100;
  
  return baseWeight + pathBonus + confidenceScore;
}

/**
 * Sorts hazards in descending order of priority:
 * Critical > High > Medium > Low, with walking path intersections given priority.
 * @param {Array} hazards
 * @param {Object} [walkingPath]
 * @returns {Array}
 */
export function sortHazardsByPriority(hazards, walkingPath = DEFAULT_WALKING_PATH) {
  if (!Array.isArray(hazards)) return [];
  return [...hazards].sort((a, b) => {
    return calculateHazardScore(b, walkingPath) - calculateHazardScore(a, walkingPath);
  });
}

/**
 * Determines whether a spoken or visual alert should fire,
 * preventing redundant continuous spam for persistent or repeating same alerts.
 * If 5 same alerts arise within the time interval, only one is allowed through.
 * Matches by hazard ID, message text, or semantic type + direction category.
 *
 * @param {Object} alert
 * @param {Map<string, { timestamp: number, urgency: string }>} alertCache
 * @param {number} cooldownMs (default 8000ms = 8s)
 * @returns {boolean}
 */
export function shouldTriggerAlert(alert, alertCache, cooldownMs = 8000) {
  if (!alert || !alertCache) return true;
  const now = Date.now();
  const currentUrgency = (alert.urgency || '').toLowerCase();

  // Conversational speech and wake-words must NEVER be throttled or suppressed by hazard alert filters
  if (currentUrgency === 'conversation' || currentUrgency === 'wake_word') {
    return true;
  }

  // 1. Filter out LOW urgency from audio alerts
  if (currentUrgency === 'low') {
    return false;
  }

  // 2. Global calm throttle: enforce minimum delay between consecutive alerts unless CRITICAL
  const lastGlobal = alertCache.get('__last_global_alert_timestamp__');
  const minInterAlertSpacing = Math.min(cooldownMs, 5000);
  if (currentUrgency !== 'critical' && lastGlobal && (now - lastGlobal.timestamp < minInterAlertSpacing)) {
    return false;
  }

  const id = alert.hazard_id;
  const msgKey = alert.message ? `msg_${alert.message.trim().toLowerCase()}` : null;
  const hType = (alert.hazard_type || alert.label || '').toLowerCase();
  const dir = (alert.direction || 'ahead').toLowerCase();
  const semanticKey = hType ? `sem_${hType}_${dir}` : null;

  // Locate the most recent alert matching this hazard by id, message, or semantic category
  let lastAlert = null;
  if (id && alertCache.has(id)) {
    lastAlert = alertCache.get(id);
  }
  if (!lastAlert && msgKey && alertCache.has(msgKey)) {
    lastAlert = alertCache.get(msgKey);
  }
  if (!lastAlert && semanticKey && alertCache.has(semanticKey)) {
    lastAlert = alertCache.get(semanticKey);
  }

  // If this alert signature was never seen, allow it
  if (!lastAlert) {
    return true;
  }

  const timeElapsed = now - lastAlert.timestamp;

  // Re-alert if direction changed significantly
  const currentDir = (alert.direction || '').toLowerCase();
  const lastDir = (lastAlert.direction || '').toLowerCase();
  if (currentDir && lastDir && currentDir !== lastDir && currentDir !== 'unknown') {
    return true;
  }

  // Re-alert if obstacle newly entered walking path
  if (alert.inPath && !lastAlert.inPath) {
    return true;
  }

  // Immediate override if urgency escalated
  const urgencyRanks = { critical: 4, high: 3, medium: 2, low: 1 };
  const currentRank = urgencyRanks[(alert.urgency || 'low').toLowerCase()] || 1;
  const lastRank = urgencyRanks[(lastAlert.urgency || 'low').toLowerCase()] || 1;
  if (currentRank > lastRank) {
    return true;
  }

  // Enforce cooldown interval to suppress duplicate/consecutive alert spam
  return timeElapsed >= cooldownMs;
}

import { AlertManager, defaultAlertManager, normalizeCategory, determineEvasionGuidance } from './alertManager.js';
export { AlertManager, defaultAlertManager, normalizeCategory, determineEvasionGuidance };

/**
 * Maps urgency to accessible styling classes and labels.
 */
export function getUrgencyStyles(urgency) {
  const norm = (urgency || '').toLowerCase();
  switch (norm) {
    case 'critical':
      return {
        bg: 'bg-red-950/80',
        border: 'border-red-500',
        text: 'text-red-400',
        badge: 'bg-red-600 text-white font-black',
        ring: 'ring-4 ring-red-500/50',
        iconColor: 'text-red-400',
        label: 'CRITICAL HAZARD',
        actionDefault: 'STOP IMMEDIATELY',
      };
    case 'high':
      return {
        bg: 'bg-amber-950/80',
        border: 'border-amber-500',
        text: 'text-amber-400',
        badge: 'bg-amber-600 text-white font-bold',
        ring: 'ring-2 ring-amber-500/40',
        iconColor: 'text-amber-400',
        label: 'HIGH CAUTION',
        actionDefault: 'SLOW DOWN & WATCH PATH',
      };
    case 'medium':
      return {
        bg: 'bg-yellow-950/60',
        border: 'border-yellow-500',
        text: 'text-yellow-400',
        badge: 'bg-yellow-600 text-black font-semibold',
        ring: 'ring-1 ring-yellow-500/30',
        iconColor: 'text-yellow-400',
        label: 'ATTENTION',
        actionDefault: 'BE AWARE',
      };
    case 'low':
    default:
      return {
        bg: 'bg-sky-950/50',
        border: 'border-sky-500',
        text: 'text-sky-300',
        badge: 'bg-sky-600 text-white font-medium',
        ring: 'ring-1 ring-sky-500/20',
        iconColor: 'text-sky-400',
        label: 'INFORMATIONAL',
        actionDefault: 'INFO ONLY',
      };
  }
}

/**
 * Ensures spoken alerts contain complete directional descriptions.
 * (e.g., "Pedestrian detected straight ahead.", "Pothole detected on the right.")
 *
 * @param {Object} alert
 * @returns {string}
 */
export function formatFullDirectionalAlert(alert) {
  if (!alert) return '';
  const dir = (alert.direction || 'ahead').toLowerCase().trim();
  const dirPhrase =
    dir === 'right' || dir === 'on the right' || dir === 'on your right'
      ? 'on the right'
      : dir === 'left' || dir === 'on the left' || dir === 'on your left'
      ? 'on the left'
      : 'straight ahead';

  const rawMsg = (alert.message || '').trim();
  const hType = (alert.hazard_type || alert.label || alert.hazard || 'obstacle').toLowerCase().trim();
  const urgency = (alert.urgency || '').toLowerCase().trim();
  const prefix = urgency === 'critical' ? 'Stop. ' : urgency === 'high' ? 'Caution. ' : '';

  const lowerMsg = rawMsg.toLowerCase();
  const hasDirection =
    lowerMsg.includes('on the right') ||
    lowerMsg.includes('on your right') ||
    lowerMsg.includes('on the left') ||
    lowerMsg.includes('on your left') ||
    lowerMsg.includes('straight ahead') ||
    lowerMsg.includes('ahead') ||
    lowerMsg.includes('behind') ||
    lowerMsg.includes('blindspot');

  if (rawMsg) {
    if (
      lowerMsg.includes('multiple') ||
      lowerMsg.includes('approaching') ||
      lowerMsg.startsWith('warning:') ||
      lowerMsg.startsWith('stop.') ||
      lowerMsg.startsWith('notice:') ||
      (hasDirection && (lowerMsg.includes('detected') || lowerMsg.includes('heard') || lowerMsg.includes('blindspot')))
    ) {
      return rawMsg;
    }
  }

  let labelName = 'Obstacle';
  const combined = `${hType} ${rawMsg.toLowerCase()}`;
  if (combined.includes('pedestrian') || combined.includes('person') || combined.includes('man')) {
    labelName = 'Pedestrian';
  } else if (combined.includes('pothole') || combined.includes('surface') || combined.includes('ground')) {
    labelName = 'Pothole';
  } else if (combined.includes('vehicle') || combined.includes('car') || combined.includes('truck') || combined.includes('bus')) {
    labelName = 'Vehicle';
  } else if (combined.includes('bicycle') || combined.includes('bike')) {
    labelName = 'Bicycle';
  } else if (hType) {
    labelName = hType.charAt(0).toUpperCase() + hType.slice(1).replace(/_/g, ' ');
  }

  return `${prefix}${labelName} detected ${dirPhrase}.`;
}

export function getHazardEvasion(hazard, allHazards = [], walkingPath = DEFAULT_WALKING_PATH) {
  if (!hazard) return { movementDirection: 'straight', actionText: 'MAINTAIN PATH', evasionPhrase: '' };
  if (hazard.movement_direction) {
    const dir = hazard.movement_direction.toLowerCase();
    const action = hazard.action || (dir === 'left' ? 'MOVE LEFT' : dir === 'right' ? 'MOVE RIGHT' : dir === 'stop' ? 'STOP' : 'AWARENESS');
    return {
      movementDirection: dir,
      actionText: action,
      evasionPhrase: '',
    };
  }
  return determineEvasionGuidance(hazard, allHazards, walkingPath);
}

