import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

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

    await screen.findByText('@Jose keep going');
    await screen.findByText(/generation stopped/i);
    expect(facilitator.generateAgentResponse).not.toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'jose' })
    );
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
});
