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
    bg: 'bg-[var(--accent-muted)] border-[var(--accent-border)]',
  },
  comfyui: {
    icon: Wand2,
    category: 'Image / Video',
    docsUrl: 'https://github.com/comfyanonymous/ComfyUI',
    color: 'text-[var(--agent-echo)]',
    bg: 'bg-[var(--agent-echo-glow)] border-[var(--border)]',
  },
  automatic1111: {
    icon: Image,
    category: 'Image',
    docsUrl: 'https://github.com/AUTOMATIC1111/stable-diffusion-webui',
    color: 'text-[var(--agent-miya)]',
    bg: 'bg-[var(--agent-miya-glow)] border-[var(--border)]',
  },
  fooocus: {
    icon: Sparkles,
    category: 'Image',
    docsUrl: 'https://github.com/lllyasviel/Fooocus',
    color: 'text-[var(--agent-jose)]',
    bg: 'bg-[var(--agent-jose-glow)] border-[var(--border)]',
  },
  invokeai: {
    icon: Layers,
    category: 'Image',
    docsUrl: 'https://github.com/invoke-ai/InvokeAI',
    color: 'text-[var(--agent-hector)]',
    bg: 'bg-[var(--agent-hector-glow)] border-[var(--border)]',
  },
  whisper: {
    icon: Mic,
    category: 'Audio',
    docsUrl: 'https://github.com/openai/whisper',
    color: 'text-[var(--agent-maria)]',
    bg: 'bg-[var(--agent-maria-glow)] border-[var(--border)]',
  },
  audiocraft: {
    icon: Music,
    category: 'Audio',
    docsUrl: 'https://github.com/facebookresearch/audiocraft',
    color: 'text-[var(--agent-marcus)]',
    bg: 'bg-[var(--agent-marcus-glow)] border-[var(--border)]',
  },
  'voice-os': {
    icon: '🎙️',
    category: 'Voice',
    docsUrl: 'https://github.com/Thatisshayan/AlphonsoEcosystem',
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10 border-cyan-500/20',
  },
  openwebui: {
    icon: Bot,
    category: 'LLM',
    docsUrl: 'https://github.com/open-webui/open-webui',
    color: 'text-[var(--agent-nova)]',
    bg: 'bg-[var(--agent-nova-glow)] border-[var(--border)]',
  },
  'mcp-server': {
    icon: Activity,
    category: 'Integration',
    docsUrl: 'https://modelcontextprotocol.io',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10 border-purple-500/20',
  },
  'alphonso-bridge': {
    icon: Activity,
    category: 'Integration',
    docsUrl: 'https://modelcontextprotocol.io',
    color: 'text-violet-400',
    bg: 'bg-violet-500/10 border-violet-500/20',
  },
  chromadb: {
    icon: Layers,
    category: 'Memory',
    docsUrl: 'https://docs.trychroma.com',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
  },
  openHands: {
    icon: Bot,
    category: 'Agent',
    docsUrl: 'https://github.com/All-Hands-AI/OpenHands',
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10 border-cyan-500/20',
  },
  n8n: {
    icon: Zap,
    category: 'Automation',
    docsUrl: 'https://n8n.io',
    color: 'text-orange-400',
    bg: 'bg-orange-500/10 border-orange-500/20',
  },
};

interface StatusDotProps {
  running?: boolean;
  installing?: boolean;
}

function StatusDot({ running, installing }: StatusDotProps) {
  if (installing)
    return (
      <span className="flex items-center gap-1 text-amber-400 text-xs">
        <Loader2 size={10} className="animate-spin" /> installing
      </span>
    );
  if (running)
    return (
      <span className="flex items-center gap-1 text-emerald-400 text-xs">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        running
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-zinc-500 text-xs">
      <Circle size={8} /> stopped
    </span>
  );
}

interface ProgressBarProps {
  pct: number;
}

function ProgressBar({ pct }: ProgressBarProps) {
  return (
    <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden mt-2">
      <div
        className="h-full bg-violet-500 transition-all duration-300"
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
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <AlertTriangle size={14} className="text-amber-400 shrink-0" />
        <span className="text-amber-300 text-sm font-semibold">Missing Prerequisites</span>
      </div>
      <p className="text-amber-200/70 text-xs">{prereqs.installHint}</p>
      <div className="flex flex-wrap gap-2">
        {prereqs.missing.map((dep) => {
          const key = dep.toLowerCase().replace(/[^a-z]/g, '').replace('python310', 'python').replace('python311', 'python').replace('python312', 'python').split('+')[0];
          return (
            <button
              key={dep}
              onClick={() => onInstall(key)}
              disabled={installing[key]}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-600 text-white transition-colors disabled:opacity-50"
            >
              {installing[key] ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />}
              Install {dep}
            </button>
          );
        })}
      </div>
      {prereqs.pythonFound && (
        <p className="text-xs text-zinc-400">
          Python {prereqs.pythonVersion} at <code className="text-zinc-500">{prereqs.pythonPath}</code>
        </p>
      )}
      {prereqs.gitFound && (
        <p className="text-xs text-zinc-400">
          {prereqs.gitVersion} at <code className="text-zinc-500">{prereqs.gitPath}</code>
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
    <div className="bg-zinc-950 rounded-lg p-2 max-h-36 overflow-y-auto font-mono text-xs text-zinc-400 space-y-0.5">
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
    <div className={`rounded-xl border p-4 flex flex-col gap-3 ${meta.bg || 'bg-zinc-900 border-zinc-800'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {(() => { const ToolIcon = meta.icon ?? Cpu; return typeof ToolIcon === 'string' ? <span>{ToolIcon}</span> : <ToolIcon className={`w-5 h-5 ${meta.color || 'text-[var(--text-3)]'}`} />; })()}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`font-semibold text-sm ${meta.color || 'text-white'}`}>
                {tool.displayName || tool.name}
              </span>
              <span className="text-zinc-600 text-xs bg-zinc-800 px-2 py-0.5 rounded">
                {meta.category}
              </span>
              {tool.port && (
                <span className="text-zinc-500 text-xs">:{tool.port}</span>
              )}
            </div>
            <p className="text-zinc-400 text-xs mt-0.5 leading-tight">{tool.description}</p>
            {tool.repoUrl && (
              <a
                href={tool.repoUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-zinc-600 hover:text-zinc-400 font-mono truncate block mt-0.5"
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
          <p className="text-xs text-zinc-400">{progress.message}</p>
          <ProgressBar pct={progress.pct} />
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {tool._webFallback ? (
          <span className="text-xs text-zinc-600 italic">Open the desktop app to install</span>
        ) : (
          <>
            {!tool.installed && !installing && (
              <button
                onClick={handleInstall}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors"
              >
                <Download size={12} /> Install
              </button>
            )}
            {tool.installed && !tool.running && !installing && (
              <button
                onClick={handleStart}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white transition-colors"
              >
                <Play size={12} /> Start
              </button>
            )}
            {tool.running && tool.startedByUs && (
              <button
                onClick={handleStop}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-900 hover:bg-red-800 text-red-200 transition-colors"
              >
                <Square size={12} /> Stop
              </button>
            )}
            {tool.running && tool.port && (
              <a
                href={`http://127.0.0.1:${tool.port}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white transition-colors"
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
            className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors ml-auto"
          >
            docs ↗
          </a>
        )}
      </div>

      <div className="flex items-center justify-between mt-1">
        <span className="text-xs text-zinc-500">Auto-start with Alphonso</span>
        <button
          onClick={() => onAutostartToggle(tool.name, !tool.autoStart)}
          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition-colors"
          aria-label={tool.autoStart ? 'Disable autostart' : 'Enable autostart'}
        >
          {tool.autoStart
            ? <ToggleRight size={18} className="text-violet-400" />
            : <ToggleLeft size={18} className="text-zinc-600" />}
          <span className={tool.autoStart ? 'text-violet-400' : 'text-zinc-600'}>
            {tool.autoStart ? 'on' : 'off'}
          </span>
        </button>
      </div>

      {log.length > 0 && (
        <div>
          <button
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Install log
          </button>
          {expanded && <LiveLogPanel toolName={tool.name} />}
        </div>
      )}

      {tool.installed && !tool.running && (
        <div className="flex items-center gap-1 text-xs text-zinc-500">
          <CheckCircle2 size={11} className="text-zinc-600" />
          <span>installed at <code className="text-zinc-600 text-[10px]">{tool.installDir}</code></span>
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
        <h2 className="text-lg font-bold text-white">Modules</h2>
        <p className="text-zinc-400 text-sm mt-0.5">Installed capability modules and active policy rules.</p>
      </div>

      {modules.length === 0 ? (
        <div className="text-zinc-500 text-sm py-8 text-center">No modules installed. Drop a module manifest into the modules/ directory.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {modules.map((m) => (
            <div key={m.manifest.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-white">{m.manifest.name}</span>
                  <span className="text-zinc-600 text-xs bg-zinc-800 px-2 py-0.5 rounded">v{m.manifest.version}</span>
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${m.status === 'enabled' ? 'bg-emerald-900 text-emerald-300' : m.status === 'error' ? 'bg-red-900 text-red-300' : 'bg-zinc-800 text-zinc-400'}`}>
                    {m.status}
                  </span>
                </div>
                <p className="text-zinc-400 text-xs mt-1">{m.manifest.description}</p>
                {m.manifest.capabilities.length > 0 && (
                  <div className="flex gap-1 flex-wrap mt-1.5">
                    {m.manifest.capabilities.map((cap) => (
                      <span key={cap} className="text-[10px] bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded">{cap}</span>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => handleToggle(m.manifest.id, m.status !== 'enabled')}
                className={`shrink-0 flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-colors ${
                  m.status === 'enabled'
                    ? 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
                    : 'bg-emerald-700 hover:bg-emerald-600 text-white'
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
          <h3 className="text-sm font-semibold text-white flex items-center gap-1.5"><Shield size={13} className="text-violet-400" /> Policy Rules</h3>
          <button
            onClick={handleReloadPolicy}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white transition-colors"
          >
            <RefreshCw size={10} /> Reload
          </button>
        </div>
        {rules.length === 0 ? (
          <p className="text-zinc-500 text-xs">No policy rules loaded.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {rules.map((r) => (
              <div key={r.id} className="flex items-start gap-2 text-xs rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
                <span className={`shrink-0 font-mono px-1.5 py-0.5 rounded text-[10px] ${r.effect === 'allow' ? 'bg-emerald-900 text-emerald-300' : r.effect === 'deny' ? 'bg-red-900 text-red-300' : 'bg-amber-900 text-amber-300'}`}>
                  {r.effect}
                </span>
                <span className="text-zinc-300">{r.description || Object.entries(r.match).map(([k, v]) => `${k}=${v}`).join(' ')}</span>
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
      <div className="flex items-center gap-1 px-5 pt-4 pb-0 border-b border-[var(--border)] shrink-0">
        {[
          { id: 'tools', label: 'Runtimes', icon: Cpu },
          { id: 'activity', label: 'Activity', icon: Activity },
          { id: 'modules', label: 'Modules', icon: Layers },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors ${
              activeTab === id
                ? 'bg-[var(--surface-1)] border border-b-0 border-[var(--border)] text-[var(--text-1)]'
                : 'text-[var(--text-3)] hover:text-[var(--text-2)]'
            }`}
          >
            <Icon className="w-3 h-3" />
            {label}
          </button>
        ))}
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
          <h2 className="text-lg font-bold text-white">AI Runtime Manager</h2>
          <p className="text-zinc-400 text-sm mt-0.5">
            All tools auto-start with Alphonso. Install once, run forever.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={load}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white transition-colors"
          >
            <RefreshCw size={12} /> Refresh
          </button>
          <button
            onClick={installAll}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-600 text-white transition-colors"
          >
            <Download size={12} /> Install all
          </button>
        </div>
      </div>

      <div className="flex items-center gap-6 text-sm">
        <div>
          <span className="text-emerald-400 font-semibold">{runningCount}</span>
          <span className="text-zinc-500 ml-1">running</span>
        </div>
        <div>
          <span className="text-zinc-300 font-semibold">{installedCount}</span>
          <span className="text-zinc-500 ml-1">installed</span>
        </div>
        <div>
          <span className="text-zinc-500 font-semibold">{allTools.length}</span>
          <span className="text-zinc-500 ml-1">total tools</span>
        </div>
      </div>

      {!isTauri && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
          <span className="font-semibold">Desktop app required.</span> Runtime installation and control only works in the Alphonso desktop app (Tauri). Download from GitHub Releases.
        </div>
      )}

      {actionMsg && (
        <div
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm border ${
            actionMsg.isError
              ? 'bg-red-950 border-red-700 text-red-300'
              : 'bg-emerald-950 border-emerald-700 text-emerald-300'
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
                ? 'bg-violet-600 border-violet-600 text-white'
                : 'border-zinc-700 text-zinc-400 hover:text-white'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-zinc-500 text-sm py-8 justify-center">
          <Loader2 size={16} className="animate-spin" /> Detecting runtimes…
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm px-4 py-3 bg-red-950 border border-red-800 rounded-xl">
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
        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-xs text-cyan-300 space-y-1">
          <div className="font-semibold text-cyan-200">🎙️ Enable Jarvis voice</div>
          <div className="text-cyan-400/80">Install <strong>Voice OS</strong> above, then use the mic button in Chat to speak to Alphonso.</div>
        </div>
      )}

      <p className="text-zinc-600 text-xs text-center pt-2">
        Tools install to <code className="text-zinc-500">%APPDATA%\Alphonso\runtimes\</code> and are shared across Alphonso updates.
      </p>
    </div>
    </div>
      )}
    </div>
  );
}
