import { useState, useEffect, useRef, useCallback } from 'react';
import { GENE_CONFIG, isWakePhrase, isExitPhrase } from '../utils/geneConfig';
import { soundCues } from '../utils/audioUtils';
import { useSpeechRecognition } from './useSpeechRecognition';
import { executeVoiceCommand } from '../utils/voiceCommands';

export const GENE_STATE = {
  IDLE: 'IDLE',
  ACTIVATING: 'ACTIVATING',
  LISTENING: 'LISTENING',
  THINKING: 'THINKING',
  SPEAKING: 'SPEAKING',
  INTERRUPTED: 'INTERRUPTED',
};

/**
 * High-Level State Machine Hook for Gene Conversational Assistant.
 * Coordinates continuous listening, wake-word activation, exit phrases,
 * 10s silence timeouts, self-voice suppression, and safety preemption.
 */
export function useGeneAssistant({
  speak,
  cancelAllSpeech,
  isSpeaking,
  sendConversation,
  sendWakeWord,
  sendConversationStatus,
  enabled = true,
  voiceContext = {},
}) {
  const [geneState, setGeneState] = useState(GENE_STATE.IDLE);
  const [userTranscript, setUserTranscript] = useState('');
  const [assistantResponse, setAssistantResponse] = useState('');

  const geneStateRef = useRef(geneState);
  const voiceContextRef = useRef(voiceContext);

  useEffect(() => {
    geneStateRef.current = geneState;
  }, [geneState]);

  useEffect(() => {
    voiceContextRef.current = voiceContext;
  }, [voiceContext]);

  const silenceTimerRef = useRef(null);
  const presenceRetryTimerRef = useRef(null);
  const resumeStateRef = useRef(null);

  // Clear silence timers helper
  const clearSilenceTimers = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (presenceRetryTimerRef.current) {
      clearTimeout(presenceRetryTimerRef.current);
      presenceRetryTimerRef.current = null;
    }
  }, []);

  // Update backend conversation status
  const updateState = useCallback(
    (newState) => {
      setGeneState(newState);
      geneStateRef.current = newState;
      if (sendConversationStatus) {
        sendConversationStatus(newState);
      }
    },
    [sendConversationStatus]
  );

  // Start 10-second silence timer for LISTENING state
  const startSilenceTimer = useCallback(() => {
    clearSilenceTimers();

    silenceTimerRef.current = setTimeout(() => {
      if (geneStateRef.current !== GENE_STATE.LISTENING) return;

      // Ask: "Are you still there?"
      speak('Are you still there?', {
        priorityLevel: 'CONVERSATION',
        onEnd: () => {
          // Wait 5 seconds for response
          presenceRetryTimerRef.current = setTimeout(() => {
            if (geneStateRef.current !== GENE_STATE.LISTENING) return;

            speak("I'll keep monitoring your surroundings.", {
              priorityLevel: 'CONVERSATION',
              onEnd: () => {
                updateState(GENE_STATE.IDLE);
              },
            });
            updateState(GENE_STATE.IDLE);
          }, GENE_CONFIG.PRESENCE_RETRY_TIMEOUT_MS);
        },
      });
    }, GENE_CONFIG.SILENCE_TIMEOUT_MS);
  }, [clearSilenceTimers, speak, updateState]);

  const startListeningRef = useRef(null);
  const ensureListeningRef = useRef(null);
  const clearCooldownRef = useRef(null);
  const clearTranscriptsRef = useRef(null);

  // Transition Gene to continuous LISTENING mode
  const transitionToListening = useCallback(() => {
    updateState(GENE_STATE.LISTENING);
    if (clearCooldownRef.current) {
      clearCooldownRef.current();
    }
    if (clearTranscriptsRef.current) {
      clearTranscriptsRef.current();
    }
    startSilenceTimer();
    if (ensureListeningRef.current) {
      ensureListeningRef.current();
    } else if (startListeningRef.current) {
      startListeningRef.current(false);
    }
  }, [updateState, startSilenceTimer]);

  // Transition Gene to IDLE sleeping mode
  const transitionToIdle = useCallback(
    (farewellMessage = "You're welcome. I'll keep monitoring your surroundings.") => {
      clearSilenceTimers();
      if (farewellMessage) {
        speak(farewellMessage, {
          priorityLevel: 'CONVERSATION',
          onEnd: () => {
            updateState(GENE_STATE.IDLE);
          },
        });
      } else {
        if (cancelAllSpeech) {
          cancelAllSpeech();
        }
      }
      updateState(GENE_STATE.IDLE);
    },
    [clearSilenceTimers, speak, updateState, cancelAllSpeech]
  );

  // Wake up Gene ("Hey Bro")
  const activateGene = useCallback(() => {
    clearSilenceTimers();
    if (soundCues.playWakeWord) {
      soundCues.playWakeWord();
    }
    updateState(GENE_STATE.ACTIVATING);

    if (sendWakeWord) {
      sendWakeWord('hey bro');
    }

    const wakeReply = 'Yes, how can I help you?';
    setAssistantResponse(wakeReply);

    speak(wakeReply, {
      priorityLevel: 'WAKE_WORD',
      onEnd: () => {
        transitionToListening();
      },
    });
  }, [clearSilenceTimers, updateState, sendWakeWord, speak, transitionToListening]);

  // Process user speech transcript
  const handleTranscript = useCallback(
    (text) => {
      if (!text || !enabled) return;
      const cleanText = text.trim();
      if (!cleanText) return;

      const currentState = geneStateRef.current;
      console.log(`[GENE ASSISTANT] Received transcript: "${cleanText}" in state: ${currentState}`);

      // 1. In IDLE state: strictly evaluate for wake word ("Hey Bro" / "Hello Bro")
      if (currentState === GENE_STATE.IDLE) {
        if (isWakePhrase(cleanText)) {
          setUserTranscript(cleanText);
          const stripped = cleanText
            .replace(/^(?:hey|hay|hi|hello|ok|okay)?\s*(?:bro|gene)[,\s]*/i, '')
            .trim();

          if (stripped && !isExitPhrase(stripped)) {
            clearSilenceTimers();

            // Check if user requested a button command (e.g. "turn on the camera")
            const cmdResult = executeVoiceCommand(stripped, voiceContextRef.current);
            if (cmdResult && cmdResult.handled) {
              updateState(GENE_STATE.SPEAKING);
              setAssistantResponse(cmdResult.response);
              speak(cmdResult.response, {
                priorityLevel: 'CONVERSATION',
                onEnd: () => {
                  transitionToListening();
                },
              });
              return;
            }

            updateState(GENE_STATE.THINKING);
            if (sendWakeWord) {
              sendWakeWord('hey bro');
            }
            if (sendConversation) {
              console.log('[GENE ASSISTANT] Spoken inquiry from IDLE:', stripped);
              sendConversation(stripped);
            }
            return;
          }

          activateGene();
        }
        return;
      }

      // 2. In LISTENING, ACTIVATING, or THINKING state
      if (
        currentState === GENE_STATE.LISTENING ||
        currentState === GENE_STATE.ACTIVATING ||
        currentState === GENE_STATE.THINKING
      ) {
        clearSilenceTimers();

        // Check for termination intent ("Thank you", "that's all", "stop")
        if (isExitPhrase(cleanText)) {
          setUserTranscript(cleanText);
          transitionToIdle("You're welcome. I'll keep monitoring your surroundings.");
          return;
        }

        // If user says "hey bro" / "hello bro" while already active, check if there is an inquiry attached
        const strippedQuery = cleanText
          .replace(/^(?:hey|hay|hi|hello|ok|okay)?\s*(?:bro|gene)[,\s]*/i, '')
          .trim();

        if (!strippedQuery) {
          // User only repeated wake word
          activateGene();
          return;
        }

        // Active inquiry from user - check button voice commands first
        const queryToSend = strippedQuery || cleanText;
        setUserTranscript(cleanText);

        const cmdResult = executeVoiceCommand(queryToSend, voiceContextRef.current);
        if (cmdResult && cmdResult.handled) {
          updateState(GENE_STATE.SPEAKING);
          setAssistantResponse(cmdResult.response);
          speak(cmdResult.response, {
            priorityLevel: 'CONVERSATION',
            onEnd: () => {
              transitionToListening();
            },
          });
          return;
        }

        updateState(GENE_STATE.THINKING);
        if (sendConversation) {
          console.log('[GENE ASSISTANT] Dispatching conversation query:', queryToSend);
          sendConversation(queryToSend);
        }
      }
    },
    [enabled, activateGene, clearSilenceTimers, transitionToIdle, updateState, sendConversation, sendWakeWord, speak, transitionToListening]
  );

  // External query submission (text box, quick chips, or API)
  const submitQuery = useCallback(
    (query) => {
      if (!query) return;
      clearSilenceTimers();

      let stripped = '';
      if (isWakePhrase(query)) {
        stripped = query
          .replace(/^(?:hey|hay|hi|hello|ok|okay)?\s*(?:bro|gene)[,\s]*/i, '')
          .trim();
        if (!stripped) {
          setUserTranscript(query);
          activateGene();
          return;
        }
      }

      if (isExitPhrase(query)) {
        setUserTranscript(query);
        transitionToIdle("You're welcome. I'll keep monitoring your surroundings.");
        return;
      }

      // Check if user requested a button command
      const queryToCheck = stripped || query;
      const cmdResult = executeVoiceCommand(queryToCheck, voiceContextRef.current);
      if (cmdResult && cmdResult.handled) {
        setUserTranscript(query);
        updateState(GENE_STATE.SPEAKING);
        setAssistantResponse(cmdResult.response);
        speak(cmdResult.response, {
          priorityLevel: 'CONVERSATION',
          onEnd: () => {
            transitionToListening();
          },
        });
        return;
      }

      setUserTranscript(query);
      updateState(GENE_STATE.THINKING);

      if (sendConversation) {
        sendConversation(query);
      }
    },
    [clearSilenceTimers, activateGene, transitionToIdle, updateState, sendConversation, speak, transitionToListening]
  );

  // Backend Assistant Response Handler
  const handleAssistantResponse = useCallback(
    (responseMsg) => {
      const text = typeof responseMsg === 'string' ? responseMsg : responseMsg.text;

      // If this is an acknowledgment for the wake word, it was already spoken by activateGene()
      if (responseMsg?.status === 'wake_word_ack') {
        return;
      }

      const isExit = responseMsg?.is_exit || (userTranscript && isExitPhrase(userTranscript));

      setAssistantResponse(text);

      if (isExit) {
        speak(text, {
          priorityLevel: 'CONVERSATION',
          onEnd: () => {
            updateState(GENE_STATE.IDLE);
          },
        });
        updateState(GENE_STATE.IDLE);
        return;
      }

      updateState(GENE_STATE.SPEAKING);

      speak(text, {
        priorityLevel: 'CONVERSATION',
        onEnd: () => {
          transitionToListening();
        },
      });
    },
    [userTranscript, speak, updateState, transitionToListening]
  );

  // Safety Preemption Interruption
  const handleSafetyInterruption = useCallback(
    (alert) => {
      clearSilenceTimers();

      // Cancel any ongoing Gene speech immediately
      if (cancelAllSpeech) {
        cancelAllSpeech();
      }

      // Record prior state so we know if user was talking with Gene
      if (geneStateRef.current !== GENE_STATE.IDLE) {
        resumeStateRef.current = geneStateRef.current;
        updateState(GENE_STATE.INTERRUPTED);
      }

      // Speak critical or high hazard alert
      const urgency = (alert.urgency || 'high').toUpperCase();
      speak(alert.message, {
        priorityLevel: urgency,
        hazardId: alert.hazard_id,
        interrupt: true,
        onEnd: () => {
          // If conversation was active, smoothly return to LISTENING
          if (resumeStateRef.current && resumeStateRef.current !== GENE_STATE.IDLE) {
            setTimeout(() => {
              transitionToListening();
              resumeStateRef.current = null;
            }, 600);
          }
        },
      });
    },
    [clearSilenceTimers, cancelAllSpeech, updateState, speak, transitionToListening]
  );

  // Initialize continuous Speech Recognition
  const {
    isListening: isMicListening,
    transcript: liveTranscript,
    interimTranscript,
    error: speechError,
    startListening,
    ensureListening,
    stopListening,
    clearCooldown,
    clearTranscripts,
  } = useSpeechRecognition({
    onTranscriptComplete: handleTranscript,
    isSpeaking,
    autoStart: enabled,
  });

  useEffect(() => {
    startListeningRef.current = startListening;
    ensureListeningRef.current = ensureListening;
    clearCooldownRef.current = clearCooldown;
    clearTranscriptsRef.current = clearTranscripts;
  }, [startListening, ensureListening, clearCooldown, clearTranscripts]);

  // Manual Mic toggle button handler
  const toggleListening = useCallback(() => {
    if (geneState === GENE_STATE.IDLE) {
      if (!isMicListening) {
        startListening();
      }
      activateGene();
    } else {
      // Manual click to turn off microphone: immediately cancel speech and silence all audio
      if (cancelAllSpeech) {
        cancelAllSpeech();
      }
      soundCues.stopAll();
      transitionToIdle('');
    }
  }, [geneState, isMicListening, startListening, activateGene, transitionToIdle, cancelAllSpeech]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      clearSilenceTimers();
    };
  }, [clearSilenceTimers]);

  return {
    geneState,
    isGeneActive: geneState !== GENE_STATE.IDLE,
    userTranscript: userTranscript || liveTranscript,
    interimTranscript,
    assistantResponse,
    isListening: geneState === GENE_STATE.LISTENING,
    isMicActive: isMicListening,
    speechError,
    activateGene,
    transitionToIdle,
    submitQuery,
    toggleListening,
    handleAssistantResponse,
    handleSafetyInterruption,
    startListening,
    stopListening,
  };
}
