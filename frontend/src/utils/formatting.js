/**
 * Formatting helpers for timestamps, directions, confidence, and latencies.
 */

export function formatTimestamp(timestamp) {
  if (!timestamp) return '--:--:--';
  const date = typeof timestamp === 'number'
    ? new Date(timestamp > 1e11 ? timestamp : timestamp * 1000)
    : new Date(timestamp);
  
  if (isNaN(date.getTime())) return '--:--:--';
  
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatConfidence(conf) {
  if (conf === undefined || conf === null || isNaN(conf)) return '0%';
  const num = Number(conf);
  const pct = num <= 1 ? Math.round(num * 100) : Math.round(num);
  return `${pct}%`;
}

export function formatDirection(direction) {
  if (!direction) return 'straight ahead';
  const d = String(direction).toLowerCase().trim();
  switch (d) {
    case 'left':
      return 'on the left';
    case 'far-left':
    case 'far left':
      return 'on the far left';
    case 'right':
      return 'on the right';
    case 'far-right':
    case 'far right':
      return 'on the far right';
    case 'ahead':
    case 'center':
    case 'front':
      return 'straight ahead';
    case 'ground':
    case 'below':
      return 'straight ahead on the ground';
    default:
      return d;
  }
}

export function getDirectionIcon(direction) {
  const d = String(direction || '').toLowerCase().trim();
  if (d.includes('left')) return 'arrow-left';
  if (d.includes('right')) return 'arrow-right';
  if (d.includes('below') || d.includes('ground')) return 'arrow-down';
  return 'arrow-up';
}

export function formatLatency(ms) {
  if (ms === undefined || ms === null || isNaN(ms)) return '-- ms';
  return `${Math.round(ms)} ms`;
}

