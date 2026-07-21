import { describe, it, expect } from 'vitest';
import { evaluateAction, getPolicyRules } from '../../services/policyDslService';

describe('policyDslService — connector risk tiering', () => {
  it('classifies irreversible publish as require_consent (not allow)', () => {
    const r = evaluateAction('external_publish', { connectorId: 'youtube', target: 'external' });
    expect(r.effect).toBe('require_consent');
    expect(r.allowed).toBe(false);
    expect(r.ruleId).toBe('require_consent_connector_publish');
  });

  it('classifies paid connector sends as require_consent (not allow)', () => {
    const r = evaluateAction('paid_connector_send', { connectorId: 'claude', target: 'external' });
    expect(r.effect).toBe('require_consent');
    expect(r.allowed).toBe(false);
    expect(r.ruleId).toBe('require_consent_connector_paid');
  });

  it('allows low-risk external actions via the catch-all', () => {
    for (const action of ['external_send', 'message_send', 'external_write', 'local_image_generation']) {
      const r = evaluateAction(action, { connectorId: 'telegram', target: 'external' });
      expect(r.effect).toBe('allow');
      expect(r.allowed).toBe(true);
    }
  });

  it('does not fail closed for an unrecognised low-risk external action-type', () => {
    const r = evaluateAction('some_new_external_action', { connectorId: 'x', target: 'external' });
    expect(r.effect).toBe('allow');
    expect(r.ruleId).toBe('allow_connector_external_default');
  });

  it('still defaults to deny when nothing matches at all (no external target)', () => {
    const r = evaluateAction('mystery_action', { connectorId: 'x' });
    expect(r.effect).toBe('deny');
    expect(r.allowed).toBe(false);
  });

  it('keeps existing hard denies and consents intact', () => {
    expect(evaluateAction('delete', { scope: 'all' }).effect).toBe('deny');
    expect(evaluateAction('export', { target: 'credentials' }).effect).toBe('deny');
    expect(evaluateAction('payment', {}).effect).toBe('require_consent');
    expect(evaluateAction('read', {}).effect).toBe('allow');
  });

  it('orders require_consent rules before the external catch-all', () => {
    const rules = getPolicyRules();
    const publishIdx = rules.findIndex(r => r.id === 'require_consent_connector_publish');
    const catchAllIdx = rules.findIndex(r => r.id === 'allow_connector_external_default');
    expect(publishIdx).toBeGreaterThanOrEqual(0);
    expect(publishIdx).toBeLessThan(catchAllIdx);
  });
});
