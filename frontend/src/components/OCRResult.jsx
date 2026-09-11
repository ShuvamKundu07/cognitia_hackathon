import { formatConfidence } from '../utils/formatting';
import { Volume2, ScanText } from 'lucide-react';

export function OCRResult({
  ocrResult,
  onSpeakText,
  isSpeaking = false,
  ocrHistory = [],
}) {
  if (!ocrResult && ocrHistory.length === 0) {
    return null;
  }

  const current = ocrResult || ocrHistory[0];

  return (
    <section
      aria-labelledby="ocr-heading"
      className="flex flex-col bg-surface-card border-2 border-surface-border rounded-xl overflow-hidden shadow-xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-surface-elevated border-b border-surface-border">
        <div className="flex items-center gap-2">
          <ScanText className="w-5 h-5 text-emerald-400" aria-hidden="true" />
          <h2 id="ocr-heading" className="text-base font-bold text-white tracking-wide">
            OPTICAL SIGN & TEXT RECOGNITION (OCR)
          </h2>
        </div>
        {current && (
          <span className="px-2 py-0.5 text-xs font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-600 rounded">
            {formatConfidence(current.confidence)} Match
          </span>
        )}
      </div>

      {/* Main Recognized Text Card */}
      {current && (
        <div className="p-4 bg-surface-darkest flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Detected Text:
              </span>
              <div className="p-3 bg-surface-elevated border-2 border-emerald-500/50 rounded-xl">
                <p className="text-lg md:text-xl font-mono font-black text-emerald-300 tracking-wide">
                  "{current.text}"
                </p>
              </div>
            </div>

            {onSpeakText && (
              <button
                type="button"
                onClick={() => onSpeakText(`The sign says: ${current.text}`)}
                className="mt-5 flex items-center gap-2 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-md transition-colors focus:ring-4 focus:ring-emerald-400"
                aria-label={`Read detected text aloud: ${current.text}`}
              >
                <Volume2 className={`w-4 h-4 ${isSpeaking ? 'animate-pulse' : ''}`} />
                <span>Read Aloud</span>
              </button>
            )}
          </div>

          {current.object_id && (
            <div className="text-[11px] text-slate-400 font-mono">
              Source Anchor: <span className="text-slate-200">{current.object_id}</span>
            </div>
          )}
        </div>
      )}

      {/* Recent OCR History */}
      {ocrHistory.length > 1 && (
        <div className="p-3 bg-surface-card border-t border-surface-border">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            Recent Text in Scene:
          </div>
          <div className="flex flex-col gap-1.5 max-h-24 overflow-y-auto">
            {ocrHistory.slice(1, 4).map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between px-2.5 py-1 rounded bg-surface-elevated text-xs text-slate-300 border border-surface-border"
              >
                <span className="truncate font-mono">"{item.text}"</span>
                <span className="text-[10px] text-emerald-400 font-mono">
                  {formatConfidence(item.confidence)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="sr-only" aria-live="polite">
        {current ? `OCR Recognized text: ${current.text}` : ''}
      </div>
    </section>
  );
}

