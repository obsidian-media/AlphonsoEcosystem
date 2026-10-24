// Phase 4b: "Make a Higgsfield picture/video of …" from anywhere becomes one Miya step that asks with the estimate.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const backend: Record<string, (args: any) => unknown> = {};
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args: any) => {
    if (cmd === 'kv_set' || cmd === 'kv_get') return null;
    if (!backend[cmd]) throw new Error(`unexpected command ${cmd}`);
    return backend[cmd](args);
  }),
}));
const creds: Record<string, string> = {};
vi.mock('../../../services/connectors/connectorAuth', () => ({
  getConnectorCredential: (_c: string, k: string) => creds[k] || '',
  getConnectorCredentials: () => ({}),
}));
vi.mock('../../../services/joseExecutionEngineService', () => ({
  runJoseCommandExecutionPipeline: vi.fn(async () => ({ ok: true, commandId: 'c9', pendingApprovalCount: 1 })),
  runPipelineShortcuts: vi.fn(async () => null),
}));

import { invoke } from '@tauri-apps/api/core';
import { runJoseCommandExecutionPipeline } from '../../../services/joseExecutionEngineService';
import { detectCreativeIntent } from '../../../services/creativeRoutingService';
import { submitToJose } from '../../../services/jose/submitToJose';
import { executeHiggsfieldByName, listHiggsfieldResults, HIGGSFIELD_BY_NAME_NOT_SET_UP, HIGGSFIELD_LABEL, HIGGSFIELD_NOT_FROM_SCHEDULE } from '../../../services/contentFactory/higgsfieldByName';
import { sendTelegramFileOrFolder } from '../../../services/telegramCompanionService';
import { setStorage } from '../../../lib/appStorage';
import { monthSpendUsd } from '../../../services/jose/joseSpend';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('alphonso_settings', JSON.stringify({ outputFolder: 'D:\\Content', zeroCostMode: false }));
  for (const k of Object.keys(backend)) delete backend[k];
  for (const k of Object.keys(creds)) delete creds[k];
  Object.assign(creds, { HIGGSFIELD_KEY_ID: 'id', HIGGSFIELD_KEY_SECRET: 'secret', HIGGSFIELD_CLIP_MODEL: 'kling/t2v', HIGGSFIELD_PICTURE_MODEL: 'soul/v2' });
  backend.higgsfield_estimate = () => ({ ok: true, usd: 0.4 });
  vi.clearAllMocks();
});

describe('asking for Higgsfield by name', () => {
  it('is recognised in the wording, before the general picture and video requests', () => {
    expect(detectCreativeIntent('make a Higgsfield video of a pour')).toBe('higgsfield_video');
    expect(detectCreativeIntent('Create a higgsfield picture of a cat')).toBe('higgsfield_picture');
    expect(detectCreativeIntent('make a video of a pour')).toBe('video_generation');
  });

  it('"make a Higgsfield video of a pour" becomes one Miya step that asks with the estimate', async () => {
    const result = await submitToJose({ text: 'make a Higgsfield video of a pour', source: 'user' });
    const args = vi.mocked(runJoseCommandExecutionPipeline).mock.calls[0][0] as any;
    expect(args.assignments).toHaveLength(1);
    expect(args.assignments[0]).toMatchObject({
      agent: 'miya', actionType: 'creative_higgsfield', costEstimateUsd: 0.4, payload: { kind: 'video', prompt: 'a pour' },
    });
    expect(args.assignments[0].effects).toContain('spend');
    expect(result.planNote).toContain(HIGGSFIELD_LABEL);
  });

  it('is asked of Higgsfield even when the wording also fits a content video', async () => {
    await submitToJose({ text: 'make a Higgsfield video for my channel of a pour', source: 'user' });
    const args = vi.mocked(runJoseCommandExecutionPipeline).mock.calls[0]?.[0] as any;
    expect(args?.assignments?.[0]).toMatchObject({ actionType: 'creative_higgsfield', payload: { kind: 'video' } });
  });

  it('a schedule never asks Higgsfield: it costs money', async () => {
    const result = await submitToJose({ text: 'make a Higgsfield picture of a sunrise', source: 'schedule', allowPaidModels: false });
    expect(result).toMatchObject({ ok: false, planNote: HIGGSFIELD_NOT_FROM_SCHEDULE });
    expect(HIGGSFIELD_NOT_FROM_SCHEDULE).toBe("Higgsfield costs money, so a schedule doesn't use it. Nothing was started.");
    expect(runJoseCommandExecutionPipeline).not.toHaveBeenCalled();
  });

  it('not set up → the plain reply and nothing started', async () => {
    delete creds.HIGGSFIELD_CLIP_MODEL;
    const result = await submitToJose({ text: 'make a Higgsfield video of a pour', source: 'telegram' });
    expect(result).toMatchObject({ ok: false, planNote: HIGGSFIELD_BY_NAME_NOT_SET_UP });
    expect(HIGGSFIELD_BY_NAME_NOT_SET_UP).toBe("Higgsfield isn't set up: add your keys and a model id in Settings → Connectors → Higgsfield. Nothing was started.");
    expect(runJoseCommandExecutionPipeline).not.toHaveBeenCalled();
  });

  it('the result is saved under Higgsfield/<date>/ and listed, and paid for', async () => {
    backend.higgsfield_run = (a) => ({ ok: true, status: 'done', path: a.outPath });
    const result = await executeHiggsfieldByName({
      agent: 'miya', actionType: 'creative_higgsfield', effects: ['write_own_work', 'spend'], costEstimateUsd: 0.4, payload: { kind: 'video', prompt: 'a pour' },
    } as any, { id: 'p1', commandId: 'c9' });
    const run = vi.mocked(invoke).mock.calls.find((c) => c[0] === 'higgsfield_run')![1] as any;
    expect(run.outPath).toMatch(/^Higgsfield\/\d{4}-\d{2}-\d{2}\/video-\d{6}-[0-9a-f]{4}\.mp4$/);
    expect(run.job).toMatchObject({ model: 'kling/t2v', prompt: 'a pour' });
    expect(result.resultState).toBe('completed');
    expect(listHiggsfieldResults()[0]).toMatchObject({ kind: 'video', prompt: 'a pour', path: run.outPath, status: 'done', commandId: 'c9' });
    expect(monthSpendUsd()).toBeCloseTo(0.4, 6);
  });

  it('without the approval nothing is sent', async () => {
    const result = await executeHiggsfieldByName({ agent: 'miya', actionType: 'creative_higgsfield', effects: ['write_own_work'], payload: { kind: 'picture', prompt: 'x' } } as any, null);
    expect(result.resultState).toBe('failed');
    expect(vi.mocked(invoke).mock.calls.some((c) => c[0] === 'higgsfield_run')).toBe(false);
  });
});

describe('Telegram', () => {
  beforeEach(() => {
    creds.TELEGRAM_BOT_TOKEN = 't';
    setStorage('alphonso_telegram_owner_chat_id', '42');
  });

  it('the file is sent when small, else the folder', async () => {
    backend.connector_send_telegram_file = () => ({ ok: true });
    expect(await sendTelegramFileOrFolder({ root: 'D:\\Content', relativePath: 'Higgsfield/2026-10-24/video-1.mp4', caption: 'Your Higgsfield video.' })).toBe('file');
    expect(vi.mocked(invoke)).toHaveBeenCalledWith('connector_send_telegram_file', expect.objectContaining({ chatId: '42', workspaceRoot: 'D:\\Content', relativePath: 'Higgsfield/2026-10-24/video-1.mp4' }));
    backend.connector_send_telegram_file = () => ({ ok: false, tooLarge: true });
    backend.connector_send_telegram = () => ({ ok: true });
    expect(await sendTelegramFileOrFolder({ root: 'D:\\Content', relativePath: 'Higgsfield/2026-10-24/video-1.mp4', caption: 'Your Higgsfield video.' })).toBe('folder');
    const text = (vi.mocked(invoke).mock.calls.filter((c) => c[0] === 'connector_send_telegram').pop()![1] as any).text;
    expect(text).toContain('too large for Telegram');
    expect(text).toContain('Higgsfield');
  });
});
