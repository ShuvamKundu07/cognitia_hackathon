import { isIntersectingWalkingPath, DEFAULT_WALKING_PATH } from '../utils/hazardPriority';
import {
  AlertOctagon,
  AlertTriangle,
  Info,
  ArrowUp,
  ArrowRight,
  ArrowLeft,
  User,
  Car,
  CircleDot,
  Footprints,
} from 'lucide-react';

/**
 * Minimal, High-Visibility Detection Overlay.
 * Designed for low-vision clarity and maximum camera visibility:
 * - Crystal clear camera feed (zero obscuring background fills/tints).
 * - Crisp, minimal high-contrast 2px bounding outlines with dark shadows for visibility on all scenes.
 * - Single compact, intelligently positioned label that avoids clipping or covering scene details.
 * - Automatic clutter reduction when multiple objects are detected simultaneously.
 * - Subtle walking corridor guides that preserve a clean camera view.
 */
export function HazardOverlay({
  objects = [],
  walkingPath = DEFAULT_WALKING_PATH,
  showWalkingPath = true,
}) {
  const getObjectIcon = (label) => {
    const l = (label || '').toLowerCase();
    if (l.includes('pedestrian') || l.includes('person') || l.includes('man') || l.includes('woman')) {
      return <User className="w-3 h-3 inline flex-shrink-0" />;
    }
    if (l.includes('car') || l.includes('vehicle') || l.includes('bus') || l.includes('truck') || l.includes('sedan')) {
      return <Car className="w-3 h-3 inline flex-shrink-0" />;
    }
    if (l.includes('pothole') || l.includes('hole') || l.includes('surface') || l.includes('curb')) {
      return <CircleDot className="w-3 h-3 inline flex-shrink-0" />;
    }
    return null;
  };

  const getDirectionIcon = (dir) => {
    const d = (dir || '').toLowerCase();
    if (d.includes('left')) return <ArrowLeft className="w-3 h-3 inline flex-shrink-0 text-sky-300" />;
    if (d.includes('right')) return <ArrowRight className="w-3 h-3 inline flex-shrink-0 text-sky-300" />;
    return <ArrowUp className="w-3 h-3 inline flex-shrink-0 text-emerald-300" />;
  };

  const getUrgencyConfig = (urgency) => {
    const norm = (urgency || '').toLowerCase();
    switch (norm) {
      case 'critical':
        return {
          border: 'border-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.9)]',
          badgeBg: 'bg-red-950/95 text-red-100 border-red-500',
          dot: 'bg-red-500',
          icon: <AlertOctagon className="w-3 h-3 text-red-400 animate-pulse flex-shrink-0" />,
        };
      case 'high':
        return {
          border: 'border-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.8)]',
          badgeBg: 'bg-amber-950/95 text-amber-100 border-amber-400',
          dot: 'bg-amber-400',
          icon: <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0" />,
        };
      case 'medium':
        return {
          border: 'border-yellow-400 drop-shadow-[0_0_4px_rgba(234,179,8,0.6)]',
          badgeBg: 'bg-yellow-950/95 text-yellow-100 border-yellow-400',
          dot: 'bg-yellow-400',
          icon: <AlertTriangle className="w-3 h-3 text-yellow-400 flex-shrink-0" />,
        };
      case 'low':
      default:
        return {
          border: 'border-sky-400/90 drop-shadow-[0_0_3px_rgba(56,189,248,0.5)]',
          badgeBg: 'bg-slate-950/90 text-sky-200 border-sky-400/60',
          dot: 'bg-sky-400',
          icon: <Info className="w-3 h-3 text-sky-400 flex-shrink-0" />,
        };
    }
  };

  const path = walkingPath || DEFAULT_WALKING_PATH;

  // Clutter reduction: if there are > 4 objects, only show text labels on the top priority items
  const urgencyWeight = { critical: 4, high: 3, medium: 2, low: 1 };
  const sortedForLabels = [...objects].sort((a, b) => {
    const uA = urgencyWeight[(a.urgency || 'low').toLowerCase()] || 1;
    const uB = urgencyWeight[(b.urgency || 'low').toLowerCase()] || 1;
    return uB - uA;
  });
  const labeledIdSet = new Set(sortedForLabels.slice(0, 4).map((o) => o.id));

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden select-none"
      aria-hidden="true"
    >
      {/* Subtle Walking Path Corridor Guides */}
      {showWalkingPath && (
        <div
          className="absolute border-2 border-dashed border-emerald-400/35 transition-all duration-300 rounded-sm"
          style={{
            left: `${path.x * 100}%`,
            top: `${path.y * 100}%`,
            width: `${path.width * 100}%`,
            height: `${path.height * 100}%`,
            backgroundColor: 'transparent', // Unobscured camera visibility
          }}
        >
          {/* Minimalist corridor marker */}
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-sm border border-emerald-400/50 text-emerald-300 text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wider uppercase flex items-center gap-1 shadow">
            <Footprints className="w-2.5 h-2.5" />
            <span>Walk Corridor</span>
          </div>
        </div>
      )}

      {/* Minimal Bounding Outlines */}
      {objects.map((obj) => {
        if (!obj.bbox) return null;
        const inPath = isIntersectingWalkingPath(obj.bbox, path);
        const config = getUrgencyConfig(obj.urgency);

        const leftPct = `${Math.max(0, Math.min(96, obj.bbox.x * 100))}%`;
        const topPct = `${Math.max(0, Math.min(96, obj.bbox.y * 100))}%`;
        const widthPct = `${Math.max(3, Math.min(100, obj.bbox.width * 100))}%`;
        const heightPct = `${Math.max(3, Math.min(100, obj.bbox.height * 100))}%`;

        // Intelligent placement: if box is near top edge (< 8%), place badge inside box to prevent clipping
        const placeInside = obj.bbox.y < 0.08;
        const alignRight = (obj.bbox.x + obj.bbox.width) > 0.88;
        const showLabel = labeledIdSet.has(obj.id);

        return (
          <div
            key={obj.id}
            className={`absolute border-2 rounded-sm transition-all duration-150 ${config.border}`}
            style={{
              left: leftPct,
              top: topPct,
              width: widthPct,
              height: heightPct,
              backgroundColor: 'transparent', // Clean camera feed at all times
            }}
          >
            {/* Single Compact Label with Intelligent Positioning */}
            {showLabel && (
              <div
                className={`absolute flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-bold shadow-lg whitespace-nowrap backdrop-blur-sm ${
                  placeInside ? 'top-1' : '-top-5'
                } ${alignRight ? 'right-0' : 'left-0'} ${config.badgeBg}`}
              >
                {getObjectIcon(obj.label) || config.icon}
                <span className="capitalize tracking-tight">{obj.label || 'Hazard'}</span>
                {getDirectionIcon(obj.direction)}
                {inPath && (
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping ml-0.5" title="In Walking Path" />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
