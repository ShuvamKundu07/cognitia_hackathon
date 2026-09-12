/**
 * Robust, singleton-capable WebSocket Service for FastAPI AI Backend.
 * Handles single persistent connection, heartbeat, exponential backoff,
 * frame streaming, and message contract dispatching.
 */

export const WS_STATUS = {
  DISCONNECTED: 'DISCONNECTED',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  RECONNECTING: 'RECONNECTING',
  ERROR: 'ERROR',
};

function getResolvedWsUrl() {
  if (import.meta.env.VITE_BACKEND_WS_URL) {
    return import.meta.env.VITE_BACKEND_WS_URL.trim();
  }
  const httpUrl = import.meta.env.VITE_BACKEND_URL;
  if (httpUrl && typeof httpUrl === 'string') {
    const trimmed = httpUrl.trim();
    const wsProto = trimmed.startsWith('https') ? 'wss' : 'ws';
    const host = trimmed.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    return `${wsProto}://${host}/ws`;
  }
  return 'ws://localhost:8000/ws';
}

class WebSocketService {
  constructor() {
    this.ws = null;
    this.url = getResolvedWsUrl();
    this.status = WS_STATUS.DISCONNECTED;
    this.listeners = new Map();
    this.statusListeners = new Set();
    
    // Heartbeat & Reconnection
    this.heartbeatTimer = null;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.maxReconnectDelay = 10000;
    this.baseReconnectDelay = 1000;
    this.heartbeatIntervalMs = 5000;
    this.shouldReconnect = true;
    this.lastPongTime = 0;
  }

  setUrl(newUrl) {
    if (newUrl && newUrl !== this.url) {
      this.url = newUrl;
      if (this.isConnected()) {
        this.disconnect();
        this.connect();
      }
    }
  }

  getStatus() {
    return this.status;
  }

  isConnected() {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  onStateChange(cb) {
    this.statusListeners.add(cb);
    cb(this.status);
    return () => this.statusListeners.delete(cb);
  }

  _setStatus(newStatus) {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.statusListeners.forEach((cb) => {
        try {
          cb(newStatus);
        } catch (e) {
          console.error('WebSocket state listener error:', e);
        }
      });
    }
  }

  on(type, callback) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type).add(callback);
    return () => {
      const set = this.listeners.get(type);
      if (set) {
        set.delete(callback);
        if (set.size === 0) {
          this.listeners.delete(type);
        }
      }
    };
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.shouldReconnect = true;
    this._setStatus(this.reconnectAttempts > 0 ? WS_STATUS.RECONNECTING : WS_STATUS.CONNECTING);

    try {
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this._setStatus(WS_STATUS.CONNECTED);
        this._startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        this._handleMessage(event.data);
      };

      this.ws.onerror = (err) => {
        console.warn('WebSocket error encountered:', err);
        this._setStatus(WS_STATUS.ERROR);
      };

      this.ws.onclose = (_event) => {
        this._stopHeartbeat();
        this.ws = null;
        if (this.shouldReconnect) {
          this._setStatus(WS_STATUS.DISCONNECTED);
          this._scheduleReconnect();
        } else {
          this._setStatus(WS_STATUS.DISCONNECTED);
        }
      };
    } catch (err) {
      console.warn('WebSocket connection attempt failed:', err);
      this._setStatus(WS_STATUS.ERROR);
      this._scheduleReconnect();
    }
  }

  disconnect() {
    this.shouldReconnect = false;
    this._stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch (_e) {
        // ignore
      }
      this.ws = null;
    }
    this._setStatus(WS_STATUS.DISCONNECTED);
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected()) {
        this.sendPing();
      }
    }, this.heartbeatIntervalMs);
  }

  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  _scheduleReconnect() {
    if (!this.shouldReconnect || this.reconnectTimer) return;

    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(1.5, this.reconnectAttempts),
      this.maxReconnectDelay
    );
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  _handleMessage(rawData) {
    try {
      const data = JSON.parse(rawData);
      const type = data.type || 'unknown';

      if (type === 'pong') {
        this.lastPongTime = Date.now();
        return;
      }

      if (this.listeners.has(type)) {
        this.listeners.get(type).forEach((cb) => {
          try {
            cb(data);
          } catch (e) {
            console.error(`Error in message handler for '${type}':`, e);
          }
        });
      }

      if (this.listeners.has('*')) {
        this.listeners.get('*').forEach((cb) => {
          try {
            cb(data);
          } catch (e) {
            console.error('Error in wildcard message handler:', e);
          }
        });
      }
    } catch (err) {
      console.error('Failed to parse WebSocket incoming JSON:', rawData, err);
    }
  }

  send(payload) {
    if (!this.isConnected()) {
      return false;
    }
    try {
      const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
      this.ws.send(serialized);
      return true;
    } catch (e) {
      console.error('WebSocket send failed:', e);
      return false;
    }
  }

  sendPing() {
    return this.send({ type: 'ping', timestamp: Date.now() });
  }

  sendFrame(base64Frame, timestamp = Date.now()) {
    return this.send({
      type: 'video_frame',
      frame: base64Frame,
      timestamp,
    });
  }

  sendAudioChunk(audioData, timestamp = Date.now()) {
    return this.send({
      type: 'audio_chunk',
      data: audioData,
      timestamp,
    });
  }

  sendAudioControl(action = 'start') {
    return this.send({
      type: 'audio_control',
      action,
      timestamp: Date.now(),
    });
  }

  sendTestAudioEvent(sound = 'Vehicle Horn', direction = 'Right', confidence = 0.95) {
    return this.send({
      type: 'test_audio_event',
      sound,
      direction,
      confidence,
      timestamp: Date.now(),
    });
  }

  sendWakeWord(text = 'hey bro') {
    return this.send({
      type: 'wake_word',
      text,
      timestamp: Date.now(),
    });
  }

  sendConversation(text) {
    return this.send({
      type: 'conversation',
      text,
      timestamp: Date.now(),
    });
  }

  sendConversationStatus(state) {
    return this.send({
      type: 'conversation_status_update',
      state,
      timestamp: Date.now(),
    });
  }

  sendOCRRequest(query = 'that sign') {
    return this.send({
      type: 'ocr_request',
      query,
      timestamp: Date.now(),
    });
  }

  sendSettings(settings) {
    return this.send({
      type: 'settings_update',
      settings,
      timestamp: Date.now(),
    });
  }
}

export const wsService = new WebSocketService();

