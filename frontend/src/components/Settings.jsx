import { useState, useEffect } from 'react';
import {
  Sliders,
  RotateCcw,
  Server,
  Globe,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  ExternalLink,
} from 'lucide-react';

export function Settings({
  settings,
  onUpdateSettings,
  onResetSettings,
  backendWsUrl = '',
  backendStatus = 'DISCONNECTED',
  onUpdateBackendWsUrl,
  onResetBackendWsUrl,
  onCheckBackendHealth,
}) {
  const [urlInput, setUrlInput] = useState(backendWsUrl);
  const [pingStatus, setPingStatus] = useState({ loading: false, result: null });
  const [showVercelGuide, setShowVercelGuide] = useState(false);

  useEffect(() => {
    setUrlInput(backendWsUrl);
  }, [backendWsUrl]);

  const handleChange = (key, value) => {
    onUpdateSettings({ ...settings, [key]: value });
  };

  const handleToggle = (key) => {
    onUpdateSettings({ ...settings, [key]: !settings[key] });
  };

  const handleSaveBackendUrl = (e) => {
    e.preventDefault();
    if (onUpdateBackendWsUrl && urlInput.trim()) {
      onUpdateBackendWsUrl(urlInput.trim());
    }
  };

  const handleTestPing = async () => {
    if (!onCheckBackendHealth) return;
    setPingStatus({ loading: true, result: null });
    const res = await onCheckBackendHealth(urlInput.trim());
    setPingStatus({ loading: false, result: res });
  };

  const isWsConnected = backendStatus === 'CONNECTED';
  const isWsConnecting = backendStatus === 'CONNECTING' || backendStatus === 'RECONNECTING';

  return (
    <section
      aria-labelledby="settings-heading"
      className="flex flex-col bg-surface-card border-2 border-surface-border rounded-xl overflow-hidden shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-surface-elevated border-b border-surface-border">
        <div className="flex items-center gap-2">
          <Sliders className="w-5 h-5 text-sky-400" aria-hidden="true" />
          <h2 id="settings-heading" className="text-base font-bold text-white tracking-wide">
            SAFETY PARAMETERS & ACCESSIBILITY PREFERENCES
          </h2>
        </div>
        {onResetSettings && (
          <button
            type="button"
            onClick={onResetSettings}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-surface-darkest hover:bg-surface-hover text-slate-300 border border-surface-border rounded-lg transition-colors focus:ring-2 focus:ring-sky-400"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>
        )}
      </div>

      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Render Backend Connection & Deployment Status Card */}
        <div className="md:col-span-2 flex flex-col gap-3 p-4 bg-surface-darkest rounded-xl border-2 border-sky-900/60 shadow-inner">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5 text-sky-400" />
              <div>
                <h3 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
                  <span>BACKEND CONNECTION (RENDER & VERCEL)</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Target FastAPI AI service for real-time video inference and hazard detection.
                </p>
              </div>
            </div>

            {/* Live Connection Status Badge */}
            <div className="flex items-center gap-2">
              <span
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full border ${
                  isWsConnected
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-500'
                    : isWsConnecting
                    ? 'bg-amber-950 text-amber-300 border-amber-500 animate-pulse'
                    : 'bg-red-950 text-red-300 border-red-500'
                }`}
              >
                {isWsConnected && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                {isWsConnecting && <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />}
                {!isWsConnected && !isWsConnecting && <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
                <span>
                  {isWsConnected
                    ? 'CONNECTED & ACTIVE'
                    : isWsConnecting
                    ? 'CONNECTING (Waking Render...)'
                    : 'DISCONNECTED'}
                </span>
              </span>
            </div>
          </div>

          {/* Render Cold-Start Notice Banner */}
          <div className="p-3 bg-sky-950/40 border border-sky-800/50 rounded-lg text-xs text-sky-200 flex items-start gap-2.5">
            <Clock className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-white">
                Render Free-Tier Spin-Down Notice
              </p>
              <p className="text-slate-300 leading-relaxed">
                Render free-tier instances sleep after 15 minutes of inactivity. On cold start, Render takes <strong className="text-amber-300">50 to 90 seconds</strong> to boot up. On mobile phones (HTTPS via Vercel), connections must use secure WebSockets (<strong className="text-emerald-300">wss://</strong>).
              </p>
            </div>
          </div>

          {/* URL Input & Controls Form */}
          <form onSubmit={handleSaveBackendUrl} className="flex flex-col sm:flex-row gap-2 mt-1">
            <div className="relative flex-1">
              <input
                id="setting-backend-url"
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="e.g. wss://your-backend.onrender.com/ws or https://your-backend.onrender.com"
                className="w-full bg-surface-elevated border-2 border-surface-border rounded-lg pl-3 pr-8 py-2 text-sm text-white placeholder-slate-500 font-mono focus:ring-2 focus:ring-sky-400"
                aria-label="Backend WebSocket URL"
              />
              <Globe className="w-4 h-4 text-slate-500 absolute right-2.5 top-3" />
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-lg shadow transition-all active:scale-95 focus:ring-2 focus:ring-sky-400 flex items-center gap-1.5"
              >
                <Server className="w-3.5 h-3.5" />
                <span>Save & Connect</span>
              </button>

              <button
                type="button"
                onClick={handleTestPing}
                disabled={pingStatus.loading}
                className="px-3 py-2 bg-surface-elevated hover:bg-surface-hover text-slate-200 border border-surface-border font-bold text-xs rounded-lg transition-all active:scale-95 focus:ring-2 focus:ring-sky-400 flex items-center gap-1.5 disabled:opacity-60"
                title="Ping backend health endpoint to check responsiveness and wake up sleeping Render instance"
              >
                {pingStatus.loading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-400" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                )}
                <span>{pingStatus.loading ? 'Pinging...' : 'Wake Up / Test'}</span>
              </button>

              {onResetBackendWsUrl && (
                <button
                  type="button"
                  onClick={() => {
                    onResetBackendWsUrl();
                    setUrlInput('');
                  }}
                  className="px-2.5 py-2 text-xs text-slate-400 hover:text-slate-200 border border-surface-border bg-surface-elevated rounded-lg transition-colors"
                  title="Reset URL to default environment configuration"
                >
                  Reset
                </button>
              )}
            </div>
          </form>

          {/* Test Ping Result Banner */}
          {pingStatus.result && (
            <div
              className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                pingStatus.result.success
                  ? 'bg-emerald-950/70 border-emerald-600 text-emerald-200'
                  : 'bg-amber-950/70 border-amber-600 text-amber-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {pingStatus.result.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                )}
                <span>
                  {pingStatus.result.success
                    ? `Backend Online! Responded HTTP ${pingStatus.result.status} in ${pingStatus.result.latencyMs}ms.`
                    : `Health check response: ${pingStatus.result.error || 'Connection failed'}.`}
                </span>
              </div>
              <span className="font-mono text-[11px] opacity-75">{pingStatus.result.latencyMs}ms</span>
            </div>
          )}

          {/* Permanent Deployment Guide Accordion */}
          <div className="mt-1">
            <button
              type="button"
              onClick={() => setShowVercelGuide(!showVercelGuide)}
              className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 font-semibold"
            >
              <ExternalLink className="w-3 h-3" />
              <span>{showVercelGuide ? 'Hide Vercel Environment Setup Guide' : 'How to configure permanently in Vercel Dashboard'}</span>
            </button>

            {showVercelGuide && (
              <div className="mt-2 p-3 bg-surface-card border border-surface-border rounded-lg text-xs text-slate-300 space-y-2">
                <p className="font-bold text-white">To make this permanent on your deployed Vercel site:</p>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-300">
                  <li>Go to your <a href="https://vercel.com/dashboard" target="_blank" rel="noreferrer" className="text-sky-400 underline">Vercel Project Dashboard</a> &rarr; <strong>Settings</strong> &rarr; <strong>Environment Variables</strong>.</li>
                  <li>Add <code className="text-sky-300 bg-surface-darkest px-1 py-0.5 rounded font-mono">VITE_BACKEND_URL</code> = <code className="text-emerald-300 bg-surface-darkest px-1 py-0.5 rounded font-mono">https://your-backend.onrender.com</code></li>
                  <li>Add <code className="text-sky-300 bg-surface-darkest px-1 py-0.5 rounded font-mono">VITE_BACKEND_WS_URL</code> = <code className="text-emerald-300 bg-surface-darkest px-1 py-0.5 rounded font-mono">wss://your-backend.onrender.com/ws</code></li>
                  <li>Click <strong>Deployments</strong> &rarr; <strong>Redeploy</strong> to apply the changes.</li>
                </ol>
              </div>
            )}
          </div>
        </div>
        {/* Detection Sensitivity */}
        <div className="flex flex-col gap-2 p-4 bg-surface-darkest rounded-xl border border-surface-border">
          <label htmlFor="setting-sensitivity" className="text-sm font-bold text-white">
            Detection Sensitivity
          </label>
          <p className="text-xs text-slate-400">
            Higher sensitivity detects distant or subtle obstacles, but may increase alerts.
          </p>
          <select
            id="setting-sensitivity"
            value={settings.sensitivity || 'NORMAL'}
            onChange={(e) => handleChange('sensitivity', e.target.value)}
            className="mt-2 bg-surface-elevated border-2 border-surface-border rounded-lg px-3 py-2 text-sm text-white font-semibold focus:ring-2 focus:ring-sky-400"
          >
            <option value="LOW">LOW (Conservative)</option>
            <option value="NORMAL">NORMAL (Recommended)</option>
            <option value="HIGH">HIGH (Aggressive Safety)</option>
          </select>
        </div>

        {/* Alert Frequency */}
        <div className="flex flex-col gap-2 p-4 bg-surface-darkest rounded-xl border border-surface-border">
          <label htmlFor="setting-frequency" className="text-sm font-bold text-white">
            Alert Frequency
          </label>
          <p className="text-xs text-slate-400">
            Controls minimum cooling-off interval before re-voicing persistent obstacles.
          </p>
          <select
            id="setting-frequency"
            value={settings.alert_frequency || 'NORMAL'}
            onChange={(e) => handleChange('alert_frequency', e.target.value)}
            className="mt-2 bg-surface-elevated border-2 border-surface-border rounded-lg px-3 py-2 text-sm text-white font-semibold focus:ring-2 focus:ring-sky-400"
          >
            <option value="LOW">LOW (Less frequent speech)</option>
            <option value="NORMAL">NORMAL (Balanced)</option>
            <option value="HIGH">HIGH (Continuous alerts)</option>
          </select>
        </div>

        {/* Speech Speed */}
        <div className="flex flex-col gap-2 p-4 bg-surface-darkest rounded-xl border border-surface-border">
          <div className="flex justify-between items-center">
            <label htmlFor="setting-speech-speed" className="text-sm font-bold text-white">
              Speech Synthesis Speed (TTS)
            </label>
            <span className="font-mono text-sm font-bold text-sky-400">
              {settings.speech_speed || 1.0}x
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Adjust the vocal pace of safety warnings and assistant responses.
          </p>
          <div className="grid grid-cols-4 gap-2 mt-2">
            {[0.75, 1.0, 1.25, 1.5].map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => handleChange('speech_speed', rate)}
                className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                  (settings.speech_speed || 1.0) === rate
                    ? 'bg-sky-600 text-white border-sky-400 ring-2 ring-sky-500/50'
                    : 'bg-surface-elevated text-slate-300 border-surface-border hover:bg-surface-hover'
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>
        </div>

        {/* High Contrast Mode Toggle */}
        <div className="flex flex-col gap-2 p-4 bg-surface-darkest rounded-xl border border-surface-border">
          <label className="text-sm font-bold text-white">High Contrast Display</label>
          <p className="text-xs text-slate-400">
            Enhances text luminance and maximizes border weights for low-vision clarity.
          </p>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-slate-300 font-semibold">Max Contrast Mode</span>
            <button
              type="button"
              onClick={() => handleToggle('high_contrast')}
              className={`w-14 h-8 flex items-center rounded-full p-1 transition-colors ${
                settings.high_contrast ? 'bg-sky-600' : 'bg-slate-700'
              }`}
              aria-pressed={!!settings.high_contrast}
            >
              <div
                className={`bg-white w-6 h-6 rounded-full shadow-md transform transition-transform ${
                  settings.high_contrast ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Google Gemini AI Configuration */}
        <div className="md:col-span-2 flex flex-col gap-3 p-4 bg-surface-darkest rounded-xl border border-surface-border">
          <div className="flex items-center justify-between">
            <div>
              <label htmlFor="setting-gemini-key" className="text-sm font-bold text-white flex items-center gap-2">
                <span>Google Gemini API Key</span>
                {settings.gemini_api_key ? (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-950 text-emerald-400 border border-emerald-600">
                    Active
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                    Not Configured
                  </span>
                )}
              </label>
              <p className="text-xs text-slate-400 mt-0.5">
                Powers Bro with Gemini 2.5 Flash for intelligent, context-aware conversational answers about your surroundings.
              </p>
            </div>
          </div>
          <div className="flex gap-2 items-center mt-1">
            <input
              id="setting-gemini-key"
              type="password"
              value={settings.gemini_api_key || ''}
              onChange={(e) => handleChange('gemini_api_key', e.target.value)}
              placeholder="Enter Gemini API key (AIzaSy...)"
              className="flex-1 bg-surface-elevated border-2 border-surface-border rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-sky-400 font-mono"
            />
            {settings.gemini_api_key && (
              <button
                type="button"
                onClick={() => handleChange('gemini_api_key', '')}
                className="px-3 py-2 text-xs font-semibold text-red-400 hover:text-red-300 bg-red-950/40 border border-red-800 rounded-lg transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Feature Toggles */}
        <div className="md:col-span-2 flex flex-col gap-3 p-4 bg-surface-darkest rounded-xl border border-surface-border">
          <span className="text-sm font-bold text-white">Active Safety Modules & Channels</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-1">
            {[
              { key: 'enable_visual_alerts', label: 'Visual Hazard Alerts' },
              { key: 'enable_audio_alerts', label: 'Spoken Audio Warnings (TTS)' },
              { key: 'enable_voice_assistant', label: 'Conversational Voice Assistant' },
              { key: 'enable_ocr', label: 'Optical Character Recognition (OCR)' },
              { key: 'enable_system_warnings', label: 'Hardware Diagnostic Warnings' },
              { key: 'show_walking_path', label: 'Walking Path Corridor Overlay' },
            ].map(({ key, label }) => (
              <label
                key={key}
                className="flex items-center gap-3 p-3 bg-surface-elevated rounded-lg border border-surface-border cursor-pointer hover:bg-surface-hover transition-colors"
              >
                <input
                  type="checkbox"
                  checked={settings[key] !== false}
                  onChange={() => handleToggle(key)}
                  className="w-5 h-5 rounded text-sky-600 bg-surface-darkest border-surface-border focus:ring-sky-400"
                />
                <span className="text-xs font-bold text-slate-200">{label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

