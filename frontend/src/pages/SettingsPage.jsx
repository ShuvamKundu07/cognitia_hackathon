import { Settings } from '../components/Settings';

export function SettingsPage({
  settings,
  onUpdateSettings,
  onResetSettings,
}) {
  return (
    <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto">
      <Settings
        settings={settings}
        onUpdateSettings={onUpdateSettings}
        onResetSettings={onResetSettings}
      />
    </div>
  );
}

