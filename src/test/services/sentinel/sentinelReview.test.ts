// Agent phase 4: Sentinel's step checks the real work with his own model, the exact checks
// handed to him as facts; keys hidden; Jose's step model.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const llm = vi.fn();
vi.mock('../../../lib/ollama', () => ({ generateAgentLlmResponse: (...a: unknown[]) => llm(...a) }));
const pushMemory = vi.fn();
vi.mock('../../../services/memoryService', () => ({ pushMemoryItem: (...a: unknown[]) => pushMemory(...a) }));
const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

import { runSentinelReview, SENTINEL_NO_CHECK } from '../../../services/sentinel/sentinelReview';
import { createJoseRequest } from '../../../services/jose/joseRequestStore';
import { setStepOutput } from '../../../services/jose/joseStepOutputs';

const KEY = 'sk-live-1234abcd5678efgh';
const POST = `Get 50% off today! Log in at http://paypa1-secure-login.com/verify with your password to claim it. Our test key is ${KEY}.`;
const answer = (o: unknown) => ({ response: JSON.stringify(o) });
const unsafe = { verdict: 'unsafe', summary: 'A phishing post.', findings: [{ what: 'A fake PayPal login', where: 'http://paypa1-secure-login.com/verify', severity: 'high', fix: 'Remove the link.' }] };
const input = (over: Record<string, unknown> = {}) => ({ instruction: 'Check it.', request: 'Check this post', needs: [], others: [], memory: '', review: null, ...over }) as never;
const reviewOf = (text: string, agent = 'alphonso', stepId = 'write') => ({ stepId, agent, text, files: [], sources: [] });

beforeEach(() => {
  localStorage.clear();
  llm.mockReset(); pushMemory.mockReset(); invoke.mockReset(); invoke.mockResolvedValue(undefined);
});

describe('what he checks', () => {
  it('checks the reviewed work, else the needed work, else the request', async () => {
    llm.mockResolvedValue(answer({ verdict: 'safe', summary: 'Fine.', findings: [] }));
    await runSentinelReview({ agent: 'sentinel' }, input({ review: reviewOf('THE REVIEWED POST') }));
    expect(llm.mock.calls[0][1].prompt).toContain('THE REVIEWED POST');
    await runSentinelReview({ agent: 'sentinel' }, input({ needs: [{ stepId: 'w', agent: 'alphonso', text: 'THE NEEDED EMAIL', files: [], sources: [], cut: 0 }] }));
    expect(llm.mock.calls[1][1].prompt).toContain('THE NEEDED EMAIL');
    await runSentinelReview({ agent: 'sentinel' }, input({ request: 'THE REQUEST TEXT' }));
    expect(llm.mock.calls[2][1].prompt).toContain('THE REQUEST TEXT');
  });

  it("reviewing Alphonso's work reads his files, results and dependency files, with the security prompt", async () => {
    createJoseRequest({ commandId: 'c1', source: 'user', text: 'Build', kind: 'normal', steps: [{ stepId: 'build', agent: 'alphonso', actionType: 'code_build', effects: ['change_project'], needs: [] }] } as never);
    setStepOutput('c1', 'build', 'alphonso', { summary: 'Built.', artifacts: [{ type: 'file_written', relativePath: 'src/app.ts' }, { type: 'validation_failed', errors: [{ label: 'npm run test', output: '1 failed' }] }] });
    invoke.mockImplementation(async (_c: string, a: { relativePath: string }) => ({ content: a.relativePath === 'src/app.ts' ? 'fetch(userUrl)' : a.relativePath === 'package.json' ? '{"dependencies":{"left-pad":"1.0.0"}}' : '' }));
    llm.mockResolvedValue(answer({ verdict: 'safe', summary: 'Fine.', findings: [] }));
    await runSentinelReview({ agent: 'sentinel' }, input({ review: reviewOf('Built the app.', 'alphonso', 'build') }), { commandId: 'c1', workspaceRoot: 'D:/p' });
    const prompt = llm.mock.calls[0][1].prompt as string;
    expect(prompt).toContain('You check security and safety only');
    expect(prompt).toContain('fetch(userUrl)');
    expect(prompt).toContain('1 failed');
    expect(prompt).toContain('left-pad');
    expect(prompt).not.toMatch(/what is good/i);
  });
});

describe('his answer', () => {
  it('quotes are checked, one retry asks to copy the words exactly', async () => {
    llm.mockResolvedValueOnce(answer({ ...unsafe, findings: [{ ...unsafe.findings[0], where: 'words that are not there' }] }));
    llm.mockResolvedValueOnce(answer(unsafe));
    const r = await runSentinelReview({ agent: 'sentinel' }, input({ review: reviewOf(POST) }));
    expect(llm).toHaveBeenCalledTimes(2);
    expect(llm.mock.calls[1][1].prompt).toContain('Copy the words exactly');
    expect(r.schema?.verdict).toBe('unsafe');
  });

  it('quotes match the hidden text', async () => {
    llm.mockResolvedValue(answer({ verdict: 'unsafe', summary: 'A key.', findings: [{ what: 'A key is posted', where: 'Our test key is [hidden key, ends …efgh]', severity: 'high', fix: 'Remove it.' }] }));
    await runSentinelReview({ agent: 'sentinel' }, input({ review: reviewOf(POST) }));
    expect(llm).toHaveBeenCalledTimes(1);
  });

  it('every exact fact is in the findings, whatever the model says', async () => {
    llm.mockResolvedValue(answer({ verdict: 'risky', summary: 'Hmm.', findings: [] }));
    const r = await runSentinelReview({ agent: 'sentinel' }, input({ review: reviewOf(POST) }));
    const all = (r.schema?.findings || []).join('\n');
    expect(all).toContain('[hidden key, ends …efgh]');
    expect(all).toContain('paypa1-secure-login.com');
    expect(all).toMatch(/password/i);
  });

  it('unsafe needs a high finding, safe has none (one retry, then risky)', async () => {
    llm.mockResolvedValue(answer({ verdict: 'safe', summary: 'Fine.', findings: [{ what: 'A fake login', where: 'Log in at', severity: 'high', fix: 'x' }] }));
    const r = await runSentinelReview({ agent: 'sentinel' }, input({ review: reviewOf(POST) }));
    expect(llm).toHaveBeenCalledTimes(2);
    expect(r.schema?.verdict).toBe('risky');
  });

  it('unreadable twice fails with the exact facts in the reason', async () => {
    llm.mockResolvedValue({ response: 'not json' });
    const r = await runSentinelReview({ agent: 'sentinel' }, input({ review: reviewOf(POST) }));
    expect(r.resultState).toBe('failed');
    expect(r.summary).toContain(SENTINEL_NO_CHECK);
    expect(r.summary).toContain('paypa1-secure-login.com');
  });

  it('hand-over starts Safe. / Risky: / Unsafe:', async () => {
    llm.mockResolvedValueOnce(answer(unsafe));
    expect((await runSentinelReview({ agent: 'sentinel' }, input({ review: reviewOf(POST) }))).summary.startsWith('Unsafe:')).toBe(true);
    llm.mockResolvedValueOnce(answer({ verdict: 'safe', summary: 'Nothing risky.', findings: [] }));
    const safe = await runSentinelReview({ agent: 'sentinel' }, input({ review: reviewOf('Welcome aboard!') }));
    expect(safe.summary.startsWith('Safe.')).toBe(true);
    expect(safe.summary).toContain('Nothing else found.');
  });

  it('a high finding asks for approval; with reviewOf the review loop sees fix', async () => {
    llm.mockResolvedValue(answer(unsafe));
    const r = await runSentinelReview({ agent: 'sentinel', reviewOf: 'write' }, input({ review: reviewOf(POST) }));
    expect(r.schema).toMatchObject({ kind: 'security', severity: 'high', requiresApproval: true, reviewVerdict: 'fix' });
  });
});

describe('his model, keys and memory', () => {
  it("uses Jose's step model", async () => {
    llm.mockResolvedValue(answer({ verdict: 'safe', summary: 'Fine.', findings: [] }));
    await runSentinelReview({ agent: 'sentinel' }, input({ review: reviewOf('Hello') }));
    expect(llm.mock.calls[0][0]).toBe('sentinel');
    expect(llm.mock.calls[0][1]).not.toHaveProperty('model');
    expect(llm.mock.calls[0][1]).not.toHaveProperty('endpoint');
  });

  it('keys are hidden in the prompt and the memory title', async () => {
    llm.mockResolvedValue(answer(unsafe));
    await runSentinelReview({ agent: 'sentinel' }, input({ request: `${KEY} please check`, review: reviewOf(POST) }));
    expect(JSON.stringify(llm.mock.calls)).not.toContain(KEY);
    expect(JSON.stringify(pushMemory.mock.calls)).not.toContain(KEY);
    expect(pushMemory.mock.calls[0][0].title).toMatch(/^Sentinel: .* — Unsafe$/);
  });

  it('confidence is inferred', async () => {
    llm.mockResolvedValue(answer({ verdict: 'safe', summary: 'Fine.', findings: [] }));
    const r = await runSentinelReview({ agent: 'sentinel' }, input({ review: reviewOf('Hello') }));
    expect(r.schema?.confidenceLevel).toBe('inferred');
  });
});
