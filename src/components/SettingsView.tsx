import React, { useRef, useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Activity, AlertTriangle, Cable, ChevronDown, ClipboardCopy, Compass, Download, Folder, FolderOpen, Monitor, Palette, RefreshCw, Terminal, Cpu, UserRound, Trash2, Plug, Key, CheckCircle2, XCircle, Database, Upload, Save, BarChart3, Zap, TrendingUp, ScrollText, Settings2, Bot, Package, ToggleLeft, ToggleRight, Mic, MessageSquare, PhoneCall } from 'lucide-react';
import { Badge, SectionHeader, StatusDot, statusColors } from './ui/Badge';
import { Modal } from './ui/Modal';
import { MemoryGraphViewer } from './MemoryGraphViewer';
import { MemoryGraphCleanupPanel } from './MemoryGraphCleanupPanel';

const LEGACY_COLOR_TO_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent'> = {
  green: 'success',
  blue: 'info',
  amber: 'warning',
  red: 'error',
  zinc: 'default',
};
import { AlphonsoProjectsSection } from './alphonso/AlphonsoProjectsSection';
import { formatModelSize, isChatModel, normalizeEndpoint as _normalizeEndpoint } from '../lib/ollama';
import { SmallModelNotice } from './SmallModelNotice';
import { getCustomAvatarDataUrl, removeCustomAvatar, setCustomAvatar } from '../services/agentAvatarService';
import { getAgentMascotPath } from '../services/agentVisualService';
import { getComposioConfig, setComposioConfig, isComposioEnabled, getComposioStatus, checkComposioHealth, fetchComposioToolkits, hydrateComposioApiKeyFromKeychain } from '../services/composioService';
import { listPlugins, togglePlugin } from '../services/pluginRegistryService';
import { createBackup, restoreBackup, exportBackupToFile, importBackupFromFile, getBackupSizeEstimate, type BackupSizeEstimate } from '../services/backupService';
import { resolveComfyuiDirectory, resolveComfyuiPython } from '../services/comfyuiSettingsService';
import { AgentMetricsPanel } from './AgentMetricsPanel';
import { DecisionsPanel } from './echo/DecisionsPanel';
import { MeaningSearchStatus } from './echo/MeaningSearchStatus';
import { WorkspaceExportImportView } from './WorkspaceExportImportView';
import { NovaHistoryChart } from './NovaHistoryChart';
import { CrashLogView } from './CrashLogView';
import { CompanionPairingPanel } from './CompanionPairingPanel';
import { ConnectorSetupPanel } from './ConnectorSetupPanel';
import { CalleOutreachPanel } from './calle/CalleOutreachPanel';
import { EscalationCallPanel } from './calle/EscalationCallPanel';
import { SessionHistoryView } from './SessionHistoryView';
import { FilesView } from './FilesView';
import { getWatcherConfig, saveWatcherConfig } from '../services/echoFileWatcherService';
import { getUsageStats } from '../services/memoryMonitorService';
import { CoachHistoryPanel } from './CoachHistoryPanel';
import { listAgentProfiles } from '../agents/agentRegistry';
import { getAgentProvider, setAgentProvider, type AgentProviderConfig } from '../services/modelSelectionService';
import { ModelProviderPicker, type ModelProviderId } from './ModelSwitcher';
import {
  ALL_COACH_TRIGGER_IDS,
  getCoachEnabled,
  setCoachEnabled,
  getAllCoachTriggerToggles,
  setCoachTriggerEnabled,
  getCoachNarrativeEnabled,
  setCoachNarrativeEnabled,
  getCoachSnoozeUntilMs,
  setCoachSnoozeHours,
  clearCoachSnooze,
} from '../services/coachEngineService';
import { openExternalUrl } from '../services/browserAutomationService';
import { ComfyUiModelPicker } from './ComfyUiModelPicker';
import { ComfyUiInstallPicker } from './ComfyUiInstallPicker';
import { BridgesPanel } from './BridgesPanel';
import { DEFAULT_EFFECT_APPROVALS, EFFECT_LABELS, JOSE_EFFECTS, LOCKED_EFFECTS, type JoseEffect } from '../services/jose/joseEffects';
import { monthSpendUsd } from '../services/jose/joseSpend';
import { getComfyUiEndpoint, setComfyUiEndpoint, DEFAULT_COMFYUI_ENDPOINT } from '../services/connectors/comfyUiEndpoint.js';

const COACH_TRIGGER_LABELS: Record<string, string> = {
  critical_override_pattern: 'Approval theater (repeated high-risk approvals)',
  late_night_approval: 'Late-night high-risk approval',
  repeated_pipeline_failure: 'Repeated pipeline failure',
  confidence_decay: 'Agent confidence decay',
  approval_rubber_stamp: 'Approval rubber-stamping',
  dead_letter_graveyard: 'Dead-letter queue graveyard',
  long_unbroken_session: 'Long unbroken session',
  agent_whiplash: 'Agent whiplash (task bouncing between agents)',
  boardroom_hedge_pileup: 'Boardroom hedge pileup',
  unused_surface_area: 'Unused connectors / skill packs',
  license_wall: 'License wall (repeated Pro-gated denials)',
};

/**
 * Per-agent LLM backend picker — Ollama (default) / NVIDIA / Gemini / Hermes,
 * one row per agent in `agentRegistry.js` (never a hardcoded list, so a
 * future 10th agent needs no change here). Hermes only becomes selectable
 * once that agent has a configured, reachable endpoint (see the "Hermes
 * Agents" section in API Credentials above). Everything defaults to Ollama —
 * this section is purely opt-in and changes nothing for anyone who never
 * opens it.
 */
function AgentProvidersSection() {
  const agents = listAgentProfiles();
  const [configs, setConfigs] = useState<Record<string, AgentProviderConfig>>(() => {
    const initial: Record<string, AgentProviderConfig> = {};
    for (const agent of agents) initial[agent.id] = getAgentProvider(agent.id);
    return initial;
  });
  const [error, setError] = useState<string | null>(null);

  const handleProviderChange = (agentId: string, provider: ModelProviderId) => {
    try {
      setAgentProvider(agentId, { provider });
      setConfigs((prev) => ({ ...prev, [agentId]: getAgentProvider(agentId) }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleModelChange = (agentId: string, model: string) => {
    const current = configs[agentId];
    try {
      setAgentProvider(agentId, { provider: current.provider, model });
      setConfigs((prev) => ({ ...prev, [agentId]: getAgentProvider(agentId) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="space-y-3">
      {error && (
        <div className="p-3 rounded-lg bg-(--error-dim) text-xs text-(--error)">{error}</div>
      )}
      {agents.map((agent) => {
        const config = configs[agent.id] || { provider: 'ollama' as ModelProviderId };
        return (
          <div key={agent.id} className="flex items-center justify-between gap-4 p-4 rounded-xl bg-(--surface-2)">
            <div className="text-sm font-semibold text-(--text-1) shrink-0">{agent.name}</div>
            <ModelProviderPicker
              agentId={agent.id}
              provider={config.provider as ModelProviderId}
              onProviderChange={(p) => handleProviderChange(agent.id, p)}
              selectedModel={config.model || ''}
              onModelChange={(m) => handleModelChange(agent.id, m)}
              ollamaPicker={<div className="text-[10px] text-(--text-4) uppercase tracking-widest px-2 py-1">Default Ollama model</div>}
            />
          </div>
        );
      })}
    </div>
  );
}

function CoachSettingsSection() {
  const [enabled, setEnabledState] = useState(getCoachEnabled);
  const [narrativeEnabled, setNarrativeEnabledState] = useState(getCoachNarrativeEnabled);
  const [triggerToggles, setTriggerToggles] = useState(getAllCoachTriggerToggles);
  const [snoozeUntil, setSnoozeUntil] = useState(getCoachSnoozeUntilMs);

  const snoozeActive = snoozeUntil > Date.now();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between p-4 rounded-xl bg-(--surface-2)">
        <div>
          <div className="text-sm font-semibold text-(--text-1)">Session Coach detection engine</div>
          <div className="text-xs text-(--text-4) mt-0.5">
            Master toggle — when off, no detector runs, regardless of the Coach window being open.
          </div>
        </div>
        <button
          role="switch"
          aria-checked={enabled}
          aria-label="Toggle Session Coach detection engine"
          onClick={() => { const next = !enabled; setCoachEnabled(next); setEnabledState(next); }}
          className={`p-1 rounded-full transition-colors ${enabled ? 'text-(--success)' : 'text-(--text-4)'}`}
        >
          {enabled ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
        </button>
      </div>

      <div className="flex items-center justify-between p-4 rounded-xl bg-(--surface-2)">
        <div>
          <div className="text-sm font-semibold text-(--text-1)">Ollama-narrative rewriting</div>
          <div className="text-xs text-(--text-4) mt-0.5">
            Rephrase coach messages via local Ollama for critical/warning signals. Falls back silently to the
            rule-based message on any failure. Off by default — requires Ollama running.
          </div>
        </div>
        <button
          role="switch"
          aria-checked={narrativeEnabled}
          aria-label="Toggle Ollama-narrative rewriting"
          onClick={() => { const next = !narrativeEnabled; setCoachNarrativeEnabled(next); setNarrativeEnabledState(next); }}
          className={`p-1 rounded-full transition-colors ${narrativeEnabled ? 'text-(--success)' : 'text-(--text-4)'}`}
        >
          {narrativeEnabled ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
        </button>
      </div>

      <div className="p-4 rounded-xl bg-(--surface-2) space-y-3">
        <div>
          <div className="text-sm font-semibold text-(--text-1)">Snooze</div>
          <div className="text-xs text-(--text-4) mt-0.5">
            Mute all coaching for a set number of hours, independent of the per-trigger toggles below.
          </div>
        </div>
        {snoozeActive ? (
          <div className="flex items-center gap-3">
            <span className="text-xs text-(--warning)">
              Snoozed until {new Date(snoozeUntil).toLocaleString()}
            </span>
            <button
              onClick={() => { clearCoachSnooze(); setSnoozeUntil(0); }}
              className="text-xs px-3 py-1.5 rounded-lg hover:bg-(--surface-3)"
            >
              Clear snooze
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {[1, 4, 24].map((hours) => (
              <button
                key={hours}
                onClick={() => { setCoachSnoozeHours(hours); setSnoozeUntil(Date.now() + hours * 3600 * 1000); }}
                className="text-xs px-3 py-1.5 rounded-lg hover:bg-(--surface-3)"
              >
                {hours}h
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 rounded-xl bg-(--surface-2) space-y-2">
        <div className="text-sm font-semibold text-(--text-1) mb-2">Per-trigger toggles</div>
        {ALL_COACH_TRIGGER_IDS.map((id) => (
          <div key={id} className="flex items-center justify-between py-1.5">
            <span className="text-xs text-(--text-2)">{COACH_TRIGGER_LABELS[id] || id}</span>
            <button
              onClick={() => {
                const next = !triggerToggles[id];
                setCoachTriggerEnabled(id, next);
                setTriggerToggles({ ...triggerToggles, [id]: next });
              }}
              role="switch"
              aria-checked={Boolean(triggerToggles[id])}
              aria-label={`Toggle ${COACH_TRIGGER_LABELS[id] || id}`}
              className={`p-0.5 rounded-full transition-colors ${triggerToggles[id] ? 'text-(--success)' : 'text-(--text-4)'}`}
            >
              {triggerToggles[id] ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

interface InstalledModel {
  name: string;
  size: number;
}

interface ModelSelectorProps {
  models: InstalledModel[];
  selectedModel?: string;
  selectedModelMissing?: boolean;
  onSelectModel: (model: string) => void;
}

function ModelSelector({ models, selectedModel, selectedModelMissing, onSelectModel }: ModelSelectorProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-xs leading-6 font-semibold text-(--text-2)">Active Inference Model</label>
        <span className="text-[11px] text-(--text-3)">{models.length} installed model{models.length === 1 ? '' : 's'}</span>
      </div>
      {models.length === 0 ? (
        <div className="rounded-2xl bg-(--warning-dim) p-4 text-sm text-(--warning)">
          No installed models were returned by Ollama. Pull a model in Ollama, then run Check Ollama again.
        </div>
      ) : (
        <div className="relative">
          <select
            aria-label="Select model"
            value={models.some((model) => model.name === selectedModel) ? selectedModel : ''}
            onChange={(event) => onSelectModel(event.target.value)}
            className="w-full appearance-none bg-(--surface-2) rounded-xl px-4 py-3 pr-10 text-sm text-(--text-1) focus:outline-hidden focus:ring-1 focus:ring-(--accent-border)"
          >
            {selectedModelMissing && <option value="">Model not found: {selectedModel}</option>}
            {models.filter(isChatModel).map((model) => (
              <option key={model.name} value={model.name}>
                {model.name} - {formatModelSize(model.size)}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--text-3)" />
        </div>
      )}
      {selectedModelMissing && (
        <div className="rounded-xl bg-(--warning-dim) p-3 text-xs text-(--warning)">
          Model not found: <span className="font-mono">{selectedModel}</span>. Suggested installed models: {models.map((model) => model.name).join(', ')}.
        </div>
      )}
      {!selectedModelMissing && <SmallModelNotice model={selectedModel} />}
    </div>
  );
}

const SUGGESTED_MODELS = ['llama3.2', 'llama3.1:8b', 'mistral', 'phi3.5', 'codellama', 'deepseek-r1:7b'];

function ModelPullHelper({ onRefresh }: { onRefresh: () => void }) {
  const [modelName, setModelName] = useState('');
  const [copied, setCopied] = useState(false);
  const cmd = `ollama pull ${modelName.trim() || '<model-name>'}`;

  const copy = () => {
    if (!modelName.trim()) return;
    navigator.clipboard.writeText(cmd).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-2xl bg-(--surface-2) p-4 space-y-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-(--text-3)">Pull a New Model</div>
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTED_MODELS.map((m) => (
          <button key={m} onClick={() => setModelName(m)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-mono border transition-colors ${modelName === m ? 'border-(--accent-border) bg-(--accent-dim) text-(--accent)' : 'border-(--border) bg-(--surface-3) text-(--text-3) hover:text-(--text-1)'}`}>
            {m}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={modelName}
          onChange={(e) => setModelName(e.target.value)}
          placeholder="or type a model name..."
          className="flex-1 bg-(--surface-3) rounded-xl px-3 py-2 text-sm font-mono text-(--text-1) placeholder-(--text-4) focus:outline-hidden focus:border-(--accent-border)"
        />
        <button
          onClick={copy}
          disabled={!modelName.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest border transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-(--surface-3) border-(--border) text-(--text-2) hover:bg-(--surface-3)"
        >
          {copied ? <><ClipboardCopy className="w-3.5 h-3.5" /> Copied</> : <><Download className="w-3.5 h-3.5" /> Copy Command</>}
        </button>
      </div>
      {modelName.trim() && (
        <div className="font-mono text-[11px] bg-(--surface-1) rounded-lg px-3 py-2 text-(--success) select-all">{cmd}</div>
      )}
      <p className="text-[11px] text-(--text-4)">Paste this in a terminal. When the download finishes, click <button onClick={onRefresh} className="text-(--accent) hover:text-(--accent-hover) underline">Refresh Models</button> to load it.</p>
    </div>
  );
}

const AVATAR_AGENTS = [
  { id: 'alphonso', label: 'Alphonso' },
  { id: 'jose',     label: 'Jose' },
  { id: 'miya',     label: 'Miya' },
  { id: 'hector',   label: 'Hector' },
  { id: 'marcus',   label: 'Marcus' },
  { id: 'maria',    label: 'Maria' },
  { id: 'echo',     label: 'Echo' },
  { id: 'sentinel', label: 'Sentinel' },
  { id: 'nova',     label: 'Nova' }
];

interface AgentAvatarCardProps {
  agentId: string;
  label: string;
}

function AgentAvatarCard({ agentId, label }: AgentAvatarCardProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string>(() => getAgentMascotPath(agentId));
  const [hasCustom, setHasCustom] = useState<boolean>(() => Boolean(getCustomAvatarDataUrl(agentId)));
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const dataUrl = await setCustomAvatar(agentId, file);
      setPreview(dataUrl);
      setHasCustom(true);
    } catch (err: unknown) {
      setError(String((err as Error).message || err));
    } finally {
      setUploading(false);
    }
  }, [agentId]);

  const handleRemove = useCallback(() => {
    removeCustomAvatar(agentId);
    setPreview(getAgentMascotPath(agentId));
    setHasCustom(false);
    setError('');
  }, [agentId]);

  return (
    <div className="flex flex-col items-center gap-2 rounded-xl bg-(--surface-2) p-3">
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        title={`Upload custom avatar for ${label}`}
        className="relative w-16 h-16 rounded-full overflow-hidden border border-(--border) group shrink-0 hover:border-(--accent-border) transition-colors disabled:opacity-60"
      >
        {preview ? (
          <img src={preview} alt={label} className="w-full h-full object-cover object-center" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-(--surface-3)">
            <UserRound className="w-6 h-6 text-(--text-3)" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span className="text-[9px] font-bold uppercase tracking-widest text-white">Change</span>
        </div>
      </button>
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
      <span className="text-[11px] font-semibold text-(--text-2)">{label}</span>
      {hasCustom && (
        <button
          onClick={handleRemove}
          className="flex items-center gap-1 text-[10px] text-(--text-3) hover:text-(--error) transition-colors"
        >
          <Trash2 className="w-3 h-3" />
          Reset
        </button>
      )}
      {!hasCustom && <span className="text-[10px] text-(--text-4)">Default</span>}
      {error && <span className="text-[10px] text-(--error) text-center">{error}</span>}
    </div>
  );
}

interface OllamaStatus {
  state: string;
  label: string;
  message?: string;
}

interface UpdateCheckState {
  available?: boolean;
  checking?: boolean;
  configured?: boolean;
  currentVersion?: string;
  latestVersion?: string;
  error?: string;
}

interface AppSettings {
  endpoint?: string;
  workspaceRoot?: string;
  ocrEnginePath?: string;
  selectedModel?: string;
  autoUpdateEnabled?: boolean;
  updaterEndpoint?: string;
  updaterPubkey?: string;
  updaterTarget?: string;
  desktopMode?: boolean;
  localOnlyMode?: boolean;
  zeroCostMode?: boolean;
  approvalMode?: boolean;
  /** Settings → Approvals: which kinds of action ask first (jose/joseEffects.ts). */
  effectApprovals?: Partial<Record<JoseEffect, boolean>>;
  /** When Jose shows his plan before running it (phase 3): always, bigger (default) or never. */
  showPlanFirst?: string;
  safeMode?: boolean;
  privacyShieldActive?: boolean;
  miyaCompanionPinned?: boolean;
  joseCompanionPinned?: boolean;
  autoLaunchServices?: boolean;
  outputFolder?: string;
  comfyuiDir?: string;
  comfyuiPython?: string;
  environmentTheme?: string;
  colorScheme?: string;
  idleTimeoutMinutes?: number;
  [key: string]: unknown;
}

/**
 * Settings → Approvals (Jose redesign, 2026-10-23): one row per kind of action.
 * Steps whose effects ask wait for you before they start; running code is
 * asked per command (read-only commands never ask). Spend, publish and delete
 * are locked to always ask, even with Approval Mode off.
 */
const EFFECT_NOTES: Partial<Record<JoseEffect, string>> = {
  run: 'Asked per command; read-only commands never ask.',
  write_own_work: 'New files only, inside the project folder.',
};

function EffectApprovalsTable({ settings, setSettings }: { settings: AppSettings; setSettings: (s: AppSettings) => void }) {
  const saved = (settings.effectApprovals && typeof settings.effectApprovals === 'object' ? settings.effectApprovals : {}) as Partial<Record<JoseEffect, boolean>>;
  const approvalMode = settings.approvalMode !== false;
  return (
    <div className="p-4 bg-(--surface-2) rounded-2xl">
      <div className="text-sm font-semibold text-(--text-1)">What asks first</div>
      <div className="text-[11px] text-(--text-3) mt-0.5">Jose and the agents wait for you before doing these.</div>
      {!approvalMode && (
        <div className="text-[11px] text-(--warning) mt-2">Approval Mode is off: only the locked ones ask.</div>
      )}
      <div className="mt-3 space-y-2">
        {JOSE_EFFECTS.map((effect) => {
          const locked = LOCKED_EFFECTS.includes(effect);
          const on = locked ? true : (typeof saved[effect] === 'boolean' ? Boolean(saved[effect]) : DEFAULT_EFFECT_APPROVALS[effect]);
          const disabled = locked || !approvalMode;
          const note = locked ? 'Always asks' : EFFECT_NOTES[effect];
          return (
            <div key={effect} className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs text-(--text-1)">{EFFECT_LABELS[effect]}</div>
                {note && <div className="text-[10px] text-(--text-3)">{note}</div>}
              </div>
              <button
                role="switch"
                aria-checked={on}
                aria-label={`Ask before: ${EFFECT_LABELS[effect]}`}
                disabled={disabled}
                onClick={() => setSettings({ ...settings, effectApprovals: { ...saved, [effect]: !on } })}
                className={`w-10 h-5 shrink-0 rounded-full transition-colors relative ${on ? 'bg-(--warning)' : 'bg-(--surface-3)'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${on ? 'right-1' : 'left-1'}`} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Settings → Approvals → Paid models (phase 4): off by default. When on (and
 * Zero-Cost Mode is off), Jose may give a hard step to Claude or ChatGPT; each
 * such step asks first and says what it should cost. The prices are yours to
 * enter (they change), and the monthly cap stops spending past it.
 */
function PaidModelsPanel({ settings, setSettings }: { settings: AppSettings; setSettings: (s: AppSettings) => void }) {
  const saved = (settings.paidModels && typeof settings.paidModels === 'object' ? settings.paidModels : {}) as Record<string, unknown>;
  const provider = saved.provider === 'chatgpt' ? 'chatgpt' : 'claude';
  // The provider shown is the one saved, also before you change it.
  const save = (patch: Record<string, unknown>) => setSettings({ ...settings, paidModels: { ...saved, provider, ...patch } });
  const amountOf = (value: string) => (value.trim() === '' || !Number.isFinite(Number(value)) || Number(value) < 0 ? null : Number(value));
  const shown = (value: unknown) => (typeof value === 'number' ? String(value) : '');
  const allowed = saved.allowed === true;
  const inputClass = 'w-24 rounded-md bg-(--surface-1) px-2 py-1 text-xs text-(--text-1)';
  return (
    <div className="p-4 bg-(--surface-2) rounded-2xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-(--text-1)">Allow paid models</div>
          <div className="text-[11px] text-(--text-3) mt-0.5">Jose may give a step that keeps failing to Claude or ChatGPT. Each one asks first and says what it should cost. Zero-Cost Mode must be off, and the model must be set up in Connectors.</div>
        </div>
        <button
          role="switch"
          aria-checked={allowed}
          aria-label="Allow paid models"
          onClick={() => save({ allowed: !allowed })}
          className={`w-10 h-5 shrink-0 rounded-full transition-colors relative ${allowed ? 'bg-(--warning)' : 'bg-(--surface-3)'}`}
        >
          <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${allowed ? 'right-1' : 'left-1'}`} />
        </button>
      </div>
      {settings.zeroCostMode !== false && (
        <div className="text-[11px] text-(--warning) mt-2">Zero-Cost Mode is on, so no paid model is used.</div>
      )}
      <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-2 text-xs text-(--text-2)">
        <label htmlFor="paid-provider">Paid model</label>
        <select
          id="paid-provider"
          aria-label="Paid model provider"
          value={provider}
          onChange={(e) => save({ provider: e.target.value })}
          className="rounded-md bg-(--surface-1) px-2 py-1 text-xs text-(--text-1)"
        >
          <option value="claude">Claude</option>
          <option value="chatgpt">ChatGPT</option>
        </select>
        <label htmlFor="paid-model-name">Model name (blank: the one chosen in Connectors)</label>
        <input
          id="paid-model-name"
          value={typeof saved.model === 'string' ? saved.model : ''}
          onChange={(e) => save({ model: e.target.value.trim() || null })}
          className="w-40 rounded-md bg-(--surface-1) px-2 py-1 text-xs text-(--text-1)"
        />
        <label htmlFor="paid-input-price">Price per million input tokens (USD)</label>
        <input id="paid-input-price" inputMode="decimal" value={shown(saved.inputPerMillionUsd)} onChange={(e) => save({ inputPerMillionUsd: amountOf(e.target.value) })} className={inputClass} />
        <label htmlFor="paid-output-price">Price per million output tokens (USD)</label>
        <input id="paid-output-price" inputMode="decimal" value={shown(saved.outputPerMillionUsd)} onChange={(e) => save({ outputPerMillionUsd: amountOf(e.target.value) })} className={inputClass} />
        <label htmlFor="paid-cap">Monthly spending cap (USD)</label>
        <input id="paid-cap" inputMode="decimal" placeholder="No cap" value={shown(saved.monthlyCapUsd)} onChange={(e) => save({ monthlyCapUsd: amountOf(e.target.value) })} className={inputClass} />
        <label htmlFor="runway-price">Runway price per second of video (USD)</label>
        <input id="runway-price" inputMode="decimal" value={shown(saved.runwayPricePerSecondUsd)} onChange={(e) => save({ runwayPricePerSecondUsd: amountOf(e.target.value) })} className={inputClass} />
        <label htmlFor="elevenlabs-char-price">ElevenLabs price per 1,000 characters (USD)</label>
        <input id="elevenlabs-char-price" inputMode="decimal" value={shown(saved.elevenLabsPricePer1kCharsUsd)} onChange={(e) => save({ elevenLabsPricePer1kCharsUsd: amountOf(e.target.value) })} className={inputClass} />
        <label htmlFor="elevenlabs-effect-price">ElevenLabs price per sound effect (USD)</label>
        <input id="elevenlabs-effect-price" inputMode="decimal" value={shown(saved.elevenLabsPricePerEffectUsd)} onChange={(e) => save({ elevenLabsPricePerEffectUsd: amountOf(e.target.value) })} className={inputClass} />
      </div>
      <div className="text-[11px] text-(--text-3) mt-2">Runway makes Miya's AI clips when a project chooses it, and ElevenLabs reads voice-overs and makes sound effects when a brand chooses it; each run asks first with the estimate (Higgsfield uses its own estimate). The monthly cap covers all of them together.</div>
      <div className="text-[11px] text-(--text-3) mt-2">Spent this month: ${monthSpendUsd().toFixed(2)}</div>
    </div>
  );
}

/**
 * Settings → Approvals → Jose on Telegram (phase 5): which messages Jose
 * sends to your paired Telegram chat. All on to start.
 */
const JOSE_TELEGRAM_KINDS = [
  { key: 'stepWaiting', label: 'When a step waits for you', note: 'With Approve and Reject.' },
  { key: 'planWaiting', label: 'When a plan waits for you', note: 'With Run this plan and Cancel.' },
  { key: 'finished', label: 'When a request finishes or fails', note: 'One line.' },
  { key: 'reviewDecision', label: 'When a review asks you to decide', note: 'After 2 rounds of changes.' },
  { key: 'performanceSummaries', label: 'Your posts after 7 days', note: 'Once a day: their numbers, with the lessons to keep or drop.' },
  { key: 'contentIdeas', label: 'New ideas from good posts', note: 'With Start project and Dismiss.' },
  { key: 'activitySummaries', label: 'Agent activity summaries', note: 'The older "N agent actions since your last check" messages. Off to start.', defaultOn: false },
] as const;

function JoseTelegramPanel({ settings, setSettings }: { settings: AppSettings; setSettings: (s: AppSettings) => void }) {
  const saved = (settings.joseTelegram && typeof settings.joseTelegram === 'object' ? settings.joseTelegram : {}) as Record<string, unknown>;
  return (
    <div className="p-4 bg-(--surface-2) rounded-2xl">
      <div className="text-sm font-semibold text-(--text-1)">Jose on Telegram</div>
      <div className="text-[11px] text-(--text-3) mt-0.5">Sent to your paired Telegram chat (Connectors → Telegram). A request cut off when the app closed is always sent, with Carry on.</div>
      <div className="mt-3 space-y-2">
        {JOSE_TELEGRAM_KINDS.map((kind) => {
          const { key, label, note } = kind;
          const on = 'defaultOn' in kind ? saved[key] === true : saved[key] !== false;
          return (
            <div key={key} className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs text-(--text-1)">{label}</div>
                <div className="text-[10px] text-(--text-3)">{note}</div>
              </div>
              <button
                role="switch"
                aria-checked={on}
                aria-label={`Telegram: ${label}`}
                onClick={() => setSettings({ ...settings, joseTelegram: { ...saved, [key]: !on } })}
                className={`w-10 h-5 shrink-0 rounded-full transition-colors relative ${on ? 'bg-(--accent)' : 'bg-(--surface-3)'}`}
              >
                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${on ? 'right-1' : 'left-1'}`} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const SETTINGS_SECTIONS = [
  { id: 'general',     label: 'General',      Icon: Settings2 },
  { id: 'connectors',  label: 'Connectors',   Icon: Plug },
  { id: 'agents',      label: 'Agents',       Icon: Bot },
  { id: 'runtime',     label: 'Runtime',      Icon: Cpu },
  { id: 'bridges',     label: 'Bridges',      Icon: Cable },
  { id: 'memory',      label: 'Memory',       Icon: Database },
  { id: 'knowledge',   label: 'Knowledge',    Icon: Compass },
  { id: 'appearance',  label: 'Appearance',   Icon: Palette },
  { id: 'coach',       label: 'Coach',        Icon: MessageSquare },
  { id: 'plugins',     label: 'Plugins',      Icon: Package },
  { id: 'logs',        label: 'Logs',         Icon: ScrollText },
  { id: 'backup',      label: 'Backup',       Icon: Download },
];

interface SettingsViewProps {
  settings: AppSettings;
  setSettings: (settings: AppSettings | ((prev: AppSettings) => AppSettings)) => void;
  ollamaStatus: OllamaStatus;
  installedModels: InstalledModel[];
  selectedModelMissing?: boolean;
  onCheckOllama: () => void;
  onCopyTroubleshootingCommand: () => void;
  copyState?: string;
  updateCheckState?: UpdateCheckState;
  onCheckUpdates?: () => void;
  normalizeEndpoint?: (endpoint: string) => string;
  ollamaTroubleshootingCommand?: string;
  braveSearchConfigured?: boolean;
  memoryItems?: unknown[];
  /** Developer mode: shows the Operator Dashboard (owner, 2026-10-22). Stored as `alphonso_operator_mode_v1`. */
  developerMode?: boolean;
  setDeveloperMode?: (on: boolean) => void;
}

interface LaunchStatus {
  service: 'ollama' | 'comfyui';
  state: 'launching' | 'launched' | 'running' | 'done' | 'error';
  message?: string;
}

interface BackupResult {
  type: 'success' | 'error';
  message: string;
}

interface ComposioHealth {
  status: string;
  message: string;
}

interface ComposioToolkit {
  key?: string;
  name?: string;
  [key: string]: unknown;
}

/**
 * ComfyUI's address, used by every image feature (owner, 2026-10-22). Until
 * then six places used a fixed 127.0.0.1:8188 and nothing could change it.
 * "Launch Now" still starts a local ComfyUI on port 8188.
 */
function ComfyUiAddressField() {
  const [value, setValue] = useState(() => getComfyUiEndpoint());
  const save = () => { setComfyUiEndpoint(value); setValue(getComfyUiEndpoint()); };
  return (
    <div className="space-y-1">
      <label htmlFor="comfyui-address" className="text-xs font-semibold text-(--text-2)">ComfyUI address</label>
      <input
        id="comfyui-address"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
        placeholder={DEFAULT_COMFYUI_ENDPOINT}
        className="w-full bg-(--surface-2) rounded-xl px-4 py-2.5 text-sm font-mono text-(--text-1) placeholder-(--text-4) focus:outline-hidden focus:ring-1 focus:ring-(--accent-border)"
      />
      <div className="text-[11px] text-(--text-4)">Where Alphonso reaches ComfyUI. Leave it empty for {DEFAULT_COMFYUI_ENDPOINT}.</div>
    </div>
  );
}

export function SettingsView({
  settings,
  setSettings,
  ollamaStatus,
  installedModels,
  selectedModelMissing,
  onCheckOllama,
  onCopyTroubleshootingCommand,
  copyState,
  updateCheckState,
  onCheckUpdates,
  normalizeEndpoint,
  ollamaTroubleshootingCommand,
  braveSearchConfigured = false,
  memoryItems = [],
  developerMode = false,
  setDeveloperMode,
}: SettingsViewProps) {
  const resolvedNormalizeEndpoint = normalizeEndpoint || _normalizeEndpoint;
  const folderPickerRef = useRef<HTMLInputElement>(null);
  const outputFolderPickerRef = useRef<HTMLInputElement>(null);
  const comfyuiDirPickerRef = useRef<HTMLInputElement>(null);

  const [graphModalOpen, setGraphModalOpen] = useState(false);
  const [composioApiKey, setComposioApiKey] = useState<string>(() => getComposioConfig().apiKey || '');
  const [composioUserId, setComposioUserId] = useState<string>(() => getComposioConfig().userId || 'alphonso-user');
  const [composioHealth, setComposioHealth] = useState<ComposioHealth | null>(null);
  const [composioChecking, setComposioChecking] = useState(false);
  const [composioToolkits, setComposioToolkits] = useState<ComposioToolkit[]>([]);

  const COMPOSIO_ENABLED_KEY = 'alphonso_composio_toolkits_enabled_v1';
  const [activeSection, setActiveSection] = useState('general');
  const [enabledToolkits, setEnabledToolkits] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('alphonso_composio_toolkits_enabled_v1') || '[]')); }
    catch { return new Set(); }
  });
  const toggleComposioToolkit = (key: string) => {
    setEnabledToolkits(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      localStorage.setItem(COMPOSIO_ENABLED_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;
    hydrateComposioApiKeyFromKeychain().then(() => {
      if (cancelled) return;
      // Re-sync from the now-hydrated cache: the useState initializers above ran
      // before this resolved, so a key that only lived in the keychain (not the
      // legacy blob this component's initial read falls back to) wasn't visible yet.
      const hydrated = getComposioConfig();
      setComposioApiKey((prev) => prev || hydrated.apiKey || '');

      const status = getComposioStatus();
      if (status.enabled && status.hasApiKey) {
        checkComposioHealth().then(setComposioHealth);
        const cached = JSON.parse(localStorage.getItem('alphonso_composio_tools_v1') || 'null');
        if (cached) setComposioToolkits(cached.toolkits || []);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const handleComposioSave = () => {
    const config = setComposioConfig({ apiKey: composioApiKey, userId: composioUserId, enabled: !!composioApiKey });
    if (config.enabled) {
      setComposioChecking(true);
      checkComposioHealth().then((health) => {
        setComposioHealth(health);
        setComposioChecking(false);
        fetchComposioToolkits().then((result: any) => {
          if (result.toolkits) setComposioToolkits(result.toolkits);
        });
      });
    }
  };

  const handlePickWorkspaceRoot = async () => {
    try {
      const result = await invoke<{ picked: boolean; path: string }>('pick_folder');
      if (result?.picked && result.path) {
        setSettings({ ...settings, workspaceRoot: result.path });
        return;
      }
    } catch { /* fall through to file input */ }
    folderPickerRef.current?.click();
  };

  const handleFolderPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0] as File & { path?: string; webkitRelativePath?: string };
    const path = file.path || file.webkitRelativePath?.split('/')[0] || '';
    if (path) setSettings({ ...settings, workspaceRoot: path });
    e.target.value = '';
  };

  // Local services state
  const [launchStatus, setLaunchStatus] = useState<LaunchStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function seedComfyUISettings() {
      if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return;
      const resolvedDir = await resolveComfyuiDirectory(settings.comfyuiDir);
      const resolvedPython = await resolveComfyuiPython(settings.comfyuiPython, resolvedDir || settings.comfyuiDir);
      if (!cancelled && (resolvedDir || resolvedPython)) {
        setSettings((prev) => {
          const nextDir = prev.comfyuiDir || resolvedDir || '';
          const nextPython = (
            prev.comfyuiPython &&
            prev.comfyuiPython.trim() &&
            prev.comfyuiPython.trim().toLowerCase() !== 'python'
          )
            ? prev.comfyuiPython
            : (resolvedPython || prev.comfyuiPython);
          if (nextDir === prev.comfyuiDir && nextPython === prev.comfyuiPython) return prev;
          return { ...prev, comfyuiDir: nextDir, comfyuiPython: nextPython };
        });
      }
    }

    seedComfyUISettings();
    return () => {
      cancelled = true;
    };
  }, [settings.comfyuiDir, settings.comfyuiPython, setSettings]);

  const handlePickOutputFolder = async () => {
    try {
      const result = await invoke<{ picked: boolean; path: string }>('pick_folder');
      if (result?.picked && result.path) setSettings({ ...settings, outputFolder: result.path });
    } catch {
      outputFolderPickerRef.current?.click();
    }
  };

  const handleOutputFolderPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0] as File & { path?: string; webkitRelativePath?: string };
    const path = file.path || file.webkitRelativePath?.split('/')[0] || '';
    if (path) setSettings({ ...settings, outputFolder: path });
    e.target.value = '';
  };

  const handlePickComfyUIDir = async () => {
    try {
      const result = await invoke<{ picked: boolean; path: string }>('pick_folder');
      if (result?.picked && result.path) setSettings({ ...settings, comfyuiDir: result.path });
    } catch {
      comfyuiDirPickerRef.current?.click();
    }
  };

  const handleComfyUIDirPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0] as File & { path?: string; webkitRelativePath?: string };
    const path = file.path || file.webkitRelativePath?.split('/')[0] || '';
    if (path) setSettings({ ...settings, comfyuiDir: path });
    e.target.value = '';
  };

  const handleLaunchOllama = async () => {
    setLaunchStatus({ service: 'ollama', state: 'launching' });
    try {
      const result = await invoke<{ launched?: boolean; already_running?: boolean; message?: string }>('launch_ollama');
      setLaunchStatus({
        service: 'ollama',
        state: result?.launched ? 'launched' : result?.already_running ? 'running' : 'done',
        message: result?.message || 'Done'
      });
    } catch (err: unknown) {
      setLaunchStatus({ service: 'ollama', state: 'error', message: String((err as Error)?.message || err) });
    }
  };

  const handleLaunchComfyUI = async () => {
    if (!settings.comfyuiDir) {
      setLaunchStatus({ service: 'comfyui', state: 'error', message: 'Set ComfyUI directory first.' });
      return;
    }
    setLaunchStatus({ service: 'comfyui', state: 'launching' });
    try {
      const result = await invoke<{ launched?: boolean; already_running?: boolean; message?: string }>('launch_comfyui', {
        comfyuiDir: settings.comfyuiDir,
        pythonExe: settings.comfyuiPython || 'python'
      });
      setLaunchStatus({
        service: 'comfyui',
        state: result?.launched ? 'launched' : result?.already_running ? 'running' : 'done',
        message: result?.message || 'Done'
      });
    } catch (err: unknown) {
      setLaunchStatus({ service: 'comfyui', state: 'error', message: String((err as Error)?.message || err) });
    }
  };

  // Backup/restore state
  const [backupSize, setBackupSize] = useState<BackupSizeEstimate>(() => getBackupSizeEstimate());
  const [backupCreating, setBackupCreating] = useState(false);
  const [backupRestoring, setBackupRestoring] = useState(false);
  const [backupResult, setBackupResult] = useState<BackupResult | null>(null);
  const backupFileRef = useRef<HTMLInputElement>(null);

  const handleCreateBackup = async () => {
    setBackupCreating(true);
    setBackupResult(null);
    try {
      const data = await createBackup();
      exportBackupToFile(data);
      setBackupResult({ type: 'success', message: `Backup created — ${backupSize.kb} KB exported` });
    } catch (err: unknown) {
      setBackupResult({ type: 'error', message: `Backup failed: ${(err as Error).message || err}` });
    } finally {
      setBackupCreating(false);
    }
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBackupRestoring(true);
    setBackupResult(null);
    try {
      const data = await importBackupFromFile(file);
      const result = await restoreBackup(data);
      setBackupResult({
        type: 'success',
        message: `Restored ${result.localStorageRestored} localStorage keys, ${result.sqliteRestored} SQLite records${result.errors.length > 0 ? `, ${result.errors.length} errors` : ''}`
      });
      // Reload page to apply restored settings
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: unknown) {
      setBackupResult({ type: 'error', message: `Restore failed: ${(err as Error).message || err}` });
    } finally {
      setBackupRestoring(false);
      e.target.value = '';
    }
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left nav rail */}
      <nav className="w-44 shrink-0 border-r border-(--border) py-4 overflow-y-auto bg-(--surface-1)">
        {SETTINGS_SECTIONS.map(section => (
          <button key={section.id} onClick={() => setActiveSection(section.id)}
            className={`w-full flex items-center gap-2.5 px-4 py-2 text-xs transition-colors ${
              activeSection === section.id
                ? 'text-(--text-1) bg-(--surface-3) border-l-2 border-(--accent) pl-[calc(1rem-2px)]'
                : 'text-(--text-3) hover:text-(--text-2) hover:bg-(--surface-3) border-l-2 border-transparent'
            }`}>
            <section.Icon className="w-3.5 h-3.5 shrink-0" />
            {section.label}
          </button>
        ))}
      </nav>
      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-6 bg-(--surface-0)">
        {activeSection === 'general' && (
          <div className="max-w-4xl mx-auto space-y-10">
            <div className="space-y-1">
              <h1 className="font-serif text-2xl font-bold tracking-tight text-(--text-1)">System Settings</h1>
              <p className="text-sm text-(--text-3)">Configure local Ollama inference and native runtime behavior.</p>
            </div>

            <section className="space-y-4">
              <SectionHeader icon={Cpu} label="Ollama Runtime" />
        <div className="grid grid-cols-1 gap-6">
          <div className="space-y-2">
            <label htmlFor="settings-ollama-endpoint" className="block text-xs leading-6 font-semibold text-(--text-2)">Ollama API Endpoint</label>
            <input
              id="settings-ollama-endpoint"
              type="text"
              value={settings.endpoint}
              onChange={(event) => setSettings({ ...settings, endpoint: event.target.value })}
              className="w-full bg-(--surface-2) rounded-xl px-4 py-3 text-sm font-mono text-(--accent) focus:outline-hidden focus:ring-1 focus:ring-(--accent-border)"
            />
          </div>

          <div className="flex items-center justify-between rounded-2xl bg-(--surface-2) p-4">
            <div>
              <div className="text-sm font-semibold text-(--text-1)">Show model thinking</div>
              <div className="text-[11px] text-(--text-3) mt-0.5">Thinking models (such as Qwen3 or DeepSeek-R1) reason before they answer. On: the reasoning is shown folded above the answer. Off: only the answer is shown.</div>
            </div>
            <button
              role="switch"
              aria-checked={settings.showModelThinking !== false}
              aria-label="Show model thinking"
              onClick={() => setSettings({ ...settings, showModelThinking: settings.showModelThinking === false })}
              className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${settings.showModelThinking !== false ? 'bg-(--success)' : 'bg-(--surface-3)'}`}
            >
              <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${settings.showModelThinking !== false ? 'right-1' : 'left-1'}`} />
            </button>
          </div>

          <div className="space-y-2">
            <label htmlFor="settings-workspace-root" className="block text-xs leading-6 font-semibold text-(--text-2)">Workspace Root (for supervised proofs)</label>
            <div className="flex gap-2">
              <input
                id="settings-workspace-root"
                type="text"
                value={settings.workspaceRoot || ''}
                onChange={(event) => setSettings({ ...settings, workspaceRoot: event.target.value })}
                className="flex-1 bg-(--surface-2) rounded-xl px-4 py-3 text-sm font-mono text-(--text-1) focus:outline-hidden focus:ring-1 focus:ring-(--accent-border)"
              />
              <input ref={folderPickerRef} type="file" {...{ webkitdirectory: '' } as any} onChange={handleFolderPick} className="hidden" />
              <button
                onClick={handlePickWorkspaceRoot}
                className="px-3 py-2 rounded-xl bg-(--surface-2) hover:bg-(--surface-3) text-(--text-3) hover:text-(--text-1) transition-colors"
                aria-label="Browse for folder"
                title="Browse for folder"
              >
                <Folder className="w-4 h-4" />
              </button>
            </div>
            <div className="text-[11px] text-(--text-3)">Set this to the approved Alphonso workspace root before running native proof.</div>
          </div>

          <div className="space-y-2">
            <label htmlFor="settings-ocr-engine-path" className="block text-xs leading-6 font-semibold text-(--text-2)">OCR Engine Path (optional)</label>
            <input
              id="settings-ocr-engine-path"
              type="text"
              value={settings.ocrEnginePath || ''}
              onChange={(event) => setSettings({ ...settings, ocrEnginePath: event.target.value })}
              className="w-full bg-(--surface-2) rounded-xl px-4 py-3 text-sm font-mono text-(--text-1) focus:outline-hidden focus:ring-1 focus:ring-(--accent-border)"
            />
            <div className="text-[11px] text-(--text-3)">Leave blank until an OCR engine is actually configured and verified.</div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={onCheckOllama}
              className="flex items-center gap-2 rounded-xl bg-(--text-1) px-4 py-2 text-xs font-bold uppercase tracking-widest text-(--surface-0) hover:opacity-90"
            >
              <Activity className="h-3.5 w-3.5" /> Check Installed Models
            </button>
            <button
              onClick={onCheckOllama}
              className="flex items-center gap-2 rounded-xl bg-(--surface-2) px-4 py-2 text-xs font-bold uppercase tracking-widest text-(--text-2) hover:bg-(--surface-3)"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retry Ollama Connection
            </button>
            <button
              onClick={onCopyTroubleshootingCommand}
              className="flex items-center gap-2 rounded-xl bg-(--surface-2) px-4 py-2 text-xs font-bold uppercase tracking-widest text-(--text-2) hover:bg-(--surface-3)"
            >
              <Terminal className="h-3.5 w-3.5" /> {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy Failed' : 'Copy Command'}
            </button>
          </div>

          <div className="rounded-2xl bg-(--surface-2) p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <StatusDot state={ollamaStatus.state} />
                <span className="text-sm font-semibold text-(--text-1)">{ollamaStatus.label}</span>
                <Badge variant={LEGACY_COLOR_TO_VARIANT[statusColors[ollamaStatus.state as keyof typeof statusColors]] || 'default'}>{ollamaStatus.state}</Badge>
              </div>
              <span className="text-[11px] text-(--text-3)">{resolvedNormalizeEndpoint(settings.endpoint || '')}/api/tags</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-(--text-3)">{ollamaStatus.message}</p>
            <div className="mt-4 rounded-xl bg-(--surface-1) px-3 py-2 font-mono text-[11px] text-(--text-3) whitespace-pre-wrap">
              {ollamaTroubleshootingCommand}
            </div>
          </div>

          <ModelSelector
            models={installedModels}
            selectedModel={settings.selectedModel}
            selectedModelMissing={selectedModelMissing}
            onSelectModel={(selectedModel) => setSettings({ ...settings, selectedModel })}
          />

          <ModelPullHelper onRefresh={onCheckOllama} />
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader icon={Compass} label="Hector Web Search" />
        <div className="rounded-2xl bg-(--surface-2) p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${braveSearchConfigured ? 'bg-(--success)' : 'bg-(--surface-3)'}`} />
            <div className="flex-1 space-y-1">
              <div className="text-sm font-semibold text-(--text-1)">
                {braveSearchConfigured ? 'Brave Search API — active' : 'Brave Search API — not configured'}
              </div>
              <div className="text-[11px] text-(--text-3)">
                {braveSearchConfigured
                  ? 'BRAVE_SEARCH_API_KEY is set. Hector will use the Brave Search JSON API as the primary search provider.'
                  : 'Set BRAVE_SEARCH_API_KEY in your environment to enable Brave Search. Hector falls back to DuckDuckGo HTML scraping when the key is absent.'}
              </div>
              {!braveSearchConfigured && (
                <div className="mt-2 rounded-xl bg-(--surface-1) px-3 py-2 font-mono text-[11px] text-(--text-3)">
                  {'# Free tier: 2,000 queries/month — signup at search.brave.com/register\nBRAVE_SEARCH_API_KEY=your_key_here'}
                </div>
              )}
            </div>
          </div>

          <div className="p-4 bg-(--surface-2) rounded-2xl space-y-3">
            <div>
              <div className="text-sm font-semibold text-(--text-1)">Voice OS WebSocket Port</div>
              <div className="text-xs text-(--text-3) mt-0.5">WebSocket URL for Voice OS (STT+TTS) pipeline. Default: ws://127.0.0.1:8766/ws</div>
            </div>
            <input
              type="text"
              defaultValue={(() => { try { return localStorage.getItem('alphonso_voice_ws_url') || 'ws://127.0.0.1:8766/ws'; } catch { return 'ws://127.0.0.1:8766/ws'; } })()}
              onBlur={(e) => {
                const val = e.target.value.trim();
                try { localStorage.setItem('alphonso_voice_ws_url', val || 'ws://127.0.0.1:8766/ws'); } catch { /* ignore */ }
              }}
              placeholder="ws://127.0.0.1:8766/ws"
              className="w-full bg-(--surface-2) rounded-xl px-4 py-2.5 text-sm font-mono text-(--text-1) placeholder-(--text-4) focus:outline-hidden focus:ring-1 focus:ring-(--accent-border)"
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader icon={Monitor} label="Desktop & UI" />
        <div className="space-y-4">
          {setDeveloperMode && (
            <div className="flex items-center justify-between rounded-2xl bg-(--surface-2) p-4">
              <div>
                <div className="text-sm font-semibold text-(--text-1)">Developer mode</div>
                <div className="text-[11px] text-(--text-3) mt-0.5">Shows the Operator Dashboard (System → Operator): runtime proofs, audit logs, process checks, recovery and supervised commands. Off for everyday use.</div>
              </div>
              <button
                role="switch"
                aria-checked={developerMode}
                aria-label="Developer mode"
                onClick={() => setDeveloperMode(!developerMode)}
                className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${developerMode ? 'bg-(--success)' : 'bg-(--surface-3)'}`}
              >
                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${developerMode ? 'right-1' : 'left-1'}`} />
              </button>
            </div>
          )}
          <div className="rounded-2xl bg-(--surface-2) p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-(--text-1)">Auto Update Checks</div>
                <div className="text-[11px] text-(--text-3) mt-0.5">Check update endpoint periodically and notify when a new version is available.</div>
              </div>
              <button
                role="switch"
                aria-checked={settings.autoUpdateEnabled}
                aria-label="Toggle auto update checks"
                onClick={() => setSettings({ ...settings, autoUpdateEnabled: !settings.autoUpdateEnabled })}
                className={`w-10 h-5 rounded-full transition-colors relative ${settings.autoUpdateEnabled ? 'bg-(--success)' : 'bg-(--surface-3)'}`}
              >
                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${settings.autoUpdateEnabled ? 'right-1' : 'left-1'}`} />
              </button>
            </div>
            <div className="space-y-2">
              <label htmlFor="settings-updater-endpoint" className="block text-xs leading-6 font-semibold text-(--text-2)">Updater Endpoint</label>
              <input
                id="settings-updater-endpoint"
                type="text"
                value={settings.updaterEndpoint || ''}
                onChange={(event) => setSettings({ ...settings, updaterEndpoint: event.target.value })}
                className="w-full bg-(--surface-2) rounded-xl px-4 py-3 text-sm font-mono text-(--text-1) focus:outline-hidden focus:ring-1 focus:ring-(--accent-border)"
              />
              <div className="text-[11px] text-(--text-3)">Enter the hosted updater endpoint only when the release manifest is actually published.</div>
            </div>
            <div className="space-y-2">
              <label htmlFor="settings-updater-pubkey" className="block text-xs leading-6 font-semibold text-(--text-2)">Updater Public Key</label>
              <textarea
                id="settings-updater-pubkey"
                value={settings.updaterPubkey || ''}
                onChange={(event) => setSettings({ ...settings, updaterPubkey: event.target.value })}
                rows={3}
                className="w-full bg-(--surface-2) rounded-xl px-4 py-3 text-xs font-mono text-(--text-1) focus:outline-hidden focus:ring-1 focus:ring-(--accent-border)"
              />
              <div className="text-[11px] text-(--text-3)">Paste the public key only after the signing setup is complete.</div>
            </div>
            <div className="space-y-2">
              <label htmlFor="settings-updater-target" className="block text-xs leading-6 font-semibold text-(--text-2)">Custom Target (optional)</label>
              <input
                id="settings-updater-target"
                type="text"
                value={settings.updaterTarget || ''}
                onChange={(event) => setSettings({ ...settings, updaterTarget: event.target.value })}
                className="w-full bg-(--surface-2) rounded-xl px-4 py-3 text-sm font-mono text-(--text-1) focus:outline-hidden focus:ring-1 focus:ring-(--accent-border)"
              />
              <div className="text-[11px] text-(--text-3)">Use the actual target only when the updater release path is configured.</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onCheckUpdates}
                className="rounded-xl bg-(--surface-3) px-4 py-2 text-xs font-bold uppercase tracking-widest text-(--text-1) hover:bg-(--surface-3)"
              >
                {updateCheckState?.checking ? 'Checking...' : 'Check Updates Now'}
              </button>
              {updateCheckState?.available && <Badge variant="success">update available</Badge>}
              {updateCheckState?.configured && !updateCheckState?.available && <Badge variant="info">up to date / no update</Badge>}
              {!updateCheckState?.configured && <Badge variant="warning">not configured</Badge>}
            </div>
            <div className="rounded-xl bg-(--surface-2) p-3 text-[11px] text-(--text-2)">
              <div>Current: {updateCheckState?.currentVersion || 'n/a'} | Latest: {updateCheckState?.latestVersion || 'none'}</div>
              <div className="mt-1">Status: {updateCheckState?.error ? updateCheckState.error : (updateCheckState?.available ? 'New version detected.' : 'No update available.')}</div>
            </div>
            {/* The installer includes an LGPL FFmpeg build for Miya's finished videos (content factory phase 2a). */}
            <div className="rounded-xl bg-(--surface-2) p-3 text-[11px] text-(--text-2)" data-testid="ffmpeg-license-notice">
              Finished videos are made with FFmpeg, included under the GNU LGPL 2.1 (its license is in the install folder, ffmpeg\LICENSE.txt).{' '}
              <button type="button" className="underline" onClick={() => { void openExternalUrl('https://ffmpeg.org/legal.html'); }}>FFmpeg license and source</button>
            </div>
          </div>
          <div className="flex items-center justify-between p-4 bg-(--surface-2) rounded-2xl">
            <div>
              <div className="text-sm font-semibold text-(--text-1)">Native Desktop Mode</div>
              <div className="text-[11px] text-(--text-3) mt-0.5">Tauri v2 desktop runtime is the intended target.</div>
              <div className="text-[11px] text-(--warning) mt-1">On Windows, verify:desktop needs WiX 3.14 binaries locally or a permitted wix314-binaries.zip download.</div>
            </div>
            <button
              role="switch"
              aria-checked={!!settings.desktopMode}
              aria-label="Toggle native desktop mode"
              onClick={() => setSettings({ ...settings, desktopMode: !settings.desktopMode })}
              className={`w-10 h-5 rounded-full transition-colors relative ${settings.desktopMode ? 'bg-(--accent)' : 'bg-(--surface-3)'}`}
            >
              <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${settings.desktopMode ? 'right-1' : 'left-1'}`} />
            </button>
          </div>
          <div className="flex items-center justify-between p-4 bg-(--surface-2) rounded-2xl">
            <div>
              <div className="text-sm font-semibold text-(--text-1)">Local-Only Runtime</div>
              <div className="text-[11px] text-(--text-3) mt-0.5">Show explicit local-only identity and disable cloud assumptions.</div>
            </div>
            <button
              role="switch"
              aria-checked={!!settings.localOnlyMode}
              aria-label="Toggle local-only runtime"
              onClick={() => setSettings({ ...settings, localOnlyMode: !settings.localOnlyMode })}
              className={`w-10 h-5 rounded-full transition-colors relative ${settings.localOnlyMode ? 'bg-(--accent)' : 'bg-(--surface-3)'}`}
            >
              <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${settings.localOnlyMode ? 'right-1' : 'left-1'}`} />
            </button>
          </div>
          <div className="flex items-center justify-between p-4 bg-(--surface-2) rounded-2xl">
            <div>
              <div className="text-sm font-semibold text-(--text-1)">Zero-Cost Mode (Default)</div>
              <div className="text-[11px] text-(--text-3) mt-0.5">Prefer local/free connectors first. Paid or metered connector routes are held for explicit approval.</div>
            </div>
            <button
              role="switch"
              aria-checked={settings.zeroCostMode}
              aria-label="Toggle zero-cost mode"
              onClick={() => setSettings({ ...settings, zeroCostMode: !settings.zeroCostMode })}
              className={`w-10 h-5 rounded-full transition-colors relative ${settings.zeroCostMode ? 'bg-(--success)' : 'bg-(--surface-3)'}`}
            >
              <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${settings.zeroCostMode ? 'right-1' : 'left-1'}`} />
            </button>
          </div>
          <div className="flex items-center justify-between p-4 bg-(--surface-2) rounded-2xl">
            <div>
              <div className="text-sm font-semibold text-(--text-1)">Approval Mode</div>
              <div className="text-[11px] text-(--text-3) mt-0.5">Require explicit confirmation for supervised actions.</div>
            </div>
            <button
              role="switch"
              // Unset counts as on, as the policy reads it (2026-10-23).
              aria-checked={settings.approvalMode !== false}
              aria-label="Toggle approval mode"
              onClick={() => setSettings({ ...settings, approvalMode: settings.approvalMode === false })}
              className={`w-10 h-5 rounded-full transition-colors relative ${settings.approvalMode !== false ? 'bg-(--warning)' : 'bg-(--surface-3)'}`}
            >
              <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${settings.approvalMode !== false ? 'right-1' : 'left-1'}`} />
            </button>
          </div>
          <EffectApprovalsTable settings={settings} setSettings={setSettings} />
          <PaidModelsPanel settings={settings} setSettings={setSettings} />
          <JoseTelegramPanel settings={settings} setSettings={setSettings} />
          <div className="flex items-center justify-between gap-3 p-4 bg-(--surface-2) rounded-2xl">
            <div>
              <label htmlFor="jose-waiting-expiry" className="text-sm font-semibold text-(--text-1)">Waiting requests expire after (days)</label>
              <div className="text-[11px] text-(--text-3) mt-0.5">A request still waiting for your approval after this many days is cancelled, with a note. Blank or 0: never.</div>
            </div>
            <input
              id="jose-waiting-expiry"
              inputMode="numeric"
              placeholder="Never"
              value={settings.joseWaitingExpiryDays === undefined ? '7' : Number(settings.joseWaitingExpiryDays) > 0 ? String(settings.joseWaitingExpiryDays) : ''}
              onChange={(e) => {
                const days = Number(e.target.value);
                setSettings({ ...settings, joseWaitingExpiryDays: e.target.value.trim() === '' || !Number.isFinite(days) || days < 0 ? 0 : Math.round(days) });
              }}
              className="w-20 rounded-md bg-(--surface-1) px-2 py-1 text-xs text-(--text-1)"
            />
          </div>
          <div className="flex items-center justify-between gap-3 p-4 bg-(--surface-2) rounded-2xl">
            <div>
              <div className="text-sm font-semibold text-(--text-1)">Show Jose's plan first</div>
              <div className="text-[11px] text-(--text-3) mt-0.5">Bigger requests are those with 4 or more agents, counting Jose and Maria, or a step that always asks.</div>
            </div>
            <select
              aria-label="Show Jose's plan first"
              value={settings.showPlanFirst === 'always' || settings.showPlanFirst === 'never' ? settings.showPlanFirst : 'bigger'}
              onChange={(e) => setSettings({ ...settings, showPlanFirst: e.target.value })}
              className="rounded-md bg-(--surface-1) px-2 py-1 text-xs text-(--text-1)"
            >
              <option value="always">Always</option>
              <option value="bigger">Bigger requests only</option>
              <option value="never">Never</option>
            </select>
          </div>
          <div className="flex items-center justify-between p-4 bg-(--surface-2) rounded-2xl">
            <div>
              <div className="text-sm font-semibold text-(--text-1)">Safe Mode</div>
              <div className="text-[11px] text-(--text-3) mt-0.5">Conservative runtime behavior with repair-first posture.</div>
            </div>
            <button
              role="switch"
              aria-checked={!!settings.safeMode}
              aria-label="Toggle safe mode"
              onClick={() => setSettings({ ...settings, safeMode: !settings.safeMode })}
              className={`w-10 h-5 rounded-full transition-colors relative ${settings.safeMode ? 'bg-(--success)' : 'bg-(--surface-3)'}`}
            >
              <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${settings.safeMode ? 'right-1' : 'left-1'}`} />
            </button>
          </div>
          <div className="flex items-center justify-between p-4 bg-(--surface-2) rounded-2xl">
            <div>
              <div className="text-sm font-semibold text-(--text-1)">Privacy Shield Indicator</div>
              <div className="text-[11px] text-(--text-3) mt-0.5">Show Alphonso in privacy-shield mode for local-only work.</div>
            </div>
            <button
              role="switch"
              aria-checked={!!settings.privacyShieldActive}
              aria-label="Toggle privacy shield indicator"
              onClick={() => setSettings({ ...settings, privacyShieldActive: !settings.privacyShieldActive })}
              className={`w-10 h-5 rounded-full transition-colors relative ${settings.privacyShieldActive ? 'bg-(--success)' : 'bg-(--surface-3)'}`}
            >
              <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${settings.privacyShieldActive ? 'right-1' : 'left-1'}`} />
            </button>
          </div>
          <div className="flex items-center justify-between p-4 bg-(--surface-2) rounded-2xl">
            <div>
              <div className="text-sm font-semibold text-(--text-1)">Miya Creative Companion</div>
              <div className="text-[11px] text-(--text-3) mt-0.5">Show Miya pinned creative assistant widget.</div>
            </div>
            <button
              role="switch"
              aria-checked={!!settings.miyaCompanionPinned}
              aria-label="Toggle Miya creative companion"
              onClick={() => setSettings({ ...settings, miyaCompanionPinned: !settings.miyaCompanionPinned })}
              className={`w-10 h-5 rounded-full transition-colors relative ${settings.miyaCompanionPinned ? 'bg-(--agent-miya)' : 'bg-(--surface-3)'}`}
            >
              <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${settings.miyaCompanionPinned ? 'right-1' : 'left-1'}`} />
            </button>
          </div>
          <div className="flex items-center justify-between p-4 bg-(--surface-2) rounded-2xl">
            <div>
              <div className="text-sm font-semibold text-(--text-1)">Jose Orchestrator Companion</div>
              <div className="text-[11px] text-(--text-3) mt-0.5">Show Jose pinned governance and routing assistant widget.</div>
            </div>
            <button
              role="switch"
              aria-checked={!!settings.joseCompanionPinned}
              aria-label="Toggle Jose orchestrator companion"
              onClick={() => setSettings({ ...settings, joseCompanionPinned: !settings.joseCompanionPinned })}
              className={`w-10 h-5 rounded-full transition-colors relative ${settings.joseCompanionPinned ? 'bg-(--agent-jose)' : 'bg-(--surface-3)'}`}
            >
              <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${settings.joseCompanionPinned ? 'right-1' : 'left-1'}`} />
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader icon={Activity} label="Performance Diagnostics" />
        <PerformanceDiagnosticsPanel />
      </section>
    </div>
  )}
  {activeSection === 'connectors' && (
    <div className="max-w-4xl mx-auto space-y-10">
      <section className="space-y-4">
        <SectionHeader icon={Key} label="API Credentials" />
        <ConnectorSetupPanel />
      </section>
      <section className="space-y-4">
        <SectionHeader icon={Bot} label="Agent Providers" />
        <AgentProvidersSection />
      </section>
      <section className="space-y-4">
        <SectionHeader icon={PhoneCall} label="CALL-E Outreach" />
        <CalleOutreachPanel />
      </section>
      <section className="space-y-4">
        <SectionHeader icon={PhoneCall} label="Escalation Calls" />
        <EscalationCallPanel />
      </section>
      <section className="space-y-4">
        <SectionHeader icon={Plug} label="External Tools (Composio)" />
        <div className="space-y-4">
          <div className="p-4 bg-(--surface-2) rounded-2xl space-y-3">
            <div className="text-sm font-semibold text-(--text-1)">Composio API Key</div>
            <div className="text-xs text-(--text-3)">Connect agents to 1000+ external services (GitHub, Slack, Notion, Jira, etc.). Get your key at <a href="https://app.composio.dev" onClick={(e) => { e.preventDefault(); void openExternalUrl("https://app.composio.dev"); }} rel="noopener noreferrer" className="text-(--accent) hover:underline">app.composio.dev</a>.</div>
            <div className="flex gap-2">
              <input
                type="password"
                value={composioApiKey}
                onChange={(e) => setComposioApiKey(e.target.value)}
                placeholder="Enter Composio API key"
                className="flex-1 bg-(--surface-2) rounded-xl px-4 py-2.5 text-sm font-mono text-(--text-1) focus:outline-hidden focus:ring-1 focus:ring-(--accent-border)"
              />
              <button
                onClick={handleComposioSave}
                disabled={composioChecking || !composioApiKey}
                className="px-4 py-2.5 bg-(--accent) hover:bg-(--accent-hover) disabled:bg-(--surface-3) disabled:text-(--text-3) text-(--accent-contrast) text-sm font-medium rounded-xl transition-colors"
              >
                {composioChecking ? 'Checking...' : 'Save'}
              </button>
            </div>
          </div>

          <div className="p-4 bg-(--surface-2) rounded-2xl space-y-3">
            <div className="text-sm font-semibold text-(--text-1)">User ID</div>
            <div className="text-xs text-(--text-3)">Identifies your agent sessions in Composio.</div>
            <input
              type="text"
              value={composioUserId}
              onChange={(e) => setComposioUserId(e.target.value)}
              placeholder="alphonso-user"
              className="w-full bg-(--surface-2) rounded-xl px-4 py-2.5 text-sm font-mono text-(--text-1) focus:outline-hidden focus:ring-1 focus:ring-(--accent-border)"
            />
          </div>

          {composioHealth && (
            <div className={`flex items-center gap-2 p-3 rounded-xl ${composioHealth.status === 'healthy' ? 'bg-(--success-dim) text-(--success)' : 'bg-(--error-dim) text-(--error)'}`}>
              {composioHealth.status === 'healthy' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              <span className="text-xs">{composioHealth.message}</span>
            </div>
          )}

          {isComposioEnabled() && composioToolkits.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-(--text-3)">Available Toolkits ({composioToolkits.length})</div>
                <span className="text-[10px] text-(--text-4)">{enabledToolkits.size} enabled</span>
              </div>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {composioToolkits.slice(0, 20).map((tk) => {
                  const key = tk.key || tk.name || '';
                  const enabled = enabledToolkits.has(key);
                  return (
                    <button
                      key={key}
                      onClick={() => toggleComposioToolkit(key)}
                      className={`text-left px-3 py-2 rounded-xl text-[10px] transition-all ${
                        enabled
                          ? 'bg-(--accent-dim) text-(--accent) ring-1 ring-(--accent-border)'
                          : 'bg-(--surface-3) text-(--text-3) hover:bg-(--surface-4)'
                      }`}
                    >
                      <div className="font-semibold truncate">{tk.name || key}</div>
                      {enabled && <div className="text-[9px] text-(--accent) mt-0.5">Active</div>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="text-[11px] text-(--text-3)">
            When enabled, agents can use Composio tools for external task management. Zero-cost mode still requires approval for paid actions.
          </div>
        </div>
      </section>
    </div>
  )}
  {activeSection === 'agents' && (
    <div className="max-w-4xl mx-auto space-y-10">
      <section className="space-y-4">
        <SectionHeader icon={UserRound} label="Agent Avatars" />
        <p className="text-[11px] text-(--text-3)">
          Click an avatar to upload a custom mascot image (PNG, JPG, WebP). Images are resized to 256 × 256 and stored locally.
          Click <strong className="text-(--text-3)">Reset</strong> to restore the default.
        </p>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-9">
          {AVATAR_AGENTS.map((agent) => (
            <AgentAvatarCard key={agent.id} agentId={agent.id} label={agent.label} />
          ))}
        </div>
      </section>
      <section className="space-y-4">
        <SectionHeader icon={FolderOpen} label="Alphonso's projects" />
        <AlphonsoProjectsSection settings={settings} setSettings={(patch) => setSettings({ ...settings, ...patch })} />
      </section>
      <section className="space-y-4">
        <SectionHeader icon={Bot} label="Agent Skills" />
        <div className="flex items-center justify-between gap-3 p-4 bg-(--surface-2) rounded-2xl">
          <div>
            <label htmlFor="agent-tool-call-size" className="text-sm font-semibold text-(--text-1)">Agents call their own tools from model size (billions)</label>
            <div className="text-[11px] text-(--text-3) mt-0.5">Smaller models follow each skill's steps in order. Paid and cloud models always call their own tools. The skills themselves are under All Agents → Skills.</div>
          </div>
          <input
            id="agent-tool-call-size"
            inputMode="numeric"
            value={Number(settings.agentToolCallMinSizeB) > 0 ? String(settings.agentToolCallMinSizeB) : '14'}
            onChange={(e) => {
              const size = Number(e.target.value);
              setSettings({ ...settings, agentToolCallMinSizeB: Number.isFinite(size) && size > 0 ? size : 14 });
            }}
            className="w-20 rounded-md bg-(--surface-1) px-2 py-1 text-xs text-(--text-1)"
          />
        </div>
      </section>
      <section className="space-y-4">
        <SectionHeader icon={BarChart3} label="Agent Performance" />
        <AgentMetricsPanel />
      </section>
      {/* Phone pairing lives only in Runtime -> Remote Access (owner, 2026-10-21;
          it was shown here too as "Agent Companions", QA Bug 36). */}
    </div>
  )}
  {activeSection === 'runtime' && (
    <div className="max-w-4xl mx-auto space-y-10">
      <section className="space-y-4">
        <SectionHeader icon={Zap} label="Local Services" />
        <div className="space-y-4">

          <div className="p-4 bg-(--surface-2) rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-(--text-1)">Auto-Launch on Startup</div>
                <div className="text-xs text-(--text-3) mt-0.5">Start Ollama (and ComfyUI if configured) automatically when Alphonso opens.</div>
              </div>
              <button
                onClick={() => setSettings({ ...settings, autoLaunchServices: !settings.autoLaunchServices })}
                className={`relative w-10 h-6 rounded-full border transition-colors ${
                  settings.autoLaunchServices
                    ? 'bg-(--accent) border-(--accent-border)'
                    : 'bg-(--surface-3) border-(--border-strong)'
                }`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${settings.autoLaunchServices ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>

          <div className="p-4 bg-(--surface-2) rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-(--text-1)">Output Folder</div>
                <div className="text-xs text-(--text-3) mt-0.5">Where generated images and files are saved.</div>
              </div>
              <input ref={outputFolderPickerRef} type="file" {...{ webkitdirectory: '' } as any} onChange={handleOutputFolderPick} className="hidden" />
              <button
                onClick={handlePickOutputFolder}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-(--surface-3) hover:bg-(--surface-3) text-(--text-1) text-xs font-medium transition-colors"
              >
                <Folder className="w-3.5 h-3.5" />
                Browse
              </button>
            </div>
            <input
              type="text"
              value={settings.outputFolder || ''}
              onChange={(e) => setSettings({ ...settings, outputFolder: e.target.value })}
              placeholder="C:\Users\You\Pictures\Alphonso"
              className="w-full bg-(--surface-2) rounded-xl px-4 py-2.5 text-sm font-mono text-(--text-1) placeholder-(--text-4) focus:outline-hidden focus:ring-1 focus:ring-(--accent-border)"
            />
          </div>

          <div className="p-4 bg-(--surface-2) rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-(--text-1)">Ollama</div>
                <div className="text-xs text-(--text-3) mt-0.5">Local LLM inference server at localhost:11434.</div>
              </div>
              <button
                onClick={handleLaunchOllama}
                disabled={launchStatus?.service === 'ollama' && launchStatus?.state === 'launching'}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-(--accent) hover:bg-(--accent-hover) disabled:bg-(--surface-3) disabled:text-(--text-3) text-(--accent-contrast) text-xs font-medium transition-colors"
              >
                <Zap className="w-3.5 h-3.5" />
                {launchStatus?.service === 'ollama' && launchStatus?.state === 'launching' ? 'Launching…' : 'Launch Now'}
              </button>
            </div>
            {launchStatus?.service === 'ollama' && launchStatus?.state !== 'launching' && (
              <div className={`flex items-center gap-2 text-xs rounded-xl px-3 py-2 border ${launchStatus.state === 'error' ? 'bg-(--error-dim) border-(--error-border) text-(--error)' : 'bg-(--success-dim) border-(--success-border) text-(--success)'}`}>
                {launchStatus.state === 'error' ? <XCircle className="w-3.5 h-3.5 shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                {launchStatus.message}
              </div>
            )}
          </div>

          <div className="p-4 bg-(--surface-2) rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-(--text-1)">ComfyUI</div>
                <div className="text-xs text-(--text-3) mt-0.5">Local image generation server. The image tool Alphonso's agents use.</div>
              </div>
              <button
                onClick={handleLaunchComfyUI}
                disabled={launchStatus?.service === 'comfyui' && launchStatus?.state === 'launching'}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-(--accent) hover:bg-(--accent-hover) disabled:bg-(--surface-3) disabled:text-(--text-3) text-(--accent-contrast) text-xs font-medium transition-colors"
              >
                <Zap className="w-3.5 h-3.5" />
                {launchStatus?.service === 'comfyui' && launchStatus?.state === 'launching' ? 'Launching…' : 'Launch Now'}
              </button>
            </div>
            <ComfyUiAddressField />
            <ComfyUiInstallPicker
              comfyuiDir={settings.comfyuiDir || ''}
              onChoose={(dir, python) => setSettings({ ...settings, comfyuiDir: dir, comfyuiPython: python })}
            />
            <div className="space-y-2">
              <div className="text-[11px] text-(--text-4)">Or enter a ComfyUI folder:</div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={settings.comfyuiDir || ''}
                  onChange={(e) => setSettings({ ...settings, comfyuiDir: e.target.value })}
                  placeholder="C:\ComfyUI"
                  className="flex-1 bg-(--surface-2) rounded-xl px-4 py-2.5 text-sm font-mono text-(--text-1) placeholder-(--text-4) focus:outline-hidden focus:ring-1 focus:ring-(--accent-border)"
                />
                <input ref={comfyuiDirPickerRef} type="file" {...{ webkitdirectory: '' } as any} onChange={handleComfyUIDirPick} className="hidden" />
                <button
                  onClick={handlePickComfyUIDir}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-(--surface-3) hover:bg-(--surface-3) text-(--text-1) text-xs font-medium transition-colors"
                >
                  <Folder className="w-3.5 h-3.5" />
                  Browse
                </button>
              </div>
              <input
                type="text"
                value={settings.comfyuiPython || ''}
                onChange={(e) => setSettings({ ...settings, comfyuiPython: e.target.value })}
                placeholder="python  (or full path to python.exe)"
                className="w-full bg-(--surface-2) rounded-xl px-4 py-2.5 text-sm font-mono text-(--text-1) placeholder-(--text-4) focus:outline-hidden focus:ring-1 focus:ring-(--accent-border)"
              />
              <div className="text-[11px] text-(--text-4)">Python executable used to run <span className="font-mono">main.py</span>. Leave blank to use <span className="font-mono">python</span>.</div>
            </div>
            <ComfyUiModelPicker />
            {launchStatus?.service === 'comfyui' && launchStatus?.state !== 'launching' && (
              <div className={`flex items-center gap-2 text-xs rounded-xl px-3 py-2 border ${launchStatus.state === 'error' ? 'bg-(--error-dim) border-(--error-border) text-(--error)' : 'bg-(--success-dim) border-(--success-border) text-(--success)'}`}>
                {launchStatus.state === 'error' ? <XCircle className="w-3.5 h-3.5 shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                {launchStatus.message}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader icon={Key} label="Remote Access" />
        <CompanionPairingPanel />
      </section>

      <section className="space-y-4">
        <SectionHeader icon={TrendingUp} label="Nova's last verdicts" />
        <NovaHistoryChart />
      </section>
    </div>
  )}
  {activeSection === 'bridges' && (
    <div className="max-w-4xl mx-auto space-y-4">
      <SectionHeader icon={Cable} label="Bridges" />
      <BridgesPanel />
    </div>
  )}

  {activeSection === 'memory' && (
    <div className="max-w-4xl mx-auto space-y-10">
      <section className="space-y-4">
        <SectionHeader icon={Mic} label="Meeting Transcription → Echo Memory" />
        <MeetingTranscriptionPanel />
      </section>
      <section className="space-y-4">
        <SectionHeader icon={Activity} label="What Echo remembers" />
        <ChromaDbStatus />
        <MeaningSearchStatus settings={settings} setSettings={setSettings} />
        <DecisionsPanel />
      </section>
      <section className="space-y-4">
        <SectionHeader icon={Database} label="Memory Knowledge Graph" />
        <MemoryGraphViewer size="compact" />
        <button
          onClick={() => setGraphModalOpen(true)}
          className="text-xs text-(--accent) hover:underline"
        >
          Expand to fullscreen →
        </button>
        <MemoryGraphCleanupPanel />
      </section>
      <section className="space-y-4">
        <SectionHeader icon={Database} label="Session History" />
        <SessionHistoryView />
      </section>
      <section className="space-y-4">
        <SectionHeader icon={FolderOpen} label="Echo Inbox Folder Watcher" />
        <InboxFolderConfig />
      </section>
    </div>
  )}
  {activeSection === 'appearance' && (
    <div className="max-w-4xl mx-auto space-y-10">
      <section className="space-y-4">
        <SectionHeader icon={Palette} label="Appearance" />
        <div className="grid grid-cols-3 gap-3">
          {[
            { id: 'minimal_runtime', label: 'Minimal Runtime', preview: 'bg-zinc-900' },
            { id: 'deep_space', label: 'Deep Space', preview: 'bg-indigo-950' },
            { id: 'orchestrator_gold', label: 'Orchestrator Gold', preview: 'bg-amber-950' }
          ].map((theme) => (
            <button
              key={theme.id}
              onClick={() => setSettings({ ...settings, environmentTheme: theme.id })}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl transition-all ${
                settings.environmentTheme === theme.id
                  ? 'bg-(--accent-dim) ring-1 ring-(--accent-border)'
                  : 'bg-(--surface-2) hover:bg-(--surface-3)'
              }`}
            >
              <div className={`w-full h-10 rounded-lg ${theme.preview}`} />
              <span className="text-[10px] font-bold uppercase tracking-widest text-(--text-3)">{theme.label}</span>
              {settings.environmentTheme === theme.id && (
                <span className="text-[9px] text-(--accent) font-bold">Active</span>
              )}
            </button>
          ))}
        </div>
      </section>
    </div>
  )}
  {activeSection === 'knowledge' && (
    <div className="max-w-4xl mx-auto min-h-[60vh]">
      <FilesView memoryItems={memoryItems as Parameters<typeof FilesView>[0]['memoryItems']} />
    </div>
  )}
  {activeSection === 'coach' && (
    <div className="max-w-4xl mx-auto space-y-10">
      <section className="space-y-4">
        <SectionHeader icon={MessageSquare} label="Session Coach" />
        <CoachSettingsSection />
      </section>
      <section className="space-y-4">
        <SectionHeader icon={ScrollText} label="Coach History" />
        <CoachHistoryPanel />
      </section>
    </div>
  )}
  {activeSection === 'plugins' && <PluginMarketplacePanel />}
  {activeSection === 'logs' && (
    <div className="max-w-4xl mx-auto space-y-10">
      <section className="space-y-4">
        <SectionHeader icon={ScrollText} label="Logs" />
        <CrashLogView />
      </section>
    </div>
  )}
  {activeSection === 'backup' && (
    <div className="max-w-4xl mx-auto space-y-10">
      <section className="space-y-4">
        <SectionHeader icon={Database} label="Backup & Restore" />
        <div className="space-y-4">
          <div className="p-4 bg-(--surface-2) rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-(--text-1)">Export Backup</div>
                <div className="text-xs text-(--text-3) mt-0.5">Download all settings, memory, chats, and agent data as a JSON file.</div>
              </div>
              <button
                onClick={handleCreateBackup}
                disabled={backupCreating}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-(--accent) hover:bg-(--accent-hover) disabled:bg-(--surface-3) disabled:text-(--text-3) text-(--accent-contrast) text-sm font-medium rounded-xl transition-colors"
              >
                <Download className="w-4 h-4" />
                {backupCreating ? 'Creating...' : `Export (${backupSize.kb} KB)`}
              </button>
            </div>
          </div>

          <div className="p-4 bg-(--surface-2) rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-(--text-1)">Import Backup</div>
                <div className="text-xs text-(--text-3) mt-0.5">Restore from a previously exported backup file. Page will reload after restore.</div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={backupFileRef}
                  type="file"
                  accept=".json"
                  onChange={handleImportBackup}
                  className="hidden"
                />
                <button
                  onClick={() => backupFileRef.current?.click()}
                  disabled={backupRestoring}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-(--surface-3) hover:bg-(--surface-3) disabled:bg-(--surface-3) disabled:text-(--text-4) text-(--text-1) text-sm font-medium rounded-xl transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  {backupRestoring ? 'Restoring...' : 'Import'}
                </button>
              </div>
            </div>
          </div>

          {backupResult && (
            <div className={`flex items-center gap-2 p-3 rounded-xl ${backupResult.type === 'success' ? 'bg-(--success-dim) text-(--success)' : 'bg-(--error-dim) text-(--error)'}`}>
              {backupResult.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              <span className="text-xs">{backupResult.message}</span>
            </div>
          )}

          <div className="text-[11px] text-(--text-3)">
            Backup includes all app data (settings, chats, memory, Boardroom threads, agent choices, research, schedules) and the stored records. Passwords, API keys and other secrets are left out; keep them in your password manager.
          </div>
        </div>
      </section>

      <div className="border-t border-(--border) pt-4">
        <WorkspaceExportImportView />
      </div>

      <McpServerInfo />
    </div>
  )}
      </div>
      <Modal open={graphModalOpen} onClose={() => setGraphModalOpen(false)} size="full" title="Memory Knowledge Graph">
        <MemoryGraphViewer size="full" />
      </Modal>
    </div>
  );
}

function PluginMarketplacePanel() {
  const [plugins, setPlugins] = React.useState(() => listPlugins());
  const [filter, setFilter] = React.useState('');

  const filtered = plugins.filter(p =>
    !filter || p.name?.toLowerCase().includes(filter.toLowerCase()) || p.description?.toLowerCase().includes(filter.toLowerCase())
  );

  const handleToggle = (id: string) => {
    togglePlugin(id, !plugins.find(p => p.id === id)?.enabled);
    setPlugins(listPlugins());
  };

  return (
    <div className="max-w-4xl mx-auto space-y-10">
      <section className="space-y-4">
        <SectionHeader icon={Package} label="Plugin Marketplace" />
        <p className="text-xs text-(--text-3)">Install and manage signed plugins. Plugins extend Alphonso with new panels, tools, and workflow steps.</p>
        <input
          type="text"
          placeholder="Search plugins…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="w-full text-sm bg-(--surface-2) rounded-xl px-4 py-2.5 text-(--text-1) placeholder:text-(--text-3) focus:outline-hidden focus:border-(--accent-border)"
        />
        {filtered.length === 0 ? (
          <div className="p-8 rounded-2xl bg-(--surface-2) text-center space-y-2">
            <Package className="w-8 h-8 text-(--text-4) mx-auto" />
            <p className="text-sm text-(--text-3)">{filter ? 'No plugins match your search.' : 'No plugins installed yet.'}</p>
            <p className="text-xs text-(--text-4)">Drop a signed plugin manifest (.json) into Settings → Backup → Import, or install via the Alphonso CLI.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(p => (
              <div key={p.id} className="flex items-center gap-4 p-4 bg-(--surface-2) rounded-2xl">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-(--text-1) truncate">{p.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-(--surface-3) text-(--text-3) shrink-0">v{p.version}</span>
                    {p.trust === 'verified' && <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-(--success-dim) text-(--success) shrink-0">✓ signed</span>}
                  </div>
                  <p className="text-xs text-(--text-3) mt-0.5 truncate">{p.description}</p>
                  {p.author && <p className="text-[10px] text-(--text-4) mt-0.5">by {p.author}</p>}
                </div>
                <button
                  onClick={() => handleToggle(p.id)}
                  className={`shrink-0 transition-colors ${p.enabled ? 'text-(--accent) hover:text-(--accent-hover)' : 'text-(--text-4) hover:text-(--text-3)'}`}
                  title={p.enabled ? 'Disable plugin' : 'Enable plugin'}
                >
                  {p.enabled ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="p-3 rounded-xl bg-(--accent-dim) text-xs text-(--text-3)">
          <span className="text-(--accent) font-medium">How to install:</span> Obtain a signed plugin manifest from a trusted source, then use <span className="font-mono text-(--text-2)">verifyAndAddPlugin(manifest)</span> from <span className="font-mono text-(--text-2)">pluginSigningService</span>. Only ECDSA-signed plugins from trusted keys are accepted.
        </div>
      </section>
    </div>
  );
}

function ChromaDbStatus() {
  const [healthy, setHealthy] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    import('../services/chromaDbService.js').then(({ isChromaHealthy }) => {
      isChromaHealthy().then(setHealthy);
    });
  }, []);

  if (healthy === null) return null;

  return (
    <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${healthy ? 'bg-(--success-dim) text-(--success)' : 'bg-(--surface-2) text-(--text-3)'}`}>
      <span className={`w-2 h-2 rounded-full ${healthy ? 'bg-(--success) animate-pulse' : 'bg-(--surface-3)'}`} />
      {healthy
        ? 'Vector search active — Echo uses ChromaDB for semantic memory retrieval'
        : 'Vector search offline — start ChromaDB in Runtime Hub for smarter memory search'}
    </div>
  );
}

function MeetingTranscriptionPanel() {
  const [status, setStatus] = React.useState<'idle' | 'reading' | 'transcribing' | 'summarizing' | 'saving' | 'done' | 'error'>('idle');
  const [result, setResult] = React.useState<{ filename: string; summary: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [whisperInstalled, setWhisperInstalled] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    import('../services/runtimeManagerService.js').then(({ getAllStatus }) => {
      getAllStatus().then((tools: any[]) => {
        const whisper = tools.find((t: any) => t.name === 'whisper');
        setWhisperInstalled(whisper?.installed ?? false);
      }).catch(() => setWhisperInstalled(false));
    }).catch(() => setWhisperInstalled(false));
  }, []);

  const pickAndTranscribe = async () => {
    setStatus('reading');
    setError(null);
    setResult(null);
    try {
      // Use native file picker to get a real filesystem path — no file.path hack
      const audioPath = await invoke<string>('pick_file', { filters: ['mp3', 'wav', 'm4a', 'mp4', 'ogg', 'webm', 'flac'] });
      const filename = audioPath.split(/[/\\]/).pop() || audioPath;
      const { transcribeAndIngest } = await import('../services/whisperTranscriptionService.js');
      const res = await transcribeAndIngest(audioPath, filename, (s: string) => setStatus(s as typeof status));
      setResult({ filename, summary: res.summary });
      setStatus('done');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'cancelled') { setStatus('idle'); return; }
      setError(msg);
      setStatus('error');
    }
  };

  const busy = status !== 'idle' && status !== 'done' && status !== 'error';
  const label = busy ? `${status}…` : 'Choose Audio File';

  return (
    <div className="p-4 bg-(--surface-2) rounded-2xl space-y-3">
      {whisperInstalled === false && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-(--warning-dim) text-(--warning) text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Whisper not installed. Install it in Runtimes → Whisper to enable transcription.
        </div>
      )}
      <p className="text-xs text-(--text-3)">
        Choose an audio file (MP3, WAV, M4A). Whisper transcribes it, Ollama summarizes it, Echo remembers it.
        Whisper must be installed via Runtime Hub first.
      </p>
      <button
        onClick={pickAndTranscribe}
        disabled={busy}
        className="px-4 py-2 bg-(--accent) hover:bg-(--accent-hover) disabled:bg-(--surface-3) text-(--accent-contrast) disabled:text-(--text-3) text-xs rounded-xl transition-colors"
      >
        {label}
      </button>
      {result && (
        <div className="space-y-1">
          <p className="text-xs text-(--success)">✓ {result.filename} saved to Echo memory</p>
          <p className="text-xs text-(--text-3) line-clamp-3">{result.summary}</p>
        </div>
      )}
      {error && (
        <p className="text-xs text-(--error)">✗ {error}</p>
      )}
    </div>
  );
}

function McpServerInfo() {
  return (
    <section className="mt-6 border-t border-(--border) pt-6">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-4 h-4 text-(--accent)" />
        <span className="text-sm font-semibold text-(--text-1)">MCP Server — Connect AI Tools</span>
      </div>
      <p className="text-xs text-(--text-3) mb-3">
        Expose Alphonso's 9 agents as tools in Claude Desktop, Cursor, Windsurf, and any MCP-compatible AI editor.
      </p>
      <div className="bg-(--surface-2) rounded-xl p-4 space-y-2 font-mono text-xs">
        <p className="text-(--accent)">1. Start "Alphonso Bridge" + "MCP Server" in Runtime Hub</p>
        <p className="text-(--accent)">2. Add to your AI editor's MCP config:</p>
        <pre className="text-(--text-3) bg-(--surface-0) rounded-sm p-2 overflow-x-auto">{`{
  "mcpServers": {
    "alphonso": {
      "url": "http://localhost:3333"
    }
  }
}`}</pre>
        <p className="text-(--text-3)">Tools available: run_pipeline · search_memory · research · get_status · get_receipts</p>
      </div>
    </section>
  );
}

function InboxFolderConfig() {
  const [inboxPath, setInboxPath] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [pollSec, setPollSec] = useState(30);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const cfg = getWatcherConfig();
      if (cfg) {
        setInboxPath(cfg.inboxPath || '');
        setEnabled(cfg.enabled || false);
        setPollSec(cfg.pollIntervalSec || 30);
      }
    } catch { /* ignore */ }
  }, []);

  function handleSave() {
    try {
      const workspaceRoot = getWatcherConfig().workspaceRoot;
      saveWatcherConfig({ workspaceRoot, inboxPath, enabled, pollIntervalSec: pollSec });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* ignore */ }
  }

  return (
    <div className="p-4 bg-(--surface-2) rounded-2xl space-y-4">
      <div className="space-y-1">
        <div className="text-sm font-semibold text-(--text-1)">Inbox Folder Path</div>
        <div className="text-xs text-(--text-3)">Directory to watch for new files. New files are auto-ingested into Echo memory by Jose.</div>
      </div>
      <input
        type="text"
        value={inboxPath}
        onChange={(e) => setInboxPath(e.target.value)}
        placeholder="C:\Users\You\Documents\Inbox"
        className="w-full px-3 py-2 bg-(--surface-3) rounded-lg text-sm text-(--text-1) placeholder-(--text-4) focus:outline-hidden focus:ring-2 focus:ring-(--accent-border)"
      />
      <div className="flex items-center gap-3">
        <button
          onClick={() => setEnabled(!enabled)}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            enabled
              ? 'bg-(--accent-dim) text-(--accent) ring-1 ring-(--accent-border)'
              : 'bg-(--surface-3) text-(--text-3) hover:bg-(--surface-4)'
          }`}
        >
          {enabled ? 'Enabled' : 'Disabled'}
        </button>
        <span className="text-xs text-(--text-3)">Poll every {pollSec}s</span>
        <input
          type="range"
          min={10}
          max={120}
          step={5}
          value={pollSec}
          onChange={(e) => setPollSec(Number(e.target.value))}
          className="w-24 accent-(--accent)"
        />
      </div>
      <button
        onClick={handleSave}
        className="inline-flex items-center gap-2 px-4 py-2 bg-(--accent) hover:bg-(--accent-hover) text-(--accent-contrast) text-sm font-medium rounded-xl transition-colors"
      >
        <Save className="w-4 h-4" />
        {saved ? 'Saved' : 'Save Config'}
      </button>
    </div>
  );
}

function PerformanceDiagnosticsPanel() {
  const [stats, setStats] = React.useState<{ bootMs: number | null; storageKB: number; storagePercent: number; itemCount: number } | null>(null);

  function run() {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const bootMs = nav ? Math.round(nav.domContentLoadedEventEnd) : null;
    try {
      const s = getUsageStats();
      setStats({ bootMs, storageKB: s.usedKB, storagePercent: Math.round((s.usedKB / 10000) * 100), itemCount: s.itemCount });
    } catch {
      setStats({ bootMs, storageKB: 0, storagePercent: 0, itemCount: 0 });
    }
  }

  React.useEffect(() => { run(); }, []);

  return (
    <div className="bg-(--surface-2) rounded-lg p-4 space-y-3">
      {stats ? (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex flex-col gap-1">
            <span className="text-(--text-3) text-xs uppercase tracking-wide">Boot time</span>
            <span className="text-(--text-1) font-mono">{stats.bootMs != null ? `${stats.bootMs}ms` : 'N/A'}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-(--text-3) text-xs uppercase tracking-wide">localStorage</span>
            <span className="text-(--text-1) font-mono">{stats.storageKB} KB / 10,000 KB ({stats.storagePercent}%)</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-(--text-3) text-xs uppercase tracking-wide">Storage items</span>
            <span className="text-(--text-1) font-mono">{stats.itemCount}</span>
          </div>
        </div>
      ) : (
        <p className="text-(--text-3) text-sm">Loading diagnostics…</p>
      )}
      <button onClick={run} className="text-xs text-(--text-3) hover:text-(--text-1) hover:border-(--border-strong) px-3 py-1.5 rounded-sm transition-colors">
        Run diagnostics
      </button>
    </div>
  );
}
