import { useState } from 'react';
import { VoiceButton } from './VoiceButton';
import { MessageSquare, Volume2, Send, AlertTriangle, Sparkles } from 'lucide-react';

export function Conversation({
  conversationState = 'IDLE',
  userTranscript = '',
  interimTranscript = '',
  assistantResponse = '',
  isListening: _isListening = false,
  onToggleListening,
  onSubmitText,
  onReplayResponse,
  isSpeaking = false,
  error = null,
}) {
  const [inputText, setInputText] = useState('');

  const handleTextSubmit = (e) => {
    e.preventDefault();
    if (inputText.trim() && onSubmitText) {
      onSubmitText(inputText.trim());
      setInputText('');
    }
  };

  const quickPrompts = [
    'Hey Bro',
    'What does that sign say?',
    'Is it safe to cross?',
    'Is there anything in front of me?',
    'Where is it?',
    'Thank you',
  ];

  const getStateDisplay = (state) => {
    switch (state) {
      case 'ACTIVATING':
        return { label: 'Bro: Activating...', color: 'bg-indigo-950 text-indigo-400 border-indigo-500 animate-pulse' };
      case 'LISTENING':
        return { label: 'Bro: Listening...', color: 'bg-emerald-950 text-emerald-400 border-emerald-500 animate-pulse' };
      case 'PROCESSING':
      case 'THINKING':
        return { label: 'Bro: Thinking...', color: 'bg-amber-950 text-amber-400 border-amber-500 animate-pulse' };
      case 'SPEAKING':
        return { label: 'Bro: Speaking...', color: 'bg-sky-950 text-sky-400 border-sky-500 animate-pulse' };
      case 'INTERRUPTED':
        return { label: 'Bro: Interrupted for Safety', color: 'bg-red-950 text-red-400 border-red-500' };
      case 'IDLE':
      default:
        return { label: 'Bro: Sleeping (Mic Off)', color: 'bg-surface-darkest text-slate-400 border-surface-border' };
    }
  };

  const stateDisplay = getStateDisplay(conversationState);

  return (
    <section
      aria-labelledby="assistant-heading"
      className="flex flex-col bg-surface-card border-2 border-surface-border rounded-xl overflow-hidden shadow-2xl"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 py-3 bg-surface-elevated border-b border-surface-border gap-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-sky-400" aria-hidden="true" />
          <div>
            <h2 id="assistant-heading" className="text-base font-bold text-white tracking-wide flex items-center gap-2">
              BRO <span className="text-xs font-normal text-slate-400 hidden sm:inline">— Conversational Assistant</span>
            </h2>
            <p className="text-[11px] text-slate-400">
              Say <span className="text-sky-300 font-semibold">"Hey Bro"</span> to activate &bull; Say <span className="text-sky-300 font-semibold">"Thank you"</span> to finish
            </p>
          </div>
        </div>

        {/* State Badge */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span
            className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${stateDisplay.color}`}
          >
            {stateDisplay.label}
          </span>
        </div>
      </div>

      {/* Safety Interruption Notice */}
      {conversationState === 'INTERRUPTED' && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-950 border-b border-red-800 text-red-200 text-xs font-bold animate-pulse">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span>Priority safety alert preempted conversation. Bro will resume after alert completes.</span>
        </div>
      )}

      {/* Conversation Thread Area */}
      <div className="p-4 flex flex-col gap-3 min-h-[160px] max-h-[220px] overflow-y-auto bg-surface-darkest/60">
        {(userTranscript || interimTranscript) && (
          <div className="flex flex-col items-end">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              You
            </div>
            <div className="max-w-[85%] p-3 rounded-2xl rounded-tr-none bg-sky-600 text-white font-semibold text-sm md:text-base shadow-md">
              {interimTranscript ? (
                <span>
                  {interimTranscript}
                  <span className="italic opacity-75 animate-pulse"> ...</span>
                </span>
              ) : (
                userTranscript
              )}
            </div>
          </div>
        )}

        {assistantResponse && (
          <div className="flex flex-col items-start">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wider">
                Bro
              </span>
              {onReplayResponse && (
                <button
                  type="button"
                  onClick={() => onReplayResponse(assistantResponse)}
                  className="p-1 text-slate-400 hover:text-white rounded focus:ring-2 focus:ring-sky-400"
                  aria-label="Replay Bro voice response"
                  title="Replay voice response"
                >
                  <Volume2 className={`w-3.5 h-3.5 ${isSpeaking ? 'text-sky-400 animate-pulse' : ''}`} />
                </button>
              )}
            </div>
            <div className="max-w-[90%] p-3.5 rounded-2xl rounded-tl-none bg-surface-elevated border-2 border-surface-border text-white text-sm md:text-base font-medium shadow-md">
              {assistantResponse}
            </div>
          </div>
        )}

        {!userTranscript && !interimTranscript && !assistantResponse && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 text-center py-6">
            <Sparkles className="w-8 h-8 text-sky-400/60 mb-2" />
            <p className="text-sm font-semibold text-slate-300">
              Say &ldquo;Hey Bro&rdquo; to begin a conversation
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Ask about signs, crossing safety, or obstacles. Hazard detection continues uninterrupted.
            </p>
          </div>
        )}

        {error && (
          <div className="p-2.5 rounded-lg bg-red-950/80 border border-red-500 text-red-200 text-xs">
            {error}
          </div>
        )}
      </div>

      {/* Quick Inquiry Chips */}
      <div className="px-4 py-2 border-t border-surface-border bg-surface-elevated flex items-center gap-2 overflow-x-auto">
        <span className="text-[11px] font-bold text-slate-400 whitespace-nowrap">
          Quick Inquiries:
        </span>
        {quickPrompts.map((prompt, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSubmitText && onSubmitText(prompt)}
            className="px-2.5 py-1 text-xs font-semibold bg-surface-card hover:bg-surface-hover border border-surface-border text-slate-200 rounded-full whitespace-nowrap transition-colors focus:ring-2 focus:ring-sky-400"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Bottom Controls */}
      <div className="p-4 bg-surface-card border-t border-surface-border flex flex-col md:flex-row items-center gap-4">
        <VoiceButton
          isListening={conversationState === 'LISTENING'}
          isProcessing={conversationState === 'PROCESSING' || conversationState === 'THINKING'}
          isActivating={conversationState === 'ACTIVATING'}
          isSpeaking={isSpeaking || conversationState === 'SPEAKING'}
          onClick={onToggleListening}
          error={error}
        />

        <form onSubmit={handleTextSubmit} className="flex-1 flex items-center gap-2 w-full">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder='Ask Bro (e.g. "Is there anything in front of me?")...'
            className="flex-1 bg-surface-darkest border-2 border-surface-border rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400"
            aria-label="Ask Bro a question"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="px-4 py-3 bg-surface-elevated hover:bg-surface-hover disabled:opacity-40 text-sky-400 font-bold rounded-xl border-2 border-surface-border transition-colors focus:ring-2 focus:ring-sky-400"
            aria-label="Send question to Bro"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>

      <div className="sr-only" aria-live="polite">
        {assistantResponse ? `Bro response: ${assistantResponse}` : ''}
      </div>
    </section>
  );
}

