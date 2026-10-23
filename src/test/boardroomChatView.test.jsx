import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';

vi.mock('../agents/agentRegistry', () => ({
  listAgentProfiles: () => [
    { id: 'jose', name: 'Jose', accentColor: 'amber' },
    { id: 'hector', name: 'Hector', accentColor: 'violet' }
  ]
}));

vi.mock('../services/boardroomFacilitatorService', () => ({
  generateAlphonsoResponse: vi.fn().mockResolvedValue({ ok: true, text: 'default alphonso reply' }),
  generateAgentResponse: vi.fn().mockResolvedValue({ ok: true, text: 'default agent reply' }),
  detectLowConfidence: vi.fn().mockReturnValue(false)
}));

vi.mock('../services/boardroomThreadService', async () => {
  const actual = await vi.importActual('../services/boardroomThreadService');
  return {
    ...actual,
    addThreadMessage: vi.fn(actual.addThreadMessage)
  };
});

vi.mock('../services/mariaAuditService', () => ({
  runMariaGovernanceAudit: vi.fn()
}));
vi.mock('../services/marcusExecutionService', () => ({
  runMarcusDistribution: vi.fn()
}));
vi.mock('../services/joseCommandRouterService', () => ({
  createJoseCommandRoute: vi.fn()
}));
vi.mock('../services/boardroomJoseService', () => ({
  concludeOnJose: vi.fn(),
  distributeOnJose: vi.fn(),
  creativeBriefOnJose: vi.fn()
}));
vi.mock('../services/unifiedMemoryService.js', () => ({
  pushMemory: vi.fn()
}));

describe('BoardroomChatView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('shows the empty state with no threads', async () => {
    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);
    expect(screen.getByText(/no threads yet/i)).toBeInTheDocument();
  });

  it('creates a thread and shows it in the thread list', async () => {
    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Q3 Growth Plan' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));

    expect(await screen.findByText('Q3 Growth Plan')).toBeInTheDocument();
  });

  it('sends a message as the selected speaker and shows it in the thread', async () => {
    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Test Thread' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Test Thread');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: 'Hello room' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    expect(await screen.findByText('Hello room')).toBeInTheDocument();
  });

  it('shows an @mention autocomplete dropdown when typing @ in the composer', async () => {
    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Mention Test' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Mention Test');

    const composer = screen.getByPlaceholderText(/message the room/i);
    fireEvent.change(composer, { target: { value: '@Hec' } });

    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByRole('option', { name: /hector/i })).toBeInTheDocument();
  });

  it('inserts the selected agent name when an autocomplete option is clicked', async () => {
    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Mention Test 2' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Mention Test 2');

    const composer = screen.getByPlaceholderText(/message the room/i);
    fireEvent.change(composer, { target: { value: '@Hec' } });
    const listbox = await screen.findByRole('listbox');
    fireEvent.click(within(listbox).getByRole('option', { name: /hector/i }));

    expect(composer.value).toBe('@Hector ');
  });

  it('shows a mentioned-agent tag on a sent message that contains an @mention', async () => {
    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Mention Test 3' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Mention Test 3');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: '@Hector please look at this' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    expect(await screen.findByText('→ Hector')).toBeInTheDocument();
  });

  it('triggers Alphonso auto-response when a message has no @mention', async () => {
    const facilitator = await import('../services/boardroomFacilitatorService');
    facilitator.generateAgentResponse.mockResolvedValue({ ok: true, text: 'Got it — pulling in Hector.' });

    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'No Mention Test' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('No Mention Test');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: 'We need a plan.' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    expect(await screen.findByText('Got it — pulling in Hector.')).toBeInTheDocument();
    expect(facilitator.generateAgentResponse).toHaveBeenCalledWith(expect.objectContaining({ agentId: 'alphonso' }));
  });

  it('does not trigger Alphonso auto-response when the message contains an @mention', async () => {
    const facilitator = await import('../services/boardroomFacilitatorService');
    facilitator.generateAgentResponse.mockClear();
    facilitator.generateAgentResponse.mockResolvedValue({ ok: true, text: 'hector reply' });

    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Mentioned Test' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Mentioned Test');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: '@Hector look into this' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await screen.findByText('@Hector look into this');
    expect(facilitator.generateAgentResponse).not.toHaveBeenCalledWith(expect.objectContaining({ agentId: 'alphonso' }));
  });

  it('shows the mentioned agent as thinking while that agent is generating a reply', async () => {
    const facilitator = await import('../services/boardroomFacilitatorService');
    let resolveResponse;
    facilitator.generateAgentResponse.mockImplementation(() => new Promise((resolve) => { resolveResponse = resolve; }));

    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Thinking Identity Test' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Thinking Identity Test');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: '@Hector investigate this' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    expect(await screen.findByText('Hector is thinking…')).toBeInTheDocument();
    expect(screen.queryByText('Alphonso is thinking…')).not.toBeInTheDocument();

    resolveResponse({ ok: true, text: 'Hector reply' });
    expect(await screen.findByText('Hector reply')).toBeInTheDocument();
  });

  it('requests approval via requestApproval before delegating to a Hermes-backed agent, and passes approved:true through once granted (Phase 1b gap fix)', async () => {
    localStorage.setItem('alphonso_agent_provider_v1', JSON.stringify({ hector: { provider: 'hermes', model: 'hermes-agent' } }));
    localStorage.setItem('alphonso_settings', JSON.stringify({ approvalMode: true }));

    const facilitator = await import('../services/boardroomFacilitatorService');
    facilitator.generateAgentResponse.mockResolvedValue({ ok: true, text: 'hector hermes reply' });
    const requestApproval = vi.fn().mockResolvedValue(true);

    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView requestApproval={requestApproval} />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Hermes Approval Test' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Hermes Approval Test');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: '@Hector look into this' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await screen.findByText('hector hermes reply');
    expect(requestApproval).toHaveBeenCalledTimes(1);
    // Regression: the shell's requestApproval destructures an OBJECT. This used
    // to be called with a bare string, leaving actionLabel undefined, which the
    // shell's high-risk label filter then auto-approved without any prompt.
    const arg = requestApproval.mock.calls[0][0];
    expect(typeof arg).toBe('object');
    expect(arg).toMatchObject({ agent: 'hector', riskLevel: 'high', requireApproval: true });
    expect(arg.actionLabel).toMatch(/hector.*hermes/i);
    expect(facilitator.generateAgentResponse).toHaveBeenCalledWith(expect.objectContaining({ agentId: 'hector', approved: true }));
  });

  it('does not call generateAgentResponse when requestApproval resolves false for a Hermes-backed agent', async () => {
    localStorage.setItem('alphonso_agent_provider_v1', JSON.stringify({ hector: { provider: 'hermes', model: 'hermes-agent' } }));
    localStorage.setItem('alphonso_settings', JSON.stringify({ approvalMode: true }));

    const facilitator = await import('../services/boardroomFacilitatorService');
    const requestApproval = vi.fn().mockResolvedValue(false);

    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView requestApproval={requestApproval} />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Hermes Denied Test' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Hermes Denied Test');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: '@Hector look into this' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await screen.findByText(/approval denied/i);
    expect(requestApproval).toHaveBeenCalledTimes(1);
    expect(facilitator.generateAgentResponse).not.toHaveBeenCalled();
  });

  it('does not call requestApproval for a non-Hermes agent (no unnecessary prompting)', async () => {
    const facilitator = await import('../services/boardroomFacilitatorService');
    facilitator.generateAgentResponse.mockResolvedValue({ ok: true, text: 'hector reply' });
    const requestApproval = vi.fn().mockResolvedValue(true);

    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView requestApproval={requestApproval} />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Ollama Test' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Ollama Test');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: '@Hector look into this' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await screen.findByText('hector reply');
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it('shows a visible error message when Alphonso auto-response fails, not a silent swallow', async () => {
    const facilitator = await import('../services/boardroomFacilitatorService');
    facilitator.generateAgentResponse.mockResolvedValue({ ok: false, text: '', error: 'Ollama is not running' });

    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Error Test' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Error Test');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    expect(await screen.findByText(/ollama is not running/i)).toBeInTheDocument();
  });

  it('triggers each mentioned agent to generate a reply, not just Alphonso', async () => {
    const facilitator = await import('../services/boardroomFacilitatorService');
    facilitator.generateAgentResponse.mockImplementation(({ agentId }) =>
      Promise.resolve({ ok: true, text: `${agentId} reply text` })
    );

    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Routing Test' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Routing Test');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: '@Hector look into this' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    expect(await screen.findByText('hector reply text')).toBeInTheDocument();
    expect(facilitator.generateAgentResponse).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'hector' })
    );
    expect(facilitator.generateAgentResponse).not.toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'alphonso' })
    );
  });

  it('triggers each of multiple mentioned agents once, in order', async () => {
    const facilitator = await import('../services/boardroomFacilitatorService');
    const calls = [];
    facilitator.generateAgentResponse.mockImplementation(({ agentId }) => {
      calls.push(agentId);
      return Promise.resolve({ ok: true, text: `${agentId} says hi` });
    });

    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Multi Routing Test' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Multi Routing Test');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: '@Hector and @Jose please weigh in' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await screen.findByText('hector says hi');
    await screen.findByText('jose says hi');
    expect(calls).toEqual(['hector', 'jose']);
  });

  it('renders an escalation message with distinct amber styling, not a normal bubble', async () => {
    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    const { createThread, addThreadMessage } = await import('../services/boardroomThreadService');

    const thread = createThread({ topic: 'Escalation Render Test', participants: ['jose', 'hector'] });
    addThreadMessage({ threadId: thread.id, speaker: 'alphonso', content: 'Round cap reached — please weigh in.', kind: 'escalation' });

    render(<BoardroomChatView />);

    const banner = await screen.findByText('Round cap reached — please weigh in.');
    expect(banner.closest('[data-message-kind="escalation"]')).toBeInTheDocument();
  });

  it('chains a mentioned agent whose reply itself @mentions another agent, within the round cap', async () => {
    const facilitator = await import('../services/boardroomFacilitatorService');
    facilitator.generateAgentResponse.mockImplementation(({ agentId }) => {
      if (agentId === 'hector') return Promise.resolve({ ok: true, text: '@Jose can you route this further?' });
      return Promise.resolve({ ok: true, text: `${agentId} final reply` });
    });

    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Chain Test' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Chain Test');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: '@Hector look into this' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    expect(await screen.findByText('@Jose can you route this further?')).toBeInTheDocument();
    expect(await screen.findByText('jose final reply')).toBeInTheDocument();
  });

  it('stops chaining and posts an escalation message once the round cap is hit', async () => {
    const facilitator = await import('../services/boardroomFacilitatorService');
    facilitator.generateAgentResponse.mockImplementation(({ agentId }) => {
      const next = agentId === 'hector' ? 'jose' : 'hector';
      return Promise.resolve({ ok: true, text: `@${next[0].toUpperCase()}${next.slice(1)} keep going` });
    });

    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Cap Test' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Cap Test');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: '@Hector start the chain' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    const escalation = await screen.findByText(/needs your decision/i);
    expect(escalation).toBeInTheDocument();
    expect(facilitator.generateAgentResponse.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('stops chaining and posts an escalation message once the character budget is exceeded, even under the round cap (G-T20)', async () => {
    const facilitator = await import('../services/boardroomFacilitatorService');
    // A single hop's reply alone exceeds DEFAULT_FANOUT_CHAR_BUDGET (40,000
    // chars) and itself @mentions the next agent, so if only the 3-hop
    // MAX_CHAIN_DEPTH cap existed, this would try to keep chaining.
    const hugeReply = '@Jose '.padEnd(45000, 'x');
    facilitator.generateAgentResponse.mockImplementation(({ agentId }) => {
      if (agentId === 'hector') return Promise.resolve({ ok: true, text: hugeReply });
      return Promise.resolve({ ok: true, text: `${agentId} final reply` });
    });

    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Budget Test' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Budget Test');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: '@Hector start the chain' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    const escalation = await screen.findByText(/character budget/i);
    expect(escalation).toBeInTheDocument();
    // Only the one huge hop ran — the budget cap fired before a 2nd hop,
    // proving this stopped it, not the 3-hop MAX_CHAIN_DEPTH cap.
    expect(facilitator.generateAgentResponse.mock.calls.length).toBe(1);
  });

  it('passes cross-thread context to generateAgentResponse when relevant history exists in another thread', async () => {
    const threadService = await import('../services/boardroomThreadService');
    const facilitator = await import('../services/boardroomFacilitatorService');
    facilitator.generateAgentResponse.mockResolvedValue({ ok: true, text: 'Based on that, yes.' });

    const otherThread = threadService.createThread({ topic: 'Q3 Pricing', participants: ['jose'] });
    threadService.addThreadMessage({ threadId: otherThread.id, speaker: 'jose', content: 'Tiered pricing decided for enterprise renewal contracts.' });

    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Renewal Terms' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Renewal Terms');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: '@Jose what did we decide about renewal pricing contracts?' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await screen.findByText('Based on that, yes.');
    expect(facilitator.generateAgentResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        crossThreadContext: expect.arrayContaining([
          expect.objectContaining({ threadTopic: 'Q3 Pricing' })
        ])
      })
    );
  });

  it('auto-escalates when a generated reply is flagged as low confidence', async () => {
    const facilitator = await import('../services/boardroomFacilitatorService');
    facilitator.generateAgentResponse.mockResolvedValue({ ok: true, text: "I'm not sure about the exact figure." });
    facilitator.detectLowConfidence.mockReturnValue(true);

    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Confidence Test' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Confidence Test');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: '@Hector what is the exact figure?' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await screen.findByText("I'm not sure about the exact figure.");
    const escalation = await screen.findByText(/hector flagged low confidence/i);
    expect(escalation.closest('[data-message-kind="escalation"]')).toBeInTheDocument();
  });

  it('does not escalate when the reply is confident', async () => {
    const facilitator = await import('../services/boardroomFacilitatorService');
    facilitator.generateAgentResponse.mockResolvedValue({ ok: true, text: 'The figure is $49/mo.' });
    facilitator.detectLowConfidence.mockReturnValue(false);

    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Confident Test' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Confident Test');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: '@Hector what is the figure?' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await screen.findByText('The figure is $49/mo.');
    expect(screen.queryByText(/flagged low confidence/i)).not.toBeInTheDocument();
  });

  it('shows a Stop button while generation is in progress and stops further hops when clicked', async () => {
    const facilitator = await import('../services/boardroomFacilitatorService');
    let resolveFirstHop;
    const firstHopPromise = new Promise((resolve) => { resolveFirstHop = resolve; });
    facilitator.generateAgentResponse.mockImplementation(({ agentId }) => {
      if (agentId === 'hector') return firstHopPromise;
      return Promise.resolve({ ok: true, text: 'jose should not be called' });
    });

    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Stop Test' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Stop Test');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: '@Hector look into this' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    const stopButton = await screen.findByRole('button', { name: /^stop$/i });
    fireEvent.click(stopButton);

    resolveFirstHop({ ok: true, text: '@Jose keep going' });

    await screen.findByText(/generation stopped/i);
    expect(screen.queryByText('@Jose keep going')).not.toBeInTheDocument();
    expect(facilitator.generateAgentResponse).not.toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'jose' })
    );
  });

  it('aborts the in-flight generation and does not post its cancelled reply', async () => {
    const facilitator = await import('../services/boardroomFacilitatorService');
    facilitator.generateAgentResponse.mockImplementation(({ signal }) => new Promise((resolve) => {
      signal.addEventListener('abort', () => resolve({ ok: false, text: '', error: 'aborted' }), { once: true });
    }));

    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Abort Test' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Abort Test');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: '@Hector investigate this' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^stop$/i }));

    expect(await screen.findByText(/generation stopped by user/i)).toBeInTheDocument();
    expect(screen.queryByText(/hector couldn't respond: aborted/i)).not.toBeInTheDocument();
  });

  it('does not show a Stop button when nothing is generating', async () => {
    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);
    expect(screen.queryByRole('button', { name: /^stop$/i })).not.toBeInTheDocument();
  });

  it('posts a failure-kind message with retryContext when an agent errors, rendered distinctly with a Retry button', async () => {
    const facilitator = await import('../services/boardroomFacilitatorService');
    facilitator.generateAgentResponse.mockResolvedValue({ ok: false, text: '', error: 'Ollama is not running' });

    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Failure Test' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Failure Test');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: '@Hector status check' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    const failureText = await screen.findByText(/ollama is not running/i);
    expect(failureText.closest('[data-message-kind="failure"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^retry$/i })).toBeInTheDocument();
  });

  it('re-runs generation for that agent when Retry is clicked, posting a new message on success', async () => {
    const facilitator = await import('../services/boardroomFacilitatorService');
    facilitator.generateAgentResponse
      .mockResolvedValueOnce({ ok: false, text: '', error: 'Ollama is not running' })
      .mockResolvedValueOnce({ ok: true, text: 'All systems normal now.' });

    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Retry Test' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Retry Test');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: '@Hector status check' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await screen.findByText(/ollama is not running/i);
    fireEvent.click(screen.getByRole('button', { name: /^retry$/i }));

    expect(await screen.findByText('All systems normal now.')).toBeInTheDocument();
    expect(facilitator.generateAgentResponse).toHaveBeenCalledTimes(2);
    expect(facilitator.generateAgentResponse.mock.calls[1][0]).toEqual(
      expect.objectContaining({ agentId: 'hector', newMessageText: '@Hector status check' })
    );
  });

  it('shows an Acknowledge button on an unacknowledged escalation message, which becomes a static badge once clicked', async () => {
    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    const { createThread, addThreadMessage } = await import('../services/boardroomThreadService');

    const thread = createThread({ topic: 'Ack Test', participants: ['jose', 'hector'] });
    addThreadMessage({ threadId: thread.id, speaker: 'alphonso', content: 'Round cap reached — please weigh in.', kind: 'escalation' });

    render(<BoardroomChatView />);
    await screen.findByText('Round cap reached — please weigh in.');

    const ackButton = screen.getByRole('button', { name: /^acknowledge$/i });
    fireEvent.click(ackButton);

    expect(await screen.findByText(/✓ acknowledged/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^acknowledge$/i })).not.toBeInTheDocument();
  });

  it('does not show an Acknowledge control on a normal (non-escalation) message', async () => {
    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    const { createThread, addThreadMessage } = await import('../services/boardroomThreadService');

    const thread = createThread({ topic: 'Normal Test', participants: ['jose'] });
    addThreadMessage({ threadId: thread.id, speaker: 'jose', content: 'Just a normal update.' });

    render(<BoardroomChatView />);
    await screen.findByText('Just a normal update.');

    expect(screen.queryByRole('button', { name: /^acknowledge$/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/✓ acknowledged/i)).not.toBeInTheDocument();
  });

  it('masks a high-risk (approvalRequired) message behind a Confirm gate until confirmed', async () => {
    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    const { createThread, addThreadMessage } = await import('../services/boardroomThreadService');

    const thread = createThread({ topic: 'Risk Test', participants: ['marcus'] });
    addThreadMessage({ threadId: thread.id, speaker: 'marcus', content: 'Ready to publish this to production.' });

    render(<BoardroomChatView />);

    expect(screen.queryByText('Ready to publish this to production.')).not.toBeInTheDocument();
    expect(await screen.findByText(/proposes a high-risk action/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /confirm to reveal/i }));

    expect(await screen.findByText('Ready to publish this to production.')).toBeInTheDocument();
    expect(screen.getByText(/^confirmed$/i)).toBeInTheDocument();
  });

  it('does not mask a normal (non-approval-required) message', async () => {
    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    const { createThread, addThreadMessage } = await import('../services/boardroomThreadService');

    const thread = createThread({ topic: 'Normal Risk Test', participants: ['jose'] });
    addThreadMessage({ threadId: thread.id, speaker: 'jose', content: 'Just a normal update.' });

    render(<BoardroomChatView />);

    expect(await screen.findByText('Just a normal update.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /confirm to reveal/i })).not.toBeInTheDocument();
  });

  it('shows a model + latency label under a successful agent reply', async () => {
    const facilitator = await import('../services/boardroomFacilitatorService');
    facilitator.generateAgentResponse.mockResolvedValue({ ok: true, text: 'On it.', model: 'llama3.2:3b', latencyMs: 2345 });

    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Latency Test' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Latency Test');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: '@Hector status?' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await screen.findByText('On it.');
    expect(await screen.findByText(/llama3\.2:3b · 2\.3s/i)).toBeInTheDocument();
  });

  it('passes informedByMessageId through the @mention chain to addThreadMessage', async () => {
    const threadService = await import('../services/boardroomThreadService');
    const facilitator = await import('../services/boardroomFacilitatorService');
    facilitator.generateAgentResponse.mockResolvedValue({ ok: true, text: 'On it.' });

    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Chain Test' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Chain Test');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: '@Hector please look at this' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await screen.findByText('On it.');

    await waitFor(() => {
      const replyCall = threadService.addThreadMessage.mock.calls.find(
        ([args]) => args.speaker === 'hector' && args.kind === 'message'
      );
      expect(replyCall).toBeDefined();
      expect(replyCall[0].informedByMessageId).toBeDefined();
    });
  });
});

// Thread actions moved from the old "Boardroom Legacy" tab (owner, 2026-10-21).
// Phase 6a: each thread action is a step in a Jose request (boardroomJoseService).
describe('BoardroomChatView thread actions', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  async function openThread(props = {}) {
    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView {...props} />);
    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Launch plan' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Launch plan');
  }

  async function conclude(review = { riskLevel: 'medium', approvalRequired: false, summary: 'Looks fine.' }) {
    const { concludeOnJose } = await import('../services/boardroomJoseService');
    concludeOnJose.mockResolvedValue({ requestId: 'jose-request-c1', review });
    fireEvent.click(screen.getByRole('button', { name: /^conclude$/i }));
    await screen.findByRole('button', { name: /^concluded$/i });
  }

  async function openSlack() {
    fireEvent.click(screen.getByRole('button', { name: /^distribute$/i }));
    fireEvent.change(screen.getByLabelText('Slack channel'), { target: { value: '#launch' } });
    fireEvent.click(screen.getByRole('button', { name: /post to slack/i }));
  }

  it("Conclude posts Maria's real risk level and summary, with no made-up score", async () => {
    await openThread();
    await conclude({ riskLevel: 'high', approvalRequired: true, summary: 'Needs legal review.' });
    expect(screen.getByText(/Maria's governance review: risk high, approval required before anything is sent out\. Needs legal review\./)).toBeInTheDocument();
    expect(screen.getByTestId('boardroom-governance-badge')).toHaveTextContent('Maria: risk high · approval required');
    expect(screen.queryByText(/risk score/i)).toBeNull();
    const { concludeOnJose } = await import('../services/boardroomJoseService');
    expect(concludeOnJose.mock.calls[0][0]).toBe('Launch plan');
  });

  it("says when the verdict came from Maria's rule-based check, not her model review", async () => {
    await openThread();
    await conclude({ riskLevel: 'low', approvalRequired: false, summary: 'Rule check passed.', confidenceLevel: 'temporary' });
    expect(screen.getByText(/Maria's rule-based check \(her model review could not be read\): risk low\./)).toBeInTheDocument();
    expect(screen.getByTestId('boardroom-governance-badge')).toHaveTextContent('Maria (rule-based): risk low');
  });

  it('a failed review says so and leaves the thread open', async () => {
    await openThread();
    const { concludeOnJose } = await import('../services/boardroomJoseService');
    concludeOnJose.mockRejectedValue(new Error('model unreachable'));
    fireEvent.click(screen.getByRole('button', { name: /^conclude$/i }));
    expect(await screen.findByText(/Maria's review did not complete: model unreachable\. The thread stays open\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^conclude$/i })).not.toBeDisabled();
  });

  it('a review with no verdict also leaves the thread open', async () => {
    await openThread();
    const { concludeOnJose } = await import('../services/boardroomJoseService');
    concludeOnJose.mockResolvedValue({ requestId: null, review: null });
    fireEvent.click(screen.getByRole('button', { name: /^conclude$/i }));
    expect(await screen.findByText(/Maria's review did not complete: Maria returned no review/)).toBeInTheDocument();
  });

  it('Distribute is unavailable until the thread is concluded', async () => {
    await openThread();
    expect(screen.getByRole('button', { name: /^distribute$/i })).toBeDisabled();
  });

  it('review-only distribution says nothing was sent', async () => {
    await openThread();
    await conclude();
    const { distributeOnJose } = await import('../services/boardroomJoseService');
    distributeOnJose.mockResolvedValue({ requestId: 'r', waiting: false, summary: 'Distribution review prepared.' });
    fireEvent.click(screen.getByRole('button', { name: /^distribute$/i }));
    fireEvent.click(screen.getByRole('button', { name: /review only/i }));
    expect(await screen.findByText(/Distribution review only, nothing was sent\. Distribution review prepared\./)).toBeInTheDocument();
    expect(distributeOnJose).toHaveBeenCalledWith('Launch plan', 'Looks fine.', 'review', '');
  });

  it('a Slack post waits for your approval in Jose, and nothing is sent from Boardroom itself', async () => {
    const requestApproval = vi.fn().mockResolvedValue(true);
    await openThread({ requestApproval });
    await conclude();
    const { distributeOnJose } = await import('../services/boardroomJoseService');
    distributeOnJose.mockResolvedValue({ requestId: 'r', waiting: true, summary: '' });
    await openSlack();
    expect(await screen.findByText(/Posting to Slack #launch is waiting for your approval\. Nothing is sent until you approve it\./)).toBeInTheDocument();
    expect(distributeOnJose).toHaveBeenCalledWith('Launch plan', 'Looks fine.', 'slack', '#launch');
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it("reports Marcus's result when the post did not need to wait", async () => {
    await openThread();
    await conclude();
    const { distributeOnJose } = await import('../services/boardroomJoseService');
    distributeOnJose.mockResolvedValue({ requestId: 'r', waiting: false, summary: 'Posted to #launch.' });
    await openSlack();
    expect(await screen.findByText('Posted to #launch.')).toBeInTheDocument();
  });

  it('a failed distribution says nothing was sent', async () => {
    await openThread();
    await conclude();
    const { distributeOnJose } = await import('../services/boardroomJoseService');
    distributeOnJose.mockRejectedValue(new Error('Marcus timed out'));
    await openSlack();
    expect(await screen.findByText(/Distribution failed, nothing was sent: Marcus timed out/)).toBeInTheDocument();
  });

  it("Creative brief shows Miya's brief", async () => {
    await openThread();
    const { creativeBriefOnJose } = await import('../services/boardroomJoseService');
    creativeBriefOnJose.mockResolvedValue({ requestId: 'r', waiting: false, summary: 'A bold launch brief.' });
    fireEvent.click(screen.getByRole('button', { name: /creative brief/i }));
    expect(await screen.findByText('Creative brief: A bold launch brief.')).toBeInTheDocument();
    expect(creativeBriefOnJose.mock.calls[0][0]).toBe('Launch plan');
  });

  it('Creative brief says where to follow it when it waits', async () => {
    await openThread();
    const { creativeBriefOnJose } = await import('../services/boardroomJoseService');
    creativeBriefOnJose.mockResolvedValue({ requestId: 'r', waiting: true, summary: '' });
    fireEvent.click(screen.getByRole('button', { name: /creative brief/i }));
    expect(await screen.findByText(/Miya's creative brief is waiting for your approval\. Follow it on the Orchestrator page, Requests tab\./)).toBeInTheDocument();
  });
});
