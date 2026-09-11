import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Custom hook for microphone streaming, permission handling,
 * real-time audio volume analysis, and audio chunk dispatch.
 */
export function useMicrophone({ onAudioChunk, enabled = true, autoStart = false } = {}) {
  const [stream, setStream] = useState(null);
  const [permissionState, setPermissionState] = useState('prompt');
  const [isMuted, setIsMuted] = useState(true);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState(null);

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const processorRef = useRef(null);
  const sourceRef = useRef(null);
  const animFrameRef = useRef(null);
  const onAudioChunkRef = useRef(onAudioChunk);
  const streamRef = useRef(null);

  // Buffer for accumulating 0.5s chunks at 16kHz
  const leftBufferRef = useRef([]);
  const rightBufferRef = useRef([]);

  useEffect(() => {
    onAudioChunkRef.current = onAudioChunk;
  }, [onAudioChunk]);

  const stopMicrophone = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch (_e) {
        // ignore
      }
      processorRef.current = null;
    }
    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch (_e) {
        // ignore
      }
      sourceRef.current = null;
    }
    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch (_e) {
        // ignore
      }
      analyserRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    leftBufferRef.current = [];
    rightBufferRef.current = [];
    setStream(null);
    setAudioLevel(0);
  }, []);

  const startMicrophone = useCallback(async () => {
    if (!enabled) return;
    if (!navigator?.mediaDevices?.getUserMedia) {
      setError('Audio input is not supported in this browser.');
      setPermissionState('denied');
      return;
    }

    try {
      setError(null);
      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
          channelCount: 2,
        },
      });

      streamRef.current = audioStream;
      setStream(audioStream);
      setPermissionState('granted');
      setIsMuted(false);

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        const audioCtx = new AudioContextClass();
        audioContextRef.current = audioCtx;

        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }

        const source = audioCtx.createMediaStreamSource(audioStream);
        sourceRef.current = source;

        // 1. Analyser for real-time visual meter (0-100%)
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        analyserRef.current = analyser;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const updateLevel = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
          }
          const average = sum / bufferLength;
          // Scale non-linearly to make normal room sounds visible
          const scaled = Math.min(100, Math.round(Math.pow(average / 128, 0.8) * 100));
          setAudioLevel(scaled);
          animFrameRef.current = requestAnimationFrame(updateLevel);
        };
        updateLevel();

        // 2. ScriptProcessor for raw stereo PCM sample streaming (0.5s chunks)
        const bufferSize = 4096;
        const processor = audioCtx.createScriptProcessor(bufferSize, 2, 2);
        processorRef.current = processor;

        const targetSampleRate = 16000;
        const downsampleFactor = Math.max(1, Math.round(audioCtx.sampleRate / targetSampleRate));
        const samplesPerChunk = targetSampleRate * 0.5; // 8000 samples for 0.5s

        processor.onaudioprocess = (e) => {
          if (!onAudioChunkRef.current) return;

          const left = e.inputBuffer.getChannelData(0);
          const hasRight = e.inputBuffer.numberOfChannels > 1;
          const right = hasRight ? e.inputBuffer.getChannelData(1) : left;

          // Downsample to 16kHz
          for (let i = 0; i < left.length; i += downsampleFactor) {
            leftBufferRef.current.push(left[i]);
            rightBufferRef.current.push(right[i]);
          }

          if (leftBufferRef.current.length >= samplesPerChunk) {
            const count = samplesPerChunk;
            const leftChunk = leftBufferRef.current.splice(0, count);
            const rightChunk = rightBufferRef.current.splice(0, count);

            // Interleave stereo int16 PCM
            const pcm16 = new Int16Array(count * 2);
            for (let j = 0; j < count; j++) {
              const l = Math.max(-1, Math.min(1, leftChunk[j]));
              const r = Math.max(-1, Math.min(1, rightChunk[j]));
              pcm16[j * 2] = l < 0 ? l * 0x8000 : l * 0x7fff;
              pcm16[j * 2 + 1] = r < 0 ? r * 0x8000 : r * 0x7fff;
            }

            // Convert buffer to base64
            let binary = '';
            const bytes = new Uint8Array(pcm16.buffer);
            const byteLen = bytes.byteLength;
            for (let k = 0; k < byteLen; k++) {
              binary += String.fromCharCode(bytes[k]);
            }
            const base64Data = btoa(binary);

            if (onAudioChunkRef.current) {
              onAudioChunkRef.current(base64Data);
            }
          }
        };

        source.connect(processor);
        // ScriptProcessor requires connection to destination to receive events
        // Connect via a zero-gain node so mic audio is not echoed to speaker
        const muteGain = audioCtx.createGain();
        muteGain.gain.value = 0.0;
        processor.connect(muteGain);
        muteGain.connect(audioCtx.destination);
      }
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionState('denied');
        setError('Microphone access denied. Enable mic in browser settings.');
      } else {
        setError(`Microphone error: ${err.message}`);
      }
    }
  }, [enabled]);

  const toggleMute = useCallback(async () => {
    if (!streamRef.current) {
      setIsMuted(false);
      await startMicrophone();
      return false;
    }

    const newMuted = !isMuted;
    streamRef.current.getAudioTracks().forEach((t) => {
      t.enabled = !newMuted;
    });
    setIsMuted(newMuted);
    if (newMuted) {
      setAudioLevel(0);
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // Ignore browser speech cancellation errors
        }
      }
    }
    return newMuted;
  }, [isMuted, startMicrophone]);

  // Only start microphone on mount if autoStart is true
  useEffect(() => {
    let cancelled = false;
    if (enabled && autoStart) {
      Promise.resolve().then(() => {
        if (!cancelled) {
          startMicrophone();
        }
      });
    }
    return () => {
      cancelled = true;
      stopMicrophone();
    };
  }, [enabled, autoStart, startMicrophone, stopMicrophone]);

  return {
    stream,
    isActive: !!stream && stream.active && !isMuted,
    permissionState,
    isMuted,
    audioLevel: isMuted ? 0 : audioLevel,
    error,
    toggleMute,
    startMicrophone,
    stopMicrophone,
  };
}
