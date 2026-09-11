import { useState } from 'react';
import { formatTimestamp, formatConfidence, formatDirection } from '../utils/formatting';
import { getUrgencyStyles } from '../utils/hazardPriority';
import { History, Trash2, Filter } from 'lucide-react';

export function AlertHistory({
  history = [],
  onClearHistory,
}) {
  const [filterUrgency, setFilterUrgency] = useState('ALL');

  const filtered = history.filter((item) => {
    if (filterUrgency === 'ALL') return true;
    return (item.urgency || '').toUpperCase() === filterUrgency;
  });

  return (
    <section
      aria-labelledby="alert-history-heading"
      className="flex flex-col bg-surface-card border-2 border-surface-border rounded-xl overflow-hidden shadow-xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-surface-elevated border-b border-surface-border">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-slate-300" aria-hidden="true" />
          <h2 id="alert-history-heading" className="text-base font-bold text-white tracking-wide">
            SAFETY ALERT LOG & EVENT HISTORY
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {/* Urgency Filter */}
          <div className="flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={filterUrgency}
              onChange={(e) => setFilterUrgency(e.target.value)}
              className="bg-surface-darkest border border-surface-border rounded px-2 py-1 text-xs text-white"
              aria-label="Filter alert history by urgency"
            >
              <option value="ALL">All Urgencies</option>
              <option value="CRITICAL">Critical Only</option>
              <option value="HIGH">High Only</option>
              <option value="MEDIUM">Medium Only</option>
              <option value="LOW">Low Only</option>
            </select>
          </div>

          {/* Clear History Button */}
          {onClearHistory && (
            <button
              type="button"
              onClick={onClearHistory}
              disabled={history.length === 0}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-surface-darkest hover:bg-surface-hover text-slate-300 disabled:opacity-40 border border-surface-border rounded transition-colors"
              aria-label="Clear all alert history"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* History Table */}
      <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            No logged alert events match the selected criteria.
          </div>
        ) : (
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-surface-elevated/70 uppercase text-[10px] text-slate-400 font-bold border-b border-surface-border sticky top-0">
              <tr>
                <th scope="col" className="px-4 py-2.5">Time</th>
                <th scope="col" className="px-4 py-2.5">Hazard</th>
                <th scope="col" className="px-4 py-2.5">Direction</th>
                <th scope="col" className="px-4 py-2.5">Urgency</th>
                <th scope="col" className="px-4 py-2.5">Confidence</th>
                <th scope="col" className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border/50">
              {filtered.map((item, idx) => {
                const urgency = (item.urgency || 'low').toLowerCase();
                const styles = getUrgencyStyles(urgency);
                const isResolved = item.status === 'Resolved';

                return (
                  <tr
                    key={idx}
                    className="hover:bg-surface-elevated/50 transition-colors"
                  >
                    <td className="px-4 py-2.5 font-mono text-slate-400 whitespace-nowrap">
                      {formatTimestamp(item.timestamp)}
                    </td>
                    <td className="px-4 py-2.5 font-bold text-white capitalize whitespace-nowrap">
                      {item.hazard || item.hazard_type || item.label || 'Obstacle'}
                    </td>
                    <td className="px-4 py-2.5 capitalize whitespace-nowrap">
                      {formatDirection(item.direction)}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase ${styles.badge}`}
                      >
                        {urgency}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono font-bold text-emerald-400 whitespace-nowrap">
                      {formatConfidence(item.confidence)}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          isResolved
                            ? 'bg-slate-800 text-slate-400'
                            : 'bg-red-950 text-red-300 border border-red-600'
                        }`}
                      >
                        {item.status || 'Active'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

