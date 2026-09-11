import { isIntersectingWalkingPath, DEFAULT_WALKING_PATH } from '../utils/hazardPriority';
import { formatConfidence, formatDirection } from '../utils/formatting';
import {
  AlertTriangle,
  AlertOctagon,
  Info,
  ArrowUp,
  ArrowRight,
  ArrowLeft,
  User,
  Car,
  CircleDot,
} from 'lucide-react';

/**
 * Renders normalized bounding boxes, object tags, and the walking path corridor
 * seamlessly over the video frame with high-contrast accessibility treatment.
 */
export function HazardOverlay({
  objects = [],
  walkingPath = DEFAULT_WALKING_PATH,
  showWalkingPath = true,
}) {
  const getObjectIcon = (label) => {
    const l = (label || '').toLowerCase();
    if (l.includes('pedestrian') || l.includes('person') || l.includes('man')) {
      return <User className="w-3.5 h-3.5 inline mr-0.5" />;
    }
    if (l.includes('car') || l.includes('vehicle') || l.includes('bus') || l.includes('truck')) {
      return <Car className="w-3.5 h-3.5 inline mr-0.5" />;
    }
    if (l.includes('pothole') || l.includes('hole') || l.includes('surface')) {
      return <CircleDot className="w-3.5 h-3.5 inline mr-0.5" />;
    }
    return null;
  };

  const getDirectionIcon = (dir) => {
    const d = (dir || '').toLowerCase();
    if (d.includes('left')) return <ArrowLeft className="w-3.5 h-3.5 inline mr-1" />;
    if (d.includes('right')) return <ArrowRight className="w-3.5 h-3.5 inline mr-1" />;
    return <ArrowUp className="w-3.5 h-3.5 inline mr-1" />;
  };

  const getUrgencyConfig = (urgency) => {
    const norm = (urgency || '').toLowerCase();
    switch (norm) {
      case 'critical':
        return {
          boxBorder: 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)] animate-pulse-fast',
          bgHeader: 'bg-red-600 text-white',
          badge: 'bg-red-950/90 text-red-200 border border-red-500',
          icon: <AlertOctagon className="w-4 h-4 text-white animate-bounce" />,
          stroke: '#EF4444',
          glow: 'rgba(239, 68, 68, 0.4)',
        };
      case 'high':
        return {
          boxBorder: 'border-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.6)]',
          bgHeader: 'bg-amber-600 text-white',
          badge: 'bg-amber-950/90 text-amber-200 border border-amber-500',
          icon: <AlertTriangle className="w-4 h-4 text-white" />,
          stroke: '#F59E0B',
          glow: 'rgba(245, 158, 11, 0.3)',
        };
      case 'medium':
        return {
          boxBorder: 'border-yellow-400 shadow-[0_0_6px_rgba(234,179,8,0.4)]',
          bgHeader: 'bg-yellow-500 text-black',
          badge: 'bg-yellow-950/90 text-yellow-200 border border-yellow-500',
          icon: <AlertTriangle className="w-3.5 h-3.5 text-black" />,
          stroke: '#EAB308',
          glow: 'rgba(234, 179, 8, 0.2)',
        };
      case 'low':
      default:
        return {
          boxBorder: 'border-sky-400',
          bgHeader: 'bg-sky-600 text-white',
          badge: 'bg-sky-950/90 text-sky-200 border border-sky-400',
          icon: <Info className="w-3.5 h-3.5 text-white" />,
          stroke: '#38BDF8',
          glow: 'transparent',
        };
    }
  };

  const path = walkingPath || DEFAULT_WALKING_PATH;

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      aria-hidden="true"
    >
      {/* Walking Path Corridor */}
      {showWalkingPath && (
        <div
          className="absolute border-2 border-dashed border-emerald-400/50 bg-emerald-950/15 transition-all duration-300 rounded-sm"
          style={{
            left: `${path.x * 100}%`,
            top: `${path.y * 100}%`,
            width: `${path.width * 100}%`,
            height: `${path.height * 100}%`,
          }}
        >
          <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-emerald-900/90 border border-emerald-400 text-emerald-200 text-[11px] font-bold px-2 py-0.5 rounded tracking-wider uppercase shadow">
            WALKING PATH CORRIDOR
          </div>
          <div className="absolute inset-x-0 bottom-2 text-center text-emerald-400/70 text-[10px] tracking-widest uppercase font-mono">
            ◄ LEFT | SAFE WALKWAY | RIGHT ►
          </div>
        </div>
      )}

      {/* Bounding Boxes */}
      {objects.map((obj) => {
        if (!obj.bbox) return null;
        const inPath = isIntersectingWalkingPath(obj.bbox, path);
        const config = getUrgencyConfig(obj.urgency);

        const leftPct = `${Math.max(0, Math.min(95, obj.bbox.x * 100))}%`;
        const topPct = `${Math.max(0, Math.min(95, obj.bbox.y * 100))}%`;
        const widthPct = `${Math.max(4, Math.min(100, obj.bbox.width * 100))}%`;
        const heightPct = `${Math.max(4, Math.min(100, obj.bbox.height * 100))}%`;

        return (
          <div
            key={obj.id}
            className={`absolute border-[3px] rounded-sm transition-all duration-150 ${config.boxBorder}`}
            style={{
              left: leftPct,
              top: topPct,
              width: widthPct,
              height: heightPct,
              backgroundColor: config.glow,
            }}
          >
            {/* Header Tag */}
            <div
              className={`absolute -top-7 left-0 flex items-center gap-1.5 px-2 py-0.5 text-xs font-black uppercase tracking-wide rounded-t shadow-md whitespace-nowrap ${config.bgHeader}`}
            >
              {getObjectIcon(obj.label) || config.icon}
              <span>{obj.label || 'Hazard'}</span>
              <span className="font-mono text-[10px] opacity-90">
                ({formatConfidence(obj.confidence)})
              </span>
            </div>

            {/* Bottom Meta Pill */}
            <div
              className={`absolute -bottom-6 left-0 flex items-center gap-2 px-1.5 py-0.5 text-[10px] font-bold rounded shadow ${config.badge}`}
            >
              <span className="flex items-center">
                {getDirectionIcon(obj.direction)}
                {formatDirection(obj.direction)}
              </span>
              {inPath && (
                <span className="bg-red-600 text-white px-1 rounded text-[9px] font-black uppercase">
                  IN PATH!
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

