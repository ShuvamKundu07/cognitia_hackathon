import { useState } from 'react';
import { EvaluationDashboard } from '../components/EvaluationDashboard';
import { RecordedVideoPlayer } from '../components/RecordedVideoPlayer';
import { BarChart2, Film } from 'lucide-react';

export function Evaluation({
  metrics,
  sessionStats,
  onRecordedFrameCaptured,
  activeObjects = [],
  walkingPath,
  alertHistory = [],
}) {
  const [activeTab, setActiveTab] = useState('metrics');

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto">
      {/* Tab Navigation */}
      <div className="flex items-center gap-3 p-1.5 bg-surface-card border-2 border-surface-border rounded-xl w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('metrics')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
            activeTab === 'metrics'
              ? 'bg-sky-600 text-white shadow'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          <BarChart2 className="w-4 h-4" />
          <span>Evaluation Metrics & Benchmark</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('replay')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
            activeTab === 'replay'
              ? 'bg-sky-600 text-white shadow'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          <Film className="w-4 h-4" />
          <span>Recorded Video Staged Testing</span>
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'metrics' ? (
        <EvaluationDashboard
          metrics={metrics}
          sessionStats={sessionStats}
        />
      ) : (
        <RecordedVideoPlayer
          onFrameCaptured={onRecordedFrameCaptured}
          objects={activeObjects}
          walkingPath={walkingPath}
          alertsHistory={alertHistory}
        />
      )}
    </div>
  );
}

