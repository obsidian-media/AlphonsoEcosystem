import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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

// ── Lazy / heavy sub-component mocks ─────────────────────────────────────────
vi.mock('../components/MarkdownMessage', () => ({
  MarkdownMessage: ({ content }) => <span data-testid="markdown-message">{content}</span>
}));

vi.mock('../components/ModelSwitcher', () => ({
  ModelSwitcher: ({ initialModel }) => <span data-testid="model-switcher">{initialModel}</span>,
  OllamaModelPicker: ({ initialModel }) => <span data-testid="model-picker">{initialModel}</span>
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
  });

  it('renders without crashing', () => {
    const { container } = render(<ChatView {...makeProps()} />);
    expect(container.firstChild).toBeTruthy();
  });

  it('shows empty state when no messages', () => {
    render(<ChatView {...makeProps()} />);
    expect(screen.getByText('Start a conversation')).toBeTruthy();
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
});
