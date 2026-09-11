import { getUrgencyStyles, isIntersectingWalkingPath } from '../utils/hazardPriority';
import { formatConfidence, formatDirection } from '../utils/formatting';
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Footprints } from 'lucide-react';

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

  const getDirectionIcon = (dir) => {
    const d = (dir || '').toLowerCase();
    if (d.includes('left')) return <ArrowLeft className="w-4 h-4 text-slate-300" />;
    if (d.includes('right')) return <ArrowRight className="w-4 h-4 text-slate-300" />;
    if (d.includes('down') || d.includes('ground')) return <ArrowDown className="w-4 h-4 text-slate-300" />;
    return <ArrowUp className="w-4 h-4 text-slate-300" />;
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
      className={`group flex items-center justify-between p-3.5 rounded-xl border-2 transition-all cursor-pointer bg-surface-elevated hover:bg-surface-hover ${styles.border} focus:outline-none focus:ring-4 focus:ring-sky-400`}
      aria-label={`Hazard #${index + 1}: ${urgency.toUpperCase()} urgency. Object: ${hazard.label || 'obstacle'}. Direction: ${formatDirection(hazard.direction)}. Confidence: ${formatConfidence(hazard.confidence)}.`}
    >
      {/* Index & Urgency badge */}
      <div className="flex items-center gap-3">
        <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-surface-darkest border border-surface-border text-slate-200 font-mono font-bold text-xs">
          {index + 1}
        </span>

        <div>
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-black uppercase tracking-wider ${styles.badge}`}
            >
              {urgency}
            </span>
            <h3 className="text-base font-extrabold text-white capitalize">
              {hazard.label || 'Hazard'}
            </h3>
          </div>

          <div className="flex items-center gap-2 mt-1 text-xs text-slate-300 font-medium">
            <span className="flex items-center gap-1">
              {getDirectionIcon(hazard.direction)}
              {formatDirection(hazard.direction)}
            </span>
            {inPath && (
              <span className="flex items-center gap-1 text-[11px] font-bold text-red-400 bg-red-950/80 px-1.5 py-0.5 rounded border border-red-800">
                <Footprints className="w-3 h-3" />
                In Walk Path
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Confidence */}
      <div className="text-right">
        <div className="text-[10px] uppercase font-bold text-slate-400">Confidence</div>
        <div className="text-sm font-mono font-black text-emerald-400">
          {formatConfidence(hazard.confidence)}
        </div>
        {hazard.id && (
          <div className="text-[10px] text-slate-500 font-mono">{hazard.id}</div>
        )}
      </div>
    </article>
  );
}

