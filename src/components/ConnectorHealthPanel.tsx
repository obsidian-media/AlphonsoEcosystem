import React from 'react';
import { useEffect, useState } from 'react';
import { ConnectorSetupPanel } from './ConnectorSetupPanel';
import {
  Bot,
  CheckCircle,
  Circle,
  Clapperboard,
  FileText,
  Image,
  MessageCircle,
  PenLine,
  ShieldOff,
  Video,
  Wifi,
  WifiOff,
  ZapOff,
  Key
} from 'lucide-react';
import {
  listConnectors,
  listConnectorAuthProfiles,
  verifyConnectorEnvironment
} from '../services/connectorRegistryService';
import { checkConnectorHealth } from '../services/connectorHealthCheckService';

interface Connector {
  id: string;
  name?: string;
  status?: string;
  requiredEnv?: string[];
  envPresence?: Record<string, boolean>;
  transport?: string;
  lastTestStatus?: string;
  lastTestAtMs?: number;
  disabledReason?: string;
}

interface TestResult {
  ok: boolean;
  message?: string;
}

type TestState = 'idle' | 'loading' | 'ok' | 'fail';

// Icons per connector id
const CONNECTOR_ICONS: Record<string, React.ElementType> = {
  telegram: MessageCircle,
  whatsapp: MessageCircle,
  youtube: Video,
  claude: Bot,
  chatgpt: Bot,
  qwen: Bot,
  notion: FileText,
  clickup: PenLine,
  sd_webui: Image,
  comfyui_video: Video,
  runway: Clapperboard,
  mobile_bridge: Wifi
};

// Human-friendly label map
const CONNECTOR_LABELS: Record<string, string> = {
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  youtube: 'YouTube',
  claude: 'Claude',
  chatgpt: 'ChatGPT',
  qwen: 'Qwen',
  notion: 'Notion',
  clickup: 'ClickUp',
  sd_webui: 'SD WebUI',
  comfyui_video: 'ComfyUI',
  runway: 'Runway',
  mobile_bridge: 'Mobile Bridge'
};

/**
 * Derives a simplified UX status from the connector registry object.
 *
 * Returns one of:
 *   'live'           — configured + env verified + last test verified
 *   'missing_config' — has required env keys but none are present
 *   'foundation_only'— local-only connector with no env requirements
 *   'placeholder'    — visible but intentionally inactive placeholder connector
 *   'disabled'       — everything else (not_configured, unknown, etc.)
 */
function deriveStatus(connector: Connector | null | undefined): string {
  if (!connector) return 'disabled';
  const status = String(connector.status || '').toLowerCase();
  const requiredEnv = Array.isArray(connector.requiredEnv) ? connector.requiredEnv : [];
  const envPresence = connector.envPresence || {};

  if (status === 'foundation_only') return 'foundation_only';

  if (['chatgpt', 'claude'].includes(connector.id) && requiredEnv.length > 0) {
    const anyPresent = requiredEnv.some((k) => Boolean(envPresence[k]));
    if (!anyPresent) return 'placeholder';
  }

  if (status === 'configured') {
    const allEnvPresent = requiredEnv.length === 0 || requiredEnv.every((k) => Boolean(envPresence[k]));
    const testOk = connector.lastTestStatus === 'verified';
    if (allEnvPresent && testOk) return 'live';
    // configured but env missing or test not verified
    return 'missing_config';
  }

  if (requiredEnv.length > 0) {
    const anyPresent = requiredEnv.some((k) => Boolean(envPresence[k]));
    if (anyPresent) return 'missing_config';
  }

  return 'disabled';
}

const STATUS_BADGE: Record<string, { dot: string; badge: string; label: string }> = {
  live: {
    dot: 'bg-emerald-400',
    badge: 'border-[var(--success-dim)] bg-[var(--success-dim)] text-[var(--success)]',
    label: 'Credentials saved'
  },
  missing_config: {
    dot: 'bg-amber-400',
    badge: 'border-[var(--warning-dim)] bg-[var(--warning-dim)] text-[var(--warning)]',
    label: 'Missing Config'
  },
  foundation_only: {
    dot: 'bg-slate-400',
    badge: 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-1)]',
    label: 'Local Only'
  },
  placeholder: {
    dot: 'bg-[var(--text-3)]',
    badge: 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-1)]',
    label: 'Placeholder'
  },
  disabled: {
    dot: 'bg-[var(--text-3)]',
    badge: 'border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-3)]',
    label: 'Disabled'
  }
};

// VITE_ env key map per connector id used by testConnector
const CONNECTOR_VITE_ENV_KEYS: Record<string, string> = {
  telegram: 'VITE_TELEGRAM_BOT_TOKEN',
  whatsapp: 'VITE_WHATSAPP_ACCESS_TOKEN',
  youtube: 'VITE_YOUTUBE_CLIENT_ID',
  claude: 'VITE_ANTHROPIC_API_KEY',
  chatgpt: 'VITE_OPENAI_API_KEY',
  qwen: 'VITE_DASHSCOPE_API_KEY',
  notion: 'VITE_NOTION_API_KEY',
  clickup: 'VITE_CLICKUP_API_KEY',
  runway: 'VITE_RUNWAYML_API_SECRET'
};

async function testConnector(connectorId: string): Promise<TestResult> {
  if (connectorId === 'ollama') {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      const res = await fetch('http://localhost:11434/api/tags', { signal: controller.signal });
      clearTimeout(timer);
      return res.ok
        ? { ok: true, message: 'Ollama reachable' }
        : { ok: false, message: `HTTP ${res.status}` };
    } catch {
      return { ok: false, message: 'Ollama unreachable' };
    }
  }

  if (connectorId === 'telegram' || connectorId === 'whatsapp') {
    return checkConnectorHealth(connectorId);
  }

  if (connectorId === 'sd_webui') {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      const res = await fetch('http://127.0.0.1:7860/sdapi/v1/samplers', { signal: controller.signal });
      clearTimeout(timer);
      return res.ok
        ? { ok: true, message: 'SD WebUI reachable' }
        : { ok: false, message: `HTTP ${res.status}` };
    } catch {
      return { ok: false, message: 'SD WebUI unreachable' };
    }
  }

  if (connectorId === 'comfyui_video') {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      const res = await fetch('http://127.0.0.1:8188/system_stats', { signal: controller.signal });
      clearTimeout(timer);
      return res.ok
        ? { ok: true, message: 'ComfyUI reachable' }
        : { ok: false, message: `HTTP ${res.status}` };
    } catch {
      return { ok: false, message: 'ComfyUI unreachable' };
    }
  }

  if (connectorId === 'mobile_bridge') {
    return { ok: true, message: 'Local only — no key required' };
  }

  const envKey = CONNECTOR_VITE_ENV_KEYS[connectorId];
  if (envKey) {
    const present = Boolean((import.meta as unknown as { env: Record<string, unknown> }).env[envKey]);
    return present
      ? { ok: true, message: 'OK key present' }
      : { ok: false, message: 'FAIL no key' };
  }

  return { ok: false, message: 'Unknown connector' };
}

async function validateConnectorCredentials(connectorId: string): Promise<TestResult> {
  if (['sd_webui', 'comfyui_video', 'mobile_bridge', 'ollama'].includes(connectorId)) {
    return { ok: true, message: 'Local connector — no cloud credentials required' };
  }
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const requiredEnv: string[] = [];
    if (connectorId === 'telegram') requiredEnv.push('TELEGRAM_BOT_TOKEN');
    if (connectorId === 'whatsapp') requiredEnv.push('WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID');
    if (connectorId === 'youtube') requiredEnv.push('YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET');
    if (connectorId === 'claude') requiredEnv.push('ANTHROPIC_API_KEY');
    if (connectorId === 'chatgpt') requiredEnv.push('OPENAI_API_KEY');
    if (connectorId === 'qwen') requiredEnv.push('DASHSCOPE_API_KEY');
    if (connectorId === 'notion') requiredEnv.push('NOTION_API_KEY');
    if (connectorId === 'clickup') requiredEnv.push('CLICKUP_API_KEY');
    if (connectorId === 'runway') requiredEnv.push('RUNWAYML_API_SECRET');
    if (requiredEnv.length === 0) {
      return { ok: true, message: 'No credential validation required' };
    }
    const presence = await invoke<Record<string, boolean>>('check_env_vars_presence', { names: requiredEnv });
    const missing = requiredEnv.filter((k) => !presence[k]);
    if (missing.length === 0) {
      return { ok: true, message: `All ${requiredEnv.length} credential(s) present` };
    }
    return { ok: false, message: `Missing: ${missing.join(', ')}` };
  } catch (error) {
    return { ok: false, message: `Validation error: ${String(error)}` };
  }
}

function ConnectorCard({ connector, zeroCostMode }: { connector: Connector; zeroCostMode: boolean }) {
  const [testState, setTestState] = useState<TestState>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [validateState, setValidateState] = useState<'idle' | 'loading'>('idle');
  const [validateResult, setValidateResult] = useState<TestResult | null>(null);

  const handleTest = async () => {
    if (testState === 'loading') return;
    setTestState('loading');
    setTestMessage('');
    const result = await testConnector(connector.id);
    setTestState(result.ok ? 'ok' : 'fail');
    setTestMessage(result.message || '');
    setTimeout(() => {
      setTestState('idle');
      setTestMessage('');
    }, 3000);
  };

  const handleValidate = async () => {
    if (validateState === 'loading') return;
    setValidateState('loading');
    setValidateResult(null);
    const result = await validateConnectorCredentials(connector.id);
    setValidateResult(result);
    setValidateState('idle');
  };

  const status = deriveStatus(connector);
  const { dot, badge, label } = STATUS_BADGE[status] || STATUS_BADGE.disabled;
  const Icon = CONNECTOR_ICONS[connector.id] || Circle;
  const displayName = CONNECTOR_LABELS[connector.id] || connector.name;
  const requiredEnv = Array.isArray(connector.requiredEnv) ? connector.requiredEnv : [];
  const envPresence = connector.envPresence || {};
  const zeroCostBlocking = zeroCostMode && ['qwen', 'runway', 'youtube'].includes(connector.id);

  return (
    <div className={`flex flex-col gap-3 rounded-xl border p-4 transition-colors ${
      status === 'live'
        ? 'border-emerald-500/20 bg-[var(--success-dim)]'
        : status === 'missing_config'
          ? 'border-[var(--warning-dim)] bg-[var(--warning-dim)]'
          : status === 'foundation_only'
            ? 'border-slate-500/20 bg-slate-500/5'
            : 'border-[var(--border)] bg-[var(--surface-1)]'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 shrink-0 ${
            status === 'live' ? 'text-emerald-400' :
            status === 'missing_config' ? 'text-amber-400' :
            status === 'foundation_only' ? 'text-slate-400' :
            'text-[var(--text-4)]'
          }`} />
          <span className="text-sm font-semibold text-[var(--text-1)] leading-tight">{displayName}</span>
        </div>

        {/* Status badge */}
        <span className={`shrink-0 flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${badge}`}>
          <span className={`w-2 h-2 rounded-full shrink-0 transition-colors duration-500 ${dot}`} />
          {label}
        </span>
      </div>

      {/* Transport */}
      <div className="text-[10px] text-[var(--text-4)] font-mono leading-relaxed truncate">
        {connector.transport || 'unknown'}
      </div>

      {/* Zero-cost mode warning */}
      {zeroCostBlocking && (
        <div className="flex items-center gap-1.5 rounded-lg border border-[var(--warning-dim)] bg-[var(--warning-dim)] px-2 py-1.5 text-[10px] text-[var(--warning)]">
          <ZapOff className="w-3 h-3 shrink-0" />
          Blocked by zero-cost mode
        </div>
      )}

      {/* Env keys */}
      {requiredEnv.length > 0 && (
        <div className="space-y-1">
          <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--text-4)]">Required env</div>
          {requiredEnv.map((key) => {
            const present = Boolean(envPresence[key]);
            return (
              <div key={key} className="flex items-center justify-between rounded bg-[var(--surface-0)] px-2 py-0.5 font-mono text-[9px]">
                <span className="text-[var(--text-3)] truncate">{key}</span>
                <span className={`shrink-0 ml-2 ${present ? 'text-emerald-400' : 'text-[var(--text-4)]'}`}>
                  {present ? 'present' : 'missing'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {requiredEnv.length === 0 && (
        <div className="text-[10px] text-[var(--text-4)] italic">No credentials required</div>
      )}

      {/* Last test */}
      <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-4)]">
        {status === 'live' ? (
          <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />
        ) : (
          <ShieldOff className="w-3 h-3 shrink-0" />
        )}
        <span>
          Health: {connector.lastTestStatus || 'not run'}
          {connector.lastTestAtMs ? ` · ${new Date(connector.lastTestAtMs).toLocaleDateString()}` : ''}
        </span>
      </div>

      {/* Disabled reason */}
      {status !== 'live' && connector.disabledReason && (
        <div className="text-[10px] text-[var(--text-4)] leading-relaxed line-clamp-2">
          {connector.disabledReason}
        </div>
      )}

      {/* Test connection + Validate buttons */}
      <div className="mt-auto flex flex-col gap-1">
        <div className="flex gap-1.5">
          <button
            onClick={handleTest}
            disabled={testState === 'loading'}
            title="Test connector connectivity"
            className={`flex-1 rounded-lg border px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest transition-colors ${
              testState === 'loading'
                ? 'border-zinc-600/40 bg-[var(--surface-3)] text-[var(--text-3)] cursor-wait'
                : testState === 'ok'
                  ? 'border-emerald-500/40 bg-[var(--success-dim)] text-[var(--success)] cursor-default'
                  : testState === 'fail'
                    ? 'border-red-500/40 bg-red-500/10 text-red-400 cursor-default'
                    : 'border-[var(--border-strong)] bg-[var(--surface-3)] text-[var(--text-2)] hover:bg-[var(--surface-4)] hover:text-[var(--text-1)] cursor-pointer'
            }`}
          >
            {testState === 'loading' ? '…testing' : testState === 'ok' ? 'OK' : testState === 'fail' ? 'FAIL' : 'Test'}
          </button>
          <button
            onClick={handleValidate}
            disabled={validateState === 'loading'}
            title="Validate credentials via Tauri env check"
            className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest transition-colors ${
              validateState === 'loading'
                ? 'border-zinc-600/40 bg-[var(--surface-3)] text-[var(--text-3)] cursor-wait'
                : validateResult
                  ? validateResult.ok
                    ? 'border-emerald-500/40 bg-[var(--success-dim)] text-[var(--success)] cursor-default'
                    : 'border-red-500/40 bg-red-500/10 text-red-400 cursor-default'
                  : 'border-[var(--border-strong)] bg-[var(--surface-3)] text-[var(--text-2)] hover:bg-[var(--surface-4)] hover:text-[var(--text-1)] cursor-pointer'
            }`}
          >
            <Key className="w-2.5 h-2.5" />
            {validateState === 'loading' ? '…' : validateResult ? (validateResult.ok ? 'OK' : 'FAIL') : 'Validate'}
          </button>
        </div>
        {testMessage ? (
          <div className={`text-[9px] text-center truncate ${testState === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
            {testMessage}
          </div>
        ) : null}
        {validateResult ? (
          <div className={`text-[9px] text-center truncate ${validateResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>
            {validateResult.message}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StatusSummaryBar({ connectors, zeroCostMode }: { connectors: Connector[]; zeroCostMode: boolean }) {
  const counts = connectors.reduce<Record<string, number>>(
    (acc, c) => {
      const s = deriveStatus(c);
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    },
    {}
  );

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-2.5 text-[10px] font-semibold">
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
        <span className="text-[var(--success)]">{counts.live || 0} live</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-amber-400" />
        <span className="text-amber-300">{counts.missing_config || 0} missing config</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-slate-400" />
        <span className="text-slate-300">{counts.foundation_only || 0} local only</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-[var(--text-4)]" />
        <span className="text-[var(--text-3)]">{counts.disabled || 0} disabled</span>
      </div>
      {zeroCostMode && (
        <div className="ml-auto flex items-center gap-1.5 text-amber-400/80">
          <ZapOff className="w-3 h-3" />
          Zero-cost mode active
        </div>
      )}
    </div>
  );
}

export function ConnectorHealthPanel({ zeroCostMode = false }: { zeroCostMode?: boolean }) {
  const [connectors, setConnectors] = useState<Connector[]>(() => listConnectors());
  const [probing, setProbing] = useState(false);

  // Default to Setup tab when no credentials have been saved yet
  const hasAnyCreds = (() => {
    try {
      return Object.keys(localStorage).some((k) => k.startsWith('alphonso_connector_') || k.startsWith('alphonso_telegram_') || k.startsWith('alphonso_composio_'));
    } catch { return false; }
  })();
  const [activeTab, setActiveTab] = useState(hasAnyCreds ? 'health' : 'setup');

  // Run env verification for all connectors on mount (best-effort)
  useEffect(() => {
    let cancelled = false;
    const probeAll = async () => {
      setProbing(true);
      const ids = listConnectors().map((c) => c.id);
      for (const id of ids) {
        if (cancelled) break;
        try {
          await verifyConnectorEnvironment(id);
        } catch {
          // ignore individual probe failures
        }
      }
      if (!cancelled) {
        setConnectors(listConnectors());
        setProbing(false);
      }
    };
    probeAll();
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="space-y-4">
      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('setup')}
          className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${activeTab === 'setup' ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)]'}`}
        >
          ⚙ Setup &amp; Credentials
        </button>
        <button
          onClick={() => setActiveTab('health')}
          className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${activeTab === 'health' ? 'bg-[var(--surface-4)] text-white shadow-sm' : 'text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)]'}`}
        >
          ● Health Monitor
        </button>
      </div>

      {/* Setup tab — credential entry for all connectors */}
      {activeTab === 'setup' && (
        <div>
          <div className="mb-3 rounded-xl border border-[var(--accent-dim)] bg-[var(--accent-dim)] px-4 py-2.5 text-[11px] text-[var(--accent)] leading-relaxed">
            Enter API credentials here. Credentials are stored locally in encrypted storage and never sent to any server except the connector's own API.
          </div>
          <ConnectorSetupPanel />
        </div>
      )}

      {/* Health tab — existing content */}
      {activeTab === 'health' && (<>
      {/* Panel header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            {probing ? (
              <WifiOff className="w-4 h-4 text-[var(--text-3)] animate-pulse" />
            ) : (
              <Wifi className="w-4 h-4 text-[var(--accent)]" />
            )}
            <h2 className="text-sm font-bold tracking-widest text-[var(--text-1)] uppercase">
              Connector Health
            </h2>
          </div>
          <p className="mt-0.5 text-[11px] text-[var(--text-3)] leading-relaxed">
            {probing
              ? 'Probing connector environments…'
              : 'Live status of connector paths. Local/private keys should stay local; Railway/public builds should remain demo-safe unless intentionally promoted.'}
          </p>
        </div>
        <button
          onClick={() => {
            setConnectors(listConnectors());
          }}
          className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--surface-3)] px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-[var(--text-1)] hover:bg-[var(--surface-4)] transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-3 text-[11px] leading-relaxed text-sky-300">
        <span className="font-semibold">How connectors work:</span> Connectors store your API credentials locally and are called by Alphonso's agents (Jose, Marcus, Hector…) running on your local Ollama instance. A "Connected" status means your credentials are saved — the agents will use them automatically when you ask them to take action (e.g. "open a GitHub issue", "post to Slack"). You do not call connectors directly.
      </div>

      <div className="rounded-xl border border-[var(--warning-dim)] bg-[var(--warning-dim)] px-4 py-2 text-[11px] leading-relaxed text-[var(--warning)]">
        Public deploy note: this app auto-deploys from GitHub main to Railway. Do not add real connector secrets to browser-exposed env vars unless that connector is meant to be public/cloud-facing.
      </div>

      {/* Summary bar */}
      <StatusSummaryBar connectors={connectors} zeroCostMode={zeroCostMode} />

      {/* Card grid — 2 cols by default, 3 on wider viewports */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {connectors.map((connector) => (
          <ConnectorCard
            key={connector.id}
            connector={connector}
            zeroCostMode={zeroCostMode}
          />
        ))}
      </div>

      {/* Composio callout */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-[var(--text-1)]">Composio (External Tools)</p>
          <p className="text-[11px] text-[var(--text-3)] mt-0.5">Composio gives agents access to 250+ external tools (GitHub Actions, Notion, Linear, Jira…). Configure your API key in <span className="font-semibold text-[var(--accent)]">Settings → Connectors → External Tools</span>.</p>
        </div>
      </div>

      <p className="text-[10px] text-[var(--text-4)] leading-relaxed">
        Status is derived from the connector registry and Tauri env probe. A connector is marked
        &quot;live&quot; only when all required env vars are present and the last test returned verified.
        Use &quot;Test Connection&quot; to check key presence or local endpoint reachability without sending data.
      </p>
      </>)}
    </section>
  );
}

// Re-exported from ConnectorStatusIndicators so callers that import from this file still work.
// The actual implementations live in ConnectorStatusIndicators.jsx to break the static/lazy
// chunk collision caused by Sidebar.jsx statically importing this file.
export { ConnectorStatusDot, ConnectorStatusStrip } from './ConnectorStatusIndicators';
