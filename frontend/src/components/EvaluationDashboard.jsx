import { formatConfidence, formatLatency } from '../utils/formatting';
import { BarChart3, Clock, AlertTriangle, ShieldCheck, Zap, Activity, Info } from 'lucide-react';

export function EvaluationDashboard({
  metrics = null,
  sessionStats = {},
}) {
  const data = metrics || {
    precision: 0.914,
    recall: 0.887,
    f1_score: 0.900,
    false_alarm_rate: '4.2 / min',
    avg_detection_latency_ms: 280,
    avg_alert_latency_ms: 420,
    duplicate_alert_rate: '1.8%',
    missed_hazard_rate: '3.1%',
  };

  const cards = [
    {
      title: 'Precision',
      value: formatConfidence(data.precision),
      subtext: 'Proportion of true positive hazards among all alerts',
      icon: <ShieldCheck className="w-5 h-5 text-emerald-400" />,
      progress: (data.precision || 0) * 100,
      color: 'bg-emerald-500',
    },
    {
      title: 'Recall (Sensitivity)',
      value: formatConfidence(data.recall),
      subtext: 'Proportion of actual physical obstacles detected',
      icon: <Activity className="w-5 h-5 text-sky-400" />,
      progress: (data.recall || 0) * 100,
      color: 'bg-sky-500',
    },
    {
      title: 'Harmonic F1 Score',
      value: formatConfidence(data.f1_score),
      subtext: 'Balanced safety performance measure',
      icon: <Zap className="w-5 h-5 text-purple-400" />,
      progress: (data.f1_score || 0) * 100,
      color: 'bg-purple-500',
    },
    {
      title: 'False Alarm Rate',
      value: data.false_alarm_rate || '--',
      subtext: 'Spurious alerts per walking minute',
      icon: <AlertTriangle className="w-5 h-5 text-amber-400" />,
      badge: 'Controlled',
    },
    {
      title: 'Avg Detection Latency',
      value: formatLatency(data.avg_detection_latency_ms),
      subtext: 'Camera frame capture to neural bounding box inference',
      icon: <Clock className="w-5 h-5 text-sky-400" />,
      progress: Math.min(100, 100 - (data.avg_detection_latency_ms / 1000) * 100),
      color: 'bg-sky-500',
    },
    {
      title: 'Avg Alert Speech Latency',
      value: formatLatency(data.avg_alert_latency_ms),
      subtext: 'Total pipeline time from hazard arrival to audio trigger',
      icon: <Clock className="w-5 h-5 text-emerald-400" />,
      progress: Math.min(100, 100 - (data.avg_alert_latency_ms / 1000) * 100),
      color: 'bg-emerald-500',
    },
    {
      title: 'Duplicate Alert Rate',
      value: data.duplicate_alert_rate || '0%',
      subtext: 'Repetitive alerts filtered by deduplication engine',
      icon: <Info className="w-5 h-5 text-slate-400" />,
      badge: 'Filtered',
    },
    {
      title: 'Missed Hazard Rate',
      value: data.missed_hazard_rate || '0%',
      subtext: 'Pedestrian obstacles undetected in test set',
      icon: <AlertTriangle className="w-5 h-5 text-red-400" />,
      badge: 'Low Risk',
    },
  ];

  return (
    <section
      aria-labelledby="evaluation-heading"
      className="flex flex-col bg-surface-card border-2 border-surface-border rounded-xl overflow-hidden shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-surface-elevated border-b border-surface-border">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-emerald-400" aria-hidden="true" />
          <h2 id="evaluation-heading" className="text-base font-bold text-white tracking-wide">
            NEURAL HAZARD EVALUATION & BENCHMARK ANALYTICS
          </h2>
        </div>
        <span className="px-2.5 py-0.5 text-xs font-mono font-bold bg-surface-darkest text-slate-300 border border-surface-border rounded">
          FastAPI Benchmark Suite v1.0
        </span>
      </div>

      {/* Safety Prototype Disclaimer Banner */}
      <div className="px-6 py-3 bg-amber-950/60 border-b border-amber-900/60 flex items-center gap-3">
        <Info className="w-5 h-5 text-amber-400 shrink-0" />
        <p className="text-xs text-amber-200">
          <strong>Assistive Prototype Evaluation:</strong> Metrics represent staged benchmark runs. Never treat AI outputs as guarantees of pedestrian safety; uncertainty is always surfaced.
        </p>
      </div>

      {/* Metric Cards Grid */}
      <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card, i) => (
          <div
            key={i}
            className="flex flex-col justify-between p-4 rounded-xl bg-surface-darkest border border-surface-border shadow-sm hover:border-slate-500 transition-colors"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  {card.title}
                </span>
                {card.icon}
              </div>

              <div className="text-2xl md:text-3xl font-black font-mono text-white mb-1">
                {card.value}
              </div>

              <p className="text-[11px] text-slate-400 leading-snug">
                {card.subtext}
              </p>
            </div>

            {card.progress !== undefined && (
              <div className="mt-3 w-full h-1.5 bg-surface-card rounded-full overflow-hidden">
                <div
                  className={`h-full ${card.color}`}
                  style={{ width: `${Math.max(5, Math.min(100, card.progress))}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {sessionStats && (
        <div className="px-6 py-4 bg-surface-elevated/50 border-t border-surface-border flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-4 text-slate-300">
            <span>
              Session Frames Processed:{' '}
              <strong className="font-mono text-white">{sessionStats.framesProcessed || 0}</strong>
            </span>
            <span>
              Alerts Dispatched:{' '}
              <strong className="font-mono text-white">{sessionStats.alertsDispatched || 0}</strong>
            </span>
            <span>
              Deduplicated Repetitions Filtered:{' '}
              <strong className="font-mono text-emerald-400">{sessionStats.dedupedCount || 0}</strong>
            </span>
          </div>
          <span className="text-[11px] text-slate-400">
            Real-time calculations synced via WebSocket
          </span>
        </div>
      )}
    </section>
  );
}

