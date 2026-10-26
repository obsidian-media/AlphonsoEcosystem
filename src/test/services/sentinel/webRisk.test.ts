// Agent phase 4: an optional Google Web Risk check of the links Hector reads and you open.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
const credential = vi.fn();
vi.mock('../../../services/connectors/connectorAuth', () => ({ getConnectorCredential: (...a: unknown[]) => credential(...a) }));
vi.mock('../../../services/policyEnforcementService', () => ({ evaluatePolicyGate: () => ({ ok: true }) }));

import { checkLinksWithWebRisk, webRiskSetUp } from '../../../services/sentinel/webRisk';

beforeEach(() => { invoke.mockReset(); credential.mockReset(); });

describe('checkLinksWithWebRisk', () => {
  it('not set up: no call', async () => {
    credential.mockReturnValue('');
    expect(webRiskSetUp()).toBe(false);
    expect((await checkLinksWithWebRisk(['https://a.example'])).size).toBe(0);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('a listed link comes back with what it is listed as', async () => {
    credential.mockReturnValue('KEY');
    invoke.mockResolvedValue({ ok: true, matches: [{ url: 'https://bad.example/', threats: ['SOCIAL_ENGINEERING'] }, { url: 'https://worse.example/', threats: ['MALWARE'] }] });
    const found = await checkLinksWithWebRisk(['https://bad.example/', 'https://worse.example/', 'https://fine.example/']);
    expect(invoke).toHaveBeenCalledWith('web_risk_check', { urls: ['https://bad.example/', 'https://worse.example/', 'https://fine.example/'], apiKey: 'KEY' });
    expect(found.get('https://bad.example/')).toBe('phishing');
    expect(found.get('https://worse.example/')).toBe('malware');
    expect(found.has('https://fine.example/')).toBe(false);
  });

  it('Google unreachable: nothing is listed, so links are read as before', async () => {
    credential.mockReturnValue('KEY');
    invoke.mockRejectedValue(new Error('offline'));
    expect((await checkLinksWithWebRisk(['https://a.example'])).size).toBe(0);
  });
});
