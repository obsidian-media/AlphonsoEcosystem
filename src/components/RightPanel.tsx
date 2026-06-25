import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Bot, ChevronLeft, ChevronRight, Cpu, RefreshCw, Shield } from 'lucide-react';
import { AgentStatusStrip } from './AgentStatusStrip';
import { formatModelSize } from '../lib/ollama';
import { scanForThreats } from '../services/sentinelSecurityService';
import { getAuditLog } from '../services/agentAuditService';
import { SentinelFindingModal } from './SentinelFindingModal';
import { SentinelAllowlistPanel } from './SentinelAllowlistPanel';
import { Badge } from './ui/Badge';

type ConnectionState = 'connected' | 'connecting' | 'warning' | 'disconnected' | 'idle' | 'model_missing' | 'no_models';

interface OllamaStatus {
  state: ConnectionState;
  label: string;
  message?: string;
  scannedAt?: number;
}

interface DesktopBridge {
  state: string;
  label: string;
}

interface InstalledModel {
  name: string;
  size: number;
}

interface AppSettings {
  selectedModel?: string;
  workspaceRoot?: string;
  [key: string]: unknown;
}

interface UpdateCheckState {
  available?: boolean;
  latestVersion?: string;
  checking?: boolean;
  configured?: boolean;
  currentVersion?: string;
  error?: string;
}

interface SentinelFinding {
  type?: string;
  pattern?: string;
  severity?: string;
  recommendation?: string;
  [key: string]: unknown;
}

interface SentinelScan {
  riskLevel?: string;
  findings?: SentinelFinding[];
  scannedAt?: number;
}

interface AuditEntry {
  agent: string;
  action: string;
  outcome: string;
  timestamp: number;
}

interface RightPanelProps {
  settings: AppSettings;
  ollamaStatus: OllamaStatus;
  installedModels: InstalledModel[];
  desktopBridge: DesktopBridge;
  selectedModelMissing?: boolean;
  onCheckOllama: () => void;
  operatorMode?: boolean;
  updateCheckState?: UpdateCheckState;
  // Additional props passed from App but not destructured in original
  voiceStatus?: string;
  lastCheckedAt?: number;
  onCopyTroubleshootingCommand?: () => void;
  copyState?: string;
  onMinimizeToCoach?: () => void;
  approvalRequiredNotice?: boolean;
  miyaCompanionState?: unknown;
  joseCompanionState?: unknown;
  hectorCompanionState?: unknown;
  screenObserverState?: unknown;
  onCheckUpdates?: () => void;
}

function StatusDot({ state }: { state: string }) {
  const colors: Record<string, string> = {
    connected: 'bg-[var(--success)]',
    connecting: 'bg-[var(--accent)]',
    warning: 'bg-[var(--warning)]',
    disconnected: 'bg-[var(--error)]',
    idle: 'bg-[var(--text-3)]',
    model_missing: 'bg-[var(--warning)]',
    no_models: 'bg-[var(--warning)]',
  };
  return <span className={`h-2 w-2 rounded-full ${colors[state] || colors['idle']}`} />;
}

interface DiagnosticRowProps {
  label: string;
  value: string;
  state: string;
}

function DiagnosticRow({ label, value, state }: DiagnosticRowProps) {
  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-[var(--surface-3)] transition-colors">
      <StatusDot state={state} />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-[var(--text-3)]">{label}</p>
        <p className="text-xs font-medium text-[var(--text-1)] truncate">{value}</p>
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
}: RightPanelProps) {
  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem('alphonso_right_panel_collapsed_v1') === 'true');
  const [activeTab, setActiveTab] = useState<'system' | 'audit' | 'agents'>('system');
  const setPanelCollapsed = (value: boolean) => {
    setCollapsed(value);
    localStorage.setItem('alphonso_right_panel_collapsed_v1', String(value));
  };

  useEffect(() => {
    const id = setInterval(onCheckOllama, 10 * 60 * 1000);
    return () => clearInterval(id);
  }, [onCheckOllama]);

  const compact = (text: unknown, max = 36): string => {
    const v = String(text || '');
    return v.length <= max ? v : `${v.slice(0, max - 1)}...`;
  };

  const [sentinelScan, setSentinelScan] = useState<SentinelScan | null>(() => {
    try {
      const stored = localStorage.getItem('alphonso_sentinel_last_scan_v1');
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });

  const [selectedFinding, setSelectedFinding] = useState<SentinelFinding | null>(null);

  const runQuickScan = () => {
    const result = scanForThreats('', {});
    const scan: SentinelScan = { ...result, scannedAt: Date.now() };
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
      label: 'Desktop',
      value: desktopBridge.label,
      state: desktopBridge.state === 'connected' ? 'connected' : 'disconnected'
    },
  ], [ollamaStatus, selectedModelMissing, settings.selectedModel, settings.workspaceRoot, desktopBridge]);

  if (collapsed) {
    return (
      <aside className="w-10 bg-[var(--surface-1)] border-l border-[var(--border)] flex flex-col shrink-0 items-center py-3 gap-2">
        <button
          onClick={() => setPanelCollapsed(false)}
          className="rounded-lg p-1.5 text-[var(--text-3)] hover:text-[var(--accent)] hover:bg-[var(--surface-3)] transition-colors"
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

  const auditEntries: AuditEntry[] = useMemo(
    () => getAuditLog().slice(-10).reverse(),
    [activeTab]
  );

  const relativeTime = (ts: number): string => {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  const scannedAt = ollamaStatus?.scannedAt;
  const scannedLabel = scannedAt ? `Last scan: ${relativeTime(scannedAt)}` : null;

  return (
    <aside className="w-72 bg-[var(--surface-1)] border-l border-[var(--border)] flex flex-col shrink-0 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--border)]">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('system')}
            className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded transition-colors ${activeTab === 'system' ? 'text-[var(--text-1)] bg-[var(--surface-3)]' : 'text-[var(--text-3)] hover:text-[var(--text-2)]'}`}
          >
            System
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded transition-colors ${activeTab === 'audit' ? 'text-[var(--text-1)] bg-[var(--surface-3)]' : 'text-[var(--text-3)] hover:text-[var(--text-2)]'}`}
          >
            Audit
          </button>
          <button
            onClick={() => setActiveTab('agents')}
            className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded transition-colors ${activeTab === 'agents' ? 'text-[var(--text-1)] bg-[var(--surface-3)]' : 'text-[var(--text-3)] hover:text-[var(--text-2)]'}`}
          >
            Agents
          </button>
        </div>
        <button
          onClick={() => setPanelCollapsed(true)}
          className="p-1 rounded-lg text-[var(--text-3)] hover:text-[var(--text-2)] hover:bg-[var(--surface-3)] transition-colors"
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
              <div className="mt-3 pt-3 border-t border-[var(--border)]">
                <p className="section-label px-3 mb-2">Models ({installedModels.length})</p>
                <div className="space-y-0.5 max-h-32 overflow-y-auto">
                  {installedModels.map((m) => (
                    <div key={m.name} className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[var(--surface-3)]">
                      <Cpu className="w-3 h-3 text-[var(--text-3)] shrink-0" />
                      <span className="text-xs text-[var(--text-2)] truncate flex-1">{m.name}</span>
                      <span className="text-2xs text-[var(--text-3)]">{formatModelSize(m.size)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {operatorMode && (
              <div className="mt-3 pt-3 border-t border-[var(--border)] px-3">
                <Badge variant="success" dot>Operator Active</Badge>
              </div>
            )}
          </div>
          <div className="mt-3 pt-3 border-t border-[var(--border)]">
            <div className="flex items-center justify-between px-3 mb-2">
              <p className="section-label">Security</p>
              <button
                onClick={runQuickScan}
                className="p-1 rounded text-[var(--text-3)] hover:text-[var(--text-2)] hover:bg-[var(--surface-3)] transition-colors"
                aria-label="Re-scan for security threats"
                title="Re-scan"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
            {sentinelScan ? (
              <div className="space-y-1">
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                  sentinelScan.riskLevel === 'critical' ? 'bg-[var(--error-dim)]' :
                  sentinelScan.riskLevel === 'high' ? 'bg-[var(--warning-dim)]' :
                  sentinelScan.riskLevel === 'medium' ? 'bg-[var(--warning-dim)]' : 'bg-[var(--success-dim)]'
                }`}>
                  <Shield className={`w-3 h-3 shrink-0 ${
                    sentinelScan.riskLevel === 'critical' ? 'text-[var(--error)]' :
                    sentinelScan.riskLevel === 'high' ? 'text-[var(--warning)]' :
                    sentinelScan.riskLevel === 'medium' ? 'text-[var(--warning)]' : 'text-[var(--success)]'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--text-3)]">Threat Level</p>
                    <p className="text-xs font-medium text-[var(--text-1)] capitalize">{sentinelScan.riskLevel || 'clean'}</p>
                  </div>
                </div>
                {sentinelScan.findings && sentinelScan.findings.length > 0 ? (
                  <div className="px-3 py-1.5">
                    <p className="text-[10px] text-[var(--text-3)]">{sentinelScan.findings.length} finding{sentinelScan.findings.length > 1 ? 's' : ''}</p>
                    {sentinelScan.findings.slice(0, 2).map((f, i) => (
                      <button
                        key={i}
                        onClick={() => setSelectedFinding(sentinelScan.findings![i])}
                        className={`block w-full text-left text-[10px] truncate cursor-pointer hover:text-[var(--text-2)] transition-colors pl-2 border-l-2 my-0.5 ${
                          f.severity === 'critical' || f.severity === 'high' ? 'border-[var(--error)] text-[var(--error)]' :
                          f.severity === 'medium' ? 'border-[var(--warning)] text-[var(--warning)]' :
                          'border-[var(--border-strong)] text-[var(--text-4)]'
                        }`}
                      >
                        {f.type || f.pattern || 'threat'}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="px-3 text-[10px] text-[var(--text-4)]">No threats detected</p>
                )}
                {sentinelScan.scannedAt && (
                  <p className="px-3 text-[10px] text-[var(--text-4)]">
                    {new Date(sentinelScan.scannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
            ) : (
              <p className="px-3 text-[10px] text-[var(--text-4)]">Click the refresh button to scan</p>
            )}
          </div>

          <div className="p-3 border-t border-[var(--border)] space-y-1.5">
            {scannedLabel && (
              <p className="text-[10px] text-[var(--text-4)] text-center">{scannedLabel}</p>
            )}
            <button
              onClick={onCheckOllama}
              className="w-full btn-secondary text-xs py-1.5"
            >
              Refresh Status
            </button>
          </div>
          <SentinelFindingModal finding={selectedFinding} onClose={() => setSelectedFinding(null)} />
          <div className="mt-3 pt-3 border-t border-[var(--border)] px-3">
            <p className="section-label mb-2">Allowlist</p>
            <SentinelAllowlistPanel />
          </div>
        </>
      )}

      {activeTab === 'audit' && (
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {auditEntries.length === 0 ? (
            <p className="text-[11px] text-[var(--text-3)] px-2 py-3">No approvals logged yet</p>
          ) : (
            auditEntries.map((entry, i) => (
              <div key={i} className="px-2 py-1.5 rounded-lg hover:bg-[var(--surface-3)] space-y-0.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-[var(--text-2)] font-medium">{entry.agent}</span>
                  <span className="text-[10px] text-[var(--text-3)]">·</span>
                  <span className="text-[11px] text-[var(--text-3)] truncate max-w-[80px]">{entry.action}</span>
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${entry.outcome === 'approved' ? 'bg-[var(--success-dim)] text-[var(--success)]' : 'bg-[var(--error-dim)] text-[var(--error)]'}`}>
                    {entry.outcome}
                  </span>
                </div>
                <div className="text-[10px] text-[var(--text-4)]">{relativeTime(entry.timestamp)}</div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'agents' && (
        <div className="flex-1 overflow-y-auto p-3">
          <p className="section-label mb-3">Active Agents</p>
          <AgentStatusStrip useAutoFeed compact={false} />
        </div>
      )}
    </aside>
  );
}
