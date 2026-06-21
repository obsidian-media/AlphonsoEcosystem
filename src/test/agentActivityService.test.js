import { describe, it, expect, beforeEach } from 'vitest';
import {
  appendAgentActivity,
  listAgentActivity,
  agentActivityLog
} from '../services/agentActivityService';

// The module uses a module-level array, so we need to drain it between tests
function clearLog() {
  agentActivityLog.splice(0, agentActivityLog.length);
}

beforeEach(() => {
  clearLog();
});

// ── appendAgentActivity ───────────────────────────────────────────────────────

describe('appendAgentActivity', () => {
  it('appends an entry with agent, action, detail and ts', () => {
    appendAgentActivity({ agent: 'alphonso', action: 'code_gen', detail: 'wrote App.jsx' });
    expect(agentActivityLog.length).toBe(1);
    const entry = agentActivityLog[0];
    expect(entry.agent).toBe('alphonso');
    expect(entry.action).toBe('code_gen');
    expect(entry.detail).toBe('wrote App.jsx');
    expect(typeof entry.ts).toBe('number');
  });

  it('uses empty string for detail when not provided', () => {
    appendAgentActivity({ agent: 'jose', action: 'routing' });
    const entry = agentActivityLog[0];
    expect(entry.detail).toBe('');
  });

  it('stores multiple entries in order', () => {
    appendAgentActivity({ agent: 'alphonso', action: 'step_1', detail: 'first' });
    appendAgentActivity({ agent: 'jose', action: 'step_2', detail: 'second' });
    appendAgentActivity({ agent: 'hector', action: 'step_3', detail: 'third' });
    expect(agentActivityLog.length).toBe(3);
    expect(agentActivityLog[0].agent).toBe('alphonso');
    expect(agentActivityLog[2].agent).toBe('hector');
  });

  it('caps log at 200 entries by shifting oldest when full', () => {
    for (let i = 0; i < 205; i++) {
      appendAgentActivity({ agent: 'bot', action: `action_${i}`, detail: '' });
    }
    expect(agentActivityLog.length).toBe(200);
    // The oldest (action_0 through action_4) should be gone
    expect(agentActivityLog[0].action).toBe('action_5');
  });

  it('records a timestamp that is close to Date.now()', () => {
    const before = Date.now();
    appendAgentActivity({ agent: 'sentinel', action: 'scan', detail: '' });
    const after = Date.now();
    const ts = agentActivityLog[0].ts;
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

// ── listAgentActivity ─────────────────────────────────────────────────────────

describe('listAgentActivity', () => {
  it('returns empty array when no activity logged', () => {
    const result = listAgentActivity();
    expect(result).toEqual([]);
  });

  it('returns all logged entries', () => {
    appendAgentActivity({ agent: 'nova', action: 'analysis', detail: 'scored 80' });
    appendAgentActivity({ agent: 'echo', action: 'memory', detail: 'synthesized' });
    const result = listAgentActivity();
    expect(result.length).toBe(2);
    expect(result[0].agent).toBe('nova');
    expect(result[1].agent).toBe('echo');
  });

  it('returns a copy — mutations do not affect the log', () => {
    appendAgentActivity({ agent: 'maria', action: 'audit', detail: 'risk check' });
    const result = listAgentActivity();
    result.push({ agent: 'fake', action: 'fake', detail: '', ts: 0 });
    expect(agentActivityLog.length).toBe(1);
  });

  it('preserves entry order (FIFO)', () => {
    for (let i = 0; i < 5; i++) {
      appendAgentActivity({ agent: 'bot', action: `action_${i}`, detail: '' });
    }
    const result = listAgentActivity();
    for (let i = 0; i < 5; i++) {
      expect(result[i].action).toBe(`action_${i}`);
    }
  });
});
