import { Mic, MicOff, Loader2, Volume2 } from 'lucide-react';

export function VoiceButton({
  isListening = false,
  isProcessing = false,
  isActivating = false,
  isSpeaking = false,
  onClick,
  disabled = false,
  _error = null,
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`relative flex items-center justify-center w-16 h-16 rounded-2xl font-bold transition-all shadow-xl focus:outline-none focus:ring-4 focus:ring-sky-400 ${
          disabled
            ? 'bg-slate-800 text-slate-500 cursor-not-allowed border-2 border-slate-700'
            : isListening
            ? 'bg-emerald-600 hover:bg-emerald-500 text-white ring-8 ring-emerald-500/40 animate-pulse border-2 border-white'
            : isActivating
            ? 'bg-indigo-600 text-white border-2 border-indigo-400 animate-pulse'
            : isProcessing
            ? 'bg-amber-600 text-white border-2 border-amber-400'
            : isSpeaking
            ? 'bg-sky-600 text-white border-2 border-sky-300 animate-pulse'
            : 'bg-surface-elevated hover:bg-surface-hover text-slate-300 hover:text-white border-2 border-surface-border hover:border-sky-400'
        }`}
        aria-label={
          isListening
            ? 'Microphone is ON. Bro is listening to you. Click to stop.'
            : isActivating
            ? 'Bro is activating...'
            : isProcessing
            ? 'Bro is thinking...'
            : isSpeaking
            ? 'Bro is speaking...'
            : 'Microphone is OFF. Say "Hey Bro" or click to start conversation.'
        }
        aria-pressed={isListening}
      >
        {isListening ? (
          <Mic className="w-8 h-8 animate-pulse text-white" />
        ) : isActivating || isProcessing ? (
          <Loader2 className="w-8 h-8 animate-spin text-white" />
        ) : isSpeaking ? (
          <Volume2 className="w-8 h-8 animate-pulse text-white" />
        ) : (
          <MicOff className="w-7 h-7 text-slate-400 group-hover:text-white" />
        )}
      </button>

      <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider text-center">
        {isListening
          ? 'Listening (Mic ON)'
          : isActivating
          ? 'Activating...'
          : isProcessing
          ? 'Thinking...'
          : isSpeaking
          ? 'Speaking...'
          : 'Click to Talk • or Say "Hey Bro"'}
      </span>
    </div>
  );
}

