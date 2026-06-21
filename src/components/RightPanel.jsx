import React, { useMemo, useState, useEffect } from 'react';
import { Activity, ChevronLeft, ChevronRight, Cpu, Wifi, WifiOff } from 'lucide-react';
import { formatModelSize } from '../lib/ollama';
import { getAuditLog } from '../services/agentAuditService';

function StatusDot({ state }) {
  const colors = {
    connected: 'bg-success',
    connecting: 'bg-accent',
    warning: 'bg-warning',
    disconnected: 'bg-danger',
    idle: 'bg-zinc-500',
    model_missing: 'bg-warning',
    no_models: 'bg-warning',
  };
  return <span className={`h-2 w-2 rounded-full ${colors[state] || colors.idle}`} />;
}

function DiagnosticRow({ label, value, state }) {
  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-surface-3/50 transition-colors">
      <StatusDot state={state} />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-zinc-400">{label}</p>
        <p className="text-xs font-medium text-zinc-200 truncate">{value}</p>
      </div>
    </div>
  );
}

export function RightPanel({
  settings,
  ollamaStatus,
  installedModels,
  desktopBridge,
  selectedModelMissing,
  onCheckOllama,
  operatorMode,
  updateCheckState,
}) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('alphonso_right_panel_collapsed_v1') === 'true');
  const [activeTab, setActiveTab] = useState('system');
  const setPanelCollapsed = (value) => {
    setCollapsed(value);
    localStorage.setItem('alphonso_right_panel_collapsed_v1', String(value));
  };

  useEffect(() => {
    const id = setInterval(onCheckOllama, 10 * 60 * 1000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const compact = (text, max = 36) => {
    const v = String(text || '');
    return v.length <= max ? v : `${v.slice(0, max - 1)}...`;
  };

  const diagnostics = useMemo(() => [
    {
      label: 'Ollama',
      value: ollamaStatus.label,
      state: ollamaStatus.state
    },
    {
      label: 'Model',
      value: selectedModelMissing ? 'Not found' : compact(settings.selectedModel || 'None'),
      state: selectedModelMissing ? 'model_missing' : settings.selectedModel ? 'connected' : 'no_models'
    },
    {
      label: 'Workspace',
      value: settings.workspaceRoot ? compact(settings.workspaceRoot, 30) : 'Not set',
      state: settings.workspaceRoot ? 'connected' : 'idle'
    },
    {
      label: 'Bridge',
      value: desktopBridge.label,
      state: desktopBridge.state === 'connected' ? 'connected' : 'disconnected'
    },
  ], [ollamaStatus, selectedModelMissing, settings.selectedModel, settings.workspaceRoot, desktopBridge]);

  if (collapsed) {
    return (
      <aside className="w-10 bg-surface-1 border-l border-white/[0.06] flex flex-col shrink-0 items-center py-3 gap-2">
        <button
          onClick={() => setPanelCollapsed(false)}
          className="rounded-lg p-1.5 text-zinc-500 hover:text-accent-light hover:bg-surface-3 transition-colors"
          title="Expand diagnostics"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="mt-2 space-y-2">
          {diagnostics.map((d) => (
            <div key={d.label} className="flex justify-center" title={`${d.label}: ${d.value}`}>
              <StatusDot state={d.state} />
            </div>
          ))}
        </div>
      </aside>
    );
  }

  const auditEntries = getAuditLog().slice(-10).reverse();

  const relativeTime = (ts) => {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  const scannedAt = ollamaStatus?.scannedAt;
  const scannedLabel = scannedAt ? `Last scan: ${relativeTime(scannedAt)}` : null;

  return (
    <aside className="w-52 bg-surface-1 border-l border-white/[0.06] flex flex-col shrink-0 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06]">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('system')}
            className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded transition-colors ${activeTab === 'system' ? 'text-zinc-200 bg-surface-3' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            System
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded transition-colors ${activeTab === 'audit' ? 'text-zinc-200 bg-surface-3' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Audit
          </button>
        </div>
        <button
          onClick={() => setPanelCollapsed(true)}
          className="p-1 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-surface-3 transition-colors"
          title="Collapse diagnostics"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {activeTab === 'system' && (
        <>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {diagnostics.map((d) => (
              <DiagnosticRow key={d.label} {...d} />
            ))}

            {installedModels.length > 0 && (
              <div className="mt-3 pt-3 border-t border-white/[0.04]">
                <p className="section-label px-3 mb-2">Models ({installedModels.length})</p>
                <div className="space-y-0.5 max-h-32 overflow-y-auto">
                  {installedModels.map((m) => (
                    <div key={m.name} className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-surface-3/50">
                      <Cpu className="w-3 h-3 text-zinc-500 shrink-0" />
                      <span className="text-xs text-zinc-300 truncate flex-1">{m.name}</span>
                      <span className="text-2xs text-zinc-500">{formatModelSize(m.size)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {operatorMode && (
              <div className="mt-3 pt-3 border-t border-white/[0.04] px-3">
                <div className="badge-success text-2xs">
                  <Activity className="w-3 h-3" />
                  Operator Active
                </div>
              </div>
            )}
          </div>

          <div className="p-3 border-t border-white/[0.06] space-y-1.5">
            {scannedLabel && (
              <p className="text-[10px] text-zinc-600 text-center">{scannedLabel}</p>
            )}
            <button
              onClick={onCheckOllama}
              className="w-full btn-secondary text-xs py-1.5"
            >
              Refresh Status
            </button>
          </div>
        </>
      )}

      {activeTab === 'audit' && (
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {auditEntries.length === 0 ? (
            <p className="text-[11px] text-zinc-500 px-2 py-3">No approvals logged yet</p>
          ) : (
            auditEntries.map((entry, i) => (
              <div key={i} className="px-2 py-1.5 rounded-lg hover:bg-surface-3/50 space-y-0.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-zinc-300 font-medium">{entry.agent}</span>
                  <span className="text-[10px] text-zinc-500">·</span>
                  <span className="text-[11px] text-zinc-400 truncate max-w-[80px]">{entry.action}</span>
                  <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${entry.outcome === 'approved' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                    {entry.outcome}
                  </span>
                </div>
                <div className="text-[10px] text-zinc-600">{relativeTime(entry.timestamp)}</div>
              </div>
            ))
          )}
        </div>
      )}
    </aside>
  );
}
