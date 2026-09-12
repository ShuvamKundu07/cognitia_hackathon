/**
 * Web Audio API utility for synthesized sound cues.
 * Non-jarring, highly legible auditory feedback for low-vision users.
 */

class SoundCueEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.alarmTimer = null;
    this.activeAlarmLevel = null;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) ||
                       (typeof globalThis !== 'undefined' && globalThis.AudioContext);
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setEnabled(val) {
    this.enabled = !!val;
    if (!this.enabled) {
      this.stopContinuousAlarm();
    }
  }

  /**
   * Immediately silences and stops all synthesized audio cues and continuous alarms.
   */
  stopAll() {
    this.stopContinuousAlarm();
    if (this.ctx) {
      try {
        if (this.ctx.state === 'running') {
          this.ctx.suspend().catch(() => {});
        }
      } catch (e) {
        console.warn('Could not suspend audio context:', e);
      }
    }
  }

  /**
   * Starts a continuous alarm for Caution (HIGH) or Serious Stop (CRITICAL) hazards.
   * Continues giving an audible pulsing alarm until the risk is mitigated.
   *
   * @param {'critical'|'high'|'caution'|'serious stop'} level
   */
  startContinuousAlarm(level = 'critical') {
    if (!this.enabled) return;
    const strLevel = String(level || '').toLowerCase();
    const normLevel = strLevel.includes('stop') || strLevel === 'critical' ? 'critical' : 'high';

    // If critical alarm is already actively sounding, do not downgrade to high
    if (this.activeAlarmLevel === 'critical' && normLevel === 'high') {
      return;
    }
    // If the same alarm level is already actively running, keep it going smoothly
    if (this.alarmTimer && this.activeAlarmLevel === normLevel) {
      return;
    }

    this.init();
    if (!this.ctx) return;

    this.stopContinuousAlarm();
    this.activeAlarmLevel = normLevel;

    const isCritical = normLevel === 'critical';
    const intervalMs = isCritical ? 450 : 900;

    const playPulse = () => {
      if (!this.enabled || !this.ctx) return;
      try {
        if (this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
        const now = this.ctx.currentTime;
        if (isCritical) {
          // Serious stop: rapid urgent dual-frequency sawtooth beep
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(880, now);
          osc.frequency.exponentialRampToValueAtTime(440, now + 0.15);

          gain.gain.setValueAtTime(0.07, now);
          gain.gain.exponentialRampToValueAtTime(0.005, now + 0.15);

          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.15);
        } else {
          // Caution: warning chime pulse
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(587.33, now); // D5
          osc.frequency.exponentialRampToValueAtTime(523.25, now + 0.20); // C5

          gain.gain.setValueAtTime(0.05, now);
          gain.gain.exponentialRampToValueAtTime(0.002, now + 0.20);

          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.20);
        }
      } catch (e) {
        console.warn('Continuous alarm pulse error:', e);
      }
    };

    playPulse();
    this.alarmTimer = setInterval(playPulse, intervalMs);
  }

  /**
   * Stops the continuous alarm immediately when the hazard risk is mitigated.
   */
  stopContinuousAlarm() {
    if (this.alarmTimer) {
      clearInterval(this.alarmTimer);
      this.alarmTimer = null;
    }
    this.activeAlarmLevel = null;
  }

  /**
   * Checks whether the continuous alarm is currently sounding.
   */
  isAlarmActive() {
    return !!this.alarmTimer;
  }

  /**
   * Urgent dual-frequency beep for CRITICAL hazards (immediate danger).
   */
  playCriticalAlert() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      
      // Tone 1
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(880, now); // A5
      osc1.frequency.exponentialRampToValueAtTime(440, now + 0.15);
      
      // Keep alert notification sound lower than speech sound
      gain1.gain.setValueAtTime(0.08, now);
      gain1.gain.exponentialRampToValueAtTime(0.005, now + 0.15);
      
      osc1.connect(gain1);
      gain1.connect(this.ctx.destination);
      
      osc1.start(now);
      osc1.stop(now + 0.15);

      // Tone 2 (repeats rapidly after 0.18s)
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(880, now + 0.18);
      osc2.frequency.exponentialRampToValueAtTime(440, now + 0.33);
      
      gain2.gain.setValueAtTime(0.08, now + 0.18);
      gain2.gain.exponentialRampToValueAtTime(0.005, now + 0.33);

      osc2.connect(gain2);
      gain2.connect(this.ctx.destination);

      osc2.start(now + 0.18);
      osc2.stop(now + 0.33);
    } catch (e) {
      console.warn('Audio cue failed:', e);
    }
  }

  /**
   * Caution chime for HIGH hazards.
   */
  playWarningChime() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.2); // E5
      
      // Gentle warning chime so speech sound is more prominent than notification
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.start(now);
      osc.stop(now + 0.25);
    } catch (e) {
      console.warn('Warning chime failed:', e);
    }
  }

  /**
   * Pleasant ascending two-tone chime when assistant wakes up.
   */
  playWakeWord() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.12); // G5

      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.22);
    } catch (e) {
      console.warn('Wake word sound failed:', e);
    }
  }

  /**
   * Click/blip tone when microphone starts listening.
   */
  playMicStart() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(880, now + 0.05);
      
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.start(now);
      osc.stop(now + 0.1);
    } catch (e) {
      console.warn('Mic start sound failed:', e);
    }
  }

  /**
   * Gentle resolving chime when a hazard clears.
   */
  playResolvedTone() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, now); // E5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.18); // A5
      
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.start(now);
      osc.stop(now + 0.22);
    } catch (e) {
      console.warn('Resolved tone failed:', e);
    }
  }

  /**
   * Synthesizes a realistic dual-tone automotive vehicle horn (415 Hz + 505 Hz).
   * Generates audible testing feedback and feeds microphone input.
   *
   * @param {number} durationSeconds Duration of horn honk (default 0.65s)
   */
  playHornSound(durationSeconds = 0.65) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const dur = Math.max(0.2, Math.min(2.0, durationSeconds));

      // Dual automotive horn fundamentals: Low (415 Hz) & High (505 Hz)
      const freqs = [415, 505];
      freqs.forEach((freq) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // Sawtooth wave provides realistic automotive horn diaphragm harmonics
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);

        // Attack - Sustain - Release envelope
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.08, now + 0.02);
        gain.gain.setValueAtTime(0.08, now + dur - 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + dur);
      });
    } catch (e) {
      console.warn('Synthesized horn sound failed:', e);
    }
  }

  /**
   * Synthesizes a realistic emergency vehicle siren wail sweep (750 Hz -> 1450 Hz -> 750 Hz).
   *
   * @param {number} durationSeconds Duration of siren sweep (default 1.2s)
   */
  playSirenSound(durationSeconds = 1.2) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const dur = Math.max(0.4, Math.min(3.0, durationSeconds));
      const half = dur / 2;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(750, now);
      osc.frequency.linearRampToValueAtTime(1450, now + half);
      osc.frequency.linearRampToValueAtTime(750, now + dur);

      // Smooth envelope
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.09, now + 0.04);
      gain.gain.setValueAtTime(0.09, now + dur - 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + dur);
    } catch (e) {
      console.warn('Synthesized siren sound failed:', e);
    }
  }
}

export const soundCues = new SoundCueEngine();


