import {
  Activity,
  Camera,
  Mic,
  Server,
  Eye,
  Radio,
  ScanText,
  Bot,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ShieldCheck,
} from 'lucide-react';

export function SystemStatus({
  systemHealth = {},
  failures = [],
  onDismissFailure,
}) {
  const getStatusConfig = (status) => {
    const s = (status || 'UNAVAILABLE').toUpperCase();
    switch (s) {
      case 'ACTIVE':
      case 'CONNECTED':
      case 'READY':
        return {
          icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />,
          dotClass: 'bg-emerald-400 animate-pulse',
          badgeClass: 'bg-emerald-950/90 text-emerald-300 border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.15)]',
          label: s,
          isHealthy: true,
        };
      case 'DEGRADED':
        return {
          icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
          dotClass: 'bg-amber-400 animate-pulse',
          badgeClass: 'bg-amber-950/90 text-amber-300 border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.15)]',
          label: s,
          isHealthy: false,
        };
      case 'FAILED':
      case 'DISCONNECTED':
        return {
          icon: <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />,
          dotClass: 'bg-red-400',
          badgeClass: 'bg-red-950/90 text-red-300 border-red-500/60 shadow-[0_0_10px_rgba(239,68,68,0.2)]',
          label: s,
          isHealthy: false,
        };
      default:
        return {
          icon: <HelpCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />,
          dotClass: 'bg-slate-500',
          badgeClass: 'bg-slate-900/90 text-slate-400 border-slate-700',
          label: s,
          isHealthy: false,
        };
    }
  };

  const backendConfig = getStatusConfig(systemHealth.backend || 'DISCONNECTED');

  const sensorAndAIModules = [
    {
      key: 'camera',
      label: 'Camera Sensor',
      sublabel: 'Primary Visual Stream',
      icon: <Camera className="w-4 h-4 text-sky-400" />,
    },
    {
      key: 'vision_ai',
      label: 'Vision AI',
      sublabel: 'Hazard Detection & Tracking',
      icon: <Eye className="w-4 h-4 text-emerald-400" />,
    },
    {
      key: 'microphone',
      label: 'Microphone',
      sublabel: 'Acoustic Radar Input',
      icon: <Mic className="w-4 h-4 text-purple-400" />,
    },
    {
      key: 'audio_ai',
      label: 'Audio AI',
      sublabel: 'Acoustic Hazard Classifier',
      icon: <Radio className="w-4 h-4 text-purple-400" />,
    },
    {
      key: 'ocr',
      label: 'OCR Engine',
      sublabel: 'Scene Text & Sign Reader',
      icon: <ScanText className="w-4 h-4 text-amber-400" />,
    },
    {
      key: 'assistant',
      label: 'Assistant LLM',
      sublabel: 'Conversational Safety Agent',
      icon: <Bot className="w-4 h-4 text-sky-400" />,
    },
  ];

  // Calculate overall health summary
  const allModules = ['backend', ...sensorAndAIModules.map((m) => m.key)];
  const totalCount = allModules.length;
  const healthyCount = allModules.filter(
    (key) => getStatusConfig(systemHealth[key] || (key === 'backend' ? 'DISCONNECTED' : 'ACTIVE')).isHealthy
  ).length;
  const isAllHealthy = healthyCount === totalCount;

  return (
    <section
      aria-labelledby="system-health-heading"
      className="flex flex-col bg-surface-card border-2 border-surface-border rounded-2xl overflow-hidden shadow-2xl"
    >
      {/* Header with Title & Live System Status Badge */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-surface-elevated border-b border-surface-border">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-surface-darkest border border-surface-border text-emerald-400">
            <Activity className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h2 id="system-health-heading" className="text-sm md:text-base font-black text-white tracking-wide uppercase">
              System Health & Diagnostics
            </h2>
            <p className="text-[11px] font-semibold text-slate-400">
              Real-time hardware sensors and neural processing integrity
            </p>
          </div>
        </div>

        {/* Global Summary Badge */}
        <div
          className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black border uppercase tracking-wider ${
            isAllHealthy
              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/60 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
              : 'bg-amber-950/80 text-amber-300 border-amber-500/60 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
          }`}
        >
          {isAllHealthy ? (
            <>
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>All Systems Nominal ({healthyCount}/{totalCount})</span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-4 h-4 text-amber-400 animate-pulse" />
              <span>{totalCount - healthyCount} Component Offline</span>
            </>
          )}
        </div>
      </div>

      {/* Prominent Failure Banners (if any hardware fault detected) */}
      {failures.length > 0 && (
        <div className="p-3.5 flex flex-col gap-2 bg-red-950/80 border-b border-red-800" role="alert">
          {failures.map((fail, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-3 rounded-xl bg-red-900/90 border-2 border-red-500 text-white text-xs md:text-sm font-bold shadow-lg"
            >
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 text-yellow-300 shrink-0 animate-bounce" />
                <span>{fail.message || `System failure in component: ${fail.component}`}</span>
              </div>
              {onDismissFailure && (
                <button
                  type="button"
                  onClick={() => onDismissFailure(i)}
                  className="px-2.5 py-1 text-xs bg-red-950 hover:bg-red-800 rounded-lg border border-red-400 font-bold transition-colors focus:ring-2 focus:ring-white"
                >
                  Dismiss
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="p-4 flex flex-col gap-3">
        {/* 1. Core Link: FastAPI Backend Connection (Featured Top Card) */}
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-surface-darkest border-2 border-surface-border hover:border-slate-600 transition-colors">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-surface-elevated border border-surface-border text-slate-200 shrink-0">
              <Server className="w-5 h-5 text-sky-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-white tracking-wide">
                  FastAPI AI Backend
                </span>
                <span className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-surface-elevated text-[10px] font-mono font-bold text-slate-400 border border-surface-border">
                  WebSocket Core
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-400 truncate">
                Real-time sensor streaming & bidirectional neural inference
              </p>
            </div>
          </div>

          <div className="shrink-0 ml-3">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-black border uppercase tracking-wider whitespace-nowrap ${backendConfig.badgeClass}`}
            >
              <span className={`w-2 h-2 rounded-full ${backendConfig.dotClass}`} />
              <span>{backendConfig.label}</span>
            </span>
          </div>
        </div>

        {/* 2. Sensor & Processing Modules Grid (Balanced 2-column layout) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {sensorAndAIModules.map((m) => {
            const rawStatus = systemHealth[m.key] || 'ACTIVE';
            const config = getStatusConfig(rawStatus);

            return (
              <div
                key={m.key}
                className="flex items-center justify-between p-3 rounded-xl bg-surface-darkest border border-surface-border/80 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-surface-elevated border border-surface-border text-slate-300 shrink-0">
                    {m.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-black text-slate-100 truncate">
                      {m.label}
                    </div>
                    <div className="text-[10px] font-medium text-slate-400 truncate">
                      {m.sublabel}
                    </div>
                  </div>
                </div>

                <div className="shrink-0 ml-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black border uppercase tracking-wider whitespace-nowrap ${config.badgeClass}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${config.dotClass}`} />
                    <span>{config.label}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
