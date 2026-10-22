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
import { getConnectorCredential } from '../services/connectors/connectorAuth';
import { deriveConnectorStatus } from '../services/connectorStatusService';
import { getConfiguredOllamaEndpoint } from '../lib/ollama';
import { getComfyUiEndpoint } from '../services/connectors/comfyUiEndpoint.js';
import { Tabs } from './ui/Tabs';

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
  /** 'live' = the service answered; 'key_only' = only a saved key was found. */
  checked?: 'live' | 'key_only';
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

const STATUS_BADGE: Record<string, { dot: string; badge: string; label: string }> = {
  live: {
    dot: 'bg-(--success)',
    badge: 'border-(--success-dim) bg-(--success-dim) text-(--success)',
    label: 'Credentials saved'
  },
  missing_config: {
    dot: 'bg-(--warning)',
    badge: 'border-(--warning-dim) bg-(--warning-dim) text-(--warning)',
    label: 'Missing Config'
  },
  foundation_only: {
    dot: 'bg-(--text-3)',
    badge: 'border-(--border) bg-(--surface-2) text-(--text-1)',
    label: 'Local Only'
  },
  // ChatGPT/Claude with no key. "Placeholder" read as "not a real
  // connector"; both work once a key is saved (QA Bug 34).
  placeholder: {
    dot: 'bg-(--text-3)',
    badge: 'border-(--border) bg-(--surface-2) text-(--text-1)',
    label: 'Not set up'
  },
  disabled: {
    dot: 'bg-(--text-3)',
    badge: 'border-(--border) bg-(--surface-1) text-(--text-3)',
    label: 'Disabled'
  }
};

// Ollama and ComfyUI refuse requests from the app window's origin (403), so
// their Test goes through the backend; the window is only the fallback for
// the plain browser build. Every other connector goes through the shared
// health checks, which say whether the service itself answered ('live') or
// only a saved key was found ('key_only'). The old Test read build-time
// VITE_* values, never the keys saved in Settings (QA Bug 33, 2026-10-21).
async function testConnector(connectorId: string): Promise<TestResult> {
  if (connectorId === 'ollama') {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const proof = await invoke<{ reachable?: boolean; models?: string[]; reason?: string | null }>('check_ollama_runtime', { endpoint: getConfiguredOllamaEndpoint() });
      return proof?.reachable
        ? { ok: true, checked: 'live', message: `Ollama answered: ${proof.models?.length ?? 0} model(s) installed` }
        : { ok: false, checked: 'live', message: proof?.reason || 'Ollama did not answer' };
    } catch {
      return windowProbe(`${getConfiguredOllamaEndpoint()}/api/tags`, 'Ollama');
    }
  }

  if (connectorId === 'comfyui_video') {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const response = await invoke<{ status: number }>('comfyui_request', { endpoint: getComfyUiEndpoint(), method: 'GET', path: '/system_stats', body: null });
      return response?.status === 200
        ? { ok: true, checked: 'live', message: 'ComfyUI answered' }
        : { ok: false, checked: 'live', message: `ComfyUI answered HTTP ${response?.status}` };
    } catch (error) {
      const reason = String((error as Error)?.message || error || '');
      return reason.includes('invoke') || reason.includes('__TAURI')
        ? windowProbe(`${getComfyUiEndpoint()}/system_stats`, 'ComfyUI')
        : { ok: false, checked: 'live', message: `ComfyUI not reachable: ${reason || 'no answer'}` };
    }
  }

  if (connectorId === 'sd_webui') {
    return windowProbe('http://127.0.0.1:7860/sdapi/v1/samplers', 'SD WebUI');
  }

  return checkConnectorHealth(connectorId);
}

async function windowProbe(url: string, label: string): Promise<TestResult> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok
      ? { ok: true, checked: 'live', message: `${label} answered` }
      : { ok: false, checked: 'live', message: `${label} answered HTTP ${res.status}` };
  } catch {
    return { ok: false, checked: 'live', message: `${label} not reachable` };
  }
}

// Validate checks the keys a connector needs, saved in Settings or set in
// the environment. It used to read only process environment variables (so a
// key saved in Settings showed as missing) and to answer "No credential
// validation required" for most connectors (QA Bug 33).
async function validateConnectorCredentials(connector: Connector): Promise<TestResult> {
  if (['sd_webui', 'comfyui_video', 'mobile_bridge', 'ollama'].includes(connector.id)) {
    return { ok: true, message: 'Local connector: no keys needed' };
  }
  const required = Array.isArray(connector.requiredEnv) ? connector.requiredEnv : [];
  if (required.length === 0) {
    return { ok: true, message: 'This connector needs no keys' };
  }
  try {
    const proof = await verifyConnectorEnvironment(connector.id) as { envPresence?: Record<string, boolean> } | null;
    const presence = proof?.envPresence || {};
    const missing = required.filter((name) => !presence[name]);
    return missing.length === 0
      ? { ok: true, message: `All ${required.length} required key(s) are saved` }
      : { ok: false, message: `Missing: ${missing.join(', ')}. Add in Settings → Connectors` };
  } catch (error) {
    return { ok: false, message: `Could not check keys: ${String(error)}` };
  }
}

// What the Health line says. lastTestStatus 'verified' is written when the
// required keys are found; nothing has been sent at that point.
const HEALTH_TEXT: Record<string, string> = {
  verified: 'keys saved, not tested',
  setup_required: 'keys missing',
  configured: 'ready',
  failed: 'not reachable',
  foundation_only: 'not checked yet'
};

function ConnectorCard({ connector, zeroCostMode }: { connector: Connector; zeroCostMode: boolean }) {
  const [testState, setTestState] = useState<TestState>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [testChecked, setTestChecked] = useState<'live' | 'key_only' | undefined>(undefined);
  const [validateState, setValidateState] = useState<'idle' | 'loading'>('idle');
  const [validateResult, setValidateResult] = useState<TestResult | null>(null);

  const handleTest = async () => {
    if (testState === 'loading') return;
    setTestState('loading');
    setTestMessage('');
    const result = await testConnector(connector.id);
    // The result stays on the card: it used to flash "OK" for 3 s.
    setTestState(result.ok ? 'ok' : 'fail');
    setTestChecked(result.checked);
    setTestMessage(result.message || '');
  };

  const handleValidate = async () => {
    if (validateState === 'loading') return;
    setValidateState('loading');
    setValidateResult(null);
    const result = await validateConnectorCredentials(connector);
    setValidateResult(result);
    setValidateState('idle');
  };

  const status = deriveConnectorStatus(connector);
  const { dot, badge, label } = STATUS_BADGE[status] || STATUS_BADGE.disabled;
  const Icon = CONNECTOR_ICONS[connector.id] || Circle;
  const displayName = CONNECTOR_LABELS[connector.id] || connector.name;
  const requiredEnv = Array.isArray(connector.requiredEnv) ? connector.requiredEnv : [];
  const envPresence = connector.envPresence || {};
  const zeroCostBlocking = zeroCostMode && ['qwen', 'runway', 'youtube'].includes(connector.id);

  return (
    <div className={`flex flex-col gap-3 rounded-xl p-4 transition-colors ${
      status === 'live'
        ? 'bg-(--success-dim)'
        : status === 'missing_config'
          ? 'bg-(--warning-dim)'
          : status === 'foundation_only'
            ? 'bg-(--surface-2)'
            : 'bg-(--surface-1)'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 shrink-0 ${
            status === 'live' ? 'text-(--success)' :
            status === 'missing_config' ? 'text-(--warning)' :
            status === 'foundation_only' ? 'text-(--text-3)' :
            'text-(--text-4)'
          }`} />
          <span className="text-sm font-semibold text-(--text-1) leading-tight">{displayName}</span>
        </div>

        {/* Status badge */}
        <span className={`shrink-0 flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${badge}`}>
          <span className={`w-2 h-2 rounded-full shrink-0 transition-colors duration-500 ${dot}`} />
          {label}
        </span>
      </div>

      {/* Transport */}
      <div className="text-[10px] text-(--text-4) font-mono leading-relaxed truncate">
        {connector.transport || 'unknown'}
      </div>

      {/* Zero-cost mode warning */}
      {zeroCostBlocking && (
        <div className="flex items-center gap-1.5 rounded-lg bg-(--warning-dim) px-2 py-1.5 text-[10px] text-(--warning)">
          <ZapOff className="w-3 h-3 shrink-0" />
          Blocked by zero-cost mode
        </div>
      )}

      {/* Env keys */}
      {requiredEnv.length > 0 && (
        <div className="space-y-1">
          <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-(--text-4)">Required keys</div>
          {requiredEnv.map((key) => {
            // Where the key is matters: some connectors call the service from
            // the app window and can only use a key saved in Settings, so an
            // environment-only key is not the same as "present".
            const saved = Boolean(String(getConnectorCredential(connector.id, key) || '').trim());
            const present = Boolean(envPresence[key]);
            const source = saved ? 'saved' : present ? 'environment only' : 'missing';
            return (
              <div key={key} className="flex items-center justify-between rounded-sm bg-(--surface-0) px-2 py-0.5 font-mono text-[9px]">
                <span className="text-(--text-3) truncate">{key}</span>
                <span
                  data-testid={`connector-key-${connector.id}-${key}`}
                  title={source === 'environment only' ? 'Set as an environment variable but not saved in Settings. Save it in Settings → Connectors so every feature can use it.' : undefined}
                  className={`shrink-0 ml-2 ${saved ? 'text-(--success)' : present ? 'text-(--warning)' : 'text-(--text-4)'}`}
                >
                  {source}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {requiredEnv.length === 0 && (
        <div className="text-[10px] text-(--text-4) italic">No credentials required</div>
      )}

      {/* Last test */}
      <div className="flex items-center gap-1.5 text-[10px] text-(--text-4)">
        {status === 'live' ? (
          <CheckCircle className="w-3 h-3 text-(--success) shrink-0" />
        ) : (
          <ShieldOff className="w-3 h-3 shrink-0" />
        )}
        <span>
          Health: {HEALTH_TEXT[connector.lastTestStatus || ''] || connector.lastTestStatus || 'not checked yet'}
          {connector.lastTestAtMs ? ` · ${new Date(connector.lastTestAtMs).toLocaleDateString()}` : ''}
        </span>
      </div>

      {/* Disabled reason */}
      {status !== 'live' && connector.disabledReason && (
        <div className="text-[10px] text-(--text-4) leading-relaxed line-clamp-2">
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
            className={`flex-1 rounded-lg px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest transition-colors ${
              testState === 'loading'
                ? 'bg-(--surface-3) text-(--text-3) cursor-wait'
                : testState === 'ok'
                  ? 'bg-(--success-dim) text-(--success) cursor-default'
                  : testState === 'fail'
                    ? 'bg-(--error-dim) text-(--error) cursor-default'
                    : 'bg-(--surface-3) text-(--text-2) hover:bg-(--surface-4) hover:text-(--text-1) cursor-pointer'
            }`}
          >
            {testState === 'loading' ? '…testing' : 'Test'}
          </button>
          <button
            onClick={handleValidate}
            disabled={validateState === 'loading'}
            title="Check that the keys this connector needs are saved"
            className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest transition-colors ${
              validateState === 'loading'
                ? 'bg-(--surface-3) text-(--text-3) cursor-wait'
                : validateResult
                  ? validateResult.ok
                    ? 'bg-(--success-dim) text-(--success) cursor-default'
                    : 'bg-(--error-dim) text-(--error) cursor-default'
                  : 'bg-(--surface-3) text-(--text-2) hover:bg-(--surface-4) hover:text-(--text-1) cursor-pointer'
            }`}
          >
            <Key className="w-2.5 h-2.5" />
            {validateState === 'loading' ? '…' : 'Validate'}
          </button>
        </div>
        {testMessage ? (
          <div
            data-testid={`connector-test-result-${connector.id}`}
            title={testMessage}
            className={`text-[9px] leading-snug ${testState === 'fail' ? 'text-(--error)' : testChecked === 'live' ? 'text-(--success)' : 'text-(--text-3)'}`}
          >
            {testState === 'fail' ? 'Failed: ' : testChecked === 'live' ? 'Live check passed: ' : 'Key saved, not tested: '}
            {testMessage}
          </div>
        ) : null}
        {validateResult ? (
          <div className={`text-[9px] text-center truncate ${validateResult.ok ? 'text-(--success)' : 'text-(--error)'}`}>
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
      const s = deriveConnectorStatus(c);
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    },
    {}
  );

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-(--surface-1) px-4 py-2.5 text-[10px] font-semibold">
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-(--success)" />
        <span className="text-(--success)">{counts.live || 0} live</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-(--warning)" />
        <span className="text-(--warning)">{counts.missing_config || 0} missing config</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-(--text-3)" />
        <span className="text-(--text-3)">{counts.foundation_only || 0} local only</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-(--text-4)" />
        <span className="text-(--text-3)">{counts.disabled || 0} disabled</span>
      </div>
      {zeroCostMode && (
        <div className="ml-auto flex items-center gap-1.5 text-(--warning)">
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
      <Tabs
        tabs={[
          { id: 'setup', label: 'Setup & Credentials' },
          { id: 'health', label: 'Health Monitor' }
        ]}
        activeId={activeTab}
        onChange={(id) => setActiveTab(id as 'setup' | 'health')}
      />

      {/* Setup tab — credential entry for all connectors */}
      {activeTab === 'setup' && (
        <div>
          <div className="mb-3 rounded-xl bg-(--accent-dim) px-4 py-2.5 text-[11px] text-(--accent) leading-relaxed">
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
              <WifiOff className="w-4 h-4 text-(--text-3) animate-pulse" />
            ) : (
              <Wifi className="w-4 h-4 text-(--accent)" />
            )}
            <h2 className="text-sm font-bold tracking-widest text-(--text-1) uppercase">
              Connector Health
            </h2>
          </div>
          <p className="mt-0.5 text-[11px] text-(--text-3) leading-relaxed">
            {probing
              ? 'Probing connector environments…'
              : 'Live status of connector paths. Local/private keys should stay local; Railway/public builds should remain demo-safe unless intentionally promoted.'}
          </p>
        </div>
        <button
          onClick={() => {
            setConnectors(listConnectors());
          }}
          className="shrink-0 rounded-lg bg-(--surface-3) px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-(--text-1) hover:bg-(--surface-4) transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="rounded-xl bg-(--info-dim) px-4 py-3 text-[11px] leading-relaxed text-(--info)">
        <span className="font-semibold">How connectors work:</span> Connectors store your API credentials locally and are called by Alphonso's agents (Jose, Marcus, Hector…) running on your local Ollama instance. "Credentials saved" means the keys are saved; it does not mean the service was reached. Use Test to check: some connectors can be checked live, others only for a saved key. The agents use saved keys automatically when you ask them to act (e.g. "open a GitHub issue", "post to Slack").
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
      <div className="rounded-xl bg-(--surface-1) px-4 py-3 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-(--text-1)">Composio (External Tools)</p>
          <p className="text-[11px] text-(--text-3) mt-0.5">Composio gives agents access to 250+ external tools (GitHub Actions, Notion, Linear, Jira…). Configure your API key in <span className="font-semibold text-(--accent)">Settings → Connectors → External Tools</span>.</p>
        </div>
      </div>

      <p className="text-[10px] text-(--text-4) leading-relaxed">
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
