import { Sliders, RotateCcw } from 'lucide-react';

export function Settings({
  settings,
  onUpdateSettings,
  onResetSettings,
}) {
  const handleChange = (key, value) => {
    onUpdateSettings({ ...settings, [key]: value });
  };

  const handleToggle = (key) => {
    onUpdateSettings({ ...settings, [key]: !settings[key] });
  };

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

