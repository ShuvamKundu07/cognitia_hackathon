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
    if (currentUtteranceRef.current) {
      currentUtteranceRef.current.onend = null;
      currentUtteranceRef.current.onerror = null;
    }
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
        try {
          window.speechSynthesis.cancel();
        } catch (_e) {}
      }
    }
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
    setIsSpeaking(true);
    setCurrentPriority(nextItem.priority);
    setCurrentText(nextItem.text);

    try {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        try {
          window.speechSynthesis.resume();
        } catch (_e) {}
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

  // Periodic safeguard to unpause Chrome Web Speech API if it silently stalls
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const interval = setInterval(() => {
      if (isSpeakingRef.current && window.speechSynthesis.paused) {
        try {
          window.speechSynthesis.resume();
        } catch (_e) {}
      }
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  /**
   * Speak a message with strict safety prioritization and interruption.
   */
  const speak = useCallback(
    (text, options = {}) => {
      if (!text || !enabled || !speechSupported) {
        if (options.onEnd) {
          setTimeout(options.onEnd, 0);
        }
        return;
      }

      const level = (options.priorityLevel || 'CONVERSATION').toUpperCase();
      const priority = SPEECH_PRIORITY[level] || SPEECH_PRIORITY.CONVERSATION;
      const hazardId = options.hazardId;
      const isConversational = level === 'CONVERSATION' || level === 'WAKE_WORD';

      // Deduplication check: ONLY applied to hazard alerts (never block conversational assistant dialogue)
      if (!isConversational) {
        const alertObj = {
          hazard_id: hazardId,
          message: text,
          hazard_type: options.hazardType,
          direction: options.direction,
          urgency: level.toLowerCase(),
        };
        if (!shouldTriggerAlert(alertObj, alertCacheRef.current, cooldownMs)) {
          if (options.onEnd) {
            setTimeout(options.onEnd, 0);
          }
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
      }

      const isCritical = priority === SPEECH_PRIORITY.CRITICAL;
      const isHigherPriority = currentPriority !== null && priority > currentPriority;
      // An active CRITICAL emergency alert must NEVER be interrupted by a lower-priority detection
      const isCurrentlyCritical = currentPriority === SPEECH_PRIORITY.CRITICAL;
      // Conversational responses and wake words preempt previous conversational speech
      const isConversationalPreemption = isConversational && (currentPriority === null || currentPriority <= SPEECH_PRIORITY.WAKE_WORD);
      const canInterrupt = !isCurrentlyCritical && (
        isCritical ||
        isHigherPriority ||
        isConversationalPreemption ||
        (options.interrupt && priority >= (currentPriority || 0))
      );

      if (isCritical || canInterrupt) {
        if (isCritical) {
          soundCues.playCriticalAlert();
        } else if (priority === SPEECH_PRIORITY.HIGH) {
          soundCues.playWarningChime();
        }

        // Detach listeners from currently active utterance before cancelling
        // so its onend/onerror does not fire stale callbacks or cause race conditions
        if (currentUtteranceRef.current) {
          currentUtteranceRef.current.onend = null;
          currentUtteranceRef.current.onerror = null;
        }

        if (watchdogTimerRef.current) {
          clearTimeout(watchdogTimerRef.current);
          watchdogTimerRef.current = null;
        }

        if (typeof window !== 'undefined' && window.speechSynthesis) {
          try {
            window.speechSynthesis.cancel();
          } catch (_e) {}
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
        const delayMs = isCritical ? 160 : (priority === SPEECH_PRIORITY.HIGH ? 120 : 25);
        setTimeout(() => {
          processNextInQueue();
        }, delayMs);
        return;
      }

      // If a critical alert is actively speaking, drop lower-priority alerts rather than queuing to speak afterwards
      if (isCurrentlyCritical && !isCritical) {
        if (options.onEnd) {
          setTimeout(options.onEnd, 0);
        }
        return;
      }

      // Avoid speaking too many alerts back-to-back by capping queued non-critical speech
      if (speechQueueRef.current.length >= 2) {
        const droppedItems = speechQueueRef.current.filter((item) => item.priority < priority);
        droppedItems.forEach((item) => {
          if (item.onEnd) {
            setTimeout(item.onEnd, 0);
          }
        });
        speechQueueRef.current = speechQueueRef.current.filter((item) => item.priority >= priority).slice(0, 1);
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
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          try {
            window.speechSynthesis.resume();
          } catch (_e) {}
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

