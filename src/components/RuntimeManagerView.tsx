import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Cpu,
  Download,
  ExternalLink,
  Image,
  Layers,
  Loader2,
  Mic,
  Music,
  Play,
  RefreshCw,
  Sparkles,
  Square,
  ToggleLeft,
  ToggleRight,
  Wand2,
  Zap,
  Shield,
} from 'lucide-react';
import { AgentActivityLog } from './AgentActivityLog';
import {
  checkPrerequisites,
  getAllStatus,
  getAutostartPrefs,
  installPrerequisite,
  installTool,
  onAnyProgress,
  onLogLine,
  saveAutostartPref,
  startTool,
  stopTool,
} from '../services/runtimeManagerService';
import { listModules, enableModule, disableModule, type ModuleRecord } from '../services/moduleRegistryService';
import { loadPolicy, getPolicyRules, type PolicyRule } from '../services/policyDslService';
import { Tabs } from './ui/Tabs';

interface ToolStatus {
  name: string;
  displayName?: string;
  description?: string;
  installed?: boolean;
  running?: boolean;
  startedByUs?: boolean;
  installDir?: string;
  port?: number;
  autoStart?: boolean;
  repoUrl?: string;
  _webFallback?: boolean;
}

interface ToolMetaEntry {
  icon: React.ComponentType<{ className?: string; size?: number }> | string;
  category: string;
  docsUrl?: string;
  color?: string;
  bg?: string;
}

const TOOL_META: Record<string, ToolMetaEntry> = {
  ollama: {
    icon: Bot,
    category: 'LLM',
    docsUrl: 'https://ollama.com',
    color: 'text-[var(--agent-alphonso)]',
    bg: 'bg-[var(--accent-muted)]',
  },
  comfyui: {
    icon: Wand2,
    category: 'Image / Video',
    docsUrl: 'https://github.com/comfyanonymous/ComfyUI',
    color: 'text-[var(--agent-echo)]',
    bg: 'bg-[var(--agent-echo-glow)]',
  },
  automatic1111: {
    icon: Image,
    category: 'Image',
    docsUrl: 'https://github.com/AUTOMATIC1111/stable-diffusion-webui',
    color: 'text-[var(--agent-miya)]',
    bg: 'bg-[var(--agent-miya-glow)]',
  },
  fooocus: {
    icon: Sparkles,
    category: 'Image',
    docsUrl: 'https://github.com/lllyasviel/Fooocus',
    color: 'text-[var(--agent-jose)]',
    bg: 'bg-[var(--agent-jose-glow)]',
  },
  invokeai: {
    icon: Layers,
    category: 'Image',
    docsUrl: 'https://github.com/invoke-ai/InvokeAI',
    color: 'text-[var(--agent-hector)]',
    bg: 'bg-[var(--agent-hector-glow)]',
  },
  whisper: {
    icon: Mic,
    category: 'Audio',
    docsUrl: 'https://github.com/openai/whisper',
    color: 'text-[var(--agent-maria)]',
    bg: 'bg-[var(--agent-maria-glow)]',
  },
  audiocraft: {
    icon: Music,
    category: 'Audio',
    docsUrl: 'https://github.com/facebookresearch/audiocraft',
    color: 'text-[var(--agent-marcus)]',
    bg: 'bg-[var(--agent-marcus-glow)]',
  },
  'voice-os': {
    icon: '🎙️',
    category: 'Voice',
    docsUrl: 'https://github.com/obsidian-media/AlphonsoEcosystem',
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
  },
  openwebui: {
    icon: Bot,
    category: 'LLM',
    docsUrl: 'https://github.com/open-webui/open-webui',
    color: 'text-[var(--agent-nova)]',
    bg: 'bg-[var(--agent-nova-glow)]',
  },
  'mcp-server': {
    icon: Activity,
    category: 'Integration',
    docsUrl: 'https://modelcontextprotocol.io',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
  },
  'alphonso-bridge': {
    icon: Activity,
    category: 'Integration',
    docsUrl: 'https://modelcontextprotocol.io',
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
  },
  chromadb: {
    icon: Layers,
    category: 'Memory',
    docsUrl: 'https://docs.trychroma.com',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
  },
  openHands: {
    icon: Bot,
    category: 'Agent',
    docsUrl: 'https://github.com/All-Hands-AI/OpenHands',
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
  },
  n8n: {
    icon: Zap,
    category: 'Automation',
    docsUrl: 'https://n8n.io',
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
  },
};

interface StatusDotProps {
  running?: boolean;
  installing?: boolean;
}

function StatusDot({ running, installing }: StatusDotProps) {
  if (installing)
    return (
      <span className="flex items-center gap-1 text-[var(--warning)] text-xs">
        <Loader2 size={10} className="animate-spin" /> installing
      </span>
    );
  if (running)
    return (
      <span className="flex items-center gap-1 text-[var(--success)] text-xs">
        <span className="w-2 h-2 rounded-full bg-[var(--success)] animate-pulse" />
        running
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-[var(--text-3)] text-xs">
      <Circle size={8} /> stopped
    </span>
  );
}

interface ProgressBarProps {
  pct: number;
}

function ProgressBar({ pct }: ProgressBarProps) {
  return (
    <div className="w-full h-1 bg-[var(--surface-2)] rounded-full overflow-hidden mt-2">
      <div
        className="h-full bg-[var(--accent)] transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

interface PrereqStatus {
  missing: string[];
  installHint: string;
  pythonFound?: boolean;
  pythonVersion?: string;
  pythonPath?: string;
  gitFound?: boolean;
  gitVersion?: string;
  gitPath?: string;
}

interface PrereqPanelProps {
  prereqs: PrereqStatus;
  onInstall: (dep: string) => void;
  installing: Record<string, boolean>;
}

function PrereqPanel({ prereqs, onInstall, installing }: PrereqPanelProps) {
  if (!prereqs || prereqs.missing.length === 0) return null;

  return (
    <div className="rounded-xl bg-[var(--warning-dim)] p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <AlertTriangle size={14} className="text-[var(--warning)] shrink-0" />
        <span className="text-[var(--warning)] text-sm font-semibold">Missing Prerequisites</span>
      </div>
      <p className="text-[var(--text-2)] text-xs">{prereqs.installHint}</p>
      <div className="flex flex-wrap gap-2">
        {prereqs.missing.map((dep) => {
          const key = dep.toLowerCase().replace(/[^a-z]/g, '').replace('python310', 'python').replace('python311', 'python').replace('python312', 'python').split('+')[0];
          return (
            <button
              key={dep}
              onClick={() => onInstall(key)}
              disabled={installing[key]}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[var(--warning)] hover:opacity-90 text-[var(--surface-0)] transition-colors disabled:opacity-50"
            >
              {installing[key] ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />}
              Install {dep}
            </button>
          );
        })}
      </div>
      {prereqs.pythonFound && (
        <p className="text-xs text-[var(--text-3)]">
          Python {prereqs.pythonVersion} at <code className="text-[var(--text-4)]">{prereqs.pythonPath}</code>
        </p>
      )}
      {prereqs.gitFound && (
        <p className="text-xs text-[var(--text-3)]">
          {prereqs.gitVersion} at <code className="text-[var(--text-4)]">{prereqs.gitPath}</code>
        </p>
      )}
    </div>
  );
}

interface LiveLogPanelProps {
  toolName: string;
}

function LiveLogPanel({ toolName }: LiveLogPanelProps) {
  const [lines, setLines] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onLogLine(toolName, ({ line }: { line: string }) => {
      setLines((prev) => [...prev.slice(-199), line]);
    }).then((fn) => { unlisten = fn as unknown as () => void; });
    return () => { unlisten?.(); };
  }, [toolName]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  if (lines.length === 0) return null;
  return (
    <div className="bg-[var(--surface-0)] rounded-lg p-2 max-h-36 overflow-y-auto font-mono text-xs text-[var(--text-3)] space-y-0.5">
      {lines.map((line, i) => <div key={i}>{line}</div>)}
      <div ref={bottomRef} />
    </div>
  );
}

interface InstallProgress {
  stage: string;
  message: string;
  pct: number;
}

interface ToolCardProps {
  tool: ToolStatus;
  onAction: (action: string, name: string, onProgress?: (p: InstallProgress) => void) => void;
  onAutostartToggle: (name: string, enabled: boolean) => void;
}

function ToolCard({ tool, onAction, onAutostartToggle }: ToolCardProps) {
  const meta = TOOL_META[tool.name] || {} as ToolMetaEntry;
  const [expanded, setExpanded] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const installing = progress !== null && progress.stage !== 'done' && progress.stage !== 'error';

  const handleInstall = () => {
    setLog([]);
    setExpanded(true);
    onAction('install', tool.name, (p) => {
      setProgress(p);
      setLog((prev) => [...prev, p.message]);
    });
  };

  const handleStart = () => onAction('start', tool.name);
  const handleStop = () => onAction('stop', tool.name);

  return (
    <div className={`rounded-xl p-4 flex flex-col gap-3 ${meta.bg || 'bg-[var(--surface-1)]'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {(() => { const ToolIcon = meta.icon ?? Cpu; return typeof ToolIcon === 'string' ? <span>{ToolIcon}</span> : <ToolIcon className={`w-5 h-5 ${meta.color || 'text-[var(--text-3)]'}`} />; })()}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`font-semibold text-sm ${meta.color || 'text-[var(--text-1)]'}`}>
                {tool.displayName || tool.name}
              </span>
              <span className="text-[var(--text-4)] text-xs bg-[var(--surface-2)] px-2 py-0.5 rounded">
                {meta.category}
              </span>
              {tool.port && (
                <span className="text-[var(--text-3)] text-xs">:{tool.port}</span>
              )}
            </div>
            <p className="text-[var(--text-3)] text-xs mt-0.5 leading-tight">{tool.description}</p>
            {tool.repoUrl && (
              <a
                href={tool.repoUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-[var(--text-4)] hover:text-[var(--text-3)] font-mono truncate block mt-0.5"
              >
                {tool.repoUrl.replace('https://github.com/', 'github: ').replace('https://', '')}
              </a>
            )}
          </div>
        </div>
        <StatusDot running={tool.running} installing={installing} />
      </div>

      {installing && progress && (
        <div>
          <p className="text-xs text-[var(--text-3)]">{progress.message}</p>
          <ProgressBar pct={progress.pct} />
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {tool._webFallback ? (
          <span className="text-xs text-[var(--text-4)] italic">Open the desktop app to install</span>
        ) : (
          <>
            {!tool.installed && !installing && (
              <button
                onClick={handleInstall}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--surface-0)] transition-colors"
              >
                <Download size={12} /> Install
              </button>
            )}
            {tool.installed && !tool.running && !installing && (
              <button
                onClick={handleStart}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[var(--success)] hover:opacity-90 text-[var(--surface-0)] transition-colors"
              >
                <Play size={12} /> Start
              </button>
            )}
            {tool.running && tool.startedByUs && (
              <button
                onClick={handleStop}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[var(--error-dim)] hover:opacity-90 text-[var(--error)] transition-colors"
              >
                <Square size={12} /> Stop
              </button>
            )}
            {tool.running && tool.port && (
              <a
                href={`http://127.0.0.1:${tool.port}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors"
              >
                <ExternalLink size={10} /> Open UI
              </a>
            )}
          </>
        )}
        {meta.docsUrl && (
          <a
            href={meta.docsUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-[var(--text-4)] hover:text-[var(--text-3)] transition-colors ml-auto"
          >
            docs ↗
          </a>
        )}
      </div>

      <div className="flex items-center justify-between mt-1">
        <span className="text-xs text-[var(--text-3)]">Auto-start with Alphonso</span>
        <button
          onClick={() => onAutostartToggle(tool.name, !tool.autoStart)}
          className="flex items-center gap-1 text-xs text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors"
          aria-label={tool.autoStart ? 'Disable autostart' : 'Enable autostart'}
        >
          {tool.autoStart
            ? <ToggleRight size={18} className="text-[var(--success)]" />
            : <ToggleLeft size={18} className="text-[var(--text-4)]" />}
          <span className={tool.autoStart ? 'text-[var(--success)]' : 'text-[var(--text-4)]'}>
            {tool.autoStart ? 'on' : 'off'}
          </span>
        </button>
      </div>

      {log.length > 0 && (
        <div>
          <button
            className="flex items-center gap-1 text-xs text-[var(--text-3)] hover:text-[var(--text-2)]"
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Install log
          </button>
          {expanded && <LiveLogPanel toolName={tool.name} />}
        </div>
      )}

      {tool.installed && !tool.running && (
        <div className="flex items-center gap-1 text-xs text-[var(--text-3)]">
          <CheckCircle2 size={11} className="text-[var(--text-4)]" />
          <span>installed at <code className="text-[var(--text-4)] text-[10px]">{tool.installDir}</code></span>
        </div>
      )}
    </div>
  );
}

function ModulesPanel() {
  const [modules, setModules] = useState<ModuleRecord[]>([]);
  const [rules, setRules] = useState<PolicyRule[]>([]);

  useEffect(() => {
    setModules(listModules());
    setRules(getPolicyRules());
  }, []);

  const handleToggle = (id: string, enabled: boolean) => {
    if (enabled) enableModule(id); else disableModule(id);
    setModules(listModules());
  };

  const handleReloadPolicy = () => {
    loadPolicy();
    setRules(getPolicyRules());
  };

  return (
    <div className="flex flex-col gap-5 p-5 max-w-4xl mx-auto">
      <div>
        <h2 className="text-lg font-bold text-[var(--text-1)]">Modules</h2>
        <p className="text-[var(--text-3)] text-sm mt-0.5">Installed capability modules and active policy rules.</p>
      </div>

      {modules.length === 0 ? (
        <div className="text-[var(--text-3)] text-sm py-8 text-center">No modules installed. Drop a module manifest into the modules/ directory.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {modules.map((m) => (
            <div key={m.manifest.id} className="rounded-xl bg-[var(--surface-1)] p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-[var(--text-1)]">{m.manifest.name}</span>
                  <span className="text-[var(--text-4)] text-xs bg-[var(--surface-2)] px-2 py-0.5 rounded">v{m.manifest.version}</span>
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${m.status === 'enabled' ? 'bg-[var(--success-dim)] text-[var(--success)]' : m.status === 'error' ? 'bg-[var(--error-dim)] text-[var(--error)]' : 'bg-[var(--surface-2)] text-[var(--text-3)]'}`}>
                    {m.status}
                  </span>
                </div>
                <p className="text-[var(--text-3)] text-xs mt-1">{m.manifest.description}</p>
                {m.manifest.capabilities.length > 0 && (
                  <div className="flex gap-1 flex-wrap mt-1.5">
                    {m.manifest.capabilities.map((cap) => (
                      <span key={cap} className="text-[10px] bg-[var(--surface-2)] text-[var(--text-3)] px-1.5 py-0.5 rounded">{cap}</span>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => handleToggle(m.manifest.id, m.status !== 'enabled')}
                className={`shrink-0 flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-colors ${
                  m.status === 'enabled'
                    ? 'bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-2)]'
                    : 'bg-[var(--success)] hover:opacity-90 text-white'
                }`}
              >
                {m.status === 'enabled' ? <ToggleRight size={12} /> : <ToggleLeft size={12} />}
                {m.status === 'enabled' ? 'Disable' : 'Enable'}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-[var(--text-1)] flex items-center gap-1.5"><Shield size={13} className="text-[var(--accent)]" /> Policy Rules</h3>
          <button
            onClick={handleReloadPolicy}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors"
          >
            <RefreshCw size={10} /> Reload
          </button>
        </div>
        {rules.length === 0 ? (
          <p className="text-[var(--text-3)] text-xs">No policy rules loaded.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {rules.map((r) => (
              <div key={r.id} className="flex items-start gap-2 text-xs rounded-lg bg-[var(--surface-1)] px-3 py-2">
                <span className={`shrink-0 font-mono px-1.5 py-0.5 rounded text-[10px] ${r.effect === 'allow' ? 'bg-[var(--success-dim)] text-[var(--success)]' : r.effect === 'deny' ? 'bg-[var(--error-dim)] text-[var(--error)]' : 'bg-[var(--warning-dim)] text-[var(--warning)]'}`}>
                  {r.effect}
                </span>
                <span className="text-[var(--text-2)]">{r.description || Object.entries(r.match).map(([k, v]) => `${k}=${v}`).join(' ')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const CATEGORIES = ['All', 'LLM', 'Image / Video', 'Image', 'Audio', 'Voice', 'Automation', 'Integration', 'Memory', 'Agent'];

export default function RuntimeManagerView() {
  const [activeTab, setActiveTab] = useState('tools');
  const [tools, setTools] = useState<ToolStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('All');
  const [actionMsg, setActionMsg] = useState<{ msg: string; isError: boolean } | null>(null);
  const [prereqs, setPrereqs] = useState<PrereqStatus | null>(null);
  const [prereqInstalling, setPrereqInstalling] = useState<Record<string, boolean>>({});
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);

  const load = useCallback(async () => {
    try {
      const [statusResult, prereqResult] = await Promise.allSettled([getAllStatus(), checkPrerequisites()]);
      setTools((statusResult.status === 'fulfilled' ? statusResult.value : null) ?? []);
      setPrereqs(prereqResult.status === 'fulfilled' ? prereqResult.value : null);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    refreshTimer.current = setInterval(load, 30000);
    onAnyProgress(() => {}).then((ul) => {
      unlistenRef.current = ul as unknown as () => void;
    });
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
      if (unlistenRef.current) unlistenRef.current();
    };
  }, [load]);

  const showMsg = (msg: string, isError = false) => {
    setActionMsg({ msg, isError });
    setTimeout(() => setActionMsg(null), 4000);
  };

  const handleAction = useCallback(async (action: string, name: string, onProgress?: (p: InstallProgress) => void) => {
    try {
      if (action === 'install') {
        const result = await installTool(name, onProgress);
        showMsg(result.message);
        await load();
      } else if (action === 'start') {
        const result = await startTool(name);
        showMsg(result.message);
        setTimeout(load, 3000);
      } else if (action === 'stop') {
        const result = await stopTool(name);
        showMsg(result.message);
        await load();
      }
    } catch (e) {
      showMsg(String(e), true);
    }
  }, [load]);

  const handleAutostartToggle = useCallback(async (name: string, enabled: boolean) => {
    try {
      await saveAutostartPref(name, enabled);
      setTools((prev) => prev.map((t) => t.name === name ? { ...t, autoStart: enabled } : t));
    } catch (e) {
      showMsg(String(e), true);
    }
  }, []);

  const handlePrereqInstall = useCallback(async (dep: string) => {
    setPrereqInstalling((prev) => ({ ...prev, [dep]: true }));
    try {
      const result = await installPrerequisite(dep);
      showMsg(result.message);
      await load();
    } catch (e) {
      showMsg(String(e), true);
    } finally {
      setPrereqInstalling((prev) => ({ ...prev, [dep]: false }));
    }
  }, [load]);

  const installAll = async () => {
    const notInstalled = allTools.filter((t) => !t.installed && t.name !== 'ollama');
    for (const t of notInstalled) {
      await handleAction('install', t.name, () => {});
    }
  };

  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  const catalogFallback = !loading && tools.length === 0 && !isTauri
    ? Object.entries(TOOL_META).map(([name, meta]) => ({
        name,
        displayName: name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, ' '),
        description: 'Install via the desktop app.',
        installed: false,
        running: false,
        installDir: null,
        autoStart: false,
        repoUrl: meta.docsUrl || null,
        _webFallback: true,
      }))
    : [];
  const allTools = tools.length > 0 ? tools : catalogFallback;
  const visible = filter === 'All'
    ? allTools
    : allTools.filter((t) => (TOOL_META[t.name]?.category || '') === filter);

  const runningCount = allTools.filter((t) => t.running).length;
  const installedCount = allTools.filter((t) => t.installed).length;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-5 pt-4 pb-0 shrink-0">
        <Tabs
          tabs={[
            { id: 'tools', label: 'Runtimes', icon: <Cpu className="w-3 h-3" /> },
            { id: 'activity', label: 'Activity', icon: <Activity className="w-3 h-3" /> },
            { id: 'modules', label: 'Modules', icon: <Layers className="w-3 h-3" /> },
          ]}
          activeId={activeTab}
          onChange={setActiveTab}
        />
      </div>

      {activeTab === 'activity' ? (
        <div className="flex-1 overflow-hidden">
          <AgentActivityLog />
        </div>
      ) : activeTab === 'modules' ? (
        <div className="flex-1 overflow-y-auto">
          <ModulesPanel />
        </div>
      ) : (
    <div className="flex-1 overflow-y-auto">
    <div className="flex flex-col gap-5 p-5 max-w-4xl mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--text-1)]">AI Runtime Manager</h2>
          <p className="text-[var(--text-3)] text-sm mt-0.5">
            All tools auto-start with Alphonso. Install once, run forever.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={load}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors"
          >
            <RefreshCw size={12} /> Refresh
          </button>
          <button
            onClick={installAll}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--surface-0)] transition-colors"
          >
            <Download size={12} /> Install all
          </button>
        </div>
      </div>

      <div className="flex items-center gap-6 text-sm">
        <div>
          <span className="text-[var(--success)] font-semibold">{runningCount}</span>
          <span className="text-[var(--text-3)] ml-1">running</span>
        </div>
        <div>
          <span className="text-[var(--text-2)] font-semibold">{installedCount}</span>
          <span className="text-[var(--text-3)] ml-1">installed</span>
        </div>
        <div>
          <span className="text-[var(--text-3)] font-semibold">{allTools.length}</span>
          <span className="text-[var(--text-3)] ml-1">total tools</span>
        </div>
      </div>

      {!isTauri && (
        <div className="rounded-xl bg-[var(--warning-dim)] px-4 py-3 text-xs text-[var(--warning)]">
          <span className="font-semibold">Desktop app required.</span> Runtime installation and control only works in the Alphonso desktop app (Tauri). Download from GitHub Releases.
        </div>
      )}

      {actionMsg && (
        <div
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm ${
            actionMsg.isError
              ? 'bg-[var(--error-dim)] text-[var(--error)]'
              : 'bg-[var(--success-dim)] text-[var(--success)]'
          }`}
        >
          {actionMsg.isError ? (
            <AlertCircle size={14} />
          ) : (
            <CheckCircle2 size={14} />
          )}
          {actionMsg.msg}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              filter === cat
                ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--surface-0)]'
                : 'border-[var(--border)] text-[var(--text-3)] hover:text-[var(--text-1)]'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-[var(--text-3)] text-sm py-8 justify-center">
          <Loader2 size={16} className="animate-spin" /> Detecting runtimes…
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-[var(--error)] text-sm px-4 py-3 bg-[var(--error-dim)] rounded-xl">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {!loading && prereqs && prereqs.missing.length > 0 && (
        <PrereqPanel
          prereqs={prereqs}
          onInstall={handlePrereqInstall}
          installing={prereqInstalling}
        />
      )}

      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visible.map((tool) => (
            <ToolCard
              key={tool.name}
              tool={tool}
              onAction={handleAction}
              onAutostartToggle={handleAutostartToggle}
            />
          ))}
        </div>
      )}

      {isTauri && !loading && allTools.find((t) => t.name === 'voice-os' && !t.installed) && (
        <div className="rounded-xl bg-cyan-500/5 px-4 py-3 text-xs text-cyan-300 space-y-1">
          <div className="font-semibold text-cyan-200">🎙️ Enable Jarvis voice</div>
          <div className="text-cyan-400/80">Install <strong>Voice OS</strong> above, then use the mic button in Chat to speak to Alphonso.</div>
        </div>
      )}

      <p className="text-[var(--text-4)] text-xs text-center pt-2">
        Tools install to <code className="text-[var(--text-3)]">%APPDATA%\Alphonso\runtimes\</code> and are shared across Alphonso updates.
      </p>
    </div>
    </div>
      )}
    </div>
  );
}
