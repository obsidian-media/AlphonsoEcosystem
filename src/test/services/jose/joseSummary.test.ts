// Requests end with a short summary of each step (agent roles Part A, 2026-10-24).
import { describe, it, expect, beforeEach } from 'vitest';
import { closingSummary } from '../../../services/jose/joseSummary';
import { setStepOutput } from '../../../services/jose/joseStepOutputs';

const request = (steps: any[]): any => ({ id: 'r1', commandId: 'c1', text: 'Research bees and write a post', status: 'waiting_approval', steps });
const s = (stepId: string, agent: string, status: string, extra: Record<string, unknown> = {}) =>
  ({ stepId, agent, actionType: 'x', needs: [], effects: ['read'], status, ...extra });

describe('closingSummary', () => {
  beforeEach(() => localStorage.clear());

  it('gives one line per step, what waits, and points to the board', () => {
    setStepOutput('c1', 'research', 'hector', { summary: 'Found five sources on honeybees. More detail follows.' });
    const text = closingSummary(request([
      s('research', 'hector', 'done'),
      s('post', 'miya', 'waiting_approval', { waitFor: 'Approve the post first.' }),
      s('send', 'marcus', 'failed', { error: 'Slack is not set up.' }),
      s('voice', 'miya', 'setup_needed', { error: 'Install Kokoro in Runtime Hub.' }),
      s('check', 'maria', 'not_run'),
    ]));
    expect(text.split('\n')).toEqual([
      'Hector: Found five sources on honeybees.',
      'Miya: waiting for you (Approve the post first.)',
      'Marcus: failed (Slack is not set up.)',
      'Miya: needs setup (Install Kokoro in Runtime Hub.)',
      'Maria: not run',
      'Waiting for you: 2',
      'Open on the board.',
    ]);
    expect(text).not.toMatch(/Jose merged/);
  });

  it('shows a single step\'s whole answer', () => {
    setStepOutput('c1', 'alphonso', 'alphonso', { summary: 'Dear landlord,\nThe heating is broken.\nThanks.' });
    expect(closingSummary(request([s('alphonso', 'alphonso', 'done')]))).toBe('Dear landlord,\nThe heating is broken.\nThanks.');
  });

  it("shows a single review's hand-over, not its data (agent phase 4)", () => {
    setStepOutput('c1', 'maria', 'maria', {
      summary: 'Risk: low.\nNo rule applies.',
      schema: { kind: 'plan', risk: 'low', needsApproval: false, confidenceLevel: 'inferred', summary: 'Risk: low.' },
    });
    const text = closingSummary(request([s('maria', 'maria', 'done')]));
    expect(text).toBe('Risk: low.\nNo rule applies.');
    expect(text).not.toContain('Confidence Level');
  });

  it("gives a waiting or failed single step's reason, not an empty answer", () => {
    expect(closingSummary(request([s('send', 'marcus', 'waiting_approval')]))).toBe('Marcus: waiting for your approval\nOpen on the board.');
    expect(closingSummary(request([s('send', 'marcus', 'failed', { error: 'No key.' })]))).toBe('Marcus: failed (No key.)\nOpen on the board.');
  });
});

// Jose phase 7: a stopped request says so first.
describe('closingSummary of a stopped request', () => {
  beforeEach(() => localStorage.clear());
  it('starts with "Stopped by you." and names the stopped step', () => {
    const text = closingSummary({ ...request([s('a', 'alphonso', 'done'), s('b', 'alphonso', 'stopped'), s('c', 'maria', 'not_run')]), status: 'stopped' });
    expect(text.split('\n').slice(0, 4)).toEqual(['Stopped by you.', 'Alphonso: done', 'Alphonso: stopped', 'Maria: not run']);
  });
});
