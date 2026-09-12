import { HazardCard } from './HazardCard';
import { ShieldCheck, ListOrdered, Footprints } from 'lucide-react';
import { isIntersectingWalkingPath } from '../utils/hazardPriority';

/**
 * Organized Detection & Hazard Side Panel.
 * Keeps detailed hazard information (confidence, track IDs, spatial metrics)
 * neatly organized off the live camera viewport to preserve full camera visibility.
 * Optimized for low-vision users with high contrast and readable text.
 */
export function HazardList({
  hazards = [],
  walkingPath,
  onSelectHazard,
}) {
  // Aggregate statistics for quick summary
  const inPathCount = hazards.filter((h) => isIntersectingWalkingPath(h.bbox, walkingPath)).length;
  const criticalCount = hazards.filter((h) => (h.urgency || '').toLowerCase() === 'critical').length;
  const highCount = hazards.filter((h) => (h.urgency || '').toLowerCase() === 'high').length;

  return (
    <section
      aria-labelledby="hazard-queue-heading"
      className="flex flex-col bg-surface-card border-2 border-surface-border rounded-xl overflow-hidden shadow-xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-surface-elevated border-b border-surface-border">
        <div className="flex items-center gap-2">
          <ListOrdered className="w-5 h-5 text-amber-400" aria-hidden="true" />
          <h2 id="hazard-queue-heading" className="text-base font-bold text-white tracking-wide">
            DETECTION & HAZARD PANEL
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {inPathCount > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-950/90 text-red-300 border border-red-500/80">
              <Footprints className="w-3 h-3" />
              {inPathCount} in Path
            </span>
          )}
          <span
            className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-surface-darkest text-slate-200 border border-surface-border"
            aria-label={`${hazards.length} hazards currently active`}
          >
            {hazards.length} ACTIVE
          </span>
        </div>
      </div>

      {/* Quick Summary Pill Bar when detections exist */}
      {hazards.length > 0 && (
        <div className="px-4 py-2 bg-surface-darkest/70 border-b border-surface-border/50 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400 font-medium">Status Breakdown:</span>
          {criticalCount > 0 && (
            <span className="px-2 py-0.5 rounded bg-red-600 text-white font-extrabold text-[11px]">
              {criticalCount} CRITICAL
            </span>
          )}
          {highCount > 0 && (
            <span className="px-2 py-0.5 rounded bg-amber-600 text-white font-bold text-[11px]">
              {highCount} HIGH
            </span>
          )}
          <span className="text-slate-400 text-[11px]">
            Detailed metrics routed to side panel for camera feed clarity.
          </span>
        </div>
      )}

      {/* List content */}
      <div className="p-3 flex flex-col gap-2.5 max-h-[380px] overflow-y-auto">
        {hazards.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400">
            <ShieldCheck className="w-10 h-10 text-emerald-500/80 mb-2" aria-hidden="true" />
            <p className="text-sm font-bold text-slate-200">No Immediate Obstacles in View</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">
              Live camera feed is clear. AI continuous detection and acoustic sensors are active.
            </p>
          </div>
        ) : (
          hazards.map((hazard, index) => (
            <HazardCard
              key={hazard.id || `hazard-${index}`}
              hazard={hazard}
              index={index}
              walkingPath={walkingPath}
              onSelect={onSelectHazard}
            />
          ))
        )}
      </div>
    </section>
  );
}
