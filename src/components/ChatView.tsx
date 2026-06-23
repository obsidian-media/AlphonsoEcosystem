// @ts-nocheck
import React from 'react';
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Bot, ChevronsDown, ChevronsUp, Copy, Download, Eye, EyeOff, History, Paperclip, Pin, PinOff, Search, Send, Square, Trash2, X, Zap, Lightbulb, ArrowRight, Keyboard, Zap as ZapIcon } from 'lucide-react';
import { ConnectorStatusDot } from './ConnectorStatusIndicators';
import { getStorage, setStorage } from '../lib/appStorage';
import { nextMsgId, CHAT_ASSISTANT_PROMPT, shouldRouteThroughJose } from '../lib/chatUtils';
import { isJoseIntakeCommand, runJoseCommandExecutionPipeline, executeApprovedPackets } from '../services/joseExecutionEngineService';
import { getRuntimePolicySettings, setRuntimePolicySettings } from '../services/policyEnforcementService';
import { deleteChatMessages, loadChatMessages, persistChatMessages } from '../services/chatPersistenceService';
import {
  OLLAMA_TROUBLESHOOTING_COMMAND,
  classifyOllamaError,
  generateOllamaChatStream
} from '../lib/ollama';
import { OllamaModelPicker } from './ModelSwitcher';
import { listConnectors } from '../services/connectorRegistryService';
import { MarkdownMessage } from './MarkdownMessage';
import { ApprovalPanel } from './ApprovalPanel';
import { PipelineResultCard } from './PipelineResultCard';
import { listOrchestrationReceipts } from '../services/orchestrationReceiptService';
import { useKeyboardShortcuts, getShortcutList } from '../hooks/useKeyboardShortcuts';
import { startProactiveWatcher } from '../services/proactiveAgentService';
import { MemorySearch } from './MemorySearch';
import { runNovaAnalysis, computeOpportunityScores, classifyPriorityTier } from '../services/novaAnalysisService';

const RuntimeNotice = lazy(() => import('./RuntimeNotice').then((mod) => ({ default: mod.RuntimeNotice })));
const MicrophoneStatus = lazy(() => import('./MicrophoneStatus').then((mod) => ({ default: mod.MicrophoneStatus })));
const VoiceInputButton = lazy(() => import('./VoiceInputButton').then((mod) => ({ default: mod.VoiceInputButton })));

// D2T9: Connector degradation banner — shown when Ollama is online but connectors are unavailable
function ConnectorDegradationBanner({ onDismiss }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const connectors = listConnectors();
      const liveCount = connectors.filter((c) => {
        const status = String(c.status || '').toLowerCase();
        const envPresence = c.envPresence || {};
        const allEnv = (c.requiredEnv || []).every((k) => Boolean(envPresence[k]));
        return status === 'configured' && allEnv && c.lastTestStatus === 'verified';
      }).length;
      setShow(liveCount === 0 && connectors.length > 0);
    } catch {
      setShow(false);
    }
  }, []);

  if (!show) return null;
  return (
    <div className="mx-3 mt-2 flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-500/8 px-3 py-2 text-[11px] text-amber-200/80">
      <span className="shrink-0">⚠</span>
      <span className="flex-1">Some connectors are unavailable — results may be limited.</span>
      <button
        onClick={onDismiss}
        className="rounded px-1 text-amber-400/60 hover:text-amber-300 transition-colors"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

function buildProjectSummary(result, commandText, baseSummary, screenContext = []) {
  const receipts = result?.executionReceipts || [];
  const allArtifacts = receipts.flatMap((r) => r.artifacts || []);
  const brainArtifacts = allArtifacts.filter((a) => a.type === 'brain_generation' || a.type === 'project_scaffold');
  const gitArtifact = allArtifacts.find((a) => a.type === 'git_commit');
  const autoRunArtifact = allArtifacts.find((a) => a.type === 'auto_run');
  const planArtifact = allArtifacts.find((a) => a.type === 'plan_preview');
  const securityArtifacts = allArtifacts.filter((a) => a.type === 'security_assessment');
  const commandArtifacts = allArtifacts.filter((a) => a.type === 'command_execution');
  const runtimeHubArtifact = allArtifacts.find((a) => a.type === 'open_runtime_hub');
  const miyaReceipt = receipts.find((r) => r.agent === 'miya');
  const generatedImagesArtifact = allArtifacts.find((a) => a.type === 'generated_images');

  // If image generation was blocked by missing runtime, return a special marker
  if (runtimeHubArtifact) {
    return `__RUNTIME_HUB_REQUIRED__${baseSummary}`;
  }

  // If Miya ran and generated images or a creative package, surface it
  if (miyaReceipt && !brainArtifacts.length) {
    const lines: string[] = [baseSummary];
    if (generatedImagesArtifact?.count > 0) {
      lines.push(`\n🎨 ${generatedImagesArtifact.count} image(s) generated.`);
    }
    return lines.join('');
  }

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

  if (screenContext.length > 0) {
    const recent = screenContext.slice(-3);
    lines.push('**Screen context:**');
    for (const e of recent) {
      lines.push(`  ${e.type || 'screen'}: ${String(e.text || e.description || '').slice(0, 100)}`);
    }
    lines.push('');
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
  onModelChange,
  screenObserverLogs = [],
  setActiveTab
}: any) {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [attachedFile, setAttachedFile] = useState(null);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [hectorBriefing, setHectorBriefing] = useState(null);
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
  const [novaInsight, setNovaInsight] = useState(null);
  const [ollamaBannerDismissed, setOllamaBannerDismissed] = useState(false);
  const [connectorBannerDismissed, setConnectorBannerDismissed] = useState(false);
  const [previewMode, setPreviewMode] = useState(() => getRuntimePolicySettings().previewMode);
  const [directMode, setDirectMode] = useState(false);
  const [directAgent, setDirectAgent] = useState('Alphonso');
  const [pinnedMessages, setPinnedMessages] = useState(() => {
    try { return JSON.parse(localStorage.getItem('alphonso_pinned_messages_v1') || '[]'); } catch { return []; }
  });
  const [showPinned, setShowPinned] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const abortRef = useRef(null);
  const streamControllerRef = useRef(null);
  const inputRef = useRef(null);
  const approvalTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pinMessage = (message) => {
    setPinnedMessages((prev) => {
      if (prev.some((p) => p.id === message.id)) return prev;
      const next = [...prev, { id: message.id, content: message.content, role: message.role, timestamp: Date.now(), pinnedAt: Date.now() }];
      try { localStorage.setItem('alphonso_pinned_messages_v1', JSON.stringify(next)); } catch { /* storage */ }
      return next;
    });
  };

  const unpinMessage = (messageId) => {
    setPinnedMessages((prev) => {
      const next = prev.filter((p) => p.id !== messageId);
      try { localStorage.setItem('alphonso_pinned_messages_v1', JSON.stringify(next)); } catch { /* storage */ }
      return next;
    });
  };

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

  useEffect(() => {
    if (ollamaStatus.state === 'connected') {
      setOllamaBannerDismissed(false);
      setConnectorBannerDismissed(false);
    }
  }, [ollamaStatus.state]);

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

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) setAttachedFiles((prev) => [...prev, ...files]);
  };

  const handleSend = async () => {
    if (!inputValue.trim() || isGenerating) return;
    setNovaInsight(null);
    const filesSuffix = attachedFiles.length
      ? `\n\n[Attached files: ${attachedFiles.map((f) => f.name).join(', ')}]`
      : '';
    const rawInput = inputValue.trim() + filesSuffix;
    const cleanInput = directMode ? `[DIRECT:${directAgent}] ${rawInput}` : rawInput;
    const joseCommand = !directMode && (isJoseIntakeCommand(cleanInput) || shouldRouteThroughJose(cleanInput));

    if (joseCommand) {
      const userMessage = { id: nextMsgId(), role: 'user', content: cleanInput };
      setMessages((current) => [...current, userMessage]);
      setInputValue('');
      setAttachedFile(null);
      setAttachedFiles([]);
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
          previewMode,
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

        const richSummary = buildProjectSummary(result, cleanInput, baseSummary, screenObserverLogs);
        const needsRuntimeHub = richSummary.startsWith('__RUNTIME_HUB_REQUIRED__');
        const displaySummary = needsRuntimeHub ? richSummary.slice('__RUNTIME_HUB_REQUIRED__'.length) : richSummary;

        setMessages((current) => [...current, {
          id: nextMsgId(),
          role: 'assistant',
          content: displaySummary + hintLine,
          ...(needsRuntimeHub ? { actionType: 'open_runtime_hub' } : {})
        }]);

        if ((result?.pendingApprovalCount || 0) > 0 && Array.isArray(result?.executionReceipts)) {
          const pending = result.executionReceipts.filter((r) => r.status === 'approval_required');
          if (pending.length > 0) {
            setPendingApprovals(pending);
            setApprovalCommandId(result.commandId);

            // Inject in-chat notification so the user knows approval is needed
            const agentNames = [...new Set(pending.map((r) => r.agent).filter(Boolean))].join(', ');
            setMessages((current) => [...current, {
              id: nextMsgId(),
              role: 'assistant',
              content: `⏳ **${agentNames || 'Agent'} ${pending.length === 1 ? 'is' : 'are'} waiting for your approval** — review the task${pending.length !== 1 ? 's' : ''} below and approve or deny to continue.`
            }]);

            // 10-minute timeout — clear approval panel and notify user
            if (approvalTimeoutRef.current) clearTimeout(approvalTimeoutRef.current);
            approvalTimeoutRef.current = setTimeout(() => {
              setPendingApprovals((prev) => {
                if (prev.length > 0) {
                  setMessages((current) => [...current, {
                    id: `timeout-${Date.now()}`,
                    role: 'assistant',
                    content: '⏸ Approval timed out after 10 minutes. Resubmit your request to try again.'
                  }]);
                }
                return [];
              });
              setApprovalCommandId(null);
            }, 10 * 60 * 1000);
          }
        }

        if (result?.commandId) {
          const receipts = listOrchestrationReceipts({ commandId: result.commandId });
          setExecutionReceipts(receipts);
          const hectorReceipt = result?.executionReceipts?.find((r) => r.agent === 'hector');
          if (hectorReceipt?.payload?.sources?.length || hectorReceipt?.details?.sources?.length) {
            setHectorBriefing({ sources: hectorReceipt?.payload?.sources || hectorReceipt?.details?.sources || [] });
          }
        }

        onJoseExecutionState?.(
          (result?.pendingApprovalCount || 0) > 0 ? 'approving' : 'task_complete',
          (result?.pendingApprovalCount || 0) > 0
            ? 'Jose executed safe tasks and is waiting for approvals.'
            : 'Jose completed routing and merged reports.'
        );
        onTaskComplete();

        // Fire Nova analysis in background — non-blocking
        try {
          const novaScores = computeOpportunityScores(cleanInput, {});
          if (novaScores.valueScore > 60) {
            runNovaAnalysis(cleanInput, null, {}, { skipOllama: true }).then(novaResult => {
              if (novaResult?.score > 65) setNovaInsight(novaResult);
            }).catch(() => {});
          }
        } catch { /* non-critical */ }
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
    setAttachedFiles([]);
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
      <div className="border-b border-[var(--border)] shrink-0 bg-[var(--surface-0)]">
        <div className="h-12 flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <History className="w-3.5 h-3.5 text-[var(--text-3)]" />
              <span className="text-xs text-[var(--text-3)] font-medium">CHAT SESSION: {activeChatId}</span>
            </div>
            <OllamaModelPicker
              initialModel={settings.selectedModel}
              onModelChange={onModelChange}
            />
            {/* D1T7: Direct mode toggle */}
            <button
              onClick={() => setDirectMode((d) => !d)}
              className={`text-2xs flex items-center gap-1 px-2 py-0.5 rounded border transition-colors uppercase tracking-widest font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 ${directMode ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300' : 'border-white/5 text-[var(--text-4)] hover:text-[var(--text-2)]'}`}
              aria-label={directMode ? `Direct mode on (${directAgent})` : 'Direct mode off'}
              title={directMode ? `Direct to ${directAgent} — bypasses Jose routing` : 'Enable direct agent mode'}
            >
              <Zap className="w-2.5 h-2.5" />
              Direct
            </button>
            {/* D1T4: Connector status dots */}
            <div className="flex items-center gap-1" title="Connector status: Ollama · Telegram">
              <ConnectorStatusDot connectorId="ollama" />
              <ConnectorStatusDot connectorId="telegram" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            {directMode && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 font-bold uppercase tracking-widest">
                Direct
              </span>
            )}
            <button
              onClick={() => { setSearchOpen((o) => !o); setSearchQuery(''); }}
              className={`text-2xs flex items-center gap-1.5 transition-colors uppercase tracking-widest font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 rounded ${searchOpen ? 'text-indigo-400' : 'text-[var(--text-3)] hover:text-indigo-400'}`}
              aria-label={searchOpen ? 'Close search' : 'Open search'}
            >
              <Search className="w-3 h-3" />
            </button>
            <button
              onClick={() => setCompactChat((current) => !current)}
              className={`text-2xs flex items-center gap-1.5 transition-colors uppercase tracking-widest font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 rounded ${compactChat ? 'text-emerald-400' : 'text-[var(--text-3)] hover:text-emerald-400'}`}
              aria-label={compactChat ? 'Expand chat spacing' : 'Compact chat spacing'}
            >
              {compactChat ? <ChevronsUp className="w-3 h-3" /> : <ChevronsDown className="w-3 h-3" />}
              {compactChat ? 'Focus' : 'Full'}
            </button>
            <button
              onClick={() => {
                const next = !previewMode;
                setPreviewMode(next);
                setRuntimePolicySettings({ previewMode: next }).catch(() => {});
              }}
              className={`text-2xs flex items-center gap-1.5 transition-colors uppercase tracking-widest font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 rounded ${previewMode ? 'text-amber-400' : 'text-[var(--text-3)] hover:text-amber-400'}`}
              aria-label={previewMode ? 'Preview mode on — approve before publishing' : 'Auto mode — publish without approval'}
              title={previewMode ? 'Preview mode: see results before publishing' : 'Auto mode: publish immediately'}
            >
              {previewMode ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              {previewMode ? 'Preview' : 'Auto'}
            </button>
            <button
              onClick={exportChat}
              disabled={messages.length === 0}
              className="text-2xs text-[var(--text-3)] hover:text-indigo-400 flex items-center gap-1.5 transition-colors uppercase tracking-widest font-bold disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 rounded"
              aria-label="Export chat as Markdown"
            >
              <Download className="w-3 h-3" /> Export
            </button>
            <button
              onClick={clearChat}
              className="text-2xs text-[var(--text-3)] hover:text-red-400 flex items-center gap-1.5 transition-colors uppercase tracking-widest font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 rounded"
              aria-label="Clear chat"
            >
              <Trash2 className="w-3 h-3" /> Clear
            </button>
          </div>
        </div>
        {searchOpen && (
          <div className="flex items-center gap-2 px-6 pb-2">
            <Search className="w-3.5 h-3.5 text-[var(--text-3)] shrink-0" />
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search messages…"
              className="flex-1 bg-transparent text-sm text-[var(--text-1)] placeholder-zinc-600 outline-none"
            />
            {searchQuery && (
              <span className="text-2xs text-[var(--text-3)]">{visibleMessages.length} of {messages.length}</span>
            )}
            <button onClick={() => setSearchQuery('')} className="text-[var(--text-4)] hover:text-[var(--text-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 rounded" aria-label="Clear search query">
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

      {compactChat && ollamaStatus.state !== 'connected' && !ollamaBannerDismissed && (
        <div className="mx-3 mt-2 flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-500/8 px-3 py-2 text-[11px] text-amber-200/80">
          <span className="shrink-0">⚠</span>
          <span className="flex-1">
            {ollamaStatus.state === 'not_running' || ollamaStatus.state === 'disconnected'
              ? 'Ollama is offline — start it to enable local AI.'
              : `Ollama: ${ollamaStatus.state}`}
          </span>
          <button
            onClick={onRetryOllama}
            className="rounded px-2 py-0.5 text-[10px] font-bold text-amber-300 hover:bg-amber-400/10 transition-colors"
          >
            Retry
          </button>
          <button
            onClick={() => setOllamaBannerDismissed(true)}
            className="rounded px-1 text-amber-400/60 hover:text-amber-300 transition-colors"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* D1T8: Pinned messages section */}
      {pinnedMessages.length > 0 && (
        <div className="mx-3 mt-2 shrink-0">
          <button
            onClick={() => setShowPinned((s) => !s)}
            className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors mb-1"
          >
            <Pin className="w-3 h-3" />
            {pinnedMessages.length} Pinned {showPinned ? '▲' : '▼'}
          </button>
          {showPinned && (
            <div className="space-y-1 max-h-40 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-2">
              {pinnedMessages.map((pm) => (
                <div key={pm.id} className="flex items-start gap-2 group">
                  <div className="flex-1 text-[11px] text-[var(--text-2)] line-clamp-2 leading-relaxed">{pm.content}</div>
                  <button
                    onClick={() => unpinMessage(pm.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-[var(--text-4)] hover:text-amber-400"
                    aria-label="Unpin message"
                  >
                    <PinOff className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* D2T9: Connector degradation banner */}
      {compactChat && ollamaStatus.state === 'connected' && !connectorBannerDismissed && (
        <ConnectorDegradationBanner onDismiss={() => setConnectorBannerDismissed(true)} />
      )}

      <div className={`flex-1 overflow-y-auto scroll-smooth ${compactChat ? 'p-3 space-y-3' : 'p-5 space-y-6'}`}>
        {messages.length === 0 && !inputValue && (
          <div className="h-full flex flex-col items-center justify-center select-none py-16">
            <div className="flex flex-col items-center gap-3 opacity-40">
              <Bot className="w-12 h-12 text-[var(--text-3)]" />
              <p className="text-sm font-medium text-[var(--text-2)]">Start a conversation</p>
              <p className="text-xs text-[var(--text-4)]">Type a command or ask anything.</p>
            </div>
          </div>
        )}

        {searchQuery && visibleMessages.length === 0 && (
          <div className="text-center text-xs text-[var(--text-4)] py-8">No messages match "{searchQuery}"</div>
        )}
        {visibleMessages.map((message) => {
          const lastAssistantIdx = messages.length - 1 - [...messages].reverse().findIndex((m) => m.role === 'assistant');
          const isLastAssistantMessage = message.role === 'assistant' && messages.indexOf(message) === lastAssistantIdx;
          return (
          <div key={message.id} className={`flex ${compactChat ? 'gap-2 max-w-4xl' : 'gap-4 max-w-3xl'} mx-auto w-full animate-in fade-in slide-in-from-bottom-2 duration-300 ${message.role === 'user' ? 'justify-end' : ''}`}>
            {message.role === 'assistant' && !compactChat && (
              <div className={`w-8 h-8 rounded-lg ${message.isError ? 'bg-red-500/10 border-red-500/20' : 'bg-indigo-500/10 border-indigo-500/20'} border flex items-center justify-center shrink-0 mt-1 shadow-sm`}>
                <Bot className={`w-4 h-4 ${message.isError ? 'text-red-400' : 'text-indigo-400'}`} />
              </div>
            )}
            <div className={`flex flex-col gap-1.5 ${message.role === 'user' ? 'items-end' : 'items-start'} max-w-[90%]`}>
              {message.role === 'assistant' ? (
                <div className="relative group">
                  <div className={`${compactChat ? 'px-3 py-2 text-[12px]' : 'px-4 py-3'} rounded-2xl border shadow-sm bg-[var(--surface-1)] border-[var(--border)] rounded-tl-sm ${message.isError ? 'text-red-300 border-red-500/20 text-[13px] leading-relaxed whitespace-pre-wrap' : 'text-[var(--text-1)]'}`}>
                    {message.isError ? message.content : <MarkdownMessage content={message.content} />}
                  </div>
                  {/* Runtime Hub action button — shown when image generation needs ComfyUI/A1111 */}
                  {message.actionType === 'open_runtime_hub' && (
                    <div className="mt-2">
                      <button
                        onClick={() => setActiveTab?.('runtimes')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 border border-indigo-500/40 rounded-lg text-xs text-indigo-300 hover:bg-indigo-600/30 hover:text-indigo-200 transition-colors"
                      >
                        <ArrowRight className="w-3 h-3" />
                        Open Runtime Hub to install ComfyUI or AUTOMATIC1111
                      </button>
                    </div>
                  )}
                  {/* Inline Hector citations on last assistant message */}
                  {hectorBriefing && isLastAssistantMessage && hectorBriefing.sources?.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {hectorBriefing.sources.slice(0, 3).map((src, i) => {
                        const domain = src.url ? (() => { try { return new URL(src.url).hostname.replace('www.', ''); } catch { return src.url; } })() : null;
                        return (
                          <a
                            key={i}
                            href="#"
                            onClick={(e) => { e.preventDefault(); window.open(src.url, '_blank'); }}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-sky-900/40 border border-sky-700/50 rounded text-xs text-sky-400 hover:text-sky-300 hover:bg-sky-900/60"
                            title={src.url}
                          >
                            <span>↗</span>
                            <span>{src.title || domain || `Source ${i + 1}`}</span>
                          </a>
                        );
                      })}
                    </div>
                  )}
                  <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => pinnedMessages.some((p) => p.id === message.id) ? unpinMessage(message.id) : pinMessage(message)}
                      className="p-1 rounded text-[var(--text-4)] hover:text-amber-400 hover:bg-[var(--surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
                      aria-label={pinnedMessages.some((p) => p.id === message.id) ? 'Unpin message' : 'Pin message'}
                      title={pinnedMessages.some((p) => p.id === message.id) ? 'Unpin' : 'Pin'}
                    >
                      {pinnedMessages.some((p) => p.id === message.id) ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(message.content);
                        setCopiedMsgId(message.id);
                        setTimeout(() => setCopiedMsgId((id) => id === message.id ? null : id), 1500);
                      }}
                      className="p-1 rounded text-[var(--text-4)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
                      aria-label={copiedMsgId === message.id ? 'Copied' : 'Copy message to clipboard'}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="relative group">
                  <div className={`px-3 py-2 text-xs ${compactChat ? '' : ''}`}>{message.content}</div>
                  <button
                    onClick={() => pinnedMessages.some((p) => p.id === message.id) ? unpinMessage(message.id) : pinMessage(message)}
                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-[var(--text-4)] hover:text-amber-400 hover:bg-[var(--surface-3)]"
                    aria-label={pinnedMessages.some((p) => p.id === message.id) ? 'Unpin message' : 'Pin message'}
                  >
                    {pinnedMessages.some((p) => p.id === message.id) ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                  </button>
                </div>
              )}
            </div>
          </div>
          );
        })}

        {isGenerating && (
          <div className="flex gap-4 max-w-3xl mx-auto w-full" aria-live="polite" aria-label="Streaming response">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0 mt-1">
              <Bot className="w-4 h-4 text-indigo-400 animate-pulse" />
            </div>
            <div className="bg-[var(--surface-1)] border border-[var(--border)] p-3 rounded-2xl rounded-tl-sm flex-1">
              {streamingText ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px] text-[var(--text-3)] px-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                        Streaming
                      </span>
                      <span className="text-[var(--text-4)]">|</span>
                      <span>{streamingTokens.toLocaleString()} tokens</span>
                      {streamingStartTime && (
                        <>
                          <span className="text-[var(--text-4)]">|</span>
                          <span>{streamingElapsed}s elapsed</span>
                        </>
                      )}
                    </div>
                    <button
                      onClick={handleAbortStream}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-md text-red-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
                      aria-label="Stop generation"
                    >
                      <Square className="w-2.5 h-2.5" />
                      Stop
                    </button>
                  </div>
                  <div className="text-[var(--text-1)] text-xs whitespace-pre-wrap font-mono leading-relaxed max-h-48 overflow-y-auto custom-scrollbar">
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
                  <span className="text-[10px] text-[var(--text-3)]">Initializing... {streamingElapsed}s</span>
                  <button
                    onClick={handleAbortStream}
                    className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-md text-red-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
                    aria-label="Cancel generation"
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
                outputFolder={settings.outputFolder || ''}
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

        {novaInsight && !isGenerating && (
          <div className="mx-auto w-full max-w-3xl animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span className="text-xs font-bold text-indigo-300 uppercase tracking-widest">Nova Insight</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    novaInsight.score >= 80 ? 'bg-emerald-500/10 border-emerald-400/20 text-emerald-300' :
                    novaInsight.score >= 60 ? 'bg-amber-500/10 border-amber-400/20 text-amber-300' :
                    'bg-zinc-500/10 border-zinc-400/20 text-[var(--text-2)]'
                  }`}>Score {novaInsight.score}/100</span>
                </div>
                <button onClick={() => setNovaInsight(null)} className="text-[var(--text-4)] hover:text-[var(--text-2)] rounded">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {novaInsight.recommendation && (
                <p className="text-xs text-[var(--text-1)] leading-relaxed">{novaInsight.recommendation}</p>
              )}
            </div>
          </div>
        )}

        {liveProgress && isGenerating && (
          <div className="flex gap-4 max-w-3xl mx-auto w-full">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0 mt-1">
              <Bot className="w-4 h-4 text-indigo-400 animate-pulse" />
            </div>
            <div className="flex-1 px-3 py-2 rounded-xl bg-[var(--surface-1)] border border-[var(--border)]">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
                <span className="text-xs text-[var(--text-2)] font-medium">
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
                onAllResolved={async (cmdId, results) => {
                  if (approvalTimeoutRef.current) {
                    clearTimeout(approvalTimeoutRef.current);
                    approvalTimeoutRef.current = null;
                  }
                  const approvedIds = Object.entries(results).filter(([, s]) => s === 'approved').map(([id]) => id);
                  const denied = Object.values(results).filter((s) => s === 'rejected').length;
                  setPendingApprovals([]);
                  setApprovalCommandId(null);

                  if (approvedIds.length === 0) {
                    setMessages((current) => [...current, {
                      id: nextMsgId(),
                      role: 'assistant',
                      content: `All ${denied} task${denied !== 1 ? 's' : ''} denied. Nothing was executed.`
                    }]);
                    return;
                  }

                  setMessages((current) => [...current, {
                    id: nextMsgId(),
                    role: 'assistant',
                    content: `✅ ${approvedIds.length} task${approvedIds.length !== 1 ? 's' : ''} approved${denied > 0 ? `, ${denied} denied` : ''}. Running now...`
                  }]);
                  setIsGenerating(true);
                  onJoseExecutionState?.('thinking', 'Running approved tasks...');

                  try {
                    const execResult = await executeApprovedPackets(approvedIds, {
                      endpoint: settings?.endpoint,
                      conversationHistory,
                      onProgress: (progress) => {
                        setLiveProgress(progress);
                      },
                      onToken: (tokenData) => {
                        if (tokenData?.token) {
                          setMessages((current) => {
                            const last = current[current.length - 1];
                            if (last?.role === 'assistant' && last?.streaming) {
                              return [...current.slice(0, -1), { ...last, content: last.content + tokenData.token }];
                            }
                            return [...current, { id: nextMsgId(), role: 'assistant', content: tokenData.token, streaming: true }];
                          });
                        }
                      }
                    });
                    // Close any open streaming message
                    setMessages((current) => current.map((m) => m.streaming ? { ...m, streaming: false } : m));
                    setMessages((current) => [...current, {
                      id: nextMsgId(),
                      role: 'assistant',
                      content: execResult.summary || 'Approved tasks completed.'
                    }]);
                    onJoseExecutionState?.('task_complete', 'Approved tasks completed.');
                  } catch (err) {
                    setMessages((current) => [...current, {
                      id: nextMsgId(),
                      role: 'assistant',
                      content: `Error running approved tasks: ${err?.message || String(err)}`,
                      isError: true
                    }]);
                  } finally {
                    setIsGenerating(false);
                    setLiveProgress(null);
                    onTaskComplete();
                  }
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
            <div className="flex-1 border border-[var(--border)] rounded-xl bg-[var(--surface-0)] p-3 space-y-2">
              <div className="text-2xs font-bold uppercase tracking-widest text-[var(--text-3)]">
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
                          : 'bg-zinc-500/10 text-[var(--text-2)] border border-white/10'
                  }`}>
                    {receipt.status}
                  </span>
                  <span className="text-[var(--text-1)] font-medium">{receipt.agent}</span>
                  <span className="text-[var(--text-3)] truncate">{receipt.actionType || receipt.eventType}</span>
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
        {hectorBriefing && (
          <div className="mx-4 mb-2 rounded-xl border border-sky-400/20 bg-sky-500/5 p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-sky-400">Hector Research</span>
              <button onClick={() => setHectorBriefing(null)} className="text-[var(--text-3)] hover:text-[var(--text-1)] text-xs">×</button>
            </div>
            {hectorBriefing.sources?.slice(0, 3).map((src, i) => {
              const domain = src.url ? (() => { try { return new URL(src.url).hostname.replace('www.', ''); } catch { return src.url; } })() : null;
              return (
                <a
                  key={i}
                  href="#"
                  onClick={(e) => { e.preventDefault(); window.open(src.url, '_blank'); }}
                  className="text-sky-400 hover:text-sky-300 underline text-xs truncate block"
                  title={src.url}
                >
                  {src.title || domain || src.url}
                </a>
              );
            })}
          </div>
        )}
        <div
          className={`relative bg-[var(--surface-2)] border rounded-2xl shadow-2xl backdrop-blur-sm group focus-within:border-indigo-500/50 transition-all ${isDragging ? 'border-amber-400/30 border-dashed' : 'border-white/10'}`}
          onDragEnter={() => setIsDragging(true)}
          onDragLeave={() => setIsDragging(false)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
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
              className={`flex items-center gap-1.5 px-3 py-1.5   bg-[var(--surface-3)] border rounded-t-lg text-2xs font-bold uppercase tracking-widest transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 ${
                attachedFile?.error
                  ? 'border-red-500/30 text-red-400'
                  : attachedFile?.name
                    ? 'border-emerald-500/30 text-emerald-400'
                    : 'border-white/5 text-[var(--text-3)] hover:text-[var(--text-1)] hover:border-white/10'
              }`}
              aria-label="Attach a file to your message"
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
            className={`w-full bg-transparent text-[var(--text-1)] p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 text-[13px] resize-none scroll-m-0 ${compactChat ? 'min-h-[68px]' : 'min-h-[100px]'}`}
          />
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-4 pb-1">
              {attachedFiles.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--surface-3)] border border-white/10 text-[11px] text-[var(--text-1)]">
                  {f.name}
                  <button onClick={() => setAttachedFiles((prev) => prev.filter((_, idx) => idx !== i))} className="text-[var(--text-3)] hover:text-[var(--text-1)] ml-0.5" aria-label={`Remove ${f.name}`}>×</button>
                </span>
              ))}
            </div>
          )}
          <div className="mt-1 text-2xs text-[var(--text-3)]">
            {ollamaStatus.state === 'connected' && !selectedModelMissing
              ? `Message ${settings.selectedModel || 'local model'}`
              : ollamaStatus.state !== 'connected'
                ? 'Start Ollama to enable local AI responses.'
                : 'Choose a local model in Settings to start chatting.'}
          </div>

          <div className="absolute bottom-3 right-3 flex items-center gap-2">
            {isGenerating && (
              <button
                onClick={() => abortRef.current?.abort()}
                className="h-9 px-4 rounded-xl flex items-center gap-2 font-bold text-xs uppercase tracking-widest bg-[var(--surface-3)] text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
                aria-label="Abort and stop"
              >
                <Square className="w-3.5 h-3.5" />
                Stop
              </button>
            )}
            <button
              onClick={handleSend}
              disabled={isGenerating || !inputValue.trim()}
              className={`h-9 px-4 rounded-xl flex items-center gap-2 font-bold text-xs uppercase tracking-widest transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 ${
                isGenerating || !inputValue.trim()
                  ? 'bg-[var(--surface-3)] text-[var(--text-4)] cursor-not-allowed opacity-50'
                  : 'bg-white text-zinc-950 hover:bg-indigo-400 hover:text-white shadow-lg'
              }`}
              aria-label="Send message"
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
                <div className="text-xs text-[var(--text-2)] mt-1">{proactiveSuggestion.message}</div>
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
                className="p-1 rounded hover:bg-[var(--surface-3)] text-[var(--text-4)] shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
                aria-label="Dismiss suggestion"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowShortcutHelp(false)} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
          <div
            className="w-full max-w-md bg-[var(--surface-0)] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-[var(--text-2)]" />
                <div className="text-sm font-semibold text-white">Keyboard Shortcuts</div>
              </div>
              <button onClick={() => setShowShortcutHelp(false)} className="p-1 rounded hover:bg-[var(--surface-3)] text-[var(--text-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50" aria-label="Close keyboard shortcuts">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
              {getShortcutList().map((shortcut, i) => (
                <div key={i} className="flex items-center justify-between py-1">
                  <span className="text-xs text-[var(--text-1)]">{shortcut.label}</span>
                  <span className="text-[10px] font-mono text-[var(--text-3)] bg-[var(--surface-3)] px-2 py-0.5 rounded">{shortcut.keys}</span>
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-white/5 text-[10px] text-[var(--text-4)] text-center">
              Press ? to toggle this help
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
