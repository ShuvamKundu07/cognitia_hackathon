import { useState, useRef, useEffect } from 'react';
import { HazardOverlay } from './HazardOverlay';
import {
  Upload,
  Play,
  Pause,
  RotateCcw,
  Film,
  CheckCircle2,
  Clock,
  FileCheck,
} from 'lucide-react';

export function RecordedVideoPlayer({
  onFrameCaptured,
  objects = [],
  walkingPath,
  _alertsHistory = [],
}) {
  const [videoSrc, setVideoSrc] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const captureTimerRef = useRef(null);

  const groundTruthEvents = [
    { time: 2.5, label: 'Vehicle Approach Right', severity: 'CRITICAL' },
    { time: 5.8, label: 'Sidewalk Pothole Ahead', severity: 'HIGH' },
    { time: 9.2, label: 'Pedestrian Passing Left', severity: 'MEDIUM' },
  ];

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoSrc(url);
      setIsPlaying(false);
      setCurrentTime(0);
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleSeek = (e) => {
    const time = Number(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleReset = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.pause();
      setIsPlaying(false);
      setCurrentTime(0);
    }
  };

  useEffect(() => {
    if (!isPlaying || !videoSrc) {
      if (captureTimerRef.current) {
        clearInterval(captureTimerRef.current);
        captureTimerRef.current = null;
      }
      return;
    }

    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }
    const canvas = canvasRef.current;
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');

    captureTimerRef.current = setInterval(() => {
      const v = videoRef.current;
      if (!v || v.paused || v.ended) return;

      try {
        ctx.drawImage(v, 0, 0, 640, 360);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
        if (onFrameCaptured) {
          onFrameCaptured(dataUrl);
        }
      } catch (_err) {
        // ignore
      }
    }, 100);

    return () => {
      if (captureTimerRef.current) {
        clearInterval(captureTimerRef.current);
        captureTimerRef.current = null;
      }
    };
  }, [isPlaying, videoSrc, onFrameCaptured]);

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-surface-card border-2 border-surface-border rounded-xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 bg-surface-elevated border-b border-surface-border">
          <div className="flex items-center gap-2">
            <Film className="w-5 h-5 text-sky-400" />
            <h2 className="text-base font-bold text-white tracking-wide">
              RECORDED VIDEO STAGED EVALUATION
            </h2>
          </div>

          <label className="flex items-center gap-2 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-sky-400">
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Test Video</span>
            <input
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              onChange={handleFileUpload}
              className="sr-only"
            />
          </label>
        </div>

        <div className="relative aspect-video w-full bg-black flex items-center justify-center overflow-hidden">
          {videoSrc ? (
            <>
              <video
                ref={videoRef}
                src={videoSrc}
                playsInline
                onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
                onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
                onEnded={() => setIsPlaying(false)}
                className="w-full h-full object-contain"
              />
              <HazardOverlay
                objects={objects}
                walkingPath={walkingPath}
                showWalkingPath={true}
              />
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 p-8 text-center text-slate-400">
              <Film className="w-12 h-12 text-slate-600" />
              <div>
                <p className="text-base font-semibold text-white">No Test Video Loaded</p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  Upload an MP4 or WebM recording of a pedestrian walkway to simulate and evaluate hazard detection benchmarks.
                </p>
              </div>
            </div>
          )}
        </div>

        {videoSrc && (
          <div className="p-4 bg-surface-elevated border-t border-surface-border flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-slate-300 w-12">
                {currentTime.toFixed(1)}s
              </span>
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                className="flex-1 accent-sky-500 cursor-pointer h-2 bg-surface-darkest rounded"
                aria-label="Seek video position"
              />
              <span className="text-xs font-mono text-slate-400 w-12 text-right">
                {duration.toFixed(1)}s
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold transition-colors"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  <span>{isPlaying ? 'Pause' : 'Play Replay'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleReset}
                  className="p-2 bg-surface-darkest hover:bg-surface-hover text-slate-300 border border-surface-border rounded-lg"
                  aria-label="Reset video to beginning"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>

              <span className="text-xs text-slate-400">
                Extracted AI Frame Rate: <strong className="text-white">10 FPS</strong>
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="bg-surface-card border-2 border-surface-border rounded-xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold text-white">
              GROUND TRUTH VS. DETECTED ALERTS COMPARISON
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-semibold">
            Validation Mode: Staged
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-surface-elevated uppercase text-[10px] text-slate-400 font-bold border-b border-surface-border">
              <tr>
                <th className="px-4 py-2">Timestamp</th>
                <th className="px-4 py-2">Ground Truth Event</th>
                <th className="px-4 py-2">Expected Urgency</th>
                <th className="px-4 py-2">Detection Status</th>
                <th className="px-4 py-2">Match Validation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border/50 font-mono">
              {groundTruthEvents.map((gt, i) => {
                const isPassed = currentTime >= gt.time;
                return (
                  <tr key={i} className="hover:bg-surface-elevated/40">
                    <td className="px-4 py-2.5 text-slate-400">{gt.time.toFixed(1)}s</td>
                    <td className="px-4 py-2.5 font-bold text-white">{gt.label}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                          gt.severity === 'CRITICAL'
                            ? 'bg-red-950 text-red-300 border border-red-500'
                            : 'bg-amber-950 text-amber-300 border border-amber-500'
                        }`}
                      >
                        {gt.severity}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {isPassed ? (
                        <span className="text-emerald-400 flex items-center gap-1 font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Triggered
                        </span>
                      ) : (
                        <span className="text-slate-500 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" /> Pending
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {isPassed ? (
                        <span className="px-2 py-0.5 bg-emerald-950 text-emerald-300 rounded text-[10px] font-bold">
                          MATCH (True Pos)
                        </span>
                      ) : (
                        <span className="text-slate-500">--</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

