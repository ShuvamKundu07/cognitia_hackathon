/**
 * Voice command processor for the "Bro" Assistant.
 * Maps spoken natural language commands directly to application button actions.
 * Allows full hands-free control of camera, microphone, settings, simulator, and navigation.
 */

/**
 * Normalizes input text by stripping punctuation, extra whitespace,
 * leading wake words ("hello bro", "hey bro"), and polite prefixes.
 *
 * @param {string} rawText
 * @returns {string}
 */
export function normalizeCommand(rawText) {
  if (!rawText) return '';
  return rawText
    .toLowerCase()
    .replace(/[.,!?;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:hey|hay|hi|hello|ok|okay)?\s*(?:bro|gene)[,\s]*/i, '')
    .replace(/^(?:please|can you|could you|would you|i want you to|go ahead and)\s+/i, '')
    .replace(/\s+(?:please|bro|gene)$/i, '')
    .trim();
}

/**
 * Evaluates and executes a button voice command against the provided UI context.
 * Returns { handled: true, response: string } if a button command matched and executed,
 * or null if the phrase is not a button control command (allowing fallback to AI dialogue).
 *
 * @param {string} rawText
 * @param {Object} context
 * @returns {{ handled: boolean, response: string } | null}
 */
export function executeVoiceCommand(rawText, context = {}) {
  const cmd = normalizeCommand(rawText);
  if (!cmd) return null;

  // 1. Camera: Turn On / Start Camera
  if (
    /^(?:turn\s+on|start|open|enable)\s+(?:the\s+)?camera(?:\s+sensor|\s+feed)?$/i.test(cmd) ||
    cmd === 'camera on' ||
    cmd === 'turn camera on' ||
    cmd === 'start detection' ||
    cmd === 'start detection camera' ||
    cmd === 'retry camera access'
  ) {
    if (context.isCameraActive) {
      return { handled: true, response: 'The camera is already running.' };
    }
    if (context.startCamera) {
      context.startCamera();
      return { handled: true, response: 'Turning on the camera.' };
    }
    return { handled: true, response: 'Camera control is unavailable.' };
  }

  // 2. Camera: Turn Off / Stop Camera
  if (
    /^(?:turn\s+off|stop|close|disable)\s+(?:the\s+)?camera(?:\s+sensor|\s+feed)?$/i.test(cmd) ||
    cmd === 'camera off' ||
    cmd === 'turn camera off' ||
    cmd === 'stop detection' ||
    cmd === 'stop detection camera'
  ) {
    if (!context.isCameraActive) {
      return { handled: true, response: 'The camera is already turned off.' };
    }
    if (context.stopCamera) {
      context.stopCamera();
      return { handled: true, response: 'Turning off the camera.' };
    }
    return { handled: true, response: 'Camera control is unavailable.' };
  }

  // 3. Camera: Switch / Flip Device
  if (/^(?:switch|flip|change|next)\s+(?:the\s+)?camera$/i.test(cmd)) {
    if (context.switchCamera) {
      context.switchCamera();
      return { handled: true, response: 'Switching camera device.' };
    }
    return { handled: true, response: 'Camera switching is not available.' };
  }

  // 4. Microphone: Mute
  if (
    /^(?:mute|turn\s+off|stop|disable)\s+(?:the\s+)?(?:microphone|mic)$/i.test(cmd) ||
    cmd === 'mute'
  ) {
    if (context.isMuted) {
      return { handled: true, response: 'Microphone is already muted.' };
    }
    if (context.muteMic) {
      context.muteMic();
      return { handled: true, response: 'Microphone muted.' };
    }
  }

  // 5. Microphone: Unmute / Start
  if (
    /^(?:unmute|turn\s+on|start|enable)\s+(?:the\s+)?(?:microphone|mic)$/i.test(cmd) ||
    cmd === 'unmute'
  ) {
    if (!context.isMuted) {
      return { handled: true, response: 'Microphone is already active.' };
    }
    if (context.unmuteMic) {
      context.unmuteMic();
      return { handled: true, response: 'Microphone unmuted.' };
    }
  }

  // 6. Microphone: Toggle
  if (/^toggle\s+(?:the\s+)?(?:microphone|mic)$/i.test(cmd)) {
    if (context.toggleMic) {
      context.toggleMic();
      return { handled: true, response: 'Toggling microphone.' };
    }
  }

  // 7. Walking Path: Show / Enable
  if (
    /^(?:turn\s+on|show|enable)\s+(?:the\s+)?walking\s+path$/i.test(cmd) ||
    cmd === 'show path' ||
    cmd === 'walking path on'
  ) {
    if (context.setWalkingPath) {
      context.setWalkingPath(true);
      return { handled: true, response: 'Showing walking path corridor.' };
    }
  }

  // 8. Walking Path: Hide / Disable
  if (
    /^(?:turn\s+off|hide|disable)\s+(?:the\s+)?walking\s+path$/i.test(cmd) ||
    cmd === 'hide path' ||
    cmd === 'walking path off'
  ) {
    if (context.setWalkingPath) {
      context.setWalkingPath(false);
      return { handled: true, response: 'Hiding walking path corridor.' };
    }
  }

  // 9. Walking Path: Toggle
  if (/^toggle\s+(?:the\s+)?(?:walking\s+)?path$/i.test(cmd)) {
    if (context.toggleWalkingPath) {
      context.toggleWalkingPath();
      return { handled: true, response: 'Toggled walking path.' };
    }
  }

  // 10. High Contrast: Enable
  if (
    /^(?:turn\s+on|enable)\s+(?:the\s+)?high\s+contrast(?:\s+mode)?$/i.test(cmd) ||
    cmd === 'high contrast on' ||
    cmd === 'max contrast on'
  ) {
    if (context.setHighContrast) {
      context.setHighContrast(true);
      return { handled: true, response: 'High contrast display enabled.' };
    }
  }

  // 11. High Contrast: Disable
  if (
    /^(?:turn\s+off|disable)\s+(?:the\s+)?high\s+contrast(?:\s+mode)?$/i.test(cmd) ||
    cmd === 'high contrast off'
  ) {
    if (context.setHighContrast) {
      context.setHighContrast(false);
      return { handled: true, response: 'High contrast display disabled.' };
    }
  }

  // 12. High Contrast: Toggle
  if (/^toggle\s+(?:high\s+)?contrast$/i.test(cmd)) {
    if (context.toggleHighContrast) {
      context.toggleHighContrast();
      return { handled: true, response: 'Toggled high contrast display.' };
    }
  }

  // 13. Spoken Audio Alerts (TTS): Enable
  if (
    /^(?:turn\s+on|enable)\s+(?:the\s+)?(?:spoken\s+)?(?:audio|voice|speech)\s+alerts?$/i.test(cmd) ||
    cmd === 'audio alerts on'
  ) {
    if (context.setAudioAlerts) {
      context.setAudioAlerts(true);
      return { handled: true, response: 'Spoken audio warnings enabled.' };
    }
  }

  // 14. Spoken Audio Alerts (TTS): Disable
  if (
    /^(?:turn\s+off|disable)\s+(?:the\s+)?(?:spoken\s+)?(?:audio|voice|speech)\s+alerts?$/i.test(cmd) ||
    cmd === 'audio alerts off'
  ) {
    if (context.setAudioAlerts) {
      context.setAudioAlerts(false);
      return { handled: true, response: 'Spoken audio warnings disabled.' };
    }
  }

  // 15. Visual Alerts: Enable / Disable
  if (/^(?:turn\s+on|enable)\s+(?:the\s+)?visual\s+alerts?$/i.test(cmd)) {
    if (context.setVisualAlerts) {
      context.setVisualAlerts(true);
      return { handled: true, response: 'Visual hazard alerts enabled.' };
    }
  }
  if (/^(?:turn\s+off|disable)\s+(?:the\s+)?visual\s+alerts?$/i.test(cmd)) {
    if (context.setVisualAlerts) {
      context.setVisualAlerts(false);
      return { handled: true, response: 'Visual hazard alerts disabled.' };
    }
  }

  // 16. OCR: Read Sign / Text Aloud
  if (
    /^(?:read|scan)\s+(?:the\s+)?(?:sign|text|board)(?:\s+aloud)?$/i.test(cmd) ||
    cmd === 'read aloud' ||
    cmd === 'what does that sign say' ||
    cmd === 'what does the sign say' ||
    cmd === 'read text' ||
    cmd === 'scan text'
  ) {
    if (context.readOcr) {
      const ocrText = context.readOcr();
      if (ocrText) {
        return { handled: true, response: `The sign reads: ${ocrText}` };
      }
      return { handled: true, response: 'Scanning for signage text in view.' };
    }
  }

  // 17. Alert Event History: Clear
  if (/^(?:clear|reset)\s+(?:the\s+)?(?:alert\s+)?(?:history|log|events?)$/i.test(cmd)) {
    if (context.clearHistory) {
      context.clearHistory();
      return { handled: true, response: 'Alert event history cleared.' };
    }
  }

  // 18. Alert Event History: Show / Hide
  if (/^(?:show|open|expand)\s+(?:the\s+)?(?:alert\s+)?(?:history|log)$/i.test(cmd)) {
    if (context.setShowHistory) {
      context.setShowHistory(true);
      return { handled: true, response: 'Showing alert event log.' };
    }
  }
  if (/^(?:hide|close|collapse)\s+(?:the\s+)?(?:alert\s+)?(?:history|log)$/i.test(cmd)) {
    if (context.setShowHistory) {
      context.setShowHistory(false);
      return { handled: true, response: 'Hiding alert event log.' };
    }
  }

  // 19. Replay / Repeat Last Alert
  if (
    /^(?:replay|repeat|hear)\s+(?:the\s+)?(?:last\s+)?alert$/i.test(cmd) ||
    cmd === 'what was that alert' ||
    cmd === 'what was the last alert' ||
    cmd === 'repeat warning' ||
    cmd === 'hear alert'
  ) {
    if (context.replayLastAlert) {
      const res = context.replayLastAlert();
      return { handled: true, response: res || 'Replaying last safety alert.' };
    }
  }

  // 20. Navigation: Dashboard
  if (
    /^(?:go\s+to|open|show|navigate\s+to)\s+(?:the\s+)?dashboard$/i.test(cmd) ||
    cmd === 'dashboard'
  ) {
    if (context.setPage) {
      context.setPage('dashboard');
      return { handled: true, response: 'Opening dashboard.' };
    }
  }

  // 21. Navigation: Settings
  if (
    /^(?:go\s+to|open|show|navigate\s+to)\s+(?:the\s+)?settings$/i.test(cmd) ||
    cmd === 'settings'
  ) {
    if (context.setPage) {
      context.setPage('settings');
      return { handled: true, response: 'Opening settings.' };
    }
  }

  // 22. Navigation: Evaluation
  if (
    /^(?:go\s+to|open|show|navigate\s+to)\s+(?:the\s+)?evaluation$/i.test(cmd) ||
    cmd === 'evaluation'
  ) {
    if (context.setPage) {
      context.setPage('evaluation');
      return { handled: true, response: 'Opening evaluation.' };
    }
  }

  // 23. Reset Defaults Settings
  if (
    /^(?:reset|restore)\s+(?:the\s+)?(?:default\s+)?settings$/i.test(cmd) ||
    cmd === 'reset defaults'
  ) {
    if (context.resetSettings) {
      context.resetSettings();
      return { handled: true, response: 'All settings have been reset to defaults.' };
    }
  }

  // 24. Staged Hazard Simulation: Critical Approaching Car
  if (
    /^(?:trigger|test|simulate)\s+(?:a\s+)?(?:critical\s+)?(?:approaching\s+)?car$/i.test(cmd) ||
    cmd === 'critical approaching car' ||
    cmd === 'test car' ||
    cmd === 'simulate car'
  ) {
    if (context.triggerCriticalCar) {
      context.triggerCriticalCar();
      return { handled: true, response: 'Simulating critical approaching car.' };
    }
  }

  // 25. Staged Hazard Simulation: Pothole in Walk Path
  if (
    /^(?:trigger|test|simulate)\s+(?:a\s+)?pothole(?:\s+in\s+walk\s+path)?$/i.test(cmd) ||
    cmd === 'pothole in walk path' ||
    cmd === 'test pothole' ||
    cmd === 'simulate pothole'
  ) {
    if (context.triggerPothole) {
      context.triggerPothole();
      return { handled: true, response: 'Simulating pothole in walking path.' };
    }
  }

  // 26. Audio Test: Car Horn
  if (
    /^(?:trigger|test|play|sound)\s+(?:a\s+)?(?:car\s+)?horn(?:\s+sound)?$/i.test(cmd) ||
    cmd === 'car horn sound' ||
    cmd === 'test horn' ||
    cmd === 'sound horn'
  ) {
    if (context.triggerHorn) {
      context.triggerHorn();
      return { handled: true, response: 'Testing vehicle horn sound.' };
    }
  }

  // 27. Audio Test: Emergency Siren
  if (
    /^(?:trigger|test|play|sound)\s+(?:an\s+)?(?:emergency\s+)?siren(?:\s+sound)?$/i.test(cmd) ||
    cmd === 'siren sound' ||
    cmd === 'test siren' ||
    cmd === 'play siren'
  ) {
    if (context.triggerSiren) {
      context.triggerSiren();
      return { handled: true, response: 'Testing emergency siren sound.' };
    }
  }

  // 28. Camera Sensor Warning Toggle
  if (
    /^(?:toggle|test|simulate)\s+camera\s+(?:sensor\s+)?warning$/i.test(cmd) ||
    cmd === 'toggle camera warning'
  ) {
    if (context.toggleCameraWarning) {
      context.toggleCameraWarning();
      return { handled: true, response: 'Toggling camera sensor warning.' };
    }
  }

  // 29. Speech Speed adjustments
  const speedMatch = cmd.match(/^(?:set\s+)?speech\s+speed\s+(?:to\s+)?(0\.75|1(?:\.0)?|1\.25|1\.5)x?$/i);
  if (speedMatch) {
    const rate = parseFloat(speedMatch[1]);
    if (context.setSpeechSpeed) {
      context.setSpeechSpeed(rate);
      return { handled: true, response: `Speech speed set to ${rate}x.` };
    }
  }
  if (cmd === 'speed up speech' || cmd === 'faster speech') {
    if (context.setSpeechSpeed) {
      context.setSpeechSpeed(1.25);
      return { handled: true, response: 'Speech speed increased to 1.25x.' };
    }
  }
  if (cmd === 'slow down speech' || cmd === 'slower speech') {
    if (context.setSpeechSpeed) {
      context.setSpeechSpeed(0.75);
      return { handled: true, response: 'Speech speed slowed to 0.75x.' };
    }
  }

  // 30. Sensitivity
  const sensMatch = cmd.match(/^(?:set\s+)?sensitivity\s+(?:to\s+)?(low|normal|high)$/i);
  if (sensMatch) {
    const level = sensMatch[1].toUpperCase();
    if (context.setSensitivity) {
      context.setSensitivity(level);
      return { handled: true, response: `Sensitivity set to ${level.toLowerCase()}.` };
    }
  }

  // 31. Alert Frequency
  const freqMatch = cmd.match(/^(?:set\s+)?(?:alert\s+)?frequency\s+(?:to\s+)?(low|normal|high)$/i);
  if (freqMatch) {
    const level = freqMatch[1].toUpperCase();
    if (context.setAlertFrequency) {
      context.setAlertFrequency(level);
      return { handled: true, response: `Alert frequency set to ${level.toLowerCase()}.` };
    }
  }

  // 32. Stop / Silence Continuous Alarm
  if (
    /^(?:stop|silence|cancel|turn\s+off|mute)\s+(?:the\s+)?alarm$/i.test(cmd) ||
    cmd === 'alarm off' ||
    cmd === 'stop alarm' ||
    cmd === 'silence alarm'
  ) {
    if (context.stopAlarm) {
      context.stopAlarm();
      return { handled: true, response: 'Alarm silenced.' };
    }
  }

  return null;
}

