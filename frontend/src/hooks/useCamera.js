import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Custom hook for live camera stream and throttled AI frame capture.
 * Ensures the preview video element renders at smooth 60fps,
 * while an offscreen canvas downscales frames for AI processing at 8-15 FPS.
 */
export function useCamera({
  targetFps = 10,
  targetWidth = 640,
  targetHeight = 360,
  onFrameCaptured,
  enabled = true,
  autoStart = false,
} = {}) {
  const [isStarted, setIsStarted] = useState(autoStart);
  const [stream, setStream] = useState(null);
  const [permissionState, setPermissionState] = useState('prompt');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [fps, setFps] = useState(targetFps);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const frameIntervalRef = useRef(null);
  const onFrameRef = useRef(onFrameCaptured);
  const streamRef = useRef(null);

  useEffect(() => {
    onFrameRef.current = onFrameCaptured;
  }, [onFrameCaptured]);

  const refreshDevices = useCallback(async () => {
    try {
      if (!navigator?.mediaDevices?.enumerateDevices) return;
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevs = allDevices.filter((d) => d.kind === 'videoinput');
      setDevices(videoDevs);
      if (videoDevs.length > 0 && !selectedDeviceId) {
        const backCam = videoDevs.find((d) =>
          d.label && (d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('environment'))
        );
        if (backCam) {
          setSelectedDeviceId(backCam.deviceId);
        }
      }
    } catch (_e) {
      // ignore
    }
  }, [selectedDeviceId]);

  // Start stream function (called when user clicks Start or retries)
  const startCamera = useCallback(async () => {
    if (!enabled) return;
    setIsStarted(true);

    if (!navigator?.mediaDevices?.getUserMedia) {
      setError('MediaDevices API is not supported in this browser.');
      setPermissionState('denied');
      return;
    }

    setIsLoading(true);
    setError(null);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    const videoConstraints = selectedDeviceId
      ? { deviceId: { exact: selectedDeviceId } }
      : { facingMode: { ideal: 'environment' } };

    videoConstraints.width = { ideal: 1280, max: 1920 };
    videoConstraints.height = { ideal: 720, max: 1920 };

    const constraints = {
      video: videoConstraints,
      audio: false,
    };

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = mediaStream;
      setStream(mediaStream);
      setPermissionState('granted');
      setIsLoading(false);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch(() => {});
      }

      refreshDevices();
    } catch (err) {
      setIsLoading(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionState('denied');
        setError('Camera access was denied. Please allow camera permissions in browser settings.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setError('No camera device detected on this system.');
      } else {
        setError(`Camera error: ${err.message || 'Stream interrupted'}`);
      }
    }
  }, [enabled, selectedDeviceId, refreshDevices]);

  // Stop camera stream (called when user clicks Stop)
  const stopCamera = useCallback(() => {
    setIsStarted(false);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setStream(null);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
  }, []);

  const toggleCamera = useCallback(() => {
    if (isStarted && stream) {
      stopCamera();
    } else {
      startCamera();
    }
  }, [isStarted, stream, startCamera, stopCamera]);

  const [videoDimensions, setVideoDimensions] = useState({
    width: 0,
    height: 0,
    isPortrait: false,
    aspectRatio: 16 / 9,
  });

  const switchCamera = useCallback(() => {
    if (!devices || devices.length < 2) return;
    const currentIndex = devices.findIndex((d) => d.deviceId === selectedDeviceId);
    const nextIndex = (currentIndex + 1) % devices.length;
    setSelectedDeviceId(devices[nextIndex].deviceId);
  }, [devices, selectedDeviceId]);

  // Effect to manage camera stream lifecycle when device changes while started
  useEffect(() => {
    if (!enabled || !isStarted) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      return;
    }
    let isCancelled = false;

    async function init() {
      if (!navigator?.mediaDevices?.getUserMedia) {
        setError('MediaDevices API is not supported in this browser.');
        setPermissionState('denied');
        return;
      }

      setIsLoading(true);
      setError(null);

      const videoConstraints = selectedDeviceId
        ? { deviceId: { exact: selectedDeviceId } }
        : { facingMode: { ideal: 'environment' } };

      videoConstraints.width = { ideal: 1280, max: 1920 };
      videoConstraints.height = { ideal: 720, max: 1920 };

      const constraints = {
        video: videoConstraints,
        audio: false,
      };

      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        if (isCancelled) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = mediaStream;
        setStream(mediaStream);
        setPermissionState('granted');
        setIsLoading(false);

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.play().catch(() => {});
        }

        refreshDevices();
      } catch (err) {
        if (isCancelled) return;
        setIsLoading(false);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setPermissionState('denied');
          setError('Camera access denied. Please allow camera permissions.');
        } else {
          setError(`Camera error: ${err.message || 'Stream failed'}`);
        }
      }
    }

    init();

    return () => {
      isCancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setStream(null);
    };
  }, [enabled, isStarted, selectedDeviceId, refreshDevices]);

  // Frame extraction loop
  useEffect(() => {
    if (!stream || !enabled || !isStarted || fps <= 0) {
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
        frameIntervalRef.current = null;
      }
      return;
    }

    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }
    const canvas = canvasRef.current;
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const intervalMs = Math.round(1000 / Math.max(1, Math.min(20, fps)));

    frameIntervalRef.current = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;

      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 360;

      // Update detected orientation/aspect ratio
      if (vw && vh && (vw !== videoDimensions.width || vh !== videoDimensions.height)) {
        setVideoDimensions({
          width: vw,
          height: vh,
          isPortrait: vh > vw,
          aspectRatio: vw / vh,
        });
      }

      // Preserve native aspect ratio (dynamic canvas dimensions for mobile portrait vs desktop landscape)
      let outW = 640;
      let outH = 360;
      if (vh > vw) {
        // Mobile portrait mode (e.g. 720x1280 or 1080x1920)
        outH = 640;
        outW = Math.round((vw / vh) * 640);
        if (outW % 2 !== 0) outW += 1;
      } else {
        // Landscape mode (e.g. 1280x720)
        outW = 640;
        outH = Math.round((vh / vw) * 640);
        if (outH % 2 !== 0) outH += 1;
      }

      if (canvas.width !== outW || canvas.height !== outH) {
        canvas.width = outW;
        canvas.height = outH;
      }

      try {
        ctx.drawImage(video, 0, 0, outW, outH);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
        if (onFrameRef.current) {
          onFrameRef.current(dataUrl);
        }
      } catch (_err) {
        // ignore
      }
    }, intervalMs);

    return () => {
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
        frameIntervalRef.current = null;
      }
    };
  }, [stream, enabled, isStarted, fps, targetWidth, targetHeight, videoDimensions.width, videoDimensions.height]);

  return {
    videoRef,
    stream,
    isStarted,
    isActive: isStarted && !!stream && stream.active,
    isLoading,
    permissionState,
    error,
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    videoDimensions,
    isPortrait: videoDimensions.isPortrait,
    switchCamera,
    fps,
    setFps,
    startCamera,
    stopCamera,
    toggleCamera,
  };
}

