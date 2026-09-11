import { useState } from 'react';
import { Camera } from '../components/Camera';
import { PriorityAlert } from '../components/PriorityAlert';
import { HazardList } from '../components/HazardList';
import { Conversation } from '../components/Conversation';
import { AudioStatus } from '../components/AudioStatus';
import { OCRResult } from '../components/OCRResult';
import { AlertHistory } from '../components/AlertHistory';
import { AlertOctagon, Volume2, EyeOff, ShieldAlert, Sparkles } from 'lucide-react';

export function Dashboard({
  // Camera
  videoRef,
  isCameraActive,
  isCameraLoading,
  cameraError,
  cameraPermission,
  onRetryCamera,
  onStartCamera,
  onStopCamera,
  cameraDevices,
  selectedCameraId,
  onCameraDeviceChange,
  cameraFps,
  onFpsChange,

  // Hazards & Alerts
  activeObjects,
  walkingPath,
  showWalkingPath,
  priorityHazards,
  currentHazard,
  onSelectHazard,
  alertHistory,
  onClearHistory,

  // Speech & Voice
  onReplayAlertSpeech,
  isSpeaking,
  conversationState,
  userTranscript,
  interimTranscript,
  assistantResponse,
  isListening,
  onToggleListening,
  onSubmitText,
  onReplayAssistantResponse,
  speechError,

  // OCR
  ocrResult,
  ocrHistory,
  onSpeakOCR,

  // Audio radar
  micStatus,
  audioAiStatus,
  audioLevel,
  latestAudioEvent,
  onToggleMute,
  isMuted,

  // System status (hidden from UI)
  systemHealth: _systemHealth,
  systemFailures: _systemFailures,
  onDismissFailure: _onDismissFailure,

  // Mock Mode & Testing
  isMockMode,
  mockBackend,
  onTriggerTestAudio,
}) {
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto">
      {/* Mock Mode Interactive Simulator Bar */}
      {isMockMode && mockBackend && (
        <aside
          aria-label="Simulation demonstration controls"
          className="p-3.5 rounded-xl bg-purple-950/80 border-2 border-purple-500/70 shadow-lg flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-300" />
            <div>
              <span className="text-xs font-black uppercase tracking-wider text-purple-200">
                Interactive Mock Simulation Controls
              </span>
              <p className="text-[11px] text-purple-300">
                Trigger staged hazards directly to evaluate immediate safety reactions and TTS interruption:
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => mockBackend.triggerCriticalCar()}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition-transform active:scale-95 flex items-center gap-1.5 shadow"
            >
              <AlertOctagon className="w-3.5 h-3.5" />
              Critical Approaching Car
            </button>

            <button
              type="button"
              onClick={() => mockBackend.triggerPotholeAhead()}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold transition-transform active:scale-95 flex items-center gap-1.5 shadow"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              Pothole in Walk Path
            </button>

            <button
              type="button"
              onClick={() => {
                if (onTriggerTestAudio) {
                  onTriggerTestAudio('Vehicle Horn', 'Right');
                } else if (mockBackend) {
                  mockBackend.triggerHornAudio();
                }
              }}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold transition-transform active:scale-95 flex items-center gap-1.5 shadow"
            >
              <Volume2 className="w-3.5 h-3.5" />
              Car Horn Sound
            </button>

            <button
              type="button"
              onClick={() => {
                if (onTriggerTestAudio) {
                  onTriggerTestAudio('Emergency Siren', 'Left');
                } else if (mockBackend) {
                  mockBackend.triggerSirenAudio();
                }
              }}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-transform active:scale-95 flex items-center gap-1.5 shadow"
            >
              <Volume2 className="w-3.5 h-3.5" />
              Siren Sound
            </button>

            <button
              type="button"
              onClick={() => mockBackend.toggleCameraVisibilityFailure()}
              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-bold transition-transform active:scale-95 flex items-center gap-1.5 shadow"
            >
              <EyeOff className="w-3.5 h-3.5" />
              Toggle Camera Warning
            </button>
          </div>
        </aside>
      )}

      {/* Main Dual Column Dashboard Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Live Camera Feed & Acoustic Radar (6 cols on lg) */}
        <div className="lg:col-span-6 flex flex-col gap-6">
          <Camera
            videoRef={videoRef}
            isActive={isCameraActive}
            isLoading={isCameraLoading}
            error={cameraError}
            permissionState={cameraPermission}
            onRetry={onRetryCamera}
            onStartCamera={onStartCamera}
            onStopCamera={onStopCamera}
            objects={activeObjects}
            walkingPath={walkingPath}
            showWalkingPath={showWalkingPath}
            fps={cameraFps}
            onFpsChange={onFpsChange}
            devices={cameraDevices}
            selectedDeviceId={selectedCameraId}
            onDeviceChange={onCameraDeviceChange}
          />

          {/* Acoustic Radar */}
          <AudioStatus
            micStatus={micStatus}
            audioAiStatus={audioAiStatus}
            audioLevel={audioLevel}
            latestAudioEvent={latestAudioEvent}
            onToggleMute={onToggleMute}
            isMuted={isMuted}
            onTriggerTestAudio={onTriggerTestAudio}
          />

          {/* OCR Result Box (when text detected) */}
          <OCRResult
            ocrResult={ocrResult}
            ocrHistory={ocrHistory}
            onSpeakText={onSpeakOCR}
            isSpeaking={isSpeaking}
          />
        </div>

        {/* RIGHT COLUMN: Priority Hazard Alert & Prioritized Queue (6 cols on lg) */}
        <div className="lg:col-span-6 flex flex-col gap-6">
          {/* Top Priority Hazard Card */}
          <PriorityAlert
            hazard={currentHazard}
            onReplaySpeech={onReplayAlertSpeech}
            isSpeaking={isSpeaking}
          />

          {/* Sequential Prioritized Hazard Queue */}
          <HazardList
            hazards={priorityHazards}
            walkingPath={walkingPath}
            onSelectHazard={onSelectHazard}
          />
        </div>
      </div>

      {/* BOTTOM AREA: Conversational Voice Assistant Panel */}
      <div className="w-full">
        <Conversation
          conversationState={conversationState}
          userTranscript={userTranscript}
          interimTranscript={interimTranscript}
          assistantResponse={assistantResponse}
          isListening={isListening}
          onToggleListening={onToggleListening}
          onSubmitText={onSubmitText}
          onReplayResponse={onReplayAssistantResponse}
          isSpeaking={isSpeaking}
          error={speechError}
        />
      </div>

      {/* Alert Event History Collapsible Toggle */}
      <div className="flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 text-xs font-bold text-slate-300 hover:text-white uppercase tracking-wider py-1 px-3 rounded bg-surface-elevated border border-surface-border transition-colors focus:ring-2 focus:ring-sky-400"
          >
            <span>{showHistory ? '▲ Hide Alert Event Log' : '▼ Show Full Alert Event Log'}</span>
            <span className="text-[10px] text-slate-400 font-mono">
              ({alertHistory.length} recorded)
            </span>
          </button>
        </div>

        {showHistory && (
          <AlertHistory
            history={alertHistory}
            onClearHistory={onClearHistory}
          />
        )}
      </div>
    </div>
  );
}

