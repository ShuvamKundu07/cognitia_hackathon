import { useState, useEffect, useRef, useCallback } from 'react';
import { soundCues } from '../utils/audioUtils';

/**
 * Enhanced Browser SpeechRecognition hook for Gene.
 * Supports continuous background listening, automatic restart,
 * and self-voice suppression when assistant or hazard alerts are speaking.
 * interim speech auto-finalization, and self-voice suppression when assistant speaks.
 */
export function useSpeechRecognition({
  onTranscriptComplete,
  onInterimTranscript,
  isSpeaking = false,
  autoStart = false,
} = {}) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isSupported] = useState(
    () =>
      typeof window !== 'undefined' &&
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
  );
  const [error, setError] = useState(null);

  const recognitionRef = useRef(null);
  const onCompleteRef = useRef(onTranscriptComplete);
  const onInterimRef = useRef(onInterimTranscript);
  const isSpeakingRef = useRef(isSpeaking);
  const shouldListenRef = useRef(false);
  const restartTimerRef = useRef(null);
  const interimTimerRef = useRef(null);
  const lastProcessedRef = useRef({ text: '', timestamp: 0 });
  const speechCooldownUntilRef = useRef(0);

  useEffect(() => {
    onCompleteRef.current = onTranscriptComplete;
  }, [onTranscriptComplete]);

  useEffect(() => {
    onInterimRef.current = onInterimTranscript;
  }, [onInterimTranscript]);

  useEffect(() => {
    const wasSpeaking = isSpeakingRef.current;
    isSpeakingRef.current = isSpeaking;
    if (wasSpeaking && !isSpeaking) {
      // 350ms grace period after Bro stops speaking so speaker audio echo doesn't trigger the microphone
      speechCooldownUntilRef.current = Date.now() + 350;
    } else if (!isSpeaking) {
      if (speechCooldownUntilRef.current <= Date.now()) {
        speechCooldownUntilRef.current = 0;
      }
    }
  }, [isSpeaking]);

  const clearCooldown = useCallback(() => {
    speechCooldownUntilRef.current = 0;
  }, []);

  const clearTranscripts = useCallback(() => {
    if (interimTimerRef.current) {
      clearTimeout(interimTimerRef.current);
      interimTimerRef.current = null;
    }
    setTranscript('');
    setInterimTranscript('');
  }, []);

  // Safely stop and discard active recognition instance
  const stopSession = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (interimTimerRef.current) {
      clearTimeout(interimTimerRef.current);
      interimTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch (_e) {
        // ignore
      }
      recognitionRef.current = null;
    }
  }, []);

  // Start fresh recognition session with optional permission bootstrapping
  const startSession = useCallback(
    async (withTone = false, isUserInitiated = false) => {
      if (typeof window === 'undefined') return;
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setError('Speech recognition is not supported in this browser. Please type your query.');
        return;
      }

      shouldListenRef.current = true;
      speechCooldownUntilRef.current = 0;

      // Clean up previous instance before creating a new one
      stopSession();

      // If user clicked or pressed space, trigger getUserMedia to prompt for microphone permission
      if (isUserInitiated && typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((track) => track.stop());
          setError(null);
        } catch (permErr) {
          if (permErr.name === 'NotAllowedError' || permErr.name === 'PermissionDeniedError') {
            setError('Microphone permission blocked. Please allow microphone access in your browser address bar.');
            shouldListenRef.current = false;
            setIsListening(false);
            return;
          }
        }
      }

      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        recognition.lang =
          (typeof navigator !== 'undefined' && (navigator.language || navigator.userLanguage)) ||
          'en-US';

        recognition.onstart = () => {
          setIsListening(true);
          setError(null);
          if (withTone) {
            soundCues.playMicStart();
          }
        };

        recognition.onresult = (event) => {
          // Self-voice suppression: ignore input while assistant or alarm is actively speaking
          if (isSpeakingRef.current || Date.now() < speechCooldownUntilRef.current) {
            return;
          }

          let interim = '';
          let final = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const item = event.results[i];
            if (item.isFinal) {
              final += item[0].transcript;
            } else {
              interim += item[0].transcript;
            }
          }

          if (interim) {
            setInterimTranscript(interim);
            if (onInterimRef.current) {
              onInterimRef.current(interim);
            }

            // Silence debounce: auto-finalize interim speech in continuous mode
            if (interimTimerRef.current) {
              clearTimeout(interimTimerRef.current);
            }
            const candidateInterim = interim.trim();
            if (candidateInterim) {
              interimTimerRef.current = setTimeout(() => {
                const now = Date.now();
                if (
                  candidateInterim &&
                  (candidateInterim.toLowerCase() !== lastProcessedRef.current.text.toLowerCase() ||
                    now - lastProcessedRef.current.timestamp > 1000)
                ) {
                  lastProcessedRef.current = { text: candidateInterim, timestamp: now };
                  setTranscript(candidateInterim);
                  setInterimTranscript('');
                  if (onCompleteRef.current) {
                    console.log('[SpeechRecognition] Auto-finalized interim query:', candidateInterim);
                    onCompleteRef.current(candidateInterim);
                  }
                }
              }, 750);
            }
          }

          if (final) {
            if (interimTimerRef.current) {
              clearTimeout(interimTimerRef.current);
              interimTimerRef.current = null;
            }
            const cleanFinal = final.trim();
            const now = Date.now();
            if (
              cleanFinal &&
              (cleanFinal.toLowerCase() !== lastProcessedRef.current.text.toLowerCase() ||
                now - lastProcessedRef.current.timestamp > 1000)
            ) {
              lastProcessedRef.current = { text: cleanFinal, timestamp: now };
              setTranscript(cleanFinal);
              setInterimTranscript('');
              if (onCompleteRef.current) {
                console.log('[SpeechRecognition] Final transcript received:', cleanFinal);
                onCompleteRef.current(cleanFinal);
              }
            }
          }
        };

        recognition.onerror = (event) => {
          if (event.error === 'not-allowed') {
            // Only flag hard error if user explicitly initiated
            if (isUserInitiated) {
              shouldListenRef.current = false;
              setIsListening(false);
              setError('Microphone permission blocked. Please click the mic button or allow access in the address bar.');
            } else {
              // Silently pause auto-listen until first user gesture
              setIsListening(false);
            }
          } else if (event.error === 'no-speech') {
            // Normal in continuous mode when silent
          } else if (event.error === 'aborted') {
            // Normal session restart
          } else {
            console.debug('Speech recognition event note:', event.error);
          }
        };

        recognition.onend = () => {
          setIsListening(false);
          // Auto-restart with fresh instance if continuous listening should remain active
          if (shouldListenRef.current) {
            if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
            restartTimerRef.current = setTimeout(() => {
              if (shouldListenRef.current) {
                startSession(false, false);
              }
            }, 120);
          }
        };

        recognitionRef.current = recognition;
        recognition.start();
      } catch (err) {
        if (err.name !== 'InvalidStateError') {
          console.debug('Speech recognition start error:', err);
        }
      }
    },
    [stopSession]
  );

  // Auto-start on mount or upon first interaction
  useEffect(() => {
    if (!autoStart || !isSupported) return;

    // Attempt initial start
    startSession(false, false);

    // If browser required a user gesture, resume upon first click or keypress
    const onFirstGesture = () => {
      if (shouldListenRef.current && !isListening) {
        startSession(false, false);
      }
    };
    window.addEventListener('click', onFirstGesture, { once: true });
    window.addEventListener('keydown', onFirstGesture, { once: true });

    return () => {
      shouldListenRef.current = false;
      stopSession();
      window.removeEventListener('click', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);
    };
  }, [autoStart, isSupported, startSession, stopSession]);

  const startListening = useCallback(
    (withTone = true) => {
      setError(null);
      startSession(withTone, true);
    },
    [startSession]
  );

  const ensureListening = useCallback(() => {
    if (!shouldListenRef.current || !isListening) {
      startSession(false, false);
    }
  }, [isListening, startSession]);

  const stopListening = useCallback(() => {
    shouldListenRef.current = false;
    stopSession();
    setIsListening(false);
  }, [stopSession]);

  return {
    isListening,
    transcript,
    interimTranscript,
    isSupported,
    error,
    startListening,
    ensureListening,
    stopListening,
    clearCooldown,
    clearTranscripts,
  };
}

