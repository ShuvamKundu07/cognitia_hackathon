import { getUrgencyStyles, getHazardEvasion } from '../utils/hazardPriority';
import { formatConfidence, formatDirection } from '../utils/formatting';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  Volume2,
  CheckCircle2,
  Navigation,
} from 'lucide-react';

/**
 * PriorityAlert Component.
 * Displays the current highest-priority hazard requiring pedestrian action.
 * Emphasizes explicit directional evasion instructions ("Move Left", "Step Right", "Stop").
 */
export function PriorityAlert({
  hazard,
  onReplaySpeech,
  isSpeaking,
}) {
  if (!hazard) {
    return (
      <section
        aria-labelledby="priority-alert-heading"
        className="flex flex-col items-center justify-center p-6 bg-surface-card border-2 border-emerald-900/60 rounded-xl text-center shadow-lg"
      >
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-emerald-950 border border-emerald-500/50 mb-3">
          <CheckCircle2 className="w-7 h-7 text-emerald-400" aria-hidden="true" />
        </div>
        <h2 id="priority-alert-heading" className="text-xl font-bold text-white tracking-wide">
          PATH CLEAR
        </h2>
        <p className="text-sm text-slate-300 mt-1 max-w-sm">
          No immediate safety hazards detected in your walking corridor. Proceed with standard awareness.
        </p>
        <div className="sr-only" aria-live="polite">
          Current status: Path clear. No critical hazards detected.
        </div>
      </section>
    );
  }

  const urgency = (hazard.urgency || 'high').toLowerCase();
  const styles = getUrgencyStyles(urgency);
  const isCritical = urgency === 'critical';

  const evasion = getHazardEvasion(hazard);
  const moveDir = (hazard.movement_direction || evasion.movementDirection || 'straight').toLowerCase();
  const actionText = hazard.action || evasion.actionText || (isCritical ? 'STOP' : 'CAUTION');
  const alertMessage = hazard.message || `${hazard.label || 'Obstacle'} detected ${formatDirection(hazard.direction)}.`;

  const getDirectionIcon = (dir) => {
    const d = (dir || '').toLowerCase();
    if (d.includes('left')) return <ArrowLeft className="w-5 h-5 text-amber-300" />;
    if (d.includes('right')) return <ArrowRight className="w-5 h-5 text-amber-300" />;
    return <ArrowUp className="w-5 h-5 text-amber-300" />;
  };

  const getMovementIcon = (dir) => {
    if (dir === 'left') return <ArrowLeft className="w-7 h-7 text-cyan-300 animate-pulse" />;
    if (dir === 'right') return <ArrowRight className="w-7 h-7 text-cyan-300 animate-pulse" />;
    if (dir === 'stop') return <AlertOctagon className="w-7 h-7 text-red-400 animate-bounce" />;
    return <ArrowUp className="w-7 h-7 text-emerald-300" />;
  };

  const getMovementLabel = (dir) => {
    if (dir === 'left') return 'MOVE LEFT';
    if (dir === 'right') return 'MOVE RIGHT';
    if (dir === 'stop') return 'STOP IMMEDIATELY';
    return 'PROCEED STRAIGHT';
  };

  return (
    <section
      aria-labelledby="priority-alert-heading"
      className={`relative flex flex-col p-6 rounded-2xl border-4 transition-all duration-200 shadow-2xl ${
        isCritical
          ? 'bg-red-950 border-red-500 ring-8 ring-red-500/40 animate-pulse-fast'
          : `${styles.bg} ${styles.border} ${styles.ring}`
      }`}
    >
      {/* Visual Interruption Banner for Critical */}
      {isCritical && (
        <div className="flex items-center justify-center gap-2 -mt-6 -mx-6 mb-4 py-2 bg-red-600 text-white font-black uppercase text-sm tracking-widest shadow-md">
          <AlertOctagon className="w-5 h-5 animate-bounce" />
          <span>IMMEDIATE SAFETY INTERVENTION</span>
          <AlertOctagon className="w-5 h-5 animate-bounce" />
        </div>
      )}

      {/* Primary Action Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={`flex items-center justify-center w-14 h-14 rounded-2xl shadow-lg ${
              isCritical
                ? 'bg-red-600 text-white'
                : urgency === 'high'
                ? 'bg-amber-500 text-black'
                : 'bg-yellow-500 text-black'
            }`}
          >
            {isCritical ? (
              <AlertOctagon className="w-9 h-9 animate-bounce" />
            ) : (
              <AlertTriangle className="w-9 h-9" />
            )}
          </div>
          <div>
            <span
              className={`inline-block px-3 py-1 rounded-md text-xs font-black tracking-wider uppercase mb-1 shadow ${styles.badge}`}
            >
              {styles.label}
            </span>
            <h2
              id="priority-alert-heading"
              className={`text-3xl font-black tracking-tight uppercase leading-none ${
                isCritical ? 'text-white drop-shadow-md' : styles.text
              }`}
            >
              {actionText}
            </h2>
          </div>
        </div>

        {onReplaySpeech && (
          <button
            type="button"
            onClick={() => onReplaySpeech(alertMessage, urgency)}
            className="flex items-center gap-2 px-3.5 py-2 bg-surface-elevated hover:bg-surface-hover border-2 border-surface-border text-slate-100 rounded-xl text-xs font-bold transition-colors focus:ring-4 focus:ring-sky-400"
            aria-label={`Vocalize safety alert: ${alertMessage}`}
            title="Read alert aloud"
          >
            <Volume2 className={`w-4 h-4 ${isSpeaking ? 'text-sky-400 animate-pulse' : 'text-slate-300'}`} />
            <span>Hear Alert</span>
          </button>
        )}
      </div>

      {/* Main Alert Message */}
      <div className="mt-4 p-4 rounded-xl bg-black/40 border border-white/10">
        <p className="text-xl md:text-2xl font-extrabold text-white leading-snug">
          "{alertMessage}"
        </p>
      </div>

      {/* Actionable Directional Guidance Banner */}
      <div
        className={`mt-4 p-4 rounded-xl border-2 flex items-center justify-between gap-4 shadow-lg ${
          moveDir === 'stop'
            ? 'bg-red-950/90 border-red-500 text-red-100'
            : 'bg-cyan-950/80 border-cyan-400 text-cyan-100'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-black/60 border border-white/20 shadow-inner">
            {getMovementIcon(moveDir)}
          </div>
          <div>
            <div className="text-[11px] uppercase font-black tracking-wider text-slate-300">
              Recommended Movement to Evade Hazard
            </div>
            <div className="text-2xl font-black tracking-tight text-white uppercase drop-shadow-sm">
              {actionText}
            </div>
          </div>
        </div>

        <div className="hidden sm:flex flex-col items-end text-right">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Threat Location</span>
          <span className="text-sm font-black text-amber-300 capitalize">{hazard.direction || 'Ahead'}</span>
        </div>
      </div>

      {/* Direction, Movement & Confidence Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
        {/* Recommended Move */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-elevated/70 border border-surface-border">
          <div className="p-2 rounded-lg bg-surface-darkest border border-surface-border">
            <Navigation className="w-5 h-5 text-cyan-300" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Move To
            </div>
            <div className="text-sm font-black text-cyan-300 uppercase">
              {getMovementLabel(moveDir)}
            </div>
          </div>
        </div>

        {/* Hazard Location */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-elevated/70 border border-surface-border">
          <div className="p-2 rounded-lg bg-surface-darkest border border-surface-border">
            {getDirectionIcon(hazard.direction)}
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Hazard Position
            </div>
            <div className="text-sm font-black text-white capitalize">
              {hazard.direction || 'Ahead'}
            </div>
          </div>
        </div>

        {/* Confidence */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-elevated/70 border border-surface-border">
          <div className="p-2 rounded-lg bg-surface-darkest border border-surface-border text-emerald-400 font-mono font-bold text-sm">
            {formatConfidence(hazard.confidence)}
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Confidence
            </div>
            <div className="text-sm font-black text-white">
              {formatConfidence(hazard.confidence)}
            </div>
          </div>
        </div>
      </div>

      {/* Assertive Live Region for Screen Readers */}
      <div
        className="sr-only"
        role="alert"
        aria-live={isCritical ? 'assertive' : 'polite'}
        aria-atomic="true"
      >
        {isCritical ? 'CRITICAL SAFETY ALERT:' : 'Hazard alert:'} Action: {actionText}. {alertMessage}. Move direction: {getMovementLabel(moveDir)}. Hazard location: {formatDirection(hazard.direction)}. Confidence {formatConfidence(hazard.confidence)}.
      </div>
    </section>
  );
}

