// Agent phase 3: after Maria reviews a plan, Chat offers to have Marcus prepare it (nothing is sent).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const submit = vi.fn();
vi.mock('../../services/jose/submitToJose', () => ({ submitStepsToJose: (...a) => submit(...a) }));

import { MariaOfferButton, MARIA_OFFER_LABEL } from '../../components/maria/MariaOfferButton';
import { createJoseRequest } from '../../services/jose/joseRequestStore';
import { setStepOutput } from '../../services/jose/joseStepOutputs';

function seed(offer) {
  localStorage.clear();
  createJoseRequest({ commandId: 'c1', source: 'user', text: 'Audit this plan: email all customers a discount code', kind: 'normal', steps: [
    { stepId: 'maria', agent: 'maria', actionType: 'governance_audit', effects: ['read'], needs: [] },
  ] });
  setStepOutput('c1', 'maria', 'maria', { summary: 'Risk: medium.', schema: { kind: 'plan', risk: 'medium', why: 'It emails customers.', points: ['Ask them first.'], offer } });
  return 'jose-request-c1';
}

beforeEach(() => submit.mockReset());

describe('MariaOfferButton', () => {
  it('shows the offer when her review has one', () => {
    render(<MariaOfferButton requestId={seed('draft the email for you to check')} />);
    expect(screen.getByRole('button', { name: /Have Marcus prepare this/ })).toBeTruthy();
    expect(screen.getByText(/draft the email for you to check/)).toBeTruthy();
  });

  it('nothing without an offer', () => {
    const { container } = render(<MariaOfferButton requestId={seed('')} />);
    expect(container.textContent).toBe('');
  });

  it('pressing it asks Marcus to prepare, sending nothing', async () => {
    submit.mockResolvedValueOnce({ ok: true, requestId: 'jose-request-c2', userReport: { summary: 'Marcus: ready.' } });
    const onReply = vi.fn();
    render(<MariaOfferButton requestId={seed('draft the email')} onReply={onReply} />);
    fireEvent.click(screen.getByRole('button', { name: /Have Marcus prepare this/ }));
    await waitFor(() => expect(submit).toHaveBeenCalled());
    const call = submit.mock.calls[0][0];
    expect(MARIA_OFFER_LABEL).toBe("Asked from Maria's review.");
    expect(call.label).toBe(MARIA_OFFER_LABEL);
    expect(call.steps).toEqual([expect.objectContaining({ agent: 'marcus', actionType: 'distribution_readiness', effects: ['read'], needs: [] })]);
    expect(call.text).toContain('email all customers a discount code');
    expect(call.text).toContain('draft the email');
    await waitFor(() => expect(onReply).toHaveBeenCalledWith('Marcus: ready.', 'jose-request-c2'));
  });
});
