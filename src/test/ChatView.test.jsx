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
  shouldRouteThroughJose: vi.fn().mockReturnValue(false),
  shouldRouteThroughCalleMcp: vi.fn().mockReturnValue(false)
}));

// ── CALL-E MCP outreach service mock ─────────────────────────────────────────
vi.mock('../services/calleMcpOutreachService', () => ({
  getMcpOutreachRecord: vi.fn().mockResolvedValue(null),
  isAwaitingMcpOutreachInput: vi.fn().mockReturnValue(false),
  handleMcpOutreachMessage: vi.fn().mockResolvedValue(''),
  confirmMcpOutreachCall: vi.fn().mockResolvedValue(''),
  cancelMcpOutreachCall: vi.fn().mockResolvedValue(''),
  markMcpOutreachDelivered: vi.fn().mockResolvedValue(undefined)
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

// ── Jose's decision and entry point (phase 2): direct by default ─────────────
vi.mock('../services/jose/joseDecision', () => ({
  decideJoseRoute: vi.fn().mockResolvedValue({ route: 'direct', source: 'rule', reason: 'test' })
}));
vi.mock('../services/jose/submitToJose', () => ({
  submitToJose: vi.fn().mockResolvedValue({ commandId: null, executionReceipts: [], plan: null, planNote: 'Planned fresh.' }),
  runApprovedPlan: vi.fn().mockResolvedValue({ ok: true, commandId: null, executionReceipts: [], requestId: 'r', command: { userReport: { summary: 'The plan ran.' } }, planNote: 'Planned fresh.' }),
  cancelPlan: vi.fn()
}));

// ── Agent bus service mock ───────────────────────────────────────────────────
vi.mock('../services/agentBusService', () => ({
  approvePacket: vi.fn(),
  rejectPacket: vi.fn(),
  getPacketById: vi.fn()
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

const approvalPanelCalls = vi.hoisted(() => ({ props: null }));

vi.mock('../components/ApprovalPanel', () => ({
  ApprovalPanel: (props) => {
    approvalPanelCalls.props = props;
    return <div data-testid="approval-panel" />;
  }
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
import { approvePacket, rejectPacket, getPacketById } from '../services/agentBusService';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { sendNvidiaMessage } from '../services/connectors/nvidiaNimConnector';
import { isGeminiConfigured } from '../services/connectors/geminiConnector';
import { isHermesAgentConfigured, sendHermesAgentMessage } from '../services/connectors/hermesAgentConnector';
import { nextMsgId, shouldRouteThroughCalleMcp } from '../lib/chatUtils';
import { invoke } from '@tauri-apps/api/core';
import { getMcpOutreachRecord, isAwaitingMcpOutreachInput, handleMcpOutreachMessage } from '../services/calleMcpOutreachService';
import { loadChatMessages } from '../services/chatPersistenceService';
import { listOrchestrationReceipts } from '../services/orchestrationReceiptService';
import { decideJoseRoute } from '../services/jose/joseDecision';
import { submitToJose, runApprovedPlan } from '../services/jose/submitToJose';
import { createWaitingPlanRequest } from '../services/jose/joseRequestStore';

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

  // Owner, 2026-10-22 (QA Q7): a thinking model's reasoning shows folded
  // above the answer, and Settings can hide it.
  it("shows a thinking model's reasoning folded, and hides it when the setting is off", async () => {
    const reply = ({ onThinking, onToken }) => { onThinking?.('2+3 makes 5.'); onToken?.('Five.', 'Five.'); return Promise.resolve('Five.'); };
    generateOllamaChatStream.mockImplementationOnce(reply);
    const { unmount } = render(<ChatView {...makeProps()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'What is 2+3?' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));
    const thinking = await screen.findByTestId('chat-message-thinking');
    expect(thinking.tagName).toBe('DETAILS');
    expect(thinking.textContent).toContain('2+3 makes 5.');
    unmount();
    localStorage.clear();

    generateOllamaChatStream.mockImplementationOnce(reply);
    render(<ChatView {...makeProps({ settings: { selectedModel: 'qwen3:0.6b', colorScheme: 'dark', showModelThinking: false } })} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'What is 2+3?' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));
    await waitFor(() => expect(generateOllamaChatStream).toHaveBeenCalledTimes(2));
    await screen.findAllByText('Five.');
    expect(screen.queryByTestId('chat-message-thinking')).toBeNull();
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

  it('maps pendingApprovals to itemId and wires approve/reject/detail callbacks for ApprovalPanel', async () => {
    decideJoseRoute.mockResolvedValueOnce({ route: 'plan', source: 'model', reason: 'test' });
    submitToJose.mockResolvedValueOnce({
      commandId: 'cmd-1',
      pendingApprovalCount: 1,
      executionReceipts: [
        { packetId: 'pkt-1', agent: 'marcus', status: 'approval_required', reason: 'External publish requires approval' }
      ]
    });
    getPacketById.mockReturnValue({
      id: 'pkt-1',
      payload: { assignment: { agent: 'marcus', actionType: 'external_publish', riskLevel: 'high' } }
    });

    render(<ChatView {...makeProps()} />);
    // Wait for the async chat-history hydration effect to settle before sending --
    // otherwise its setMessages([]) can land after our send and wipe the messages
    // this test is about to add.
    await screen.findByText('What can I help you build?');

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'do the risky thing' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await screen.findByTestId('approval-panel');

    const props = approvalPanelCalls.props;
    expect(props.pendingApprovals).toEqual([
      expect.objectContaining({ itemId: 'pkt-1', packetId: 'pkt-1', agent: 'marcus' })
    ]);

    props.onApprove('pkt-1');
    expect(approvePacket).toHaveBeenCalledWith('pkt-1', 'chatview-inline');

    props.onReject('pkt-1');
    expect(rejectPacket).toHaveBeenCalledWith('pkt-1', 'Rejected from chat inline approval');

    expect(props.getItemDetail('pkt-1')).toEqual({ agent: 'marcus', actionType: 'external_publish', riskLevel: 'high' });
  });

  describe('Jose command path', () => {
    async function sendJoseCommand(text) {
      render(<ChatView {...makeProps()} />);
      await screen.findByText('What can I help you build?');
      fireEvent.change(screen.getByRole('textbox'), { target: { value: text } });
      fireEvent.click(screen.getByRole('button', { name: /send message/i }));
    }

    beforeEach(() => {
      localStorage.clear();
      decideJoseRoute.mockResolvedValue({ route: 'plan', source: 'model', reason: 'test' });
    });

    afterEach(() => {
      decideJoseRoute.mockResolvedValue({ route: 'direct', source: 'rule', reason: 'test' });
      listOrchestrationReceipts.mockReturnValue([]);
    });

    it('shows an error reply and a warning state when the pipeline throws', async () => {
      nextMsgId.mockReturnValueOnce('jose-err-user').mockReturnValueOnce('jose-err-reply');
      submitToJose.mockRejectedValueOnce(new Error('pipeline exploded'));
      const props = makeProps();
      render(<ChatView {...props} />);
      await screen.findByText('What can I help you build?');
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'build the thing' } });
      fireEvent.click(screen.getByRole('button', { name: /send message/i }));

      await screen.findByText(/Jose orchestration failed\.[\s\S]*pipeline exploded/);
      expect(props.onJoseExecutionState).toHaveBeenCalledWith('warning', 'Jose orchestration failed.');
      expect(props.onTaskComplete).not.toHaveBeenCalled();
      expect(props.onGenerationChange).toHaveBeenLastCalledWith(false);
    });

    it('loads receipts for the command, reports completion and shows Hector sources', async () => {
      nextMsgId.mockReturnValueOnce('jose-ok-user').mockReturnValueOnce('jose-ok-reply');
      submitToJose.mockResolvedValueOnce({
        commandId: 'cmd-ok',
        pendingApprovalCount: 0,
        executionReceipts: [],
        command: { userReport: { summary: 'Research finished.' } }
      });
      listOrchestrationReceipts.mockReturnValue([
        { agent: 'hector', details: { sources: [{ url: 'https://example.org/report', title: 'Example report' }] } }
      ]);
      const props = makeProps();
      render(<ChatView {...props} />);
      await screen.findByText('What can I help you build?');
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'research the thing' } });
      fireEvent.click(screen.getByRole('button', { name: /send message/i }));

      await screen.findByText('Example report');
      expect(listOrchestrationReceipts).toHaveBeenCalledWith({ commandId: 'cmd-ok' });
      expect(props.onJoseExecutionState).toHaveBeenCalledWith('task_complete', 'Jose completed routing and merged reports.');
      expect(props.onTaskComplete).toHaveBeenCalledTimes(1);
      const saved = JSON.parse(localStorage.getItem('alphonso_jose_pipeline_v1_test-chat-id'));
      expect(saved.pipelineCommandText).toBe('research the thing');
      expect(saved.executionReceipts).toHaveLength(1);
    });

    // QA Bug 57 (2026-10-22): when Jose stopped early, chat said "Jose
    // processed the command." and dropped his reason.
    it("shows Jose's reason when he stops before doing anything", async () => {
      nextMsgId.mockReturnValueOnce('jose-stop-user').mockReturnValueOnce('jose-stop-reply');
      submitToJose.mockResolvedValueOnce({
        ok: false,
        reason: "Making videos from chat isn't available yet. Nothing was started.",
        needsRuntime: false,
        notAvailable: true,
        command: null
      });
      await sendJoseCommand('make a video of a cat');
      expect(await screen.findByText(/Making videos from chat isn't available yet\. Nothing was started\./)).toBeInTheDocument();
      expect(screen.queryByText('Jose processed the command.')).toBeNull();
    });

    it('still saves the run and completes when the pipeline returns no command id', async () => {
      nextMsgId.mockReturnValueOnce('jose-none-user').mockReturnValueOnce('jose-none-reply');
      submitToJose.mockResolvedValueOnce({ commandId: null, executionReceipts: [] });
      await sendJoseCommand('do a quick thing');

      await waitFor(() => {
        expect(localStorage.getItem('alphonso_jose_pipeline_v1_test-chat-id')).not.toBeNull();
      });
      expect(listOrchestrationReceipts).not.toHaveBeenCalled();
      const saved = JSON.parse(localStorage.getItem('alphonso_jose_pipeline_v1_test-chat-id'));
      expect(saved.executionReceipts).toEqual([]);
    });
  });

  it('keeps a message sent while chat-history hydration is still in flight (does not get clobbered once it resolves)', async () => {
    nextMsgId.mockReturnValueOnce('msg-race');
    let resolveLoad;
    loadChatMessages.mockImplementationOnce(() => new Promise((resolve) => { resolveLoad = resolve; }));

    render(<ChatView {...makeProps()} />);

    // Send a message while loadChatMessages() for this activeChatId is still pending --
    // this is exactly the race the fix in ChatView.tsx's hydration effect guards against.
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'sent during load' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));
    await screen.findByText('sent during load');

    // Now let the persisted-history load resolve with unrelated prior history. Before the fix,
    // this plain `setMessages(durable)` would silently wipe out the message just sent above.
    await act(async () => {
      resolveLoad([{ id: 'old-1', role: 'assistant', content: 'earlier persisted reply' }]);
    });

    await screen.findByText('earlier persisted reply');
    expect(screen.getByText('sent during load')).toBeTruthy();
  });

  describe('CALL-E MCP conversational routing', () => {
    beforeEach(() => {
      getMcpOutreachRecord.mockResolvedValue(null);
      isAwaitingMcpOutreachInput.mockReturnValue(false);
      shouldRouteThroughCalleMcp.mockReturnValue(false);
      handleMcpOutreachMessage.mockResolvedValue('What phone number should I call?');
    });

    it('routes a call-like message to handleMcpOutreachMessage instead of the normal Ollama path', async () => {
      shouldRouteThroughCalleMcp.mockReturnValue(true);
      render(<ChatView {...makeProps()} />);
      await screen.findByText('What can I help you build?');

      fireEvent.change(screen.getByRole('textbox'), { target: { value: "call Joe's Pizza and ask about their website" } });
      fireEvent.click(screen.getByRole('button', { name: /send message/i }));

      await waitFor(() => {
        expect(handleMcpOutreachMessage).toHaveBeenCalledWith('test-chat-id', "call Joe's Pizza and ask about their website");
      });
      await screen.findByText('What phone number should I call?');
      expect(generateOllamaChatStream).not.toHaveBeenCalled();
    });

    it('routes the next message through handleMcpOutreachMessage while a record is awaiting input, even if the text itself would not match shouldRouteThroughCalleMcp', async () => {
      getMcpOutreachRecord.mockResolvedValue({ chatId: 'test-chat-id', stage: 'clarifying' });
      isAwaitingMcpOutreachInput.mockReturnValue(true);
      shouldRouteThroughCalleMcp.mockReturnValue(false);
      handleMcpOutreachMessage.mockResolvedValue('Got it, checking availability.');

      render(<ChatView {...makeProps()} />);
      await screen.findByText('What can I help you build?');

      fireEvent.change(screen.getByRole('textbox'), { target: { value: '+15550123456' } });
      fireEvent.click(screen.getByRole('button', { name: /send message/i }));

      await waitFor(() => {
        expect(handleMcpOutreachMessage).toHaveBeenCalledWith('test-chat-id', '+15550123456');
      });
      expect(generateOllamaChatStream).not.toHaveBeenCalled();
    });

    it('does not intercept an unrelated message once the record has moved to in_progress', async () => {
      getMcpOutreachRecord.mockResolvedValue({ chatId: 'test-chat-id', stage: 'in_progress' });
      isAwaitingMcpOutreachInput.mockReturnValue(false);
      shouldRouteThroughCalleMcp.mockReturnValue(false);

      render(<ChatView {...makeProps()} />);
      await screen.findByText('What can I help you build?');

      fireEvent.change(screen.getByRole('textbox'), { target: { value: "what's the weather" } });
      fireEvent.click(screen.getByRole('button', { name: /send message/i }));

      await waitFor(() => {
        expect(generateOllamaChatStream).toHaveBeenCalled();
      });
      expect(handleMcpOutreachMessage).not.toHaveBeenCalled();
    });
  });

});

// Phase 2 of the Jose redesign (2026-10-23): everything goes to Jose, who
// decides whether to answer directly or plan.
describe('ChatView: everything goes to Jose', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAgentProvider('alphonso', { provider: 'ollama' });
  });

  const send = (text) => {
    fireEvent.change(screen.getByRole('textbox'), { target: { value: text } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));
  };

  it('streams a direct answer when Jose decides to answer', async () => {
    decideJoseRoute.mockResolvedValueOnce({ route: 'direct', source: 'model', reason: 'chat' });
    generateOllamaChatStream.mockImplementationOnce(({ onToken }) => { onToken?.('Hi!', 'Hi!'); return Promise.resolve('Hi!'); });
    render(<ChatView {...makeProps()} />);
    send('Thanks, that helps');
    await waitFor(() => expect(generateOllamaChatStream).toHaveBeenCalled());
    expect(decideJoseRoute).toHaveBeenCalledWith('Thanks, that helps', expect.anything());
    expect(submitToJose).not.toHaveBeenCalled();
  });

  it('hands the request to Jose when he decides to plan, and shows how he planned', async () => {
    decideJoseRoute.mockResolvedValueOnce({ route: 'plan', source: 'model', reason: 'work' });
    render(<ChatView {...makeProps()} />);
    send('Make a launch video for my app');
    await waitFor(() => expect(submitToJose).toHaveBeenCalled());
    expect(submitToJose.mock.calls[0][0]).toMatchObject({ text: 'Make a launch video for my app', source: 'user', planFresh: false });
    expect(Array.isArray(submitToJose.mock.calls[0][0].history)).toBe(true);
    expect(await screen.findByText(/Planned fresh\./)).toBeTruthy();
    expect(generateOllamaChatStream).not.toHaveBeenCalled();
  });

  it('"Plan this fresh:" asks Jose to skip templates, without a decision', async () => {
    render(<ChatView {...makeProps()} />);
    send('Plan this fresh: research our competitors');
    await waitFor(() => expect(submitToJose).toHaveBeenCalled());
    expect(submitToJose.mock.calls[0][0]).toMatchObject({ text: 'research our competitors', planFresh: true });
    expect(decideJoseRoute).not.toHaveBeenCalled();
  });

  it('ignores a second send while Jose is still deciding', async () => {
    let decide;
    decideJoseRoute.mockImplementationOnce(() => new Promise((resolve) => { decide = resolve; }));
    render(<ChatView {...makeProps()} />);
    send('Make a launch video for my app');
    await waitFor(() => expect(decideJoseRoute).toHaveBeenCalledTimes(1));
    send('Make a launch video for my app');
    await new Promise((r) => setTimeout(r, 50));
    expect(decideJoseRoute).toHaveBeenCalledTimes(1);
    decide({ route: 'plan', source: 'model', reason: 'work' });
    await waitFor(() => expect(submitToJose).toHaveBeenCalledTimes(1));
  });

  it('leaves Direct mode alone: no decision, no plan', async () => {
    generateOllamaChatStream.mockImplementationOnce(({ onToken }) => { onToken?.('Ok', 'Ok'); return Promise.resolve('Ok'); });
    render(<ChatView {...makeProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /direct mode off/i }));
    send('Make a launch video for my app');
    await waitFor(() => expect(generateOllamaChatStream).toHaveBeenCalled());
    expect(decideJoseRoute).not.toHaveBeenCalled();
    expect(submitToJose).not.toHaveBeenCalled();
  });

  // Phase 3 (2026-10-23): bigger requests show their plan first.
  it('shows the plan card for a plan that waits, and runs it from Chat', async () => {
    const waiting = createWaitingPlanRequest({
      text: 'Research and judge', source: 'user', kind: 'normal',
      steps: [
        { stepId: 'facts', agent: 'hector', actionType: 'research_report', effects: ['read'], needs: [], instruction: 'Find the facts.' },
        { stepId: 'value', agent: 'nova', actionType: 'analysis_findings', effects: ['read'], needs: ['facts'], instruction: 'Judge them.' },
      ],
      plan: { source: 'fresh', templateId: null, note: '' }, runOptions: { source: 'user' },
    });
    decideJoseRoute.mockResolvedValueOnce({ route: 'plan', source: 'model', reason: 'work' });
    submitToJose.mockResolvedValueOnce({ ok: true, waitingForPlan: true, requestId: waiting.id, plan: null, planNote: 'Planned fresh.', executionReceipts: [] });
    const onOpenJoseBoard = vi.fn();
    render(<ChatView {...makeProps({ onOpenJoseBoard })} />);
    send('Research and judge');
    const card = await screen.findByTestId('jose-plan-card');
    expect(card.querySelectorAll('[data-testid="jose-plan-step"]')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Edit on the board' }));
    expect(onOpenJoseBoard).toHaveBeenCalledWith(waiting.id);
    fireEvent.click(screen.getByRole('button', { name: 'Run this plan' }));
    await waitFor(() => expect(runApprovedPlan).toHaveBeenCalledWith(waiting.id, expect.anything()));
    expect(await screen.findByText(/The plan ran\./)).toBeTruthy();
  });

  it('passes the plan-first setting to Jose', async () => {
    decideJoseRoute.mockResolvedValueOnce({ route: 'plan', source: 'model', reason: 'work' });
    render(<ChatView {...makeProps({ settings: { selectedModel: 'llama3.2:3b', colorScheme: 'dark', showPlanFirst: 'always' } })} />);
    send('Make a launch video for my app');
    await waitFor(() => expect(submitToJose).toHaveBeenCalled());
    expect(submitToJose.mock.calls[0][0].showPlanFirst).toBe('always');
  });
});
