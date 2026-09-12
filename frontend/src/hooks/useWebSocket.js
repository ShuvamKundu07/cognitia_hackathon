import { useState, useEffect, useCallback, useRef } from 'react';
import { wsService, WS_STATUS } from '../services/websocket';
import { mockBackend } from '../services/mockBackend';

/**
 * Custom hook providing WebSocket communication with FastAPI backend,
 * or seamless switching to Mock Backend when offline.
 */
export function useWebSocket({ onMessage } = {}) {
  const [isMockMode, setIsMockMode] = useState(false);
  const [status, setStatus] = useState(WS_STATUS.DISCONNECTED);
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  // Connect active service
  useEffect(() => {
    const activeService = isMockMode ? mockBackend : wsService;

    // Listen to status updates
    const unbindStatus = activeService.onStateChange((newStatus) => {
      setStatus(newStatus);
    });

    // Listen to all incoming messages
    const unbindMsg = activeService.on('*', (data) => {
      if (onMessageRef.current) {
        onMessageRef.current(data);
      }
    });

    // Initiate connection
    if (isMockMode) {
      mockBackend.start();
    } else {
      wsService.connect();
    }

    return () => {
      unbindStatus();
      unbindMsg();
      if (isMockMode) {
        mockBackend.stop();
      } else {
        wsService.disconnect();
      }
    };
  }, [isMockMode]);

  const toggleMockMode = useCallback((desiredMode) => {
    setIsMockMode((prev) => (desiredMode !== undefined ? desiredMode : !prev));
  }, []);

  const sendFrame = useCallback((base64Frame) => {
    const active = isMockMode ? mockBackend : wsService;
    return active.sendFrame(base64Frame);
  }, [isMockMode]);

  const sendAudioChunk = useCallback((audioData) => {
    const active = isMockMode ? mockBackend : wsService;
    return active.sendAudioChunk(audioData);
  }, [isMockMode]);

  const sendTestAudioEvent = useCallback((sound = 'Vehicle Horn', direction = 'Right', confidence = 0.95) => {
    if (isMockMode) {
      if (sound.toLowerCase().includes('siren')) {
        mockBackend.triggerSirenAudio();
      } else {
        mockBackend.triggerHornAudio();
      }
      return true;
    }
    return wsService.sendTestAudioEvent(sound, direction, confidence);
  }, [isMockMode]);

  const sendConversation = useCallback((text) => {
    const active = isMockMode ? mockBackend : wsService;
    return active.sendConversation(text);
  }, [isMockMode]);

  const sendAudioControl = useCallback((action = 'start') => {
    const active = isMockMode ? mockBackend : wsService;
    return active.sendAudioControl ? active.sendAudioControl(action) : true;
  }, [isMockMode]);

  const sendOCRRequest = useCallback((query) => {
    const active = isMockMode ? mockBackend : wsService;
    return active.sendOCRRequest(query);
  }, [isMockMode]);

  const sendWakeWord = useCallback((text = 'hey bro') => {
    const active = isMockMode ? mockBackend : wsService;
    return active.sendWakeWord ? active.sendWakeWord(text) : active.sendConversation(text);
  }, [isMockMode]);

  const sendConversationStatus = useCallback((state) => {
    const active = isMockMode ? mockBackend : wsService;
    return active.sendConversationStatus ? active.sendConversationStatus(state) : true;
  }, [isMockMode]);

  const sendSettings = useCallback((settings) => {
    const active = isMockMode ? mockBackend : wsService;
    return active.sendSettings(settings);
  }, [isMockMode]);

  const [currentWsUrl, setCurrentWsUrl] = useState(() => wsService.getUrl());

  const setWsUrl = useCallback((newUrl) => {
    wsService.setUrl(newUrl);
    setCurrentWsUrl(wsService.getUrl());
  }, []);

  const resetWsUrl = useCallback(() => {
    const defaultUrl = wsService.resetUrl();
    setCurrentWsUrl(defaultUrl);
  }, []);

  const reconnect = useCallback(() => {
    wsService.disconnect();
    wsService.connect();
  }, []);

  const checkBackendHealth = useCallback(async (targetUrl) => {
    return await wsService.checkBackendHealth(targetUrl || wsService.getUrl());
  }, []);

  return {
    status,
    isConnected: status === WS_STATUS.CONNECTED,
    currentWsUrl,
    setWsUrl,
    resetWsUrl,
    reconnect,
    checkBackendHealth,
    isMockMode,
    toggleMockMode,
    sendFrame,
    sendAudioChunk,
    sendAudioControl,
    sendTestAudioEvent,
    sendConversation,
    sendWakeWord,
    sendConversationStatus,
    sendOCRRequest,
    sendSettings,
    mockBackend: isMockMode ? mockBackend : null,
  };
}

