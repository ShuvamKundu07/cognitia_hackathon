import { useState, useRef, useCallback, useEffect } from 'react';
import { soundCues } from '../utils/audioUtils';
import { shouldTriggerAlert } from '../utils/hazardPriority';

export const SPEECH_PRIORITY = {
  CRITICAL: 5,
  HIGH: 4,
  MEDIUM: 3,
  WAKE_WORD: 2,
  LOW: 2,
  CONVERSATION: 1,
};

/**
 * Priority-Aware Text-To-Speech Engine with Safety Interruption.
 * Enforces CRITICAL > HIGH > MEDIUM > WAKE_WORD > CONVERSATION.
 * When a critical or high hazard arrives, active lower-priority speech is cancelled immediately.
 */
export function useSpeech({
  rate = 1.0,
  pitch = 1.0,
  volume = 1.0,
  enabled = true,
  cooldownMs = 8000,
  onSpeechStart = null,
  onSpeechEnd = null,
} = {}) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentPriority, setCurrentPriority] = useState(null);
  const [currentText, setCurrentText] = useState('');
  const [speechSupported] = useState(
    () => typeof window !== 'undefined' && 'speechSynthesis' in window
  );

  const speechQueueRef = useRef([]);
  const alertCacheRef = useRef(new Map());
  const currentUtteranceRef = useRef(null);
  const isSpeakingRef = useRef(false);
  const watchdogTimerRef = useRef(null);
  const processNextInQueueRef = useRef(null);
  const onSpeechStartRef = useRef(onSpeechStart);
  const onSpeechEndRef = useRef(onSpeechEnd);

  useEffect(() => {
    onSpeechStartRef.current = onSpeechStart;
  }, [onSpeechStart]);

  useEffect(() => {
    onSpeechEndRef.current = onSpeechEnd;
  }, [onSpeechEnd]);

  // Stop active speech and clear all queued speech
  const stop = useCallback(() => {
    speechQueueRef.current = [];
    currentUtteranceRef.current = null;
    isSpeakingRef.current = false;
    if (watchdogTimerRef.current) {
      clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
    if (typeof window !== 'undefined') {
      if (window._activeUtterances) {
        window._activeUtterances.clear();
      }
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    }
    setIsSpeaking(false);
    setCurrentPriority(null);
    setCurrentText('');
    if (onSpeechEndRef.current) {
      onSpeechEndRef.current();
    }
  }, []);

  const clearQueue = useCallback(() => {
    speechQueueRef.current = [];
  }, []);

  const processNextInQueue = useCallback(() => {
    if (!enabled || !speechSupported) return;
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    if (speechQueueRef.current.length === 0) {
      isSpeakingRef.current = false;
      currentUtteranceRef.current = null;
      setIsSpeaking(false);
      setCurrentPriority(null);
      setCurrentText('');
      if (onSpeechEndRef.current) {
        onSpeechEndRef.current();
      }
      return;
    }

    // Sort queue by priority descending
    speechQueueRef.current.sort((a, b) => b.priority - a.priority);
    const nextItem = speechQueueRef.current.shift();

    const utterance = new SpeechSynthesisUtterance(nextItem.text);
    utterance.rate = nextItem.rate || rate;
    utterance.pitch = nextItem.pitch || pitch;
    // Ensure speech sound is at full volume (louder and more prominent than alert notification chimes)
    utterance.volume = 1.0;

    if (typeof window !== 'undefined') {
      window._activeUtterances = window._activeUtterances || new Set();
      window._activeUtterances.add(utterance);
    }

    utterance.onstart = () => {
      isSpeakingRef.current = true;
      setIsSpeaking(true);
      setCurrentPriority(nextItem.priority);
      setCurrentText(nextItem.text);
      if (nextItem.onStart) {
        nextItem.onStart();
      }
      if (onSpeechStartRef.current) {
        onSpeechStartRef.current(nextItem);
      }
    };

    let finished = false;
    const handleFinished = () => {
      if (finished) return;
      finished = true;
      if (watchdogTimerRef.current) {
        clearTimeout(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
      if (typeof window !== 'undefined' && window._activeUtterances) {
        window._activeUtterances.delete(utterance);
      }
      currentUtteranceRef.current = null;

      // If no further speech is queued, clear speaking flags BEFORE executing onEnd callback
      if (speechQueueRef.current.length === 0) {
        isSpeakingRef.current = false;
        setIsSpeaking(false);
        setCurrentPriority(null);
        setCurrentText('');
        if (onSpeechEndRef.current) {
          try {
            onSpeechEndRef.current();
          } catch (e) {
            console.error('Error in onSpeechEnd callback:', e);
          }
        }
      }

      if (nextItem.onEnd) {
        try {
          nextItem.onEnd();
        } catch (e) {
          console.error('Error in onEnd speech callback:', e);
        }
      }
      if (processNextInQueueRef.current) {
        processNextInQueueRef.current();
      }
    };

    utterance.onend = handleFinished;
    utterance.onerror = (_e) => {
      handleFinished();
    };

    // Watchdog fallback in case Chrome/WebKit speech engine fails to fire onend
    const estDurationMs = Math.max(3500, nextItem.text.length * 100);
    watchdogTimerRef.current = setTimeout(() => {
      if (currentUtteranceRef.current === utterance) {
        console.debug('Speech watchdog timer fired for utterance:', nextItem.text);
        handleFinished();
      }
    }, estDurationMs);

    currentUtteranceRef.current = utterance;
    isSpeakingRef.current = true;

    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('speechSynthesis.speak error:', err);
      handleFinished();
    }
  }, [enabled, speechSupported, rate, pitch]);

  useEffect(() => {
    processNextInQueueRef.current = processNextInQueue;
  }, [processNextInQueue]);

  /**
   * Speak a message with strict safety prioritization and interruption.
   */
  const speak = useCallback(
    (text, options = {}) => {
      if (!text || !enabled || !speechSupported) return;

      const level = (options.priorityLevel || 'CONVERSATION').toUpperCase();
      const priority = SPEECH_PRIORITY[level] || SPEECH_PRIORITY.CONVERSATION;
      const hazardId = options.hazardId;

      // Deduplication check for hazard alerts and repeated speech to prevent spam
      const alertObj = {
        hazard_id: hazardId,
        message: text,
        hazard_type: options.hazardType,
        direction: options.direction,
        urgency: level.toLowerCase(),
      };
      if (!shouldTriggerAlert(alertObj, alertCacheRef.current, cooldownMs)) {
        return;
      }
      const record = {
        timestamp: Date.now(),
        urgency: level.toLowerCase(),
      };
      if (hazardId) {
        alertCacheRef.current.set(hazardId, record);
      }
      alertCacheRef.current.set(`msg_${text.trim().toLowerCase()}`, record);
      if (options.hazardType) {
        alertCacheRef.current.set(`sem_${(options.hazardType).toLowerCase()}_${(options.direction || 'ahead').toLowerCase()}`, record);
      }

      const isCritical = priority === SPEECH_PRIORITY.CRITICAL;
      const isHigherPriority = currentPriority !== null && priority > currentPriority;

      if (isCritical || isHigherPriority || options.interrupt) {
        if (isCritical) {
          soundCues.playCriticalAlert();
        } else if (priority === SPEECH_PRIORITY.HIGH) {
          soundCues.playWarningChime();
        }

        if (window.speechSynthesis) {
          window.speechSynthesis.cancel();
        }

        speechQueueRef.current = speechQueueRef.current.filter((item) => item.priority >= priority);
        speechQueueRef.current.unshift({
          text,
          priority,
          rate: options.rate || rate,
          pitch: options.pitch || pitch,
          volume: 1.0,
          onStart: options.onStart,
          onEnd: options.onEnd,
        });

        currentUtteranceRef.current = null;
        isSpeakingRef.current = false;
        // Brief 160ms pause so subtle notification cue sounds first without masking the initial spoken word
        setTimeout(() => {
          processNextInQueue();
        }, 160);
        return;
      }

      speechQueueRef.current.push({
        text,
        priority,
        rate: options.rate || rate,
        pitch: options.pitch || pitch,
        volume: options.volume || volume,
        onStart: options.onStart,
        onEnd: options.onEnd,
      });

      if (!isSpeakingRef.current && !currentUtteranceRef.current) {
        if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
        processNextInQueue();
      }
    },
    [enabled, speechSupported, cooldownMs, currentPriority, rate, pitch, volume, processNextInQueue]
  );

  return {
    speak,
    stop,
    cancelAllSpeech: stop,
    clearQueue,
    isSpeaking,
    currentPriority,
    currentText,
    speechSupported,
  };
}

