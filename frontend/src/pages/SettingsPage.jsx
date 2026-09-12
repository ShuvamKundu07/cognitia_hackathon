import { Settings } from '../components/Settings';

export function SettingsPage({
  settings,
  onUpdateSettings,
  onResetSettings,
  backendWsUrl,
  backendStatus,
  onUpdateBackendWsUrl,
  onResetBackendWsUrl,
  onCheckBackendHealth,
}) {
  return (
    <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto">
      <Settings
        settings={settings}
        onUpdateSettings={onUpdateSettings}
        onResetSettings={onResetSettings}
        backendWsUrl={backendWsUrl}
        backendStatus={backendStatus}
        onUpdateBackendWsUrl={onUpdateBackendWsUrl}
        onResetBackendWsUrl={onResetBackendWsUrl}
        onCheckBackendHealth={onCheckBackendHealth}
      />
    </div>
  );
}

