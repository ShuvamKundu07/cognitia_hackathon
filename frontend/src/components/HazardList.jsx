import { HazardCard } from './HazardCard';
import { ShieldCheck, ListOrdered } from 'lucide-react';

export function HazardList({
  hazards = [],
  walkingPath,
  onSelectHazard,
}) {
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
            PRIORITIZED HAZARD QUEUE
          </h2>
        </div>
        <span
          className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-surface-darkest text-slate-300 border border-surface-border"
          aria-label={`${hazards.length} hazards currently active`}
        >
          {hazards.length} ACTIVE
        </span>
      </div>

      {/* List content */}
      <div className="p-3 flex flex-col gap-2.5 max-h-[340px] overflow-y-auto">
        {hazards.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400">
            <ShieldCheck className="w-10 h-10 text-emerald-500/70 mb-2" aria-hidden="true" />
            <p className="text-sm font-semibold text-slate-300">Hazard Queue Empty</p>
            <p className="text-xs text-slate-400 mt-0.5">
              AI sensor fusion is actively scanning the environment.
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

