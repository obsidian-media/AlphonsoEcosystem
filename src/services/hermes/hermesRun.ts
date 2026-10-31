// Hermes gateway (2026-10-30): a Hermes step runs as a Hermes run, so its
// progress shows, Stop ends it and its approval requests reach Alphonso. The
// backend (hermes_runs.rs) starts the run and sends its events here as
// `hermes://run_event`. A profile without runs (an older Hermes) falls back to
// the chat endpoint. Hermes's text is passed through redactText() before it is
// shown or saved.
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  getHermesAgentEndpoint,
  getHermesSessionMode,
  hermesGate,
  resolveSecureSessionId,
  sendHermesAgentMessage,
} from '../connectors/hermesAgentConnector';
import { agentName } from '../jose/agentNames';
import { STOPPED_LINE } from '../jose/joseStop';
import { redactText } from '../sentinel/exactChecks';

export const RUN_EVENT = 'hermes://run_event';
export const RUNS_NOT_SUPPORTED = "This Hermes profile can't show its progress or be stopped (an older Hermes).";
export const HERMES_LOST = (name: string) => `${name}'s Hermes profile stopped answering.`;
export const HERMES_NOT_SET_UP = (name: string) => `${name} has no Hermes profile set up.`;

export interface HermesApprovalRequest {
  runId: string;
  agent: string;
  command?: string;
  description: string;
}

export type HermesStepResult = { ok: true; text: string } | { ok: false; reason: string; stopped?: boolean };

export interface HermesRunOptions {
  instructions?: string;
  /** For a profile without runs only: the model its chat endpoint is asked for. */
  model?: string;
  sessionId?: string;
  approved?: boolean;
  signal?: AbortSignal;
  onProgress?: (line: string) => void;
  onApproval?: (req: HermesApprovalRequest) => Promise<'once' | 'deny'>;
}

/** Hermes's tool names in plain words, for the progress line. */
const TOOL_WORDS: Record<string, string> = {
  web_search: 'searching the web',
  web_extract: 'reading a page',
  memory: 'checking its memory',
  session_search: 'searching its past work',
  vision_analyze: 'looking at a picture',
};

type EventData = Record<string, unknown>;

export function progressLine(agent: string, data: EventData): string | null {
  if (data.event !== 'tool.started') return null;
  const tool = String(data.tool || '').trim();
  if (!tool) return null;
  return `${agentName(agent)}: ${TOOL_WORDS[tool] || `using ${tool}`}`;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

async function fallbackToChat(agent: string, input: string, opts: HermesRunOptions): Promise<HermesStepResult> {
  opts.onProgress?.(RUNS_NOT_SUPPORTED);
  const messages = [
    ...(opts.instructions ? [{ role: 'system' as const, content: opts.instructions }] : []),
    { role: 'user' as const, content: input },
  ];
  try {
    const r = await sendHermesAgentMessage(agent, messages, { ...(opts.model ? { model: opts.model } : {}), sessionId: opts.sessionId, approved: opts.approved });
    return r.ok ? { ok: true, text: redactText(r.content) } : { ok: false, reason: ('message' in r && r.message) || HERMES_LOST(agentName(agent)) };
  } catch (error) {
    return { ok: false, reason: redactText(error instanceof Error ? error.message : String(error)) };
  }
}

/** Runs one step on the agent's Hermes profile and waits for its answer. */
export async function runHermesStep(agent: string, input: string, opts: HermesRunOptions = {}): Promise<HermesStepResult> {
  const name = agentName(agent);
  if (opts.signal?.aborted) return { ok: false, stopped: true, reason: STOPPED_LINE };
  const held = hermesGate(agent, JSON.stringify({ agent, input }), opts.approved);
  if (held) return { ok: false, reason: ('message' in held && held.message) || HERMES_LOST(name) };
  const { url, key } = getHermesAgentEndpoint(agent);
  if (!url || !key) return { ok: false, reason: HERMES_NOT_SET_UP(name) };
  const target = { baseUrl: url.replace(/\/+$/, ''), authorizationHeader: `Bearer ${key}` };
  const sessionId = opts.sessionId && getHermesSessionMode(agent) === 'persistent' ? resolveSecureSessionId(opts.sessionId) : undefined;

  let runId: string | null = null;
  const early: { runId: string; data: EventData }[] = [];
  let onEvent: (data: EventData) => void = () => {};
  const unlisten = await listen<{ runId: string; event: string; data: EventData }>(RUN_EVENT, (e) => {
    const { runId: id, data } = e.payload || ({} as never);
    if (runId === null) early.push({ runId: id, data });
    else if (id === runId) onEvent(data);
  });

  return new Promise<HermesStepResult>((resolve) => {
    let finished = false;
    let stopping = false;
    let answer = '';
    const finish = (result: HermesStepResult) => {
      if (finished) return;
      finished = true;
      unlisten();
      opts.signal?.removeEventListener('abort', onAbort);
      resolve(result);
    };
    const stop = () => {
      if (runId) invoke('hermes_run_stop', { ...target, runId }).catch(() => undefined);
      finish({ ok: false, stopped: true, reason: STOPPED_LINE });
    };
    function onAbort() {
      stopping = true;
      if (runId) stop();
    }
    opts.signal?.addEventListener('abort', onAbort);

    const answerApproval = async (data: EventData) => {
      const req: HermesApprovalRequest = {
        runId: runId as string,
        agent,
        ...(text(data.command) ? { command: redactText(text(data.command)) } : {}),
        description: redactText(text(data.description)),
      };
      let choice: 'once' | 'deny' = 'deny';
      try {
        choice = opts.onApproval ? await opts.onApproval(req) : 'deny';
      } catch {
        choice = 'deny';
      }
      if (choice !== 'once') choice = 'deny';
      if (finished) return;
      await invoke('hermes_run_answer', { ...target, runId, choice }).catch(() => undefined);
    };

    onEvent = (data: EventData) => {
      if (finished) return;
      const kind = String(data.event || '');
      const line = progressLine(agent, data);
      if (line) opts.onProgress?.(line);
      if (kind === 'message.delta') answer += text(data.delta);
      else if (kind === 'approval.request') void answerApproval(data);
      else if (kind === 'run.completed') finish({ ok: true, text: redactText(text(data.output) || answer) });
      else if (kind === 'run.failed') finish({ ok: false, reason: `${name}'s Hermes profile failed: ${redactText(text(data.error) || 'no reason given')}` });
      else if (kind === 'run.cancelled') finish({ ok: false, stopped: true, reason: STOPPED_LINE });
      else if (kind === 'run.lost') finish({ ok: false, reason: HERMES_LOST(name) });
    };

    invoke<{ runId: string | null; notSupported: boolean }>('hermes_run_start', {
      ...target,
      input,
      instructions: opts.instructions || null,
      sessionId: sessionId || null,
    }).then(async (started) => {
      if (started?.notSupported || !started?.runId) {
        unlisten();
        opts.signal?.removeEventListener('abort', onAbort);
        if (finished) return;
        finished = true;
        resolve(await fallbackToChat(agent, input, opts));
        return;
      }
      runId = started.runId;
      if (stopping) return stop();
      for (const e of early.splice(0)) if (e.runId === runId) onEvent(e.data);
    }).catch((error) => {
      finish({ ok: false, reason: redactText(typeof error === 'string' ? error : error instanceof Error ? error.message : HERMES_LOST(name)) });
    });
  });
}
