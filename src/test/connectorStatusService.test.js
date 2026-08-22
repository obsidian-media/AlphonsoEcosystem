import { describe, it, expect } from 'vitest';
import { deriveConnectorStatus } from '../services/connectorStatusService';

// Regression test for a real QA finding (Q&A E2E Test.md, Round 3 N-13):
// ConnectorStatusIndicators.tsx (sidebar) and ConnectorHealthPanel.tsx (view)
// each had their own copy of deriveStatus() that had drifted apart, so the
// same 25 connectors produced two different counts on screen at once. This
// tests the single shared function both components now import — pinning
// its exact classification behavior so it can never silently fork again.

describe('deriveConnectorStatus', () => {
  it('returns disabled for a missing connector', () => {
    expect(deriveConnectorStatus(undefined)).toBe('disabled');
    expect(deriveConnectorStatus(null)).toBe('disabled');
  });

  it('returns foundation_only for a local-only connector', () => {
    expect(deriveConnectorStatus({ id: 'ollama', status: 'foundation_only' })).toBe('foundation_only');
  });

  it('returns placeholder for chatgpt/claude with zero credentials configured', () => {
    expect(deriveConnectorStatus({ id: 'chatgpt', requiredEnv: ['OPENAI_API_KEY'], envPresence: {} })).toBe('placeholder');
    expect(deriveConnectorStatus({ id: 'claude', requiredEnv: ['ANTHROPIC_API_KEY'], envPresence: {} })).toBe('placeholder');
  });

  it('does not apply the placeholder rule to other connectors with no credentials', () => {
    expect(deriveConnectorStatus({ id: 'telegram', requiredEnv: ['TELEGRAM_BOT_TOKEN'], envPresence: {} })).toBe('disabled');
  });

  it('returns live when configured, all required env present, and last test verified', () => {
    expect(deriveConnectorStatus({
      id: 'github',
      status: 'configured',
      requiredEnv: ['GITHUB_TOKEN'],
      envPresence: { GITHUB_TOKEN: true },
      lastTestStatus: 'verified'
    })).toBe('live');
  });

  it('returns missing_config when configured but env or test verification is incomplete', () => {
    expect(deriveConnectorStatus({
      id: 'github',
      status: 'configured',
      requiredEnv: ['GITHUB_TOKEN'],
      envPresence: {},
      lastTestStatus: 'verified'
    })).toBe('missing_config');

    expect(deriveConnectorStatus({
      id: 'github',
      status: 'configured',
      requiredEnv: ['GITHUB_TOKEN'],
      envPresence: { GITHUB_TOKEN: true },
      lastTestStatus: undefined
    })).toBe('missing_config');
  });

  it('returns missing_config for a not-configured connector with some but not all required env present', () => {
    expect(deriveConnectorStatus({
      id: 'whatsapp',
      status: 'not_configured',
      requiredEnv: ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'],
      envPresence: { WHATSAPP_ACCESS_TOKEN: true }
    })).toBe('missing_config');
  });

  it('returns disabled for a not-configured connector with no required env present at all', () => {
    expect(deriveConnectorStatus({
      id: 'whatsapp',
      status: 'not_configured',
      requiredEnv: ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'],
      envPresence: {}
    })).toBe('disabled');
  });
});
