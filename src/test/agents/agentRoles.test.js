import { describe, it, expect } from 'vitest';
import { listAgentProfiles, getAgentProfile } from '../../agents/agentRegistry';
import { isEffectAllowed } from '../../services/jose/agentPermissionTable';

// The profiles say what each agent really does (owner, 2026-10-23; design §7).
const text = (profile) => [profile.purpose, ...(profile.strengths || []), profile.defaultPrompt].join(' ').toLowerCase();

describe('agent profiles', () => {
  it('keep each agent to its own role', () => {
    expect(text(getAgentProfile('marcus'))).not.toMatch(/security|risk|audit/);
    expect(text(getAgentProfile('maria'))).not.toMatch(/roadmap|backlog/);
    expect(text(getAgentProfile('sentinel'))).not.toMatch(/roadmap|publish|campaign/);
  });

  it('describe Miya as UI/UX, content and front-end', () => {
    const purpose = getAgentProfile('miya').purpose.toLowerCase();
    expect(purpose).toMatch(/content/);
    expect(purpose).toMatch(/front-end/);
  });

  it('describe Hector as finding facts and sources, without "not wired"', () => {
    const hector = getAgentProfile('hector');
    expect(hector.purpose.toLowerCase()).toMatch(/source/);
    expect(hector.limitations.join(' ')).not.toMatch(/not wired/);
  });

  it('describe Nova as judging value, priority and timing', () => {
    expect(getAgentProfile('nova').purpose.toLowerCase()).toMatch(/value.*priorit.*timing|value.*timing.*priorit/);
  });

  it('name no runtime that is not there', () => {
    for (const profile of listAgentProfiles()) {
      const labels = [profile.runtime, profile.runtimeName, profile.runtimeId, profile.identity, profile.defaultPrompt].filter(Boolean).join(' ');
      expect(labels, profile.id).not.toMatch(/Hermes|OpenFang/);
    }
  });

  it('agree with the permission table: only Alphonso runs code', () => {
    for (const profile of listAgentProfiles()) {
      const claimsToRun = (profile.strengths || []).some((s) => /test execution|run(s|ning)? (code|commands|tests)|build verification/i.test(s));
      if (claimsToRun) expect(isEffectAllowed(profile.id, 'run'), profile.id).toBe(true);
      const limitations = (profile.limitations || []).join(' ').toLowerCase();
      if (profile.id !== 'alphonso') expect(limitations, profile.id).toMatch(/does not run code|cannot run code|no .*execution/);
    }
  });
});
