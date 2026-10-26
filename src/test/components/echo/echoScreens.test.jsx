// Agent phase 7: see, edit and forget Echo's decisions; apply a cleanup.
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../services/memoryGraphService', () => ({ addNode: vi.fn(async () => null), addEdge: vi.fn(async () => null) }));
vi.mock('../../../services/echo/echoPicks', () => ({
  applyCleanupStep: vi.fn(async () => ({ ok: true, summary: 'Applied 1 changes to memory.' })),
  dismissCleanupStep: vi.fn(async () => ({ ok: true, summary: 'Left memory as it is.' })),
  pickForget: vi.fn(async () => ({ ok: true, summary: 'Forgot: A.' })),
}));

import { EchoRemembered } from '../../../components/echo/EchoRemembered';
import { DecisionsPanel } from '../../../components/echo/DecisionsPanel';
import { CleanupProposals } from '../../../components/echo/CleanupProposals';
import { addDecision, forgetDecision, getDecision } from '../../../services/echo/decisions';
import { saveCleanupSet } from '../../../services/echo/cleanup';
import { applyCleanupStep, dismissCleanupStep } from '../../../services/echo/echoPicks';

const add = (text, extra = {}) => addDecision({ kind: 'decision', text, topics: [], source: { surface: 'chat', by: 'you', requestId: 'r1' }, ...extra });

beforeEach(() => {
  localStorage.clear();
  vi.mocked(applyCleanupStep).mockClear();
  vi.mocked(dismissCleanupStep).mockClear();
});

describe('EchoRemembered', () => {
  it("shows what Echo remembered from the request; Forget removes it", async () => {
    const d = add('The launch is on Friday.');
    add('Something from another request.', { source: { surface: 'chat', by: 'you', requestId: 'r2' } });
    render(<EchoRemembered requestId="r1" />);
    const box = screen.getByTestId('echo-remembered');
    expect(box.textContent).toContain('Echo remembered: The launch is on Friday.');
    expect(box.textContent).not.toContain('another request');
    fireEvent.click(screen.getByRole('button', { name: 'Forget' }));
    await waitFor(() => expect(screen.queryByTestId('echo-remembered')).toBeNull());
    expect(getDecision(d.id).status).toBe('forgotten');
  });

  it('Edit saves the new text', async () => {
    const d = add('The launch is on Friday.');
    render(<EchoRemembered requestId="r1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Decision text'), { target: { value: 'The launch is on Saturday.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(getDecision(d.id).text).toBe('The launch is on Saturday.'));
    expect(screen.getByTestId('echo-remembered').textContent).toContain('The launch is on Saturday.');
  });

  it('shows nothing when Echo remembered nothing', () => {
    const { container } = render(<EchoRemembered requestId="r9" />);
    expect(container.textContent).toBe('');
  });
});

describe('DecisionsPanel', () => {
  it('lists active decisions, labels preferences, and shows forgotten ones only with the switch', () => {
    add('The launch is on Friday.');
    addDecision({ kind: 'preference', text: 'Short emails, no emojis.', topics: [], appliesTo: ['all'], source: { surface: 'chat', by: 'you' } });
    const gone = add('Old price $19.');
    forgetDecision(gone.id);
    render(<DecisionsPanel />);
    const panel = screen.getByTestId('echo-decisions');
    expect(panel.textContent).toContain('The launch is on Friday.');
    expect(panel.textContent).toContain('Preference — applies to everyone');
    expect(panel.textContent).not.toContain('Old price $19.');
    fireEvent.click(screen.getByLabelText('Show replaced and forgotten'));
    expect(screen.getByTestId('echo-decisions').textContent).toContain('Old price $19.');
  });

  it('says so when nothing is saved', () => {
    render(<DecisionsPanel />);
    expect(screen.getByTestId('echo-decisions').textContent).toContain('Nothing saved yet.');
  });
});

describe('CleanupProposals', () => {
  const set = () => saveCleanupSet({ requestId: 'r1', proposals: [
    { id: 'p0', kind: 'drop', ids: ['d1'], reason: 'It is stale.' },
    { id: 'p1', kind: 'merge', ids: ['d2', 'd3'], text: 'Launch Friday.', reason: 'They say the same.' },
  ] });

  it('Apply sends only the ticked proposals', async () => {
    const s = set();
    render(<CleanupProposals requestId="r1" stepId="echo" setId={s.id} />);
    expect(screen.getByTestId('echo-cleanup').textContent).toContain('It is stale.');
    fireEvent.click(screen.getByLabelText('They say the same.'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(applyCleanupStep).toHaveBeenCalledWith('r1', 'echo', ['p0']));
  });

  it('Not now changes nothing', async () => {
    const s = set();
    render(<CleanupProposals requestId="r1" stepId="echo" setId={s.id} />);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(dismissCleanupStep).toHaveBeenCalledWith('r1', 'echo'));
    expect(applyCleanupStep).not.toHaveBeenCalled();
  });
});
