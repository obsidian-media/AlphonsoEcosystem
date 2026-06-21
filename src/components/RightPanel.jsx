import React, { useEffect, useMemo, useState } from 'react';
import { Activity, ChevronLeft, ChevronRight, Cpu, Shield, Wifi, WifiOff } from 'lucide-react';
import { formatModelSize } from '../lib/ollama';
import { scanForThreats } from '../services/sentinelSecurityService';

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
  const setPanelCollapsed = (value) => {
    setCollapsed(value);
    localStorage.setItem('alphonso_right_panel_collapsed_v1', String(value));
  };

  const compact = (text, max = 36) => {
    const v = String(text || '');
    return v.length <= max ? v : `${v.slice(0, max - 1)}...`;
  };

  const [sentinelScan, setSentinelScan] = useState(() => {
    try {
      const stored = localStorage.getItem('alphonso_sentinel_last_scan_v1');
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });

  const runQuickScan = () => {
    const result = scanForThreats('', {});
    const scan = { ...result, scannedAt: Date.now() };
    setSentinelScan(scan);
    localStorage.setItem('alphonso_sentinel_last_scan_v1', JSON.stringify(scan));
  };

  useEffect(() => {
    if (!sentinelScan) runQuickScan();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <aside className="w-52 bg-surface-1 border-l border-white/[0.06] flex flex-col shrink-0 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06]">
        <span className="section-label">System</span>
        <button
          onClick={() => setPanelCollapsed(true)}
          className="p-1 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-surface-3 transition-colors"
          title="Collapse diagnostics"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

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

        <div className="mt-3 pt-3 border-t border-white/[0.04]">
          <div className="flex items-center justify-between px-3 mb-2">
            <p className="section-label">Security</p>
            <button
              onClick={runQuickScan}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
              title="Re-scan"
            >
              ↺
            </button>
          </div>
          {sentinelScan ? (
            <div className="space-y-1">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                sentinelScan.riskLevel === 'critical' ? 'bg-red-500/10' :
                sentinelScan.riskLevel === 'high' ? 'bg-orange-500/10' :
                sentinelScan.riskLevel === 'medium' ? 'bg-amber-500/10' : 'bg-emerald-500/10'
              }`}>
                <Shield className={`w-3 h-3 shrink-0 ${
                  sentinelScan.riskLevel === 'critical' ? 'text-red-400' :
                  sentinelScan.riskLevel === 'high' ? 'text-orange-400' :
                  sentinelScan.riskLevel === 'medium' ? 'text-amber-400' : 'text-emerald-400'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-400">Threat Level</p>
                  <p className="text-xs font-medium text-zinc-200 capitalize">{sentinelScan.riskLevel || 'clean'}</p>
                </div>
              </div>
              {sentinelScan.findings?.length > 0 ? (
                <div className="px-3 py-1.5">
                  <p className="text-[10px] text-zinc-500">{sentinelScan.findings.length} finding{sentinelScan.findings.length > 1 ? 's' : ''}</p>
                  {sentinelScan.findings.slice(0, 2).map((f, i) => (
                    <p key={i} className="text-[10px] text-zinc-600 truncate">• {f.type || f.pattern || 'threat'}</p>
                  ))}
                </div>
              ) : (
                <p className="px-3 text-[10px] text-zinc-600">No threats detected</p>
              )}
              {sentinelScan.scannedAt && (
                <p className="px-3 text-[10px] text-zinc-700">
                  {new Date(sentinelScan.scannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
          ) : (
            <p className="px-3 text-[10px] text-zinc-600">Click ↺ to scan</p>
          )}
        </div>
      </div>

      <div className="p-3 border-t border-white/[0.06]">
        <button
          onClick={onCheckOllama}
          className="w-full btn-secondary text-xs py-1.5"
        >
          Refresh Status
        </button>
      </div>
    </aside>
  );
}
