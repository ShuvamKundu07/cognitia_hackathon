import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Dashboard } from './pages/Dashboard';
import { Evaluation } from './pages/Evaluation';
import { SettingsPage } from './pages/SettingsPage';
import { useWebSocket } from './hooks/useWebSocket';
import { useCamera } from './hooks/useCamera';
import { useMicrophone } from './hooks/useMicrophone';
import { useSpeech } from './hooks/useSpeech';
import { useGeneAssistant } from './hooks/useGeneAssistant';
import {
  sortHazardsByPriority,
  shouldTriggerAlert,
  formatFullDirectionalAlert,
  DEFAULT_WALKING_PATH,
} from './utils/hazardPriority';
import { soundCues } from './utils/audioUtils';
import {
  ShieldAlert,
  Server,
  Sliders,
  BarChart2,
  LayoutDashboard,
} from 'lucide-react';

const DEFAULT_SETTINGS = {
  sensitivity: 'NORMAL',
  alert_frequency: 'NORMAL',
  speech_speed: 1.0,
  high_contrast: false,
  enable_visual_alerts: true,
  enable_audio_alerts: true,
  enable_voice_assistant: true,
  enable_ocr: true,
  enable_system_warnings: true,
  show_walking_path: true,
  gemini_api_key: '',
  fps: 10,
};

export function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');

  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('pedestrian_safety_settings');
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });


  useEffect(() => {
    if (settings.high_contrast) {
      document.documentElement.classList.add('high-contrast');
    } else {
      document.documentElement.classList.remove('high-contrast');
    }
  }, [settings.high_contrast]);

  const [activeObjects, setActiveObjects] = useState([]);
  const [walkingPath, setWalkingPath] = useState(DEFAULT_WALKING_PATH);
  const [priorityHazards, setPriorityHazards] = useState([]);
  const [currentHazard, setCurrentHazard] = useState(null);
  const [alertHistory, setAlertHistory] = useState([]);
  const [latestAudioEvent, setLatestAudioEvent] = useState(null);
  const [ocrResult, setOcrResult] = useState(null);
  const [ocrHistory, setOcrHistory] = useState([]);
  const [evaluationMetrics, setEvaluationMetrics] = useState(null);
  const [systemFailures, setSystemFailures] = useState([]);
  const [sessionStats, setSessionStats] = useState({
    framesProcessed: 0,
    alertsDispatched: 0,
    dedupedCount: 0,
  });

  const [systemHealth, setSystemHealth] = useState({
    camera: 'ACTIVE',
    microphone: 'ACTIVE',
    backend: 'DISCONNECTED',
    vision_ai: 'ACTIVE',
    audio_ai: 'ACTIVE',
    ocr: 'READY',
    assistant: 'READY',
  });

  const handleSafetyInterruptionRef = useRef(null);
  const handleAssistantResponseRef = useRef(null);

  const {
    speak,
    stop: stopSpeech,
    cancelAllSpeech,
    isSpeaking,
  } = useSpeech({
    rate: settings.speech_speed || 1.0,
    enabled: settings.enable_audio_alerts !== false,
    cooldownMs: settings.alert_frequency === 'HIGH' ? 4000 : settings.alert_frequency === 'LOW' ? 12000 : 8000,
  });

  const alertCacheRef = useRef(new Map());
  const lastAlertRef = useRef(null);
  const lastSpokenAlertTimeRef = useRef(0);
  const handleToggleMuteRef = useRef(null);
  const handleReplayAlertRef = useRef(null);
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const lastAudioChimeRef = useRef({ time: 0, sound: '' });
  const audioEventClearTimerRef = useRef(null);

  const handleIncomingMessage = useCallback(
    (msg) => {
      if (!msg || !msg.type) return;

      switch (msg.type) {
        case 'detection': {
          const objs = msg.objects || [];
          setActiveObjects(objs);
          if (msg.walking_path) {
            setWalkingPath(msg.walking_path);
          }

          const sorted = sortHazardsByPriority(objs, msg.walking_path || walkingPath);
          setPriorityHazards(sorted);
          const top = sorted.length > 0 ? sorted[0] : null;
          setCurrentHazard(top);

          // Continuous alarm ONLY for Serious Stop (CRITICAL) - never for HIGH/MEDIUM/LOW
          if (settings.enable_audio_alerts !== false) {
            const topUrgency = (top?.urgency || '').toLowerCase();
            if (topUrgency === 'critical') {
              soundCues.startContinuousAlarm('critical');
            } else if (soundCues.isAlarmActive()) {
              soundCues.stopContinuousAlarm();
              soundCues.playResolvedTone();
            }
          }

          setSessionStats((prev) => ({
            ...prev,
            framesProcessed: prev.framesProcessed + 1,
          }));
          break;
        }

        case 'hazard_alert': {
          const alert = { ...msg };
          const urgency = (alert.urgency || 'high').toUpperCase();

          // 1. FILTER: Suppress LOW urgency alerts from audio notifications
          if (urgency === 'LOW') {
            break;
          }

          // 2. Enforce full directional speech sentence
          alert.message = formatFullDirectionalAlert(alert);
          lastAlertRef.current = alert;

          // 3. Continuous alarm ONLY for Serious Stop (CRITICAL)
          if (settings.enable_audio_alerts !== false && urgency === 'CRITICAL') {
            soundCues.startContinuousAlarm('critical');
          } else if (soundCues.isAlarmActive() && urgency !== 'CRITICAL') {
            soundCues.stopContinuousAlarm();
          }

          // 4. Per-hazard deduplication and state change check
          const allowAlert = shouldTriggerAlert(
            alert,
            alertCacheRef.current,
            settings.alert_frequency === 'HIGH' ? 4000 : settings.alert_frequency === 'LOW' ? 12000 : 8000
          );

          if (!allowAlert) {
            setSessionStats((prev) => ({
              ...prev,
              dedupedCount: prev.dedupedCount + 1,
            }));
            return;
          }

          // 5. GLOBAL CALM THROTTLE:
          // Unless urgency is CRITICAL (immediate emergency), enforce minimum calm spacing
          // between any consecutive spoken alerts to prevent sensory overload
          const now = Date.now();
          const timeSinceLastSpoken = now - (lastSpokenAlertTimeRef.current || 0);
          const minInterAlertSpacing = settings.alert_frequency === 'HIGH' ? 4000 : settings.alert_frequency === 'LOW' ? 12000 : 7000;

          if (urgency !== 'CRITICAL' && timeSinceLastSpoken < minInterAlertSpacing) {
            setSessionStats((prev) => ({
              ...prev,
              dedupedCount: prev.dedupedCount + 1,
            }));
            return;
          }

          // 6. If currently speaking an alert, do not interrupt with non-critical alert
          if (isSpeaking && urgency !== 'CRITICAL') {
            setSessionStats((prev) => ({
              ...prev,
              dedupedCount: prev.dedupedCount + 1,
            }));
            return;
          }

          // Record timestamp for global pacing
          lastSpokenAlertTimeRef.current = now;

          const alertRecord = {
            timestamp: now,
            urgency: alert.urgency,
            direction: alert.direction,
            inPath: alert.inPath,
          };
          if (alert.hazard_id) {
            alertCacheRef.current.set(alert.hazard_id, alertRecord);
          }
          if (alert.message) {
            alertCacheRef.current.set(`msg_${alert.message.trim().toLowerCase()}`, alertRecord);
          }
          const hType = (alert.hazard_type || alert.label || '').toLowerCase();
          const dir = (alert.direction || 'ahead').toLowerCase();
          if (hType) {
            alertCacheRef.current.set(`sem_${hType}_${dir}`, alertRecord);
          }
          alertCacheRef.current.set('__last_global_alert_timestamp__', {
            timestamp: now,
            urgency,
          });

          // Safety preemption: CRITICAL or HIGH alerts interrupt Gene immediately
          if (urgency === 'CRITICAL' || urgency === 'HIGH' || alert.interrupt) {
            if (handleSafetyInterruptionRef.current) {
              handleSafetyInterruptionRef.current(alert);
            }
          } else if (settings.enable_audio_alerts !== false) {
            speak(alert.message, {
              priorityLevel: urgency,
              hazardId: alert.hazard_id,
            });
          }

          setAlertHistory((prev) => [
            {
              timestamp: alert.timestamp || now,
              hazard: alert.hazard_type || alert.label || 'Obstacle',
              direction: alert.direction || 'Ahead',
              urgency: alert.urgency || 'HIGH',
              confidence: alert.confidence || 0.9,
              message: alert.message,
              status: 'Active',
            },
            ...prev.slice(0, 49),
          ]);

          setSessionStats((prev) => ({
            ...prev,
            alertsDispatched: prev.alertsDispatched + 1,
          }));
          break;
        }

        case 'hazard_resolved': {
          const resolvedId = msg.hazard_id;
          soundCues.stopContinuousAlarm();
          soundCues.playResolvedTone();

          setAlertHistory((prev) =>
            prev.map((item) =>
              item.hazard_id === resolvedId || item.hazard === resolvedId
                ? { ...item, status: 'Resolved' }
                : item
            )
          );

          setCurrentHazard((prev) => (prev?.id === resolvedId ? null : prev));
          break;
        }

        case 'audio_event': {
          // Strictly ignore any engine sounds
          if (msg.sound && msg.sound.toLowerCase().includes('engine')) {
            break;
          }
          setLatestAudioEvent(msg);

          // Reset displayed acoustic hazard card after 4 seconds
          if (audioEventClearTimerRef.current) {
            clearTimeout(audioEventClearTimerRef.current);
          }
          audioEventClearTimerRef.current = setTimeout(() => {
            setLatestAudioEvent(null);
          }, 4000);

          const now = Date.now();
          const lastChimeTime = lastAudioChimeRef.current?.time || 0;
          const lastSound = lastAudioChimeRef.current?.sound;
          const timeSinceLastSpoken = now - (lastSpokenAlertTimeRef.current || 0);

          // Only chime if not currently speaking, not within 4s of a spoken alert,
          // high confidence (> 0.90), and at least 8s since last chime
          if (
            !isSpeaking &&
            timeSinceLastSpoken > 4000 &&
            msg.confidence > 0.90 &&
            settings.enable_audio_alerts !== false &&
            (msg.sound !== lastSound || now - lastChimeTime > 8000)
          ) {
            lastAudioChimeRef.current = { time: now, sound: msg.sound };
            soundCues.playWarningChime();
          }
          break;
        }

        case 'system_status': {
          setSystemHealth((prev) => ({
            ...prev,
            ...msg,
            backend: 'CONNECTED',
          }));
          break;
        }

        case 'system_failure': {
          if (settings.enable_system_warnings !== false) {
            setSystemFailures((prev) => [msg, ...prev.slice(0, 4)]);
          }
          break;
        }

        case 'ocr_result': {
          if (settings.enable_ocr !== false) {
            setOcrResult(msg);
            setOcrHistory((prev) => [msg, ...prev.slice(0, 9)]);
          }
          break;
        }

        case 'assistant_response': {
          if (handleAssistantResponseRef.current) {
            handleAssistantResponseRef.current(msg);
          }
          break;
        }

        case 'conversation_status': {
          // Handled via Gene assistant state machine
          break;
        }

        case 'evaluation_result': {
          setEvaluationMetrics(msg.metrics);
          break;
        }

        default:
          break;
      }
    },
    [settings, speak, walkingPath, isSpeaking]
  );

  const {
    status: wsStatus,
    isConnected: isWsConnected,
    currentWsUrl,
    setWsUrl,
    resetWsUrl,
    reconnect: _reconnectWs,
    checkBackendHealth,
    isMockMode,
    sendFrame,
    sendAudioChunk,
    sendAudioControl,
    sendTestAudioEvent,
    sendConversation,
    sendWakeWord,
    sendConversationStatus,
    sendSettings,
    mockBackend,
  } = useWebSocket({
    onMessage: handleIncomingMessage,
  });

  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const isLocalhostBackend = (currentWsUrl || '').includes('localhost') || (currentWsUrl || '').includes('127.0.0.1');
  const showLocalhostWarning = isHttps && isLocalhostBackend && !isWsConnected;
  const [dismissWarning, setDismissWarning] = useState(false);

  const handleUpdateSettings = useCallback(
    (newSettings) => {
      setSettings(newSettings);
      if (newSettings.enable_audio_alerts === false) {
        soundCues.stopContinuousAlarm();
      }
      try {
        localStorage.setItem('pedestrian_safety_settings', JSON.stringify(newSettings));
      } catch (e) {
        console.warn('LocalStorage save error:', e);
      }
      sendSettings(newSettings);
    },
    [sendSettings]
  );

  const handleResetSettings = useCallback(() => {
    handleUpdateSettings(DEFAULT_SETTINGS);
  }, [handleUpdateSettings]);

  // Derive backend health reactively without cascading renders
  const effectiveSystemHealth = useMemo(() => {
    return {
      ...systemHealth,
      backend: isWsConnected ? 'CONNECTED' : wsStatus === 'RECONNECTING' ? 'DEGRADED' : 'DISCONNECTED',
    };
  }, [systemHealth, isWsConnected, wsStatus]);

  const handleFrameCaptured = useCallback(
    (base64Frame) => {
      sendFrame(base64Frame);
    },
    [sendFrame]
  );

  const {
    videoRef,
    isActive: isCameraActive,
    isLoading: isCameraLoading,
    error: cameraError,
    permissionState: cameraPermission,
    devices: cameraDevices,
    selectedDeviceId: selectedCameraId,
    setSelectedDeviceId: setSelectedCameraId,
    isPortrait,
    switchCamera,
    fps: cameraFps,
    setFps: setCameraFps,
    startCamera,
    stopCamera,
  } = useCamera({
    targetFps: settings.fps || 10,
    onFrameCaptured: handleFrameCaptured,
    enabled: currentPage === 'dashboard',
    autoStart: false,
  });

  const handleStartCamera = useCallback(() => {
    startCamera();
  }, [startCamera]);

  const handleStopCamera = useCallback(() => {
    stopCamera();
    setActiveObjects([]);
    setCurrentHazard(null);
    soundCues.stopContinuousAlarm();
  }, [stopCamera]);

  const handleAudioChunk = useCallback(
    (audioBase64) => {
      sendAudioChunk(audioBase64);
    },
    [sendAudioChunk]
  );

  const handleTriggerTestAudio = useCallback(
    (sound = 'Vehicle Horn', direction = 'Right') => {
      sendAudioControl('start');
      if (sound.toLowerCase().includes('siren')) {
        soundCues.playSirenSound();
      } else {
        soundCues.playHornSound();
      }
      sendTestAudioEvent(sound, direction);
      handleIncomingMessage({
        type: 'audio_event',
        sound,
        direction,
        confidence: 0.95,
        timestamp: Date.now(),
      });
    },
    [sendAudioControl, sendTestAudioEvent, handleIncomingMessage]
  );

  const {
    isActive: isMicActive,
    permissionState: micPermission,
    isMuted,
    audioLevel,
    toggleMute,
  } = useMicrophone({
    onAudioChunk: handleAudioChunk,
    enabled: settings.enable_audio_alerts !== false,
    autoStart: false,
  });

  const voiceContext = useMemo(() => ({
    isCameraActive,
    startCamera: () => handleStartCamera(),
    stopCamera: () => handleStopCamera(),
    switchCamera: () => {
      if (cameraDevices && cameraDevices.length > 1) {
        const currentIndex = cameraDevices.findIndex((d) => d.deviceId === selectedCameraId);
        const nextDevice = cameraDevices[(currentIndex + 1) % cameraDevices.length];
        setSelectedCameraId(nextDevice.deviceId);
      }
    },
    isMuted,
    muteMic: () => {
      if (!isMuted && handleToggleMuteRef.current) {
        handleToggleMuteRef.current();
      }
    },
    unmuteMic: () => {
      if (isMuted && handleToggleMuteRef.current) {
        handleToggleMuteRef.current();
      }
    },
    toggleMic: () => {
      if (handleToggleMuteRef.current) {
        handleToggleMuteRef.current();
      }
    },
    setWalkingPath: (show) => {
      handleUpdateSettings({ ...settingsRef.current, show_walking_path: show });
    },
    toggleWalkingPath: () => {
      handleUpdateSettings({ ...settingsRef.current, show_walking_path: !settingsRef.current.show_walking_path });
    },
    setHighContrast: (enable) => {
      handleUpdateSettings({ ...settingsRef.current, high_contrast: enable });
    },
    toggleHighContrast: () => {
      handleUpdateSettings({ ...settingsRef.current, high_contrast: !settingsRef.current.high_contrast });
    },
    setAudioAlerts: (enable) => {
      handleUpdateSettings({ ...settingsRef.current, enable_audio_alerts: enable });
    },
    setVisualAlerts: (enable) => {
      handleUpdateSettings({ ...settingsRef.current, enable_visual_alerts: enable });
    },
    readOcr: () => {
      const text = ocrResult?.text;
      if (text) {
        speak(`The sign reads: ${text}`, { priorityLevel: 'CONVERSATION' });
        return text;
      }
      return null;
    },
    clearHistory: () => {
      setAlertHistory([]);
    },
    replayLastAlert: () => {
      if (lastAlertRef.current?.message) {
        if (handleReplayAlertRef.current) {
          handleReplayAlertRef.current(lastAlertRef.current.message, lastAlertRef.current.urgency || 'HIGH');
        }
        return lastAlertRef.current.message;
      }
      if (currentHazard) {
        const msg = formatFullDirectionalAlert(currentHazard);
        if (handleReplayAlertRef.current) {
          handleReplayAlertRef.current(msg, currentHazard.urgency || 'HIGH');
        }
        return msg;
      }
      return 'No active alerts to replay.';
    },
    setPage: (page) => {
      setCurrentPage(page);
    },
    resetSettings: () => handleResetSettings(),
    triggerCriticalCar: () => {
      if (mockBackend) mockBackend.triggerCriticalCar();
    },
    triggerPothole: () => {
      if (mockBackend) mockBackend.triggerPotholeAhead();
    },
    triggerHorn: () => {
      handleTriggerTestAudio('Vehicle Horn', 'Right');
    },
    triggerSiren: () => {
      handleTriggerTestAudio('Emergency Siren', 'Left');
    },
    toggleCameraWarning: () => {
      if (mockBackend) mockBackend.toggleCameraVisibilityFailure();
    },
    stopAlarm: () => {
      soundCues.stopContinuousAlarm();
    },
    setSpeechSpeed: (rate) => {
      handleUpdateSettings({ ...settingsRef.current, speech_speed: rate });
    },
    setSensitivity: (sens) => {
      handleUpdateSettings({ ...settingsRef.current, sensitivity: sens });
    },
    setAlertFrequency: (freq) => {
      handleUpdateSettings({ ...settingsRef.current, alert_frequency: freq });
    },
  }), [
    isCameraActive,
    handleStartCamera,
    handleStopCamera,
    cameraDevices,
    selectedCameraId,
    setSelectedCameraId,
    isMuted,
    ocrResult,
    currentHazard,
    handleResetSettings,
    handleUpdateSettings,
    mockBackend,
    handleTriggerTestAudio,
    speak,
  ]);

  const {
    geneState,
    userTranscript,
    interimTranscript,
    assistantResponse,
    isListening,
    speechError,
    submitQuery,
    toggleListening,
    transitionToIdle,
    handleAssistantResponse,
    handleSafetyInterruption,
  } = useGeneAssistant({
    speak,
    cancelAllSpeech,
    isSpeaking,
    sendConversation,
    sendWakeWord,
    sendConversationStatus,
    enabled: settings.enable_voice_assistant !== false,
    voiceContext,
  });

  const handleToggleMute = useCallback(async () => {
    const nextMuted = await toggleMute();
    if (nextMuted) {
      // Switched to muted / OFF
      sendAudioControl('stop');
      setLatestAudioEvent(null);
      cancelAllSpeech();
      soundCues.stopAll();
      soundCues.stopContinuousAlarm();
      if (geneState !== 'IDLE') {
        transitionToIdle('');
      }
    } else {
      // Switched to active / ON
      sendAudioControl('start');
    }
  }, [toggleMute, sendAudioControl, cancelAllSpeech, geneState, transitionToIdle]);

  useEffect(() => {
    handleSafetyInterruptionRef.current = handleSafetyInterruption;
    handleAssistantResponseRef.current = handleAssistantResponse;
    handleToggleMuteRef.current = handleToggleMute;
  }, [handleSafetyInterruption, handleAssistantResponse, handleToggleMute]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (
        e.code === 'Space' &&
        document.activeElement.tagName !== 'INPUT' &&
        document.activeElement.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        toggleListening();
      }

      if (e.key === 'Escape') {
        stopSpeech();
        soundCues.stopContinuousAlarm();
      }

      if (e.altKey && e.key === '1') setCurrentPage('dashboard');
      if (e.altKey && e.key === '2') setCurrentPage('evaluation');
      if (e.altKey && e.key === '3') setCurrentPage('settings');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleListening, stopSpeech]);

  const handleReplayAlert = useCallback(
    (message, urgency) => {
      speak(message, { priorityLevel: urgency || 'HIGH', interrupt: true });
    },
    [speak]
  );

  useEffect(() => {
    handleReplayAlertRef.current = handleReplayAlert;
  }, [handleReplayAlert]);

  const handleReplayAssistant = useCallback(
    (response) => {
      speak(response, { priorityLevel: 'CONVERSATION', interrupt: false });
    },
    [speak]
  );

  const handleSpeakOCR = useCallback(
    (ocrText) => {
      speak(ocrText, { priorityLevel: 'CONVERSATION', interrupt: false });
    },
    [speak]
  );

  return (
    <div className="min-h-screen flex flex-col bg-surface-darkest text-slate-100 selection:bg-sky-500 selection:text-white">
      {/* Header */}
      <header
        role="banner"
        className="sticky top-0 z-50 bg-surface-card/95 backdrop-blur border-b-2 border-surface-border shadow-xl"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-sky-600 text-white shadow-lg shadow-sky-600/30">
              <ShieldAlert className="w-7 h-7" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-black text-white tracking-tight uppercase leading-none">
                PEDESTRIAN SHIELD
              </h1>
              <p className="text-[11px] font-bold text-slate-400 tracking-wide mt-0.5">
                Autonomous Real-Time Hazard Alerting & Conversational Assistant
              </p>
            </div>
          </div>

          <nav role="navigation" aria-label="Main application sections" className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCurrentPage('dashboard')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all focus:ring-4 focus:ring-sky-400 ${
                currentPage === 'dashboard'
                  ? 'bg-sky-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-surface-elevated'
              }`}
              aria-current={currentPage === 'dashboard' ? 'page' : undefined}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Dashboard</span>
            </button>

            <button
              type="button"
              onClick={() => setCurrentPage('evaluation')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all focus:ring-4 focus:ring-sky-400 ${
                currentPage === 'evaluation'
                  ? 'bg-sky-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-surface-elevated'
              }`}
              aria-current={currentPage === 'evaluation' ? 'page' : undefined}
            >
              <BarChart2 className="w-4 h-4" />
              <span>Evaluation & Testing</span>
            </button>

            <button
              type="button"
              onClick={() => setCurrentPage('settings')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all focus:ring-4 focus:ring-sky-400 ${
                currentPage === 'settings'
                  ? 'bg-sky-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-surface-elevated'
              }`}
              aria-current={currentPage === 'settings' ? 'page' : undefined}
            >
              <Sliders className="w-4 h-4" />
              <span>Settings</span>
            </button>
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage('settings')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all hover:opacity-90 active:scale-95 focus:ring-2 focus:ring-sky-400 ${
                isWsConnected
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-600'
                  : wsStatus === 'RECONNECTING'
                  ? 'bg-amber-950 text-amber-300 border-amber-600 animate-pulse'
                  : 'bg-red-950 text-red-300 border-red-600'
              }`}
              title={`Backend Status: ${wsStatus}. Tap to configure backend URL in Settings.`}
              aria-label={`FastAPI Backend status: ${wsStatus}`}
            >
              <Server className="w-3.5 h-3.5" />
              <span>{isMockMode ? 'MOCK ENGINE' : wsStatus}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Page Content */}
      <main role="main" className="flex-1 p-4 sm:p-6 md:p-8">
        {/* Production Localhost Mismatch Alert Banner */}
        {showLocalhostWarning && !dismissWarning && (
          <div className="mb-6 max-w-7xl mx-auto p-4 bg-amber-950/90 border-2 border-amber-500 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs shadow-xl animate-fadeIn">
            <div className="flex items-start gap-3 text-amber-200">
              <ShieldAlert className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="text-white font-bold text-sm">Mobile / Cloud Deployment Notice: Backend Not Connected</strong>
                <p className="text-amber-300/90 mt-0.5 leading-relaxed">
                  Your frontend is running on HTTPS via Vercel, but the backend target is still pointing to <code className="bg-amber-900/60 px-1 py-0.5 rounded font-mono text-amber-100 font-bold">{currentWsUrl}</code> (which does not exist on your phone). Tap below to enter your Render backend URL.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage('settings')}
                className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg transition-all shadow active:scale-95 flex items-center gap-1.5"
              >
                <Server className="w-3.5 h-3.5" />
                <span>Configure Render URL</span>
              </button>
              <button
                type="button"
                onClick={() => setDismissWarning(true)}
                className="px-2.5 py-2 text-amber-400 hover:text-amber-200 border border-amber-800 bg-amber-950 rounded-lg"
                aria-label="Dismiss warning"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {currentPage === 'dashboard' && (
          <Dashboard
            videoRef={videoRef}
            isCameraActive={isCameraActive}
            isCameraLoading={isCameraLoading}
            cameraError={cameraError}
            cameraPermission={cameraPermission}
            onRetryCamera={handleStartCamera}
            onStartCamera={handleStartCamera}
            onStopCamera={handleStopCamera}
            onSwitchCamera={switchCamera}
            isPortrait={isPortrait}
            cameraDevices={cameraDevices}
            selectedCameraId={selectedCameraId}
            onCameraDeviceChange={setSelectedCameraId}
            cameraFps={cameraFps}
            onFpsChange={setCameraFps}
            activeObjects={activeObjects}
            walkingPath={walkingPath}
            showWalkingPath={settings.show_walking_path !== false}
            priorityHazards={priorityHazards}
            currentHazard={currentHazard}
            onSelectHazard={(h) => handleReplayAlert(h.message || `${h.label} detected`, h.urgency)}
            alertHistory={alertHistory}
            onClearHistory={() => setAlertHistory([])}
            onReplayAlertSpeech={handleReplayAlert}
            isSpeaking={isSpeaking}
            conversationState={geneState}
            userTranscript={userTranscript}
            interimTranscript={interimTranscript}
            assistantResponse={assistantResponse}
            isListening={isListening}
            onToggleListening={toggleListening}
            onSubmitText={submitQuery}
            onReplayAssistantResponse={handleReplayAssistant}
            speechError={speechError}
            ocrResult={ocrResult}
            ocrHistory={ocrHistory}
            onSpeakOCR={handleSpeakOCR}
            micStatus={isMicActive ? 'ACTIVE' : micPermission === 'denied' ? 'DENIED' : 'UNAVAILABLE'}
            audioAiStatus={effectiveSystemHealth.audio_ai || 'ACTIVE'}
            audioLevel={audioLevel}
            latestAudioEvent={latestAudioEvent}
            onToggleMute={handleToggleMute}
            isMuted={isMuted}
            systemHealth={effectiveSystemHealth}
            systemFailures={systemFailures}
            onDismissFailure={(idx) => setSystemFailures((prev) => prev.filter((_, i) => i !== idx))}
            isMockMode={isMockMode}
            mockBackend={mockBackend}
            onTriggerTestAudio={handleTriggerTestAudio}
          />
        )}

        {currentPage === 'evaluation' && (
          <Evaluation
            metrics={evaluationMetrics}
            sessionStats={sessionStats}
            onRecordedFrameCaptured={handleFrameCaptured}
            activeObjects={activeObjects}
            walkingPath={walkingPath}
            alertHistory={alertHistory}
          />
        )}

        {currentPage === 'settings' && (
          <SettingsPage
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            onResetSettings={handleResetSettings}
            backendWsUrl={currentWsUrl}
            backendStatus={wsStatus}
            onUpdateBackendWsUrl={setWsUrl}
            onResetBackendWsUrl={resetWsUrl}
            onCheckBackendHealth={checkBackendHealth}
          />
        )}
      </main>

      <footer
        role="contentinfo"
        className="bg-surface-card border-t-2 border-surface-border px-4 py-4 text-center text-xs text-slate-400"
      >
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="font-semibold text-slate-300">
            3amBug Assistive Safety Prototype • Designed for Low-Vision Pedestrian Mobility
          </p>
          <p className="text-[11px] text-slate-400">
            Notice: Not a certified life-safety device. Always exercise caution and secondary verification.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
