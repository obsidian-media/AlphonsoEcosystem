// Asking for Higgsfield by name (content factory phase 4b): "Make a Higgsfield picture/video of …"
// from Chat, Telegram or the board becomes one Miya step (`creative_higgsfield`, `spend`) that
// asks with Higgsfield's estimate. The result is saved in `<output folder>/Higgsfield/<date>/`,
// listed in Miya Studio's Quick package, shown in Chat and sent on Telegram.
import { invoke } from '@tauri-apps/api/core';
import { cachedHiggsfieldEstimate, higgsfieldAvailable, higgsfieldKeys, higgsfieldModels, refreshHiggsfieldEstimate } from '../connectors/higgsfieldConnector';
import { detectCreativeIntent } from '../creativeRoutingService';
import { canSpend, recordSpendUsd } from '../jose/joseSpend';
import { findRequestByPacket } from '../jose/joseRequestStore';
import { submitStepsToJose } from '../jose/submitToJose';
import type { PlanStep } from '../jose/stepGraph';
import { randomHex } from '../../lib/randomId';
import { requireOutputRoot } from './contentProjectFiles';
import { contentAppSettings } from './contentStepRecorder';

export const HIGGSFIELD_BY_NAME_NOT_SET_UP = "Higgsfield isn't set up: add your keys and a model id in Settings → Connectors → Higgsfield. Nothing was started.";
export const HIGGSFIELD_LABEL = 'Asked for Higgsfield by name.';
const RESULTS_KEY = 'alphonso_higgsfield_results_v1';
const KEEP = 100;

export type HiggsfieldKind = 'picture' | 'video';

export interface HiggsfieldResult {
  id: string;
  kind: HiggsfieldKind;
  prompt: string;
  /** Relative to the output folder. */
  path: string;
  status: 'done' | 'pending';
  atMs: number;
  requestId?: string;
  commandId?: string;
  usd?: number;
}

/** 'picture' or 'video' when the text asks for Higgsfield by name. */
export function higgsfieldKindOf(text: string): HiggsfieldKind | null {
  const intent = detectCreativeIntent(text);
  return intent === 'higgsfield_video' ? 'video' : intent === 'higgsfield_picture' ? 'picture' : null;
}

/** What to make: the words after "… Higgsfield picture/video of", else the whole request. */
export function higgsfieldPromptOf(text: string): string {
  const match = /\bhiggsfield\b.{0,30}?\b(?:picture|image|photo|video|clip|reel|animation)s?\b\s*(?:of|showing|with|:)?\s*(.+)$/i.exec(text.trim());
  return (match?.[1] || text).trim().replace(/[.!?]+$/, '').slice(0, 1000);
}

function modelFor(kind: HiggsfieldKind): string | undefined {
  const models = higgsfieldModels();
  return kind === 'picture' ? models.picture : models.clip;
}

/** Plans the request as one Miya step with the estimate, or says what to set up; nothing starts without it. */
export async function askHiggsfieldByName(input: { text: string; source: string; onProgress?: (event: unknown) => void }): Promise<any> {
  const kind = higgsfieldKindOf(input.text);
  if (!kind) return null;
  if (!higgsfieldAvailable().ok || !modelFor(kind)) return { ok: false, reason: HIGGSFIELD_BY_NAME_NOT_SET_UP, plan: null, planNote: HIGGSFIELD_BY_NAME_NOT_SET_UP };
  const estimate = await refreshHiggsfieldEstimate(kind === 'picture' ? 'picture' : 'clip', kind === 'video' ? { seconds: 5 } : {});
  if (!estimate.ok || typeof estimate.usd !== 'number') {
    const reason = `${estimate.reason || 'Higgsfield gave no estimate.'} Nothing was started.`;
    return { ok: false, reason, plan: null, planNote: reason };
  }
  const prompt = higgsfieldPromptOf(input.text);
  const step: PlanStep = {
    stepId: 'miya', agent: 'miya', actionType: 'creative_higgsfield', effects: ['write_own_work', 'spend'], needs: [],
    instruction: `Make a Higgsfield ${kind}: ${prompt}`, payload: { kind, prompt }, costEstimateUsd: estimate.usd,
  } as PlanStep;
  return submitStepsToJose({ text: input.text, source: input.source, steps: [step], label: HIGGSFIELD_LABEL, saveDecisions: false, onProgress: input.onProgress as never });
}

export function listHiggsfieldResults(): HiggsfieldResult[] {
  try {
    const list = JSON.parse(localStorage.getItem(RESULTS_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveResult(result: HiggsfieldResult): void {
  const rest = listHiggsfieldResults().filter((r) => r.id !== result.id);
  try {
    localStorage.setItem(RESULTS_KEY, JSON.stringify([result, ...rest].slice(0, KEEP)));
  } catch {
    // The file is still in the folder.
  }
}

/** Results of one Jose command (Chat shows them under its reply). */
export function higgsfieldResultsFor(commandId: string | null | undefined): HiggsfieldResult[] {
  return commandId ? listHiggsfieldResults().filter((r) => r.commandId === commandId && r.status === 'done') : [];
}

const pad = (n: number) => String(n).padStart(2, '0');

function outRel(kind: HiggsfieldKind, now = new Date()): string {
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `Higgsfield/${day}/${kind}-${time}-${randomHex(4)}.${kind === 'video' ? 'mp4' : 'png'}`;
}

function stepResult(assignment: { agent: string; actionType: string }, state: 'completed' | 'failed', summary: string, path?: string, data?: unknown) {
  return {
    summary: `${assignment.agent}: ${summary}`,
    resultState: state,
    artifacts: [{ type: 'higgsfield_result', actionType: assignment.actionType, ...(path ? { path, relativePath: path } : {}), data: data ?? null, raw: '' }],
    sources: [],
    contractAction: assignment.actionType,
    ...(state === 'failed' ? { failureReason: summary } : {}),
  };
}

type RunAnswer = { ok?: boolean; status?: string; requestId?: string; reason?: string };

async function tellTelegram(packet: { id?: string } | null, root: string, result: HiggsfieldResult): Promise<void> {
  const source = packet?.id ? findRequestByPacket(packet.id)?.source : null;
  if (source !== 'telegram') return;
  const { sendTelegramFileOrFolder } = await import('../telegramCompanionService');
  await sendTelegramFileOrFolder({ root, relativePath: result.path, caption: `Your Higgsfield ${result.kind}: ${result.prompt}` }).catch(() => undefined);
}

/** The step: only with its approved spending, within the monthly cap. */
export async function executeHiggsfieldByName(
  assignment: { agent: string; actionType: string; effects?: string[]; costEstimateUsd?: number; payload?: { kind?: HiggsfieldKind; prompt?: string } },
  packet: { id?: string; commandId?: string } | null,
): Promise<ReturnType<typeof stepResult>> {
  const kind: HiggsfieldKind = assignment.payload?.kind === 'video' ? 'video' : 'picture';
  const prompt = String(assignment.payload?.prompt || '').trim();
  if (!(assignment.effects || []).includes('spend')) return stepResult(assignment, 'failed', "Higgsfield wasn't approved for this request; nothing was sent.");
  const model = modelFor(kind);
  if (!higgsfieldAvailable().ok || !model) return stepResult(assignment, 'failed', HIGGSFIELD_BY_NAME_NOT_SET_UP);
  const usd = Number.isFinite(assignment.costEstimateUsd) ? Number(assignment.costEstimateUsd) : cachedHiggsfieldEstimate(kind === 'picture' ? 'picture' : 'clip')?.usd ?? 0;
  const cap = canSpend(usd);
  if (!cap.ok) return stepResult(assignment, 'failed', `${cap.reason}; nothing was sent.`);
  let root: string;
  try {
    root = requireOutputRoot(contentAppSettings());
  } catch (error) {
    return stepResult(assignment, 'failed', (error as Error).message);
  }
  const path = outRel(kind);
  const models = higgsfieldModels();
  const answer = await invoke<RunAnswer>('higgsfield_run', {
    job: { model, prompt, aspect: '16:9', ...(kind === 'video' ? { seconds: 5 } : {}), extra: (kind === 'picture' ? models.pictureExtra : models.clipExtra) ?? null },
    workspaceRoot: root, outPath: path, keys: higgsfieldKeys(),
  }).catch((): RunAnswer => ({ ok: false, reason: 'Higgsfield could not be reached.' }));
  const base = { id: `hf-${Date.now()}-${randomHex(4)}`, kind, prompt, path, atMs: Date.now(), ...(packet?.commandId ? { commandId: packet.commandId } : {}), usd };
  if (answer?.status === 'pending' && answer.requestId) {
    saveResult({ ...base, status: 'pending', requestId: answer.requestId });
    return stepResult(assignment, 'completed', 'Still being made at Higgsfield; Check again in Miya Studio → Quick package.', undefined, { kind, prompt, requestId: answer.requestId });
  }
  if (!answer?.ok || answer.status !== 'done') return stepResult(assignment, 'failed', answer?.reason || 'Higgsfield made nothing.');
  recordSpendUsd(usd);
  const saved: HiggsfieldResult = { ...base, status: 'done', ...(answer.requestId ? { requestId: answer.requestId } : {}) };
  saveResult(saved);
  await tellTelegram(packet, root, saved);
  return stepResult(assignment, 'completed', `Made a Higgsfield ${kind}.`, path, { kind, prompt });
}

/** Quick package's Check again: one look at a result still being made; never a new run. */
export async function checkHiggsfieldResult(id: string): Promise<HiggsfieldResult | null> {
  const result = listHiggsfieldResults().find((r) => r.id === id);
  if (!result || result.status !== 'pending' || !result.requestId) return result || null;
  const root = requireOutputRoot(contentAppSettings());
  const answer = await invoke<RunAnswer>('higgsfield_check', { requestId: result.requestId, workspaceRoot: root, outPath: result.path, keys: higgsfieldKeys() })
    .catch(() => null);
  if (answer?.ok && answer.status === 'done') {
    recordSpendUsd(result.usd || 0);
    const done: HiggsfieldResult = { ...result, status: 'done' };
    saveResult(done);
    return done;
  }
  return result;
}
