import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { setAgentProvider } from '../services/modelSelectionService';

// ── Core Tauri mock ───────────────────────────────────────────────────────────
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null)
}));

// ── Ollama lib mock ───────────────────────────────────────────────────────────
vi.mock('../lib/ollama', () => ({
  generateOllamaChatStream: vi.fn().mockResolvedValue(undefined),
  checkOllama: vi.fn().mockResolvedValue({ ok: true }),
  classifyOllamaError: vi.fn().mockReturnValue({ label: 'Error', message: 'Something went wrong' }),
  OLLAMA_TROUBLESHOOTING_COMMAND: 'ollama serve'
}));

// ── App storage mock ──────────────────────────────────────────────────────────
vi.mock('../lib/appStorage', () => ({
  getStorage: vi.fn().mockImplementation((_key, defaultVal) => defaultVal !== undefined ? defaultVal : null),
  setStorage: vi.fn()
}));

// ── Chat utils mock ───────────────────────────────────────────────────────────
vi.mock('../lib/chatUtils', () => ({
  nextMsgId: vi.fn().mockReturnValue('msg-1'),
  CHAT_ASSISTANT_PROMPT: 'You are a helpful assistant.',
  shouldRouteThroughJose: vi.fn().mockReturnValue(false)
}));

// ── Policy enforcement service mock ──────────────────────────────────────────
vi.mock('../services/policyEnforcementService', () => ({
  getRuntimePolicySettings: vi.fn().mockReturnValue({ previewMode: false }),
  setRuntimePolicySettings: vi.fn().mockResolvedValue(undefined)
}));

// ── Chat persistence service mock ─────────────────────────────────────────────
vi.mock('../services/chatPersistenceService', () => ({
  loadChatMessages: vi.fn().mockResolvedValue([]),
  persistChatMessages: vi.fn().mockResolvedValue(undefined),
  deleteChatMessages: vi.fn().mockResolvedValue(undefined)
}));

// ── Jose execution engine mock ───────────────────────────────────────────────
vi.mock('../services/joseExecutionEngineService', () => ({
  isJoseIntakeCommand: vi.fn().mockReturnValue(false),
  runJoseCommandExecutionPipeline: vi.fn().mockResolvedValue({ commandId: null, executionReceipts: [] })
}));

// ── Orchestration receipt service mock ────────────────────────────────────────
vi.mock('../services/orchestrationReceiptService', () => ({
  listOrchestrationReceipts: vi.fn().mockReturnValue([])
}));

// ── Proactive agent service mock ──────────────────────────────────────────────
vi.mock('../services/proactiveAgentService', () => ({
  startProactiveWatcher: vi.fn().mockReturnValue(() => {})
}));

// ── Keyboard shortcuts hook mock ──────────────────────────────────────────────
vi.mock('../hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: vi.fn(),
  getShortcutList: vi.fn().mockReturnValue([])
}));

// ── Cloud provider connector mocks ────────────────────────────────────────────
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

// Stateful, not a fixed return -- ChatView's syncLegacyProviderIntoAgentStore
// writes settings.selectedProvider into this store via setAgentProvider, and
// its own selectedProvider derivation reads it back via getAgentProvider.
// A fixed-return mock would break every existing test that sets
// settings.selectedProvider to something other than 'ollama', since that
// value would never reach the derived selectedProvider.
vi.mock('../services/modelSelectionService', () => {
  const store = {};
  return {
    getAgentProvider: vi.fn((agentId) => store[agentId] || { provider: 'ollama' }),
    setAgentProvider: vi.fn((agentId, config) => { store[agentId] = config; })
  };
});

// ── Lazy / heavy sub-component mocks ─────────────────────────────────────────
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

// ── Component under test ──────────────────────────────────────────────────────
import { ChatView } from '../components/ChatView';
import { generateOllamaChatStream } from '../lib/ollama';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { sendNvidiaMessage } from '../services/connectors/nvidiaNimConnector';
import { isGeminiConfigured } from '../services/connectors/geminiConnector';
import { isHermesAgentConfigured, sendHermesAgentMessage } from '../services/connectors/hermesAgentConnector';
import { nextMsgId } from '../lib/chatUtils';
import { invoke } from '@tauri-apps/api/core';

// ── Shared props factory ──────────────────────────────────────────────────────
function makeProps(overrides = {}) {
  return {
    activeChatId: 'test-chat-id',
    settings: { selectedModel: 'llama3.2:3b', colorScheme: 'dark' },
    setConversations: vi.fn(),
    ollamaStatus: { state: 'connected', label: 'Connected', message: 'Connected' },
    installedModels: [{ name: 'llama3.2:3b' }],
    selectedModelMissing: false,
    voice: {
      voiceStatus: { state: 'idle', privacyLabel: 'Mic Off' },
      toggleListening: vi.fn()
    },
    onGenerationChange: vi.fn(),
    onTaskComplete: vi.fn(),
    onRetryOllama: vi.fn(),
    onJoseExecutionState: vi.fn(),
    onOpenSettings: vi.fn(),
    onModelChange: vi.fn(),
    ...overrides
  };
}

describe('ChatView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // vi.clearAllMocks() clears call history but not the stateful mock's
    // internal store closure -- reset it explicitly so a test that sets
    // settings.selectedProvider can't leak its choice into a later test
    // that uses makeProps()'s default (undefined) selectedProvider.
    setAgentProvider('alphonso', { provider: 'ollama' });
  });

  it('renders without crashing', () => {
    const { container } = render(<ChatView {...makeProps()} />);
    expect(container.firstChild).toBeTruthy();
  });

  it('shows empty state when no messages', () => {
    render(<ChatView {...makeProps()} />);
    expect(screen.getByText('What can I help you build?')).toBeTruthy();
  });

  it('shows Ollama offline hint when not connected', () => {
    render(
      <ChatView
        {...makeProps({
          ollamaStatus: { state: 'not_running', label: 'Offline', message: 'Not running' }
        })}
      />
    );
    // The placeholder hint below the textarea changes when Ollama is not connected
    expect(screen.getByText(/Start Ollama/i)).toBeTruthy();
  });

  it('shows compact mode by default', () => {
    render(<ChatView {...makeProps()} />);
    const textarea = screen.getByRole('textbox');
    expect(textarea.className).toMatch(/min-h/);
  });

  it('send button is disabled when input is empty', () => {
    render(<ChatView {...makeProps()} />);
    const sendButton = screen.getByRole('button', { name: /send message/i });
    expect(sendButton.disabled).toBe(true);
  });

  it('send button is enabled when user types something', () => {
    render(<ChatView {...makeProps()} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    const sendButton = screen.getByRole('button', { name: /send message/i });
    expect(sendButton.disabled).toBe(false);
  });

  it('abort button not visible when not generating', () => {
    render(<ChatView {...makeProps()} />);
    // The abort/stop button is only rendered when isGenerating is true
    expect(screen.queryByRole('button', { name: /abort and stop/i })).toBeNull();
  });

  it('cancels an active Ollama stream from the stop control', async () => {
    let resolveStream;
    generateOllamaChatStream.mockImplementationOnce(({ signal }) => new Promise((resolve) => {
      resolveStream = resolve;
      expect(signal.aborted).toBe(false);
    }));

    render(<ChatView {...makeProps()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    const stopButton = await screen.findByRole('button', { name: /abort and stop/i });
    fireEvent.click(stopButton);

    await waitFor(() => {
      expect(generateOllamaChatStream.mock.calls[0][0].signal.aborted).toBe(true);
    });
    resolveStream();
  });

  it('cancels an active Ollama stream from the keyboard shortcut', async () => {
    let resolveStream;
    generateOllamaChatStream.mockImplementationOnce(() => new Promise((resolve) => {
      resolveStream = resolve;
    }));

    render(<ChatView {...makeProps()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await screen.findByRole('button', { name: /abort and stop/i });
    useKeyboardShortcuts.mock.calls.at(-1)[0].abort_generation();

    await waitFor(() => {
      expect(generateOllamaChatStream.mock.calls[0][0].signal.aborted).toBe(true);
    });
    resolveStream();
  });

  it('shows model name in placeholder hint when connected', () => {
    render(
      <ChatView
        {...makeProps({
          ollamaStatus: { state: 'connected', label: 'Connected', message: 'Connected' },
          settings: { selectedModel: 'llama3.2:3b', colorScheme: 'dark' }
        })}
      />
    );
    expect(screen.getAllByText(/llama3\.2:3b/).length).toBeGreaterThan(0);
  });

  it('routes generation through sendNvidiaMessage when nvidia_nim is the selected provider', async () => {
    nextMsgId.mockReturnValueOnce('msg-user').mockReturnValueOnce('msg-assistant');
    render(
      <ChatView
        {...makeProps({
          settings: { selectedProvider: 'nvidia_nim', selectedModel: 'meta/llama-3.1-8b-instruct', colorScheme: 'dark' }
        })}
      />
    );
    // ChatView's chat-loading useEffect (unrelated to provider routing) fetches
    // persisted messages on mount and calls setMessages once it settles. In
    // production that resolves long before a user can type and send; in a test
    // that clicks send immediately, it can resolve AFTER generation completes
    // and clobber messages back to []. Let it settle before interacting.
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('kv_get', expect.anything()));

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => {
      expect(sendNvidiaMessage).toHaveBeenCalled();
      expect(generateOllamaChatStream).not.toHaveBeenCalled();
      expect(screen.getByText('Hello from NVIDIA')).toBeTruthy();
    });
  });

  it('routes generation through sendHermesAgentMessage for the alphonso agent when hermes is selected', async () => {
    nextMsgId.mockReturnValueOnce('msg-hermes-user').mockReturnValueOnce('msg-hermes-assistant');
    setAgentProvider('alphonso', { provider: 'hermes' });
    render(
      <ChatView
        {...makeProps({
          settings: { selectedModel: 'hermes-agent', colorScheme: 'dark' }
        })}
      />
    );
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('kv_get', expect.anything()));

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => {
      expect(sendHermesAgentMessage).toHaveBeenCalledWith('alphonso', expect.anything(), expect.objectContaining({ model: 'hermes-agent' }));
      expect(generateOllamaChatStream).not.toHaveBeenCalled();
      expect(screen.getByText('Hello from Hermes')).toBeTruthy();
    });
  });

  it('blocks send with a clear message when Hermes is selected but not configured', async () => {
    nextMsgId.mockReturnValueOnce('msg-hermes-unconf');
    isHermesAgentConfigured.mockReturnValue(false);
    setAgentProvider('alphonso', { provider: 'hermes' });
    render(
      <ChatView
        {...makeProps({
          settings: { selectedModel: 'hermes-agent', colorScheme: 'dark' }
        })}
      />
    );
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('kv_get', expect.anything()));

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => {
      expect(screen.getByText(/Hermes is not configured/i)).toBeTruthy();
    });
    isHermesAgentConfigured.mockReturnValue(true);
  });

  it('shows a policy-blocked message distinct from a generic error when Hermes reports blocked:true', async () => {
    nextMsgId.mockReturnValueOnce('msg-hermes-blocked-user').mockReturnValueOnce('msg-hermes-blocked-assistant');
    sendHermesAgentMessage.mockResolvedValueOnce({ ok: false, blocked: true, message: 'Approval Mode requires confirmation', provider: 'hermes' });
    setAgentProvider('alphonso', { provider: 'hermes' });
    render(
      <ChatView
        {...makeProps({
          settings: { selectedModel: 'hermes-agent', colorScheme: 'dark' }
        })}
      />
    );
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('kv_get', expect.anything()));

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => {
      expect(screen.getByText(/blocked by policy/i)).toBeTruthy();
    });
  });

  it('does not apply a cloud provider result after Stop was clicked mid-request', async () => {
    nextMsgId.mockReturnValueOnce('msg-user-abort').mockReturnValueOnce('msg-assistant-abort');
    let resolveCloud;
    sendNvidiaMessage.mockImplementationOnce(() => new Promise((resolve) => { resolveCloud = resolve; }));
    render(
      <ChatView
        {...makeProps({
          settings: { selectedProvider: 'nvidia_nim', selectedModel: 'meta/llama-3.1-8b-instruct', colorScheme: 'dark' }
        })}
      />
    );
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('kv_get', expect.anything()));

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    const stopButton = await screen.findByRole('button', { name: /abort and stop/i });
    fireEvent.click(stopButton);

    await act(async () => {
      resolveCloud({ ok: true, content: 'Hello from NVIDIA', model: 'meta/llama-3.1-8b-instruct', provider: 'nvidia_nim' });
    });

    await waitFor(() => {
      expect(screen.queryByText('Hello from NVIDIA')).toBeNull();
    });
  });

  it('shows a distinct generic-failure message when a cloud result is ok:false but not rate-limited', async () => {
    nextMsgId.mockReturnValueOnce('msg-user-3').mockReturnValueOnce('msg-assistant-3');
    sendNvidiaMessage.mockResolvedValueOnce({ ok: false, rateLimited: false, status: 500, message: 'server error', provider: 'nvidia_nim' });
    render(
      <ChatView
        {...makeProps({
          settings: { selectedProvider: 'nvidia_nim', selectedModel: 'meta/llama-3.1-8b-instruct', colorScheme: 'dark' }
        })}
      />
    );
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('kv_get', expect.anything()));

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => {
      expect(screen.getByText(/request failed/i)).toBeTruthy();
      expect(screen.queryByText(/rate-limited/i)).toBeNull();
    });
  });

  it('shows a rate-limited message distinct from a generic error when the cloud provider is saturated', async () => {
    nextMsgId.mockReturnValueOnce('msg-user-2').mockReturnValueOnce('msg-assistant-2');
    sendNvidiaMessage.mockResolvedValueOnce({ ok: false, rateLimited: true, status: 429, message: 'quota', provider: 'nvidia_nim' });
    render(
      <ChatView
        {...makeProps({
          settings: { selectedProvider: 'nvidia_nim', selectedModel: 'meta/llama-3.1-8b-instruct', colorScheme: 'dark' }
        })}
      />
    );
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('kv_get', expect.anything()));

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => {
      expect(screen.getByText(/rate-limited/i)).toBeTruthy();
    });
  });

  it('blocks send with a clear message when the selected cloud provider is not configured', async () => {
    nextMsgId.mockReturnValueOnce('msg-3');
    isGeminiConfigured.mockReturnValue(false);
    render(
      <ChatView
        {...makeProps({
          settings: { selectedProvider: 'gemini', selectedModel: 'gemini-2.5-flash-lite', colorScheme: 'dark' }
        })}
      />
    );
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('kv_get', expect.anything()));

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => {
      expect(screen.getByText(/Gemini is not configured/i)).toBeTruthy();
    });
    isGeminiConfigured.mockReturnValue(true);
  });
});
