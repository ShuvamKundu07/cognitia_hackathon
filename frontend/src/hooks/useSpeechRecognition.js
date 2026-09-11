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
    if (isSpeaking) {
      speechCooldownUntilRef.current = Date.now() + 60000; // Cleared when isSpeaking becomes false
    } else if (wasSpeaking) {
      // Transitioned from speaking to silent: small 250ms grace period for speaker reverb
      speechCooldownUntilRef.current = Date.now() + 250;
    } else {
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

  const restartRecognition = useCallback(() => {
    if (!shouldListenRef.current || !recognitionRef.current) return;
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);

    restartTimerRef.current = setTimeout(() => {
      if (!shouldListenRef.current || !recognitionRef.current) return;
      try {
        recognitionRef.current.start();
      } catch (err) {
        // If already started or browser is busy, ignore
        if (err.name !== 'InvalidStateError') {
          console.debug('Speech recognition restart caught:', err);
        }
      }
    }, 150);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang =
      (typeof navigator !== 'undefined' && (navigator.language || navigator.userLanguage)) ||
      'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event) => {
      // Self-voice suppression: ignore any recognition while assistant or alert is speaking
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

        // Continuous mode auto-finalization:
        // In Chrome/WebKit, continuous mode emits interim deltas but often delays or never sets isFinal.
        // A 850ms silence debounce auto-finalizes the conversational question.
        if (interimTimerRef.current) {
          clearTimeout(interimTimerRef.current);
        }
        const candidateInterim = interim.trim();
        if (candidateInterim) {
          interimTimerRef.current = setTimeout(() => {
            const now = Date.now();
            if (
              candidateInterim &&
              (candidateInterim !== lastProcessedRef.current.text ||
                now - lastProcessedRef.current.timestamp > 1500)
            ) {
              lastProcessedRef.current = { text: candidateInterim, timestamp: now };
              setTranscript(candidateInterim);
              setInterimTranscript('');
              if (onCompleteRef.current) {
                console.log('[SpeechRecognition] Auto-finalized interim query:', candidateInterim);
                onCompleteRef.current(candidateInterim);
              }
            }
          }, 850);
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
          (cleanFinal !== lastProcessedRef.current.text ||
            now - lastProcessedRef.current.timestamp > 1500)
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
        shouldListenRef.current = false;
        setIsListening(false);
        setError('Microphone permission blocked for speech recognition.');
      } else if (event.error === 'no-speech') {
        // Normal in continuous mode; do not surface noisy error
      } else if (event.error === 'aborted') {
        // Intentional abort / restart
      } else {
        setError(`Recognition notice: ${event.error}`);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      if (shouldListenRef.current) {
        restartRecognition();
      }
    };

    recognitionRef.current = recognition;

    if (autoStart) {
      shouldListenRef.current = true;
      try {
        recognition.start();
      } catch (_e) {
        // ignore
      }
    }

    return () => {
      shouldListenRef.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      if (interimTimerRef.current) clearTimeout(interimTimerRef.current);
      try {
        recognition.abort();
      } catch (_e) {
        // ignore
      }
    };
  }, [autoStart, restartRecognition]);

  const startListening = useCallback(
    (withTone = true) => {
      if (!isSupported || !recognitionRef.current) {
        setError('Speech recognition is not supported in this browser. Please type your query.');
        return;
      }
      setError(null);
      shouldListenRef.current = true;
      speechCooldownUntilRef.current = 0;
      try {
        recognitionRef.current.start();
        if (withTone) {
          soundCues.playMicStart();
        }
      } catch (err) {
        if (err.name !== 'InvalidStateError') {
          setError(`Could not start speech recognition: ${err.message}`);
        }
      }
    },
    [isSupported]
  );

  const ensureListening = useCallback(() => {
    if (!isSupported || !recognitionRef.current) return;
    shouldListenRef.current = true;
    speechCooldownUntilRef.current = 0;
    try {
      recognitionRef.current.start();
      soundCues.playMicStart();
    } catch (err) {
      // If already running, ignore InvalidStateError
      if (err.name !== 'InvalidStateError') {
        setError(`Could not start speech recognition: ${err.message}`);
        console.debug('ensureListening start note:', err);
      }
    }
  }, [isSupported]);

  const stopListening = useCallback(() => {
    shouldListenRef.current = false;
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    if (interimTimerRef.current) clearTimeout(interimTimerRef.current);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (_e) {
        // ignore
      }
    }
    setIsListening(false);
  }, []);

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

