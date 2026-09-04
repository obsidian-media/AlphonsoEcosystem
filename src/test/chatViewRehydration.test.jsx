import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { setAgentProvider } from '../services/modelSelectionService';

// Regression test for a real QA finding (Q&A E2E Test.md, Round 2 N-1):
// "chat history is saved but never restored — messages sit in storage after
// reload yet the UI shows an empty chat." Deliberately does NOT mock
// ../lib/appStorage (unlike src/test/ChatView.test.jsx) so the real
// localStorage read/write path is actually exercised — that mock is exactly
// why the existing ChatView test suite never caught this.

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null)
}));

vi.mock('../lib/ollama', () => ({
  generateOllamaChatStream: vi.fn().mockResolvedValue(undefined),
  checkOllama: vi.fn().mockResolvedValue({ ok: true }),
  classifyOllamaError: vi.fn().mockReturnValue({ label: 'Error', message: 'Something went wrong' }),
  OLLAMA_TROUBLESHOOTING_COMMAND: 'ollama serve'
}));

vi.mock('../lib/chatUtils', () => ({
  nextMsgId: vi.fn().mockReturnValue('msg-1'),
  CHAT_ASSISTANT_PROMPT: 'You are a helpful assistant.',
  shouldRouteThroughJose: vi.fn().mockReturnValue(false)
}));

vi.mock('../services/policyEnforcementService', () => ({
  getRuntimePolicySettings: vi.fn().mockReturnValue({ previewMode: false }),
  setRuntimePolicySettings: vi.fn().mockResolvedValue(undefined)
}));

// The real bug condition: durable/SQLite memory is unavailable, exactly like
// the QA report's "SQLite unavailable / preview fallback" observation.
vi.mock('../services/chatPersistenceService', () => ({
  loadChatMessages: vi.fn().mockResolvedValue(null),
  persistChatMessages: vi.fn(),
  deleteChatMessages: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../services/joseExecutionEngineService', () => ({
  isJoseIntakeCommand: vi.fn().mockReturnValue(false),
  runJoseCommandExecutionPipeline: vi.fn().mockResolvedValue({ commandId: null, executionReceipts: [] })
}));

vi.mock('../services/orchestrationReceiptService', () => ({
  listOrchestrationReceipts: vi.fn().mockReturnValue([])
}));

vi.mock('../services/proactiveAgentService', () => ({
  startProactiveWatcher: vi.fn().mockReturnValue(() => {})
}));

vi.mock('../hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: vi.fn(),
  getShortcutList: vi.fn().mockReturnValue([])
}));

vi.mock('../services/connectors/nvidiaNimConnector', () => ({
  isNvidiaConfigured: vi.fn().mockReturnValue(true),
  sendNvidiaMessage: vi.fn().mockResolvedValue({ ok: true, content: 'Hello from NVIDIA', model: 'meta/llama-3.1-8b-instruct', provider: 'nvidia_nim' })
}));

vi.mock('../services/connectors/geminiConnector', () => ({
  isGeminiConfigured: vi.fn().mockReturnValue(true),
  sendGeminiMessage: vi.fn().mockResolvedValue({ ok: true, content: 'Hello from Gemini', model: 'gemini-3.5-flash-lite', provider: 'gemini' })
}));

vi.mock('../services/connectors/hermesAgentConnector', () => ({
  isHermesAgentConfigured: vi.fn().mockReturnValue(true),
  sendHermesAgentMessage: vi.fn().mockResolvedValue({ ok: true, content: 'Hello from Hermes', model: 'hermes-agent', usage: null, provider: 'hermes' })
}));

// Stateful, not a fixed return -- see ChatView.test.jsx for why.
vi.mock('../services/modelSelectionService', () => {
  const store = {};
  return {
    getAgentProvider: vi.fn((agentId) => store[agentId] || { provider: 'ollama' }),
    setAgentProvider: vi.fn((agentId, config) => { store[agentId] = config; })
  };
});

vi.mock('../components/MarkdownMessage', () => ({
  MarkdownMessage: ({ content }) => <span data-testid="markdown-message">{content}</span>
}));

vi.mock('../components/ModelSwitcher', () => ({
  ModelSwitcher: ({ initialModel }) => <span data-testid="model-switcher">{initialModel}</span>,
  OllamaModelPicker: ({ initialModel }) => <span data-testid="model-picker">{initialModel}</span>,
  ModelProviderPicker: ({ ollamaPicker }) => <div data-testid="model-provider-picker">{ollamaPicker}</div>
}));

vi.mock('../components/ApprovalPanel', () => ({
  ApprovalPanel: () => <div data-testid="approval-panel" />
}));

vi.mock('../components/PipelineResultCard', () => ({
  PipelineResultCard: () => <div data-testid="pipeline-result-card" />
}));

vi.mock('../components/MemorySearch', () => ({
  MemorySearch: () => <div data-testid="memory-search" />
}));

vi.mock('../components/RuntimeNotice', () => ({
  RuntimeNotice: () => <div data-testid="runtime-notice" />
}));

vi.mock('../components/MicrophoneStatus', () => ({
  MicrophoneStatus: () => <div data-testid="microphone-status" />
}));

vi.mock('../components/VoiceInputButton', () => ({
  VoiceInputButton: () => <button data-testid="voice-input-button">Voice</button>
}));

vi.mock('../components/ConnectorStatusIndicators', () => ({
  ConnectorStatusDot: () => <span data-testid="connector-status-dot" />,
  ConnectorStatusStrip: () => <span data-testid="connector-status-strip" />
}));

import { ChatView } from '../components/ChatView';

function makeProps(overrides = {}) {
  return {
    activeChatId: 'default-session',
    settings: { selectedModel: 'llama3.2:3b', colorScheme: 'dark' },
    setConversations: vi.fn(),
    ollamaStatus: { state: 'connected', label: 'Connected', message: 'Connected' },
    installedModels: [{ name: 'llama3.2:3b' }],
    selectedModelMissing: false,
    voice: { voiceStatus: { state: 'idle', privacyLabel: 'Mic Off' }, toggleListening: vi.fn() },
    onGenerationChange: vi.fn(),
    onTaskComplete: vi.fn(),
    onRetryOllama: vi.fn(),
    onJoseExecutionState: vi.fn(),
    onOpenSettings: vi.fn(),
    onModelChange: vi.fn(),
    ...overrides
  };
}

describe('ChatView chat history rehydration (real localStorage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setAgentProvider('alphonso', { provider: 'ollama' });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('shows a previously-saved message on a fresh mount when durable memory is unavailable', async () => {
    localStorage.setItem(
      'alphonso_messages_default-session',
      JSON.stringify([{ id: 1, role: 'user', content: 'store check message zulu' }])
    );

    render(<ChatView {...makeProps()} />);

    await waitFor(() => {
      expect(screen.getByText('store check message zulu')).toBeInTheDocument();
    });
  });
});

describe('ChatView clears messages when activeChatId changes (New Chat isolation)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setAgentProvider('alphonso', { provider: 'ollama' });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('does not keep showing the previous chat\'s messages after switching to a new chat id', async () => {
    localStorage.setItem(
      'alphonso_messages_default-session',
      JSON.stringify([{ id: 1, role: 'user', content: 'session one message' }])
    );

    // setConversations must be a single stable reference across renders here,
    // matching what the real app actually passes (a raw useState setter,
    // guaranteed stable by React) — a fresh vi.fn() per render would itself
    // retrigger the persist effect below and produce a false positive/negative
    // unrelated to the real bug.
    const setConversations = vi.fn();
    const { rerender } = render(<ChatView {...makeProps({ activeChatId: 'default-session', setConversations })} />);
    await waitFor(() => {
      expect(screen.getByText('session one message')).toBeInTheDocument();
    });

    // Simulate what the real app does on "Create new chat": the parent
    // (useAppShellState's createNewChat) flips activeChatId to a brand-new id
    // with no messages of its own yet.
    rerender(<ChatView {...makeProps({ activeChatId: 'chat-1787265437959', setConversations })} />);

    await waitFor(() => {
      expect(screen.queryByText('session one message')).not.toBeInTheDocument();
    });

    // The previous chat's messages must never leak into the new chat's own
    // storage key either (the actual root cause: a persist effect firing
    // with a stale `messages` array in the same commit as the chat switch).
    expect(localStorage.getItem('alphonso_messages_chat-1787265437959')).toBeNull();
  });
});
