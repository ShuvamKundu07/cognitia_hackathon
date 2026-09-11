import { HazardOverlay } from './HazardOverlay';
import { Camera as CameraIcon, AlertCircle, RefreshCw, VideoOff, Play, Square } from 'lucide-react';

export function Camera({
  videoRef,
  isActive,
  isLoading,
  error,
  _permissionState,
  onRetry,
  onStartCamera,
  onStopCamera,
  objects = [],
  walkingPath,
  showWalkingPath = true,
  fps = 10,
  onFpsChange,
  devices = [],
  selectedDeviceId,
  onDeviceChange,
}) {
  return (
    <section
      aria-labelledby="camera-heading"
      className="relative flex flex-col bg-surface-card border-2 border-surface-border rounded-xl overflow-hidden shadow-2xl focus-within:border-sky-500"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-surface-elevated border-b border-surface-border">
        <div className="flex items-center gap-2">
          <CameraIcon className="w-5 h-5 text-sky-400" aria-hidden="true" />
          <h2 id="camera-heading" className="text-base font-bold text-white tracking-wide">
            LIVE CAMERA FEED
          </h2>
          {isActive && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-600 rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              LIVE
            </span>
          )}
        </div>

        {/* Camera Controls */}
        <div className="flex items-center gap-3">
          {/* Start / Stop Camera Toggle Button */}
          {isActive ? (
            <button
              type="button"
              onClick={onStopCamera}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg shadow-md transition-all active:scale-95 focus:ring-2 focus:ring-rose-400"
              aria-label="Stop detection camera"
              title="Turn off live camera and stop detection"
            >
              <Square className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
              <span>Stop Camera</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onStartCamera || onRetry}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-lg shadow-md transition-all active:scale-95 focus:ring-2 focus:ring-emerald-400"
              aria-label="Start detection camera"
              title="Turn on live camera and begin hazard detection"
            >
              <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
              <span>Start Camera</span>
            </button>
          )}

          {/* FPS Selector */}
          <div className="flex items-center gap-1.5 text-xs text-slate-300">
            <label htmlFor="fps-select" className="font-medium text-slate-400">
              AI FPS:
            </label>
            <select
              id="fps-select"
              value={fps}
              onChange={(e) => onFpsChange && onFpsChange(Number(e.target.value))}
              className="bg-surface-darkest border border-surface-border rounded px-2 py-1 text-xs text-white focus:ring-2 focus:ring-sky-400"
              aria-label="Set AI Processing Frame Rate"
            >
              <option value="8">8 FPS</option>
              <option value="10">10 FPS (Default)</option>
              <option value="12">12 FPS</option>
              <option value="15">15 FPS</option>
            </select>
          </div>

          {/* Device Selector */}
          {devices.length > 1 && (
            <select
              id="camera-select"
              value={selectedDeviceId}
              onChange={(e) => onDeviceChange && onDeviceChange(e.target.value)}
              className="bg-surface-darkest border border-surface-border rounded px-2 py-1 text-xs text-white max-w-[140px] truncate focus:ring-2 focus:ring-sky-400"
              aria-label="Select camera device"
            >
              {devices.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Main Video Viewport */}
      <div className="relative aspect-video w-full bg-black flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover ${!isActive ? 'hidden' : 'block'}`}
          aria-label="Live forward-facing pedestrian camera view"
        />

        {isActive && (
          <>
            <HazardOverlay
              objects={objects}
              walkingPath={walkingPath}
              showWalkingPath={showWalkingPath}
            />
            {/* Quick Stop Button overlay in viewport */}
            <div className="absolute top-3 right-3 z-30">
              <button
                type="button"
                onClick={onStopCamera}
                className="flex items-center gap-1.5 px-3 py-1 bg-black/75 hover:bg-rose-600 text-white/90 hover:text-white backdrop-blur border border-white/20 hover:border-rose-500 rounded-lg text-xs font-bold transition-all shadow focus:ring-2 focus:ring-rose-400"
                aria-label="Stop detection camera"
                title="Stop camera"
              >
                <Square className="w-3 h-3 fill-current" aria-hidden="true" />
                <span>Stop</span>
              </button>
            </div>
          </>
        )}

        {isLoading && (
          <div className="flex flex-col items-center gap-3 text-slate-300 p-6 text-center">
            <RefreshCw className="w-10 h-10 text-sky-400 animate-spin" aria-hidden="true" />
            <p className="text-base font-medium">Initializing camera sensor...</p>
          </div>
        )}

        {!isLoading && error && (
          <div
            role="alert"
            className="flex flex-col items-center gap-4 text-center max-w-md p-6 bg-red-950/90 border-2 border-red-500 rounded-xl m-4"
          >
            <AlertCircle className="w-12 h-12 text-red-400" aria-hidden="true" />
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Camera Sensor Offline</h3>
              <p className="text-sm text-red-200">{error}</p>
            </div>
            {(onStartCamera || onRetry) && (
              <button
                type="button"
                onClick={onStartCamera || onRetry}
                className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg text-sm transition-colors focus:ring-4 focus:ring-red-400"
              >
                <RefreshCw className="w-4 h-4" />
                Retry Camera Access
              </button>
            )}
          </div>
        )}

        {!isLoading && !error && !isActive && (
          <div className="flex flex-col items-center gap-3 text-slate-400 p-6 text-center max-w-sm">
            <div className="w-14 h-14 rounded-full bg-surface-elevated border-2 border-surface-border flex items-center justify-center text-slate-400 shadow-inner">
              <VideoOff className="w-7 h-7 text-slate-400" aria-hidden="true" />
            </div>
            <div>
              <p className="text-base font-bold text-white">Detection Camera is Off</p>
              <p className="text-xs text-slate-300 mt-1">
                Click Start to turn on your camera and begin real-time hazard detection.
              </p>
            </div>
            <button
              type="button"
              onClick={onStartCamera || onRetry}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm transition-all shadow-lg hover:shadow-emerald-600/30 active:scale-95 focus:ring-4 focus:ring-emerald-400"
              aria-label="Start Detection Camera"
            >
              <Play className="w-4 h-4 fill-current" aria-hidden="true" />
              <span>Start Detection Camera</span>
            </button>
          </div>
        )}
      </div>

      <div className="sr-only" aria-live="polite">
        {isActive
          ? `Camera active. ${objects.length} potential hazards currently in field of view.`
          : 'Camera is currently disconnected.'}
      </div>
    </section>
  );
}

