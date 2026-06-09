import React from 'react';
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Bot, ChevronsDown, ChevronsUp, Copy, Download, History, Paperclip, Search, Send, Square, Trash2, X, Zap, Lightbulb, ArrowRight, Keyboard } from 'lucide-react';
import { getStorage, setStorage } from '../lib/appStorage';
import { nextMsgId, CHAT_ASSISTANT_PROMPT, shouldRouteThroughJose } from '../lib/chatUtils';
import { isJoseIntakeCommand, runJoseCommandExecutionPipeline } from '../services/joseExecutionEngineService';
import { deleteChatMessages, loadChatMessages, persistChatMessages } from '../services/chatPersistenceService';
import {
  OLLAMA_TROUBLESHOOTING_COMMAND,
  classifyOllamaError,
  generateOllamaChatStream
} from '../lib/ollama';
import { ModelSwitcher } from './ModelSwitcher';
import { MarkdownMessage } from './MarkdownMessage';
import { ApprovalPanel } from './ApprovalPanel';
import { PipelineResultCard } from './PipelineResultCard';
import { listOrchestrationReceipts } from '../services/orchestrationReceiptService';
import { useKeyboardShortcuts, getShortcutList } from '../hooks/useKeyboardShortcuts';
import { startProactiveWatcher } from '../services/proactiveAgentService';
import { MemorySearch } from './MemorySearch';

const RuntimeNotice = lazy(() => import('./RuntimeNotice').then((mod) => ({ default: mod.RuntimeNotice })));
const MicrophoneStatus = lazy(() => import('./MicrophoneStatus').then((mod) => ({ default: mod.MicrophoneStatus })));
const VoiceInputButton = lazy(() => import('./VoiceInputButton').then((mod) => ({ default: mod.VoiceInputButton })));

function buildProjectSummary(result, commandText, baseSummary) {
  const receipts = result?.executionReceipts || [];
  const allArtifacts = receipts.flatMap((r) => r.artifacts || []);
  const brainArtifacts = allArtifacts.filter((a) => a.type === 'brain_generation' || a.type === 'project_scaffold');
  const gitArtifact = allArtifacts.find((a) => a.type === 'git_commit');
  const autoRunArtifact = allArtifacts.find((a) => a.type === 'auto_run');
  const planArtifact = allArtifacts.find((a) => a.type === 'plan_preview');
  const securityArtifacts = allArtifacts.filter((a) => a.type === 'security_assessment');
  const commandArtifacts = allArtifacts.filter((a) => a.type === 'command_execution');

  const files = brainArtifacts.flatMap((a) => a.filesGenerated || []);
  const scaffoldArtifact = allArtifacts.find((a) => a.type === 'project_scaffold');
  const scaffoldFiles = scaffoldArtifact?.files || [];
  const allFiles = [...new Set([...scaffoldFiles, ...files])];

  if (allFiles.length === 0 && commandArtifacts.length === 0) {
    return baseSummary;
  }

  const lines = [];

  if (planArtifact?.plan) {
    lines.push(`**What I built:** ${planArtifact.plan}`);
    lines.push('');
  }

  if (allFiles.length > 0) {
    lines.push('**Files created:**');
    const grouped = {};
    for (const f of allFiles) {
      const parts = f.split('/');
      const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
      if (!grouped[dir]) grouped[dir] = [];
      grouped[dir].push(parts[parts.length - 1]);
    }
    for (const [dir, fileNames] of Object.entries(grouped)) {
      if (dir === '.') {
        lines.push(`  ${fileNames.join(', ')}`);
      } else {
        lines.push(`  ${dir}/ → ${fileNames.join(', ')}`);
      }
    }
    lines.push('');
  }

  if (scaffoldArtifact?.template) {
    lines.push(`**Stack:** ${scaffoldArtifact.template}`);
    lines.push('');
  }

  const hasDevScript = commandArtifacts.some((a) => a.args?.includes('dev'));
  if (autoRunArtifact?.success) {
    lines.push(`**Running:** Dev server started${autoRunArtifact.url ? ` at ${autoRunArtifact.url}` : ''}`);
    lines.push('');
  } else if (hasDevScript || allFiles.some((f) => f === 'package.json' || f.endsWith('/package.json'))) {
    lines.push('**To run:** `npm run dev`');
    lines.push('');
  }

  if (gitArtifact?.message) {
    lines.push(`**Git:** Committed as "${gitArtifact.message}"`);
    lines.push('');
  }

  if (securityArtifacts.length > 0) {
    const findings = securityArtifacts.flatMap((a) => a.findings || []);
    if (findings.length > 0) {
      lines.push('**Security notes:**');
      for (const f of findings.slice(0, 3)) {
        lines.push(`  - [${f.severity}] ${f.detail}`);
      }
      lines.push('');
    }
  }

  lines.push('**Next steps:**');
  if (autoRunArtifact?.url) {
    lines.push(`  Open ${autoRunArtifact.url} in your browser`);
  } else if (allFiles.some((f) => f.includes('src/') || f.includes('client/'))) {
    lines.push('  Run `npm run dev` and open the URL shown');
  } else {
    lines.push('  Run the app and test it');
  }
  lines.push('  Tell me if you want changes: "add dark mode", "make it responsive", etc.');

  return lines.join('\n');
}

export function ChatView({
  activeChatId,
  settings,
  setConversations,
  ollamaStatus,
  installedModels,
  selectedModelMissing,
  voice,
  onGenerationChange,
  onTaskComplete,
  onRetryOllama,
  onJoseExecutionState,
  onOpenSettings,
  onModelChange
}) {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [attachedFile, setAttachedFile] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState(null);
  const [compactChat, setCompactChat] = useState(() => Boolean(getStorage('alphonso_chat_compact_v1', true)));
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [approvalCommandId, setApprovalCommandId] = useState(null);
  const [executionReceipts, setExecutionReceipts] = useState([]);
  const [pipelineResult, setPipelineResult] = useState(null);
  const [pipelineCommandText, setPipelineCommandText] = useState('');
  const [liveProgress, setLiveProgress] = useState(null);
  const [streamingText, setStreamingText] = useState('');
  const [streamingTokens, setStreamingTokens] = useState(0);
  const [streamingStartTime, setStreamingStartTime] = useState(null);
  const [streamingElapsed, setStreamingElapsed] = useState(0);
  const [proactiveSuggestion, setProactiveSuggestion] = useState(null);
  const [showMemorySearch, setShowMemorySearch] = useState(false);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const abortRef = useRef(null);
  const streamControllerRef = useRef(null);
  const inputRef = useRef(null);

  const handleAbortStream = () => {
    if (streamControllerRef.current) {
      streamControllerRef.current.abort();
      streamControllerRef.current = null;
    }
    setIsGenerating(false);
    onGenerationChange(false);
    onJoseExecutionState?.('aborted', 'Generation cancelled');
    setStreamingText('');
    setStreamingTokens(0);
    setStreamingStartTime(null);
    setStreamingElapsed(0);
  };

  useKeyboardShortcuts({
    new_chat: () => {
      setMessages([]);
      setPipelineResult(null);
      setLiveProgress(null);
    },
    focus_input: () => inputRef.current?.focus(),
    abort_generation: handleAbortStream,
    toggle_search: () => setShowMemorySearch((prev) => !prev),
    show_shortcuts: () => setShowShortcutHelp((prev) => !prev)
  });

  // Proactive agent watcher
  useEffect(() => {
    const cleanup = startProactiveWatcher((suggestion) => {
      setProactiveSuggestion(suggestion);
    });
    return cleanup;
  }, []);

  useEffect(() => {
    if (!streamingStartTime) {
      setStreamingElapsed(0);
      return;
    }
    const interval = setInterval(() => {
      setStreamingElapsed(Math.round((Date.now() - streamingStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [streamingStartTime]);

  const handleFileAttach = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const MAX_SIZE = 500 * 1024;
    if (file.size > MAX_SIZE) {
      setAttachedFile({ name: file.name, error: 'File too large (max 500 KB)' });
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      setAttachedFile({ name: file.name, content });
      setInputValue((current) => current
        ? `${current}\n\n[Attached: ${file.name}]\n\`\`\`\n${content}\n\`\`\``
        : `[Attached: ${file.name}]\n\`\`\`\n${content}\n\`\`\``
      );
    };
    reader.onerror = () => setAttachedFile({ name: file.name, error: 'Failed to read file' });
    reader.readAsText(file);
    event.target.value = '';
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const durable = await loadChatMessages(activeChatId);
      if (cancelled) return;
      if (durable && durable.length > 0) {
        setMessages(durable);
      } else {
        try {
          const sqliteData = await invoke('kv_get', { key: `alphonso_messages_${activeChatId}` });
          if (sqliteData) {
            const parsed = JSON.parse(sqliteData);
            if (Array.isArray(parsed)) {
              setMessages(parsed);
              return;
            }
          }
        } catch { /* SQLite read failed — fall through to localStorage */ }
        setMessages(getStorage(`alphonso_messages_${activeChatId}`, []));
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [activeChatId]);

  useEffect(() => {
    if (messages.length > 0) {
      setStorage(`alphonso_messages_${activeChatId}`, messages);
      persistChatMessages(activeChatId, messages);
      invoke('kv_set', { key: `alphonso_messages_${activeChatId}`, value: JSON.stringify(messages) }).catch(() => {});
      setConversations((current) => current.map((conversation) => {
        if (
          conversation.id !== activeChatId ||
          !(conversation.title === 'Unsaved Chat' || conversation.title === 'New Chat Session')
        ) return conversation;
        const firstUser = messages.find((m) => m.role === 'user');
        const text = firstUser ? firstUser.content : messages[0].content;
        const title = text.length > 45 ? `${text.slice(0, 45)}…` : text;
        return { ...conversation, title };
      }));
    }
  }, [messages, activeChatId, setConversations]);

  useEffect(() => {
    if (settings.autoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isGenerating, settings.autoScroll]);

  const modelReady = settings.selectedModel && !selectedModelMissing;

  const handleSend = async () => {
    if (!inputValue.trim() || isGenerating) return;
    const cleanInput = inputValue.trim();
    const joseCommand = isJoseIntakeCommand(cleanInput) || shouldRouteThroughJose(cleanInput);

    if (joseCommand) {
      const userMessage = { id: nextMsgId(), role: 'user', content: cleanInput };
      setMessages((current) => [...current, userMessage]);
      setInputValue('');
      setAttachedFile(null);
      setIsGenerating(true);
      onGenerationChange(true);
      onJoseExecutionState?.('thinking', 'Jose is decomposing and distributing the command.');

      try {
        const conversationHistory = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));
        setStreamingText('');
        setStreamingTokens(0);
        setStreamingStartTime(Date.now());
        streamControllerRef.current = new AbortController();
        const result = await runJoseCommandExecutionPipeline({
          commandText: cleanInput,
          source: 'shayan',
          endpoint: settings.endpoint,
          zeroCostMode: settings.zeroCostMode,
          conversationHistory,
          onProgress: (progress) => {
            setLiveProgress(progress);
            onJoseExecutionState?.(
              progress.stage === 'executed' ? 'task_complete'
                : progress.stage === 'approval_required' ? 'approving'
                  : progress.stage === 'generating_images' ? 'generating'
                    : 'thinking',
              progress.stage === 'wave_start'
                ? `Wave ${progress.wave + 1}: ${progress.agents?.join(', ')}`
                : progress.stage === 'executed'
                  ? `${progress.assignment?.agent || 'Agent'} completed`
                  : progress.stage === 'generating_images'
                    ? `Generating ${progress.promptCount || 0} image(s)...`
                    : progress.stage === 'approval_required'
                      ? `${progress.assignment?.agent || 'Agent'} needs approval`
                      : 'Processing...'
            );
          },
          onToken: (tokenData) => {
            setStreamingText(tokenData.fullText || '');
            setStreamingTokens(tokenData.fullText?.length || 0);
            onJoseExecutionState?.('streaming', `Generating code... ${tokenData.fullText?.length || 0} tokens`);
          }
        });
        streamControllerRef.current = null;
        setStreamingText('');
        setStreamingTokens(0);
        setStreamingStartTime(null);

        setPipelineResult(result);
        setPipelineCommandText(cleanInput);
        setLiveProgress(null);

        const command = result?.command || {};
        const shayanReport = command?.shayanReport || null;
        const baseSummary = shayanReport?.summary || 'Jose processed the command.';
        const hintLine = (result?.pendingApprovalCount || 0) > 0
          ? '\nApprove the pending tasks below to continue.'
          : '';

        const richSummary = buildProjectSummary(result, cleanInput, baseSummary);

        setMessages((current) => [...current, {
          id: nextMsgId(),
          role: 'assistant',
          content: richSummary + hintLine
        }]);

        if ((result?.pendingApprovalCount || 0) > 0 && Array.isArray(result?.executionReceipts)) {
          const pending = result.executionReceipts.filter((r) => r.status === 'approval_required');
          if (pending.length > 0) {
            setPendingApprovals(pending);
            setApprovalCommandId(result.commandId);
          }
        }

        if (result?.commandId) {
          const receipts = listOrchestrationReceipts({ commandId: result.commandId });
          setExecutionReceipts(receipts);
        }

        onJoseExecutionState?.(
          (result?.pendingApprovalCount || 0) > 0 ? 'approving' : 'task_complete',
          (result?.pendingApprovalCount || 0) > 0
            ? 'Jose executed safe tasks and is waiting for approvals.'
            : 'Jose completed routing and merged reports.'
        );
        onTaskComplete();
      } catch (error) {
        setMessages((current) => [...current, {
          id: nextMsgId(),
          role: 'assistant',
          isError: true,
          content: `Jose orchestration failed.\n\n${String(error)}`
        }]);
        onJoseExecutionState?.('warning', 'Jose orchestration failed.');
      } finally {
        setIsGenerating(false);
        onGenerationChange(false);
      }
      return;
    }

    if (!modelReady) {
      setMessages((current) => [...current, {
        id: nextMsgId(),
        role: 'assistant',
        isError: true,
        content: selectedModelMissing
          ? `Model not found: ${settings.selectedModel}. Choose one of the installed models: ${installedModels.map((model) => model.name).join(', ')}.`
          : 'No Ollama model is selected. Run Check Ollama and choose an installed model.'
      }]);
      return;
    }

    // Capture conversation history before state updates (React batches setMessages).
    // Cap at 20 most-recent non-error turns to keep the Ollama context window bounded.
    const historySnapshot = messages
      .filter((m) => !m.isError && m.role && m.content)
      .slice(-20);

    const userMessage = { id: nextMsgId(), role: 'user', content: cleanInput };
    setMessages((current) => [...current, userMessage]);
    setInputValue('');
    setAttachedFile(null);
    setIsGenerating(true);
    onGenerationChange(true);

    const assistantMsgId = nextMsgId();
    setMessages((current) => [...current, { id: assistantMsgId, role: 'assistant', content: '' }]);

    const chatMessages = [
      { role: 'system', content: CHAT_ASSISTANT_PROMPT },
      ...historySnapshot.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: cleanInput }
    ];

    abortRef.current = new AbortController();
    try {
      await generateOllamaChatStream({
        endpoint: settings.endpoint,
        model: settings.selectedModel,
        messages: chatMessages,
        signal: abortRef.current.signal,
        onToken: (_tok, full) => {
          setMessages((current) => current.map((msg) =>
            msg.id === assistantMsgId ? { ...msg, content: full } : msg
          ));
        }
      });
      setMessages((current) => current.map((msg) => {
        if (msg.id !== assistantMsgId) return msg;
        return msg.content ? msg : { ...msg, content: 'Ollama returned an empty response.' };
      }));
      onTaskComplete();
    } catch (error) {
      const classified = classifyOllamaError(error);
      setMessages((current) => current.map((msg) =>
        msg.id === assistantMsgId
          ? { ...msg, isError: true, content: `${classified.label}\n\n${classified.message}\n\nPowerShell:\n${OLLAMA_TROUBLESHOOTING_COMMAND}` }
          : msg
      ));
    } finally {
      setIsGenerating(false);
      onGenerationChange(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setAttachedFile(null);
    setPendingApprovals([]);
    setApprovalCommandId(null);
    setExecutionReceipts([]);
    setPipelineResult(null);
    setPipelineCommandText('');
    setLiveProgress(null);
    localStorage.removeItem(`alphonso_messages_${activeChatId}`);
    void deleteChatMessages(activeChatId);
  };

  const exportChat = () => {
    if (messages.length === 0) return;
    const lines = messages.map((m) => {
      const role = m.role === 'user' ? 'You' : 'Alphonso';
      return `### ${role}\n${m.content}`;
    });
    const md = `# Alphonso Chat — ${activeChatId}\n_Exported ${new Date().toLocaleString()}_\n\n---\n\n${lines.join('\n\n---\n\n')}`;
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `alphonso-chat-${activeChatId}-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    setStorage('alphonso_chat_compact_v1', compactChat);
  }, [compactChat]);

  const visibleMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    const q = searchQuery.toLowerCase();
    return messages.filter((m) => m.content?.toLowerCase().includes(q));
  }, [messages, searchQuery]);

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-white/[0.03] shrink-0 bg-zinc-950/40">
        <div className="h-12 flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <History className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-xs text-zinc-500 font-medium">CHAT SESSION: {activeChatId}</span>
            </div>
            <ModelSwitcher
              initialModel={settings.selectedModel}
              onModelChange={onModelChange}
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setSearchOpen((o) => !o); setSearchQuery(''); }}
              className={`text-2xs flex items-center gap-1.5 transition-colors uppercase tracking-widest font-bold ${searchOpen ? 'text-indigo-400' : 'text-zinc-500 hover:text-indigo-400'}`}
            >
              <Search className="w-3 h-3" />
            </button>
            <button
              onClick={() => setCompactChat((current) => !current)}
              className={`text-2xs flex items-center gap-1.5 transition-colors uppercase tracking-widest font-bold ${compactChat ? 'text-emerald-400' : 'text-zinc-500 hover:text-emerald-400'}`}
              title={compactChat ? 'Expand chat spacing' : 'Compact chat spacing'}
            >
              {compactChat ? <ChevronsUp className="w-3 h-3" /> : <ChevronsDown className="w-3 h-3" />}
              {compactChat ? 'Focus' : 'Full'}
            </button>
            <button
              onClick={exportChat}
              disabled={messages.length === 0}
              className="text-2xs text-zinc-500 hover:text-indigo-400 flex items-center gap-1.5 transition-colors uppercase tracking-widest font-bold disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Download className="w-3 h-3" /> Export
            </button>
            <button
              onClick={clearChat}
              className="text-2xs text-zinc-500 hover:text-red-400 flex items-center gap-1.5 transition-colors uppercase tracking-widest font-bold"
            >
              <Trash2 className="w-3 h-3" /> Clear
            </button>
          </div>
        </div>
        {searchOpen && (
          <div className="flex items-center gap-2 px-6 pb-2">
            <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search messages…"
              className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 outline-none"
            />
            {searchQuery && (
              <span className="text-2xs text-zinc-500">{visibleMessages.length} of {messages.length}</span>
            )}
            <button onClick={() => setSearchQuery('')} className="text-zinc-600 hover:text-zinc-400">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {!compactChat && (
        <Suspense fallback={null}>
          <RuntimeNotice
            ollamaStatus={ollamaStatus}
            selectedModelMissing={selectedModelMissing}
            installedModels={installedModels}
            onRetryOllama={onRetryOllama}
            onOpenSettings={onOpenSettings}
          />
        </Suspense>
      )}

      <div className={`flex-1 overflow-y-auto scroll-smooth ${compactChat ? 'p-3 space-y-3' : 'p-5 space-y-6'}`}>
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-zinc-600 opacity-50 select-none">
            <Bot className="w-16 h-16 mb-4" />
            <p className="text-sm font-medium">Local chat ready when Ollama is connected</p>
          </div>
        )}

        {searchQuery && visibleMessages.length === 0 && (
          <div className="text-center text-xs text-zinc-600 py-8">No messages match "{searchQuery}"</div>
        )}
        {visibleMessages.map((message) => (
          <div key={message.id} className={`flex ${compactChat ? 'gap-2 max-w-4xl' : 'gap-4 max-w-3xl'} mx-auto w-full animate-in fade-in slide-in-from-bottom-2 duration-300 ${message.role === 'user' ? 'justify-end' : ''}`}>
            {message.role === 'assistant' && !compactChat && (
              <div className={`w-8 h-8 rounded-lg ${message.isError ? 'bg-red-500/10 border-red-500/20' : 'bg-indigo-500/10 border-indigo-500/20'} border flex items-center justify-center shrink-0 mt-1 shadow-sm`}>
                <Bot className={`w-4 h-4 ${message.isError ? 'text-red-400' : 'text-indigo-400'}`} />
              </div>
            )}
            <div className={`flex flex-col gap-1.5 ${message.role === 'user' ? 'items-end' : 'items-start'} max-w-[90%]`}>
              {message.role === 'assistant' ? (
                <div className="relative group">
                  <div className={`${compactChat ? 'px-3 py-2 text-[12px]' : 'px-4 py-3'} rounded-2xl border shadow-sm bg-zinc-900/30 border-white/[0.05] rounded-tl-sm ${message.isError ? 'text-red-300 border-red-500/20 text-[13px] leading-relaxed whitespace-pre-wrap' : 'text-zinc-300'}`}>
                    {message.isError ? message.content : <MarkdownMessage content={message.content} />}
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(message.content);
                      setCopiedMsgId(message.id);
                      setTimeout(() => setCopiedMsgId((id) => id === message.id ? null : id), 1500);
                    }}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800"
                    title={copiedMsgId === message.id ? 'Copied!' : 'Copy message'}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                    <div className={`px-3 py-2 text-xs ${compactChat ? '' : ''}`}>{message.content}</div>
              )}
            </div>
          </div>
        ))}

        {isGenerating && (
          <div className="flex gap-4 max-w-3xl mx-auto w-full" aria-live="polite" aria-label="Streaming response">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0 mt-1">
              <Bot className="w-4 h-4 text-indigo-400 animate-pulse" />
            </div>
            <div className="bg-zinc-900/30 border border-white/[0.05] p-3 rounded-2xl rounded-tl-sm flex-1">
              {streamingText ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px] text-zinc-500 px-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                        Streaming
                      </span>
                      <span className="text-zinc-600">|</span>
                      <span>{streamingTokens.toLocaleString()} tokens</span>
                      {streamingStartTime && (
                        <>
                          <span className="text-zinc-600">|</span>
                          <span>{streamingElapsed}s elapsed</span>
                        </>
                      )}
                    </div>
                    <button
                      onClick={handleAbortStream}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-md text-red-400 transition-colors"
                      title="Stop generation"
                    >
                      <Square className="w-2.5 h-2.5" />
                      Stop
                    </button>
                  </div>
                  <div className="text-zinc-300 text-xs whitespace-pre-wrap font-mono leading-relaxed max-h-48 overflow-y-auto custom-scrollbar">
                    {streamingText}
                    <span className="inline-block w-1.5 h-4 bg-indigo-400 ml-0.5 animate-pulse" />
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-indigo-500/50 rounded-full animate-bounce [animation-duration:0.8s]" />
                    <div className="w-1.5 h-1.5 bg-indigo-500/50 rounded-full animate-bounce [animation-duration:0.8s] [animation-delay:0.2s]" />
                    <div className="w-1.5 h-1.5 bg-indigo-500/50 rounded-full animate-bounce [animation-duration:0.8s] [animation-delay:0.4s]" />
                  </div>
                  <span className="text-[10px] text-zinc-500">Initializing... {streamingElapsed}s</span>
                  <button
                    onClick={handleAbortStream}
                    className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-md text-red-400 transition-colors"
                    title="Cancel"
                  >
                    <Square className="w-2.5 h-2.5" />
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {pipelineResult && !isGenerating && (
          <div className="flex gap-4 max-w-3xl mx-auto w-full">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0 mt-1">
              <Bot className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="flex-1">
              <PipelineResultCard
                result={pipelineResult}
                commandText={pipelineCommandText}
                onRetryAgent={(receipt) => {
                  setMessages((current) => [...current, {
                    id: nextMsgId(),
                    role: 'user',
                    content: `/jose retry ${receipt.agent} for: ${pipelineCommandText}`
                  }]);
                }}
              />
            </div>
          </div>
        )}

        {liveProgress && isGenerating && (
          <div className="flex gap-4 max-w-3xl mx-auto w-full">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0 mt-1">
              <Bot className="w-4 h-4 text-indigo-400 animate-pulse" />
            </div>
            <div className="flex-1 px-3 py-2 rounded-xl bg-zinc-900/40 border border-white/[0.04]">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
                <span className="text-xs text-zinc-400 font-medium">
                  {liveProgress.stage === 'wave_start' && `Wave ${(liveProgress.wave || 0) + 1}: ${(liveProgress.agents || []).join(', ')}`}
                  {liveProgress.stage === 'executed' && `${liveProgress.assignment?.agent || 'Agent'} completed`}
                  {liveProgress.stage === 'generating_images' && `Generating ${liveProgress.promptCount || 0} image(s)...`}
                  {liveProgress.stage === 'approval_required' && `${liveProgress.assignment?.agent || 'Agent'} needs approval`}
                  {!['wave_start', 'executed', 'generating_images', 'approval_required'].includes(liveProgress.stage) && 'Processing...'}
                </span>
              </div>
            </div>
          </div>
        )}

        {pendingApprovals.length > 0 && !isGenerating && (
          <div className={`flex gap-4 max-w-3xl mx-auto w-full ${compactChat ? '' : ''}`}>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 mt-1">
              <Bot className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex-1">
              <ApprovalPanel
                pendingApprovals={pendingApprovals}
                commandId={approvalCommandId}
                onAllResolved={(cmdId, results) => {
                  const approved = Object.values(results).filter((s) => s === 'approved').length;
                  const denied = Object.values(results).filter((s) => s === 'rejected').length;
                  setMessages((current) => [...current, {
                    id: nextMsgId(),
                    role: 'assistant',
                    content: `Approval complete: ${approved} approved, ${denied} denied.\n\nCommand ID: ${cmdId}`
                  }]);
                  setPendingApprovals([]);
                  setApprovalCommandId(null);
                }}
              />
            </div>
          </div>
        )}

        {executionReceipts.length > 0 && !isGenerating && (
          <div className="flex gap-4 max-w-3xl mx-auto w-full">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0 mt-1">
              <Bot className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="flex-1 border border-white/[0.05] rounded-xl bg-zinc-900/20 p-3 space-y-2">
              <div className="text-2xs font-bold uppercase tracking-widest text-zinc-500">
                Execution Receipts ({executionReceipts.length})
              </div>
              {executionReceipts.map((receipt) => (
                <div key={receipt.id} className="flex items-center gap-2 text-xs">
                  <span className={`px-1.5 py-0.5 rounded text-2xs font-bold uppercase tracking-widest ${
                    receipt.status === 'reported_to_jose' || receipt.status === 'executed'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : receipt.status === 'pending_approval'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : receipt.status === 'dead_letter' || receipt.status === 'failed'
                          ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                          : 'bg-zinc-500/10 text-zinc-400 border border-white/10'
                  }`}>
                    {receipt.status}
                  </span>
                  <span className="text-zinc-300 font-medium">{receipt.agent}</span>
                  <span className="text-zinc-500 truncate">{receipt.actionType || receipt.eventType}</span>
                  {receipt.riskLevel && receipt.riskLevel !== 'low' && (
                    <span className={`px-1 py-0.5 rounded text-2xs font-bold uppercase ${
                      receipt.riskLevel === 'high'
                        ? 'bg-red-500/10 text-red-400'
                        : 'bg-amber-500/10 text-amber-400'
                    }`}>{receipt.riskLevel}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className={`${compactChat ? 'p-3' : 'p-5'} shrink-0 max-w-4xl mx-auto w-full`}>
        <div className="relative bg-zinc-900/80 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-sm group focus-within:border-indigo-500/50 transition-all">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.js,.jsx,.ts,.tsx,.py,.json,.yaml,.yml,.csv,.html,.css,.rs,.go,.java,.sh,.env.example"
            onChange={handleFileAttach}
            className="hidden"
          />
          <div className="absolute -top-10 left-0 flex gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border rounded-t-lg text-2xs font-bold uppercase tracking-widest transition-colors ${
                attachedFile?.error
                  ? 'border-red-500/30 text-red-400'
                  : attachedFile?.name
                    ? 'border-emerald-500/30 text-emerald-400'
                    : 'border-white/5 text-zinc-500 hover:text-zinc-300 hover:border-white/10'
              }`}
              title="Attach a file to your message"
            >
              <Paperclip className="w-3 h-3" />
              {attachedFile?.error ? attachedFile.error : attachedFile?.name ? attachedFile.name : 'ATTACH FILE'}
            </button>
            <Suspense fallback={null}>
              <VoiceInputButton voiceStatus={voice.voiceStatus} onToggle={voice.toggleListening} />
            </Suspense>
          </div>
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                handleSend();
              }
            }}
            className={`w-full bg-transparent text-zinc-100 p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 text-[13px] resize-none scroll-m-0 ${compactChat ? 'min-h-[68px]' : 'min-h-[100px]'}`}
          />
          <div className="mt-1 text-2xs text-zinc-500">
            {ollamaStatus.state === 'connected' && !selectedModelMissing
              ? `Message ${settings.selectedModel || 'local model'}`
              : 'Ollama is setup_required. Check runtime, then choose a local model.'}
          </div>

          <div className="absolute bottom-3 right-3 flex items-center gap-2">
            {isGenerating && (
              <button
                onClick={() => abortRef.current?.abort()}
                className="h-9 px-4 rounded-xl flex items-center gap-2 font-bold text-xs uppercase tracking-widest bg-zinc-800 text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-all"
              >
                <Square className="w-3.5 h-3.5" />
                Stop
              </button>
            )}
            <button
              onClick={handleSend}
              disabled={isGenerating || !inputValue.trim()}
              className={`h-9 px-4 rounded-xl flex items-center gap-2 font-bold text-xs uppercase tracking-widest transition-all ${
                isGenerating || !inputValue.trim()
                  ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed opacity-50'
                  : 'bg-white text-zinc-950 hover:bg-indigo-400 hover:text-white shadow-lg'
              }`}
            >
              {isGenerating ? 'Computing...' : 'Run Prompt'}
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        {!compactChat && (
          <div className="mt-3">
            <Suspense fallback={null}>
              <MicrophoneStatus voiceStatus={voice.voiceStatus} />
            </Suspense>
          </div>
        )}
      </div>

      {/* Proactive suggestion banner */}
      {proactiveSuggestion && !isGenerating && (
        <div className="max-w-3xl mx-auto w-full mt-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <Lightbulb className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-amber-200">{proactiveSuggestion.title}</div>
                <div className="text-xs text-zinc-400 mt-1">{proactiveSuggestion.message}</div>
                {proactiveSuggestion.actions && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {proactiveSuggestion.actions.map((action, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          if (action.command) {
                            setInputValue(action.command);
                            inputRef.current?.focus();
                          }
                          setProactiveSuggestion(null);
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-lg text-amber-300 text-xs transition-colors"
                      >
                        {action.label}
                        {action.command && <ArrowRight className="w-3 h-3" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => setProactiveSuggestion(null)}
                className="p-1 rounded hover:bg-zinc-800 text-zinc-600 shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Memory search modal */}
      {showMemorySearch && (
        <MemorySearch
          onClose={() => setShowMemorySearch(false)}
          onSelect={(item) => {
            setInputValue(`Tell me about: ${item.title}`);
            setShowMemorySearch(false);
          }}
        />
      )}

      {/* Keyboard shortcut help modal */}
      {showShortcutHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowShortcutHelp(false)}>
          <div
            className="w-full max-w-md bg-zinc-950 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-zinc-400" />
                <div className="text-sm font-semibold text-white">Keyboard Shortcuts</div>
              </div>
              <button onClick={() => setShowShortcutHelp(false)} className="p-1 rounded hover:bg-zinc-800 text-zinc-500">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
              {getShortcutList().map((shortcut, i) => (
                <div key={i} className="flex items-center justify-between py-1">
                  <span className="text-xs text-zinc-300">{shortcut.label}</span>
                  <span className="text-[10px] font-mono text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">{shortcut.keys}</span>
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-white/5 text-[10px] text-zinc-600 text-center">
              Press ? to toggle this help
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
