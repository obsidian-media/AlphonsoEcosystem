// Agent phase 5: a send from outside a Jose request is one Marcus step, approved like any other.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../services/jose/submitToJose', () => ({ submitStepsToJose: vi.fn(async () => ({ ok: true, commandId: 'k1' })) }));

import { submitStepsToJose } from '../../../services/jose/submitToJose';
import { askMarcusToSend, MARCUS_LABEL } from '../../../services/marcus/askMarcus';

beforeEach(() => vi.clearAllMocks());

describe('askMarcusToSend', () => {
  it('one Marcus step with the text and destination, labelled by who asked', async () => {
    const r = await askMarcusToSend({ text: 'Open Saturday.', connector: 'slack', target: '#news', source: 'Project Execution' });
    expect(r).toEqual({ ok: true, requestId: 'jose-request-k1' });
    const call = vi.mocked(submitStepsToJose).mock.calls[0][0] as any;
    expect(call.label).toBe('Steps set by Project Execution.');
    expect(call.steps).toEqual([expect.objectContaining({
      stepId: 'marcus', agent: 'marcus', actionType: 'distribution_execution', effects: ['publish_or_send'], needs: [],
      payload: { text: 'Open Saturday.', connector: 'slack', target: '#news' },
    })]);
    expect(MARCUS_LABEL('Content Empire')).toBe('Steps set by Content Empire.');
  });

  it('a release is a distribution_release step', async () => {
    await askMarcusToSend({ text: 'Fixed login.', connector: 'github', target: 'acme/shop', kind: 'release', title: 'v1.2.0', source: 'Project Execution' });
    expect((vi.mocked(submitStepsToJose).mock.calls[0][0] as any).steps[0].actionType).toBe('distribution_release');
  });

  it('no text → nothing asked', async () => {
    expect(await askMarcusToSend({ text: '  ', source: 'x' })).toEqual({ ok: false, reason: 'Nothing to send: there is no text.' });
    expect(submitStepsToJose).not.toHaveBeenCalled();
  });
});
