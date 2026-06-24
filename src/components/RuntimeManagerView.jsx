import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
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
} from 'lucide-react';
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

const TOOL_META = {
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
};

function StatusDot({ running, installing }) {
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

function ProgressBar({ pct }) {
  return (
    <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden mt-2">
      <div
        className="h-full bg-violet-500 transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── Gap 1 & 2: Prerequisite panel ─────────────────────────────────────────────
function PrereqPanel({ prereqs, onInstall, installing }) {
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

// ── Gap 4: Live log viewer ─────────────────────────────────────────────────────
function LiveLogPanel({ toolName }) {
  const [lines, setLines] = useState([]);
  const bottomRef = useRef(null);

  useEffect(() => {
    let unlisten;
    onLogLine(toolName, ({ line }) => {
      setLines((prev) => [...prev.slice(-199), line]);
    }).then((fn) => { unlisten = fn; });
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

function ToolCard({ tool, onAction, onAutostartToggle }) {
  const meta = TOOL_META[tool.name] || {};
  const [expanded, setExpanded] = useState(false);
  const [log, setLog] = useState([]);
  const [progress, setProgress] = useState(null);
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
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {(() => { const ToolIcon = meta.icon ?? Cpu; return <ToolIcon className={`w-5 h-5 ${meta.color || 'text-[var(--text-3)]'}`} />; })()}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`font-semibold text-sm ${meta.color || 'text-white'}`}>
                {tool.displayName}
              </span>
              <span className="text-zinc-600 text-xs bg-zinc-800 px-2 py-0.5 rounded">
                {meta.category}
              </span>
              {tool.port && (
                <span className="text-zinc-500 text-xs">:{tool.port}</span>
              )}
            </div>
            <p className="text-zinc-400 text-xs mt-0.5 leading-tight">{tool.description}</p>
          </div>
        </div>
        <StatusDot running={tool.running} installing={installing} />
      </div>

      {/* Install progress bar */}
      {installing && progress && (
        <div>
          <p className="text-xs text-zinc-400">{progress.message}</p>
          <ProgressBar pct={progress.pct} />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
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

      {/* Gap 9: Autostart toggle */}
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

      {/* Install log (Gap 4: live log panel) */}
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

      {/* Installed indicator */}
      {tool.installed && !tool.running && (
        <div className="flex items-center gap-1 text-xs text-zinc-500">
          <CheckCircle2 size={11} className="text-zinc-600" />
          <span>installed at <code className="text-zinc-600 text-[10px]">{tool.installDir}</code></span>
        </div>
      )}
    </div>
  );
}

const CATEGORIES = ['All', 'LLM', 'Image / Video', 'Image', 'Audio'];

export default function RuntimeManagerView() {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('All');
  const [actionMsg, setActionMsg] = useState(null);
  // Gap 1 & 2: prerequisites
  const [prereqs, setPrereqs] = useState(null);
  const [prereqInstalling, setPrereqInstalling] = useState({});
  const refreshTimer = useRef(null);
  const unlistenRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [statuses, pq] = await Promise.all([getAllStatus(), checkPrerequisites()]);
      setTools(statuses);
      setPrereqs(pq);
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
      unlistenRef.current = ul;
    });
    return () => {
      clearInterval(refreshTimer.current);
      if (unlistenRef.current) unlistenRef.current();
    };
  }, [load]);

  const showMsg = (msg, isError = false) => {
    setActionMsg({ msg, isError });
    setTimeout(() => setActionMsg(null), 4000);
  };

  const handleAction = useCallback(async (action, name, onProgress) => {
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

  // Gap 9: autostart toggle handler
  const handleAutostartToggle = useCallback(async (name, enabled) => {
    try {
      await saveAutostartPref(name, enabled);
      // Optimistic update
      setTools((prev) => prev.map((t) => t.name === name ? { ...t, autoStart: enabled } : t));
    } catch (e) {
      showMsg(String(e), true);
    }
  }, []);

  // Gap 1 & 2: install prerequisite handler
  const handlePrereqInstall = useCallback(async (dep) => {
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
    const notInstalled = tools.filter((t) => !t.installed && t.name !== 'ollama');
    for (const t of notInstalled) {
      await handleAction('install', t.name, () => {});
    }
  };

  const visible = filter === 'All'
    ? tools
    : tools.filter((t) => (TOOL_META[t.name]?.category || '') === filter);

  const runningCount = tools.filter((t) => t.running).length;
  const installedCount = tools.filter((t) => t.installed).length;

  return (
    <div className="h-full overflow-y-auto">
    <div className="flex flex-col gap-5 p-5 max-w-4xl mx-auto">
      {/* Header */}
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

      {/* Stats strip */}
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
          <span className="text-zinc-500 font-semibold">{tools.length}</span>
          <span className="text-zinc-500 ml-1">total tools</span>
        </div>
      </div>

      {/* Toast */}
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

      {/* Category filter */}
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

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-zinc-500 text-sm py-8 justify-center">
          <Loader2 size={16} className="animate-spin" /> Detecting runtimes…
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm px-4 py-3 bg-red-950 border border-red-800 rounded-xl">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Gap 1 & 2: prerequisite warning panel */}
      {!loading && prereqs && prereqs.missing.length > 0 && (
        <PrereqPanel
          prereqs={prereqs}
          onInstall={handlePrereqInstall}
          installing={prereqInstalling}
        />
      )}

      {/* Tool grid */}
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

      {/* Footer note */}
      <p className="text-zinc-600 text-xs text-center pt-2">
        Tools install to <code className="text-zinc-500">%APPDATA%\Alphonso\runtimes\</code> and are shared across Alphonso updates.
      </p>
    </div>
    </div>
  );
}
