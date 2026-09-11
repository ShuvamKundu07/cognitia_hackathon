import { formatConfidence } from '../utils/formatting';
import { Mic, MicOff, Volume2, Radio, AlertCircle } from 'lucide-react';

export function AudioStatus({
  micStatus = 'ACTIVE',
  audioAiStatus = 'ACTIVE',
  audioLevel = 0,
  latestAudioEvent = null,
  onToggleMute,
  isMuted = false,
  onTriggerTestAudio = null,
  _error = null,
}) {
  const isAvailable = micStatus === 'ACTIVE' || micStatus === 'MUTED';

  return (
    <section
      aria-labelledby="audio-status-heading"
      className="flex flex-col bg-surface-card border-2 border-surface-border rounded-xl overflow-hidden shadow-xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-surface-elevated border-b border-surface-border">
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5 text-purple-400" aria-hidden="true" />
          <h2 id="audio-status-heading" className="text-base font-bold text-white tracking-wide">
            ACOUSTIC HAZARD RADAR
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {onToggleMute && (
            <button
              type="button"
              onClick={onToggleMute}
              className={`p-1.5 rounded-lg border text-xs font-bold transition-all ${
                isMuted
                  ? 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white hover:border-slate-500'
                  : 'bg-emerald-950 text-emerald-300 border-emerald-500 hover:bg-emerald-900 shadow-md shadow-emerald-900/30'
              }`}
              aria-label={isMuted ? 'Start microphone detection' : 'Stop microphone detection'}
            >
              {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4 animate-pulse" />}
            </button>
          )}
          <span
            className={`px-2 py-0.5 text-xs font-bold rounded-full uppercase ${
              isMuted
                ? 'bg-slate-800 text-slate-400 border border-slate-700'
                : micStatus === 'ACTIVE'
                ? 'bg-emerald-950 text-emerald-400 border border-emerald-600'
                : 'bg-red-950 text-red-400 border border-red-600'
            }`}
          >
            {isMuted ? 'OFF' : micStatus}
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-4 flex flex-col gap-3">
        {/* Audio AI Failure State */}
        {!isAvailable || audioAiStatus === 'UNAVAILABLE' ? (
          <div className="flex items-center gap-2 p-3 bg-red-950/80 border border-red-500 rounded-xl text-red-200 text-sm font-semibold">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <span>Audio detection unavailable. Environmental sounds will not be scored.</span>
          </div>
        ) : (
          <>
            {/* Live Mic Volume Level Bar */}
            <div>
              <div className="flex justify-between items-center text-xs font-bold text-slate-400 mb-1">
                <span>MIC LEVEL:</span>
                <span className="font-mono text-slate-300">{isMuted ? 0 : audioLevel}%</span>
              </div>
              <div className="w-full h-2.5 bg-surface-darkest rounded-full overflow-hidden border border-surface-border">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 via-yellow-400 to-red-500 transition-all duration-75"
                  style={{ width: `${isMuted ? 0 : Math.min(100, Math.max(2, audioLevel))}%` }}
                />
              </div>
            </div>

            {/* Detected Sound Card */}
            {isMuted ? (
              <div className="p-3.5 rounded-xl bg-surface-darkest border border-surface-border text-center text-xs text-slate-400">
                Microphone is <strong className="text-slate-300">OFF</strong>. Click the microphone button above to start acoustic hazard detection.
              </div>
            ) : latestAudioEvent && !latestAudioEvent.sound?.toLowerCase().includes('engine') ? (() => {
              const zoneMatch = latestAudioEvent.sound?.match(/\[(.*?)\]/);
              const hazardZone = latestAudioEvent.hazard_zone || (zoneMatch ? zoneMatch[1] : null);
              const isBlindspot = hazardZone && hazardZone.toLowerCase().includes('blindspot');
              const isInView = hazardZone && hazardZone.toLowerCase().includes('in view');
              const cleanSound = latestAudioEvent.sound?.replace(/\s*\[.*?\]/, '') || latestAudioEvent.sound;

              return (
                <div className={`p-3.5 rounded-xl border-2 flex items-center justify-between ${
                  isBlindspot
                    ? 'bg-red-950/60 border-red-500/80'
                    : 'bg-purple-950/50 border-purple-500/60'
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-xl border ${
                      isBlindspot
                        ? 'bg-red-900 border-red-400 text-red-200'
                        : 'bg-purple-900 border-purple-400 text-purple-200'
                    }`}>
                      <Volume2 className="w-5 h-5 animate-pulse" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] uppercase font-black text-purple-300 tracking-wider">
                          Detected Sound
                        </span>
                        {hazardZone && (
                          <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border ${
                            isBlindspot
                              ? 'bg-red-900 text-red-200 border-red-400 animate-pulse'
                              : isInView
                              ? 'bg-amber-900/80 text-amber-200 border-amber-500'
                              : 'bg-indigo-900/80 text-indigo-200 border-indigo-500'
                          }`}>
                            {hazardZone}
                          </span>
                        )}
                      </div>
                      <div className="text-base font-black text-white">
                        "{cleanSound}"
                      </div>
                      <div className="text-xs text-slate-300">
                        Direction: <strong className="text-white capitalize">{latestAudioEvent.direction}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Confidence</div>
                    <div className="text-sm font-mono font-black text-purple-300">
                      {formatConfidence(latestAudioEvent.confidence)}
                    </div>
                  </div>
                </div>
              );
            })() : (
              <div className="p-3.5 rounded-xl bg-surface-darkest border border-surface-border text-center text-xs text-slate-400">
                Listening for vehicle sounds (horns, sirens, tire squeals)...
              </div>
            )}
            {/* Quick Test Buttons */}
            {onTriggerTestAudio && (
              <div className="flex items-center gap-2 pt-1 border-t border-surface-border/60">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Test Audio:</span>
                <button
                  type="button"
                  onClick={() => onTriggerTestAudio('Vehicle Horn', 'Right')}
                  className="px-2.5 py-1 bg-purple-900/60 hover:bg-purple-800 text-purple-200 border border-purple-600 rounded-lg text-xs font-bold transition-all active:scale-95 flex items-center gap-1"
                >
                  <Volume2 className="w-3 h-3" />
                  Car Horn
                </button>
                <button
                  type="button"
                  onClick={() => onTriggerTestAudio('Emergency Siren', 'Left')}
                  className="px-2.5 py-1 bg-indigo-900/60 hover:bg-indigo-800 text-indigo-200 border border-indigo-600 rounded-lg text-xs font-bold transition-all active:scale-95 flex items-center gap-1"
                >
                  <Volume2 className="w-3 h-3" />
                  Siren
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

