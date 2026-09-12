import { getUrgencyStyles, isIntersectingWalkingPath, getHazardEvasion } from '../utils/hazardPriority';
import { formatConfidence, formatDirection } from '../utils/formatting';
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Footprints, User, Car, CircleDot, Navigation } from 'lucide-react';

export function HazardCard({
  hazard,
  index,
  walkingPath,
  onSelect,
}) {
  if (!hazard) return null;

  const urgency = (hazard.urgency || 'low').toLowerCase();
  const styles = getUrgencyStyles(urgency);
  const inPath = isIntersectingWalkingPath(hazard.bbox, walkingPath);
  const evasion = getHazardEvasion(hazard, [], walkingPath);
  const moveDir = (hazard.movement_direction || evasion.movementDirection || '').toLowerCase();

  const getObjectIcon = (label) => {
    const l = (label || '').toLowerCase();
    if (l.includes('pedestrian') || l.includes('person') || l.includes('man') || l.includes('woman')) {
      return <User className="w-4 h-4 text-sky-400" />;
    }
    if (l.includes('car') || l.includes('vehicle') || l.includes('bus') || l.includes('truck')) {
      return <Car className="w-4 h-4 text-amber-400" />;
    }
    if (l.includes('pothole') || l.includes('hole') || l.includes('surface') || l.includes('curb')) {
      return <CircleDot className="w-4 h-4 text-red-400" />;
    }
    return <CircleDot className="w-4 h-4 text-slate-400" />;
  };

  const getDirectionIcon = (dir) => {
    const d = (dir || '').toLowerCase();
    if (d.includes('left')) return <ArrowLeft className="w-4 h-4 text-sky-300" />;
    if (d.includes('right')) return <ArrowRight className="w-4 h-4 text-sky-300" />;
    if (d.includes('down') || d.includes('ground')) return <ArrowDown className="w-4 h-4 text-sky-300" />;
    return <ArrowUp className="w-4 h-4 text-emerald-300" />;
  };

  return (
    <article
      tabIndex={0}
      onClick={() => onSelect && onSelect(hazard)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect && onSelect(hazard);
        }
      }}
      className={`group flex items-center justify-between p-3.5 rounded-xl border-2 transition-all cursor-pointer bg-surface-elevated hover:bg-surface-hover ${styles.border} focus:outline-none focus:ring-4 focus:ring-sky-400 shadow-md`}
      aria-label={`Hazard #${index + 1}: ${urgency.toUpperCase()} urgency. Object: ${hazard.label || 'obstacle'}. Location: ${formatDirection(hazard.direction)}. Recommended movement: ${moveDir.toUpperCase() || 'MAINTAIN'}. Confidence: ${formatConfidence(hazard.confidence)}.`}
    >
      {/* Index & Category Icon & Urgency */}
      <div className="flex items-center gap-3">
        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-surface-darkest border border-surface-border text-white font-mono font-black text-sm shadow-inner">
          {index + 1}
        </span>

        <div>
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-black uppercase tracking-wider ${styles.badge}`}
            >
              {urgency}
            </span>
            <div className="flex items-center gap-1.5">
              {getObjectIcon(hazard.label)}
              <h3 className="text-base font-black text-white capitalize tracking-tight">
                {hazard.label || 'Hazard'}
              </h3>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-slate-200 font-semibold">
            <span className="flex items-center gap-1 bg-surface-darkest px-2 py-0.5 rounded border border-surface-border/60">
              {getDirectionIcon(hazard.direction)}
              <span>{formatDirection(hazard.direction)}</span>
            </span>

            {moveDir && moveDir !== 'straight' && (
              <span
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-extrabold border ${
                  moveDir === 'stop'
                    ? 'bg-red-950/90 text-red-300 border-red-600'
                    : 'bg-cyan-950/90 text-cyan-300 border-cyan-500'
                }`}
              >
                <Navigation className="w-3 h-3 text-cyan-300" />
                <span>Move {moveDir.toUpperCase()}</span>
              </span>
            )}

            {inPath && (
              <span className="flex items-center gap-1 text-[11px] font-extrabold text-red-300 bg-red-950/90 px-2 py-0.5 rounded border border-red-600 shadow-sm">
                <Footprints className="w-3 h-3 text-red-400" />
                In Walk Path
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Confidence & ID */}
      <div className="text-right flex flex-col items-end">
        <div className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider">AI Confidence</div>
        <div className="text-base font-mono font-black text-emerald-400 drop-shadow-sm">
          {formatConfidence(hazard.confidence)}
        </div>
        {hazard.id && (
          <div className="text-[10px] text-slate-500 font-mono tracking-tight">{hazard.id}</div>
        )}
      </div>
    </article>
  );
}
