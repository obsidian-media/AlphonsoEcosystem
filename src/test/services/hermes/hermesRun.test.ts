import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hermes gateway (2026-10-30), Task 5: a Hermes step runs as a Hermes run.
type Listener = (e: { payload: { runId: string; event: string; data: Record<string, unknown> } }) => void;
// Like Tauri's listen(): every listener hears every event until it unlistens.
const listeners = new Set<Listener>();
vi.mock('@tauri-apps/api/event', () => ({
  listen: async (_name: string, fn: Listener) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
}));
const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a), isTauri: () => true }));
const gate = vi.fn((): unknown => null);
const sendHermesAgentMessage = vi.fn();
vi.mock('../../../services/connectors/hermesAgentConnector', () => ({
  getHermesAgentEndpoint: () => ({ url: 'http://127.0.0.1:8700/', key: 'alphonso-profile:hector' }),
  hermesGate: (...a: unknown[]) => gate(...(a as [])),
  resolveSecureSessionId: (id: string) => `s-${id}`,
  getHermesSessionMode: () => 'persistent',
  sendHermesAgentMessage: (...a: unknown[]) => sendHermesAgentMessage(...a),
}));

const { runHermesStep, progressLine, HERMES_LOST, RUNS_NOT_SUPPORTED } = await import('../../../services/hermes/hermesRun');

function send(runId: string, data: Record<string, unknown>) {
  for (const fn of [...listeners]) fn({ payload: { runId, event: String(data.event), data } });
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('Hermes runs', () => {
  beforeEach(() => {
    invoke.mockReset();
    gate.mockReset();
    gate.mockReturnValue(null);
    sendHermesAgentMessage.mockReset();
    listeners.clear();
  });

  it('builds the answer from the run and reports tools in plain words', async () => {
    invoke.mockResolvedValueOnce({ runId: 'run_1', notSupported: false });
    const progress: string[] = [];
    const done = runHermesStep('hector', 'Find X', { sessionId: 'p1', onProgress: (l) => progress.push(l) });
    await tick();
    send('run_1', { event: 'run.started' });
    send('run_1', { event: 'tool.started', tool: 'web_search' });
    send('run_1', { event: 'message.delta', delta: 'Hi ' });
    send('run_1', { event: 'message.delta', delta: 'there' });
    send('run_1', { event: 'run.completed' });
    expect(await done).toEqual({ ok: true, text: 'Hi there' });
    expect(progress).toContain('Hector: searching the web');
    const [cmd, args] = invoke.mock.calls[0];
    expect(cmd).toBe('hermes_run_start');
    expect(args).toMatchObject({ baseUrl: 'http://127.0.0.1:8700', authorizationHeader: 'Bearer alphonso-profile:hector', input: 'Find X', sessionId: 's-p1' });
  });

  it('prefers the run\'s own final output and hides keys in it', async () => {
    invoke.mockResolvedValueOnce({ runId: 'run_1', notSupported: false });
    const done = runHermesStep('hector', 'x', {});
    await tick();
    send('run_1', { event: 'run.completed', output: 'Use key sk-abcdefghijklmnopqrstuvwxyz123456 now' });
    const r: any = await done;
    expect(r.ok).toBe(true);
    expect(r.text).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456');
  });

  it('stops the run when the step is stopped', async () => {
    invoke.mockResolvedValueOnce({ runId: 'run_1', notSupported: false }).mockResolvedValueOnce(undefined);
    const controller = new AbortController();
    const done = runHermesStep('hector', 'x', { signal: controller.signal });
    await tick();
    controller.abort();
    expect(await done).toEqual({ ok: false, stopped: true, reason: 'Stopped by you.' });
    expect(invoke.mock.calls[1]).toEqual(['hermes_run_stop', { baseUrl: 'http://127.0.0.1:8700', authorizationHeader: 'Bearer alphonso-profile:hector', runId: 'run_1' }]);
  });

  it('says so when the profile stops answering', async () => {
    invoke.mockResolvedValueOnce({ runId: 'run_1', notSupported: false });
    const done = runHermesStep('hector', 'x', {});
    await tick();
    send('run_1', { event: 'run.lost' });
    expect(await done).toEqual({ ok: false, reason: "Hector's Hermes profile stopped answering." });
    expect(HERMES_LOST('Hector')).toBe("Hector's Hermes profile stopped answering.");
  });

  it('keeps two runs on one agent apart, and stopping one stops only it', async () => {
    invoke.mockResolvedValueOnce({ runId: 'run_a', notSupported: false }).mockResolvedValueOnce({ runId: 'run_b', notSupported: false });
    const ca = new AbortController();
    const a = runHermesStep('hector', 'a', { signal: ca.signal });
    await tick();
    const b = runHermesStep('hector', 'b', {});
    await tick();
    invoke.mockResolvedValueOnce(undefined);
    ca.abort();
    send('run_b', { event: 'message.delta', delta: 'B' });
    send('run_b', { event: 'run.completed' });
    expect((await a as any).stopped).toBe(true);
    expect(await b).toEqual({ ok: true, text: 'B' });
    const stops = invoke.mock.calls.filter((c) => c[0] === 'hermes_run_stop');
    expect(stops.map((c) => c[1].runId)).toEqual(['run_a']);
  });

  it('asks Alphonso on an approval request and sends only once or deny', async () => {
    invoke.mockResolvedValueOnce({ runId: 'run_1', notSupported: false }).mockResolvedValueOnce({ ok: true, tooLate: false });
    const onApproval = vi.fn(async () => 'once' as const);
    const done = runHermesStep('hector', 'x', { onApproval });
    await tick();
    send('run_1', { event: 'approval.request', command: 'rm -rf build', description: 'delete the build folder', choices: ['once', 'session', 'always', 'deny'] });
    await tick();
    await tick();
    expect(onApproval).toHaveBeenCalledWith({ runId: 'run_1', agent: 'hector', command: 'rm -rf build', description: 'delete the build folder' });
    expect(invoke.mock.calls[1]).toEqual(['hermes_run_answer', expect.objectContaining({ runId: 'run_1', choice: 'once' })]);
    send('run_1', { event: 'run.completed', output: 'Done' });
    expect(await done).toEqual({ ok: true, text: 'Done' });
  });

  it('denies an approval when nobody can be asked', async () => {
    invoke.mockResolvedValueOnce({ runId: 'run_1', notSupported: false }).mockResolvedValueOnce({ ok: true, tooLate: false });
    const done = runHermesStep('hector', 'x', {});
    await tick();
    send('run_1', { event: 'approval.request', command: 'ls' });
    await tick();
    expect(invoke.mock.calls[1][1].choice).toBe('deny');
    send('run_1', { event: 'run.failed', error: 'denied' });
    expect((await done as any).ok).toBe(false);
  });

  it('falls back to the chat endpoint when the profile has no runs', async () => {
    invoke.mockResolvedValueOnce({ runId: null, notSupported: true });
    sendHermesAgentMessage.mockResolvedValueOnce({ ok: true, content: 'old answer', model: 'm', provider: 'hermes' });
    const progress: string[] = [];
    expect(await runHermesStep('hector', 'x', { onProgress: (l) => progress.push(l) })).toEqual({ ok: true, text: 'old answer' });
    expect(progress).toContain(RUNS_NOT_SUPPORTED);
  });

  it('is held back by the same checks as any Hermes call', async () => {
    gate.mockReturnValueOnce({ ok: false, blocked: true, message: 'Zero-Cost Mode blocked hermes_agents', provider: 'hermes' });
    expect(await runHermesStep('hector', 'x', {})).toEqual({ ok: false, reason: 'Zero-Cost Mode blocked hermes_agents' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('words tools plainly', () => {
    expect(progressLine('hector', { event: 'tool.started', tool: 'web_extract' })).toBe('Hector: reading a page');
    expect(progressLine('hector', { event: 'tool.started', tool: 'memory' })).toBe('Hector: checking its memory');
    expect(progressLine('hector', { event: 'tool.started', tool: 'todo' })).toBe('Hector: using todo');
    expect(progressLine('hector', { event: 'message.delta', delta: 'x' })).toBeNull();
  });
});
