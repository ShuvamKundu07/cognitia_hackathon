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

export const LS_BACKEND_URL_KEY = 'pedestrian_safety_backend_ws_url';

/**
 * Normalizes user-entered or environment URL into a valid wss:// or ws:// WebSocket endpoint.
 * Handles inputs like 'https://my-backend.onrender.com', 'my-backend.onrender.com', or 'ws://localhost:8000/ws'.
 */
export function formatWsUrl(inputUrl) {
  if (!inputUrl || typeof inputUrl !== 'string') return '';
  let trimmed = inputUrl.trim();
  if (!trimmed) return '';

  let isSecure = false;
  if (trimmed.startsWith('https://') || trimmed.startsWith('wss://')) {
    isSecure = true;
  } else if (trimmed.startsWith('http://') || trimmed.startsWith('ws://')) {
    isSecure = false;
  } else if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    isSecure = true;
  }

  // Strip existing protocol
  let cleanHost = trimmed.replace(/^(https?:\/\/|wss?:\/\/)/i, '');

  // Strip trailing slashes
  cleanHost = cleanHost.replace(/\/+$/, '');

  // Ensure /ws path
  if (!cleanHost.endsWith('/ws')) {
    cleanHost = `${cleanHost}/ws`;
  }

  const proto = isSecure ? 'wss' : 'ws';
  return `${proto}://${cleanHost}`;
}

/**
 * Converts a WebSocket URL back to an HTTP/HTTPS URL for pinging health endpoints.
 */
export function wsToHttpUrl(wsUrl) {
  if (!wsUrl || typeof wsUrl !== 'string') return '';
  const trimmed = wsUrl.trim();
  const proto = trimmed.startsWith('wss://') ? 'https://' : 'http://';
  let clean = trimmed.replace(/^wss?:\/\//i, '');
  clean = clean.replace(/\/ws\/?$/i, '');
  clean = clean.replace(/\/+$/, '');
  return `${proto}${clean}`;
}

export function getResolvedWsUrl() {
  if (typeof window !== 'undefined' && window.localStorage) {
    const custom = window.localStorage.getItem(LS_BACKEND_URL_KEY);
    if (custom && custom.trim()) {
      return formatWsUrl(custom.trim());
    }
  }

  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';

  if (import.meta.env.VITE_BACKEND_WS_URL) {
    const trimmedWs = import.meta.env.VITE_BACKEND_WS_URL.trim();
    // In HTTPS production (e.g. Vercel), reject ws://localhost default if VITE_BACKEND_URL is set to a cloud host
    if (isHttps && trimmedWs.includes('localhost')) {
      const httpUrl = import.meta.env.VITE_BACKEND_URL;
      if (httpUrl && typeof httpUrl === 'string' && !httpUrl.includes('localhost')) {
        return formatWsUrl(httpUrl);
      }
    }
    return formatWsUrl(trimmedWs);
  }

  const httpUrl = import.meta.env.VITE_BACKEND_URL;
  if (httpUrl && typeof httpUrl === 'string') {
    return formatWsUrl(httpUrl);
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
    if (!newUrl) return;
    const formatted = formatWsUrl(newUrl);
    if (formatted) {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(LS_BACKEND_URL_KEY, formatted);
      }
      this.url = formatted;
      this.reconnectAttempts = 0;
      this.disconnect();
      this.connect();
    }
  }

  resetUrl() {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(LS_BACKEND_URL_KEY);
    }
    this.url = getResolvedWsUrl();
    this.reconnectAttempts = 0;
    this.disconnect();
    this.connect();
    return this.url;
  }

  getUrl() {
    return this.url;
  }

  async checkBackendHealth(targetUrl = this.url) {
    const httpBase = wsToHttpUrl(targetUrl);
    if (!httpBase) {
      return { success: false, status: 0, latencyMs: 0, error: 'Invalid backend URL' };
    }
    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(`${httpBase}/health`, {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startTime;
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return { success: true, status: res.status, latencyMs, data };
      }
      return { success: false, status: res.status, latencyMs, error: `HTTP ${res.status}` };
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      return {
        success: false,
        status: 0,
        latencyMs,
        error: err.name === 'AbortError' ? 'Render service is sleeping (timed out after 12s). Give it ~40-60s to spin up.' : (err.message || 'Connection failed'),
      };
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

