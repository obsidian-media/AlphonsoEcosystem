import { describe, it, expect } from 'vitest';
import {
  CONNECTOR_KEY, CONNECTOR_AUDIT_KEY, CONNECTOR_AUTH_KEY,
  CONNECTOR_SCOPE, CONNECTOR_AUDIT_SCOPE, CONNECTOR_AUTH_SCOPE
} from '../../services/connectors/connectorConstants';

describe('connectorConstants', () => {
  it('exports all 6 constants', () => {
    expect(typeof CONNECTOR_KEY).toBe('string');
    expect(typeof CONNECTOR_AUDIT_KEY).toBe('string');
    expect(typeof CONNECTOR_AUTH_KEY).toBe('string');
    expect(typeof CONNECTOR_SCOPE).toBe('string');
    expect(typeof CONNECTOR_AUDIT_SCOPE).toBe('string');
    expect(typeof CONNECTOR_AUTH_SCOPE).toBe('string');
  });

  it('keys are localStorage key strings', () => {
    expect(CONNECTOR_KEY).toContain('connector_registry');
    expect(CONNECTOR_AUDIT_KEY).toContain('connector_audit');
    expect(CONNECTOR_AUTH_KEY).toContain('connector_auth');
  });

  it('scopes match their key counterparts', () => {
    expect(CONNECTOR_SCOPE).toBe('connector_registry_v2');
    expect(CONNECTOR_AUDIT_SCOPE).toBe('connector_audit_v2');
    expect(CONNECTOR_AUTH_SCOPE).toBe('connector_auth_profiles_v1');
  });

  it('all values are unique', () => {
    const vals = [CONNECTOR_KEY, CONNECTOR_AUDIT_KEY, CONNECTOR_AUTH_KEY, CONNECTOR_SCOPE, CONNECTOR_AUDIT_SCOPE, CONNECTOR_AUTH_SCOPE];
    expect(new Set(vals).size).toBe(6);
  });

  it('all values are non-empty', () => {
    [CONNECTOR_KEY, CONNECTOR_AUDIT_KEY, CONNECTOR_AUTH_KEY, CONNECTOR_SCOPE, CONNECTOR_AUDIT_SCOPE, CONNECTOR_AUTH_SCOPE].forEach(v => {
      expect(v.length).toBeGreaterThan(0);
    });
  });
});
