// Phase 4c: training a character on Higgsfield — one step that asks first, never trained twice.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const backend: Record<string, (args: any) => unknown> = {};
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args: any) => {
    if (cmd === 'kv_set' || cmd === 'kv_get' || cmd === 'save_image_to_folder') return null;
    if (!backend[cmd]) throw new Error(`unexpected command ${cmd}`);
    return backend[cmd](args);
  }),
}));
const creds: Record<string, string> = {};
vi.mock('../../../services/connectors/connectorAuth', () => ({ getConnectorCredential: (_c: string, k: string) => creds[k] || '' }));
vi.mock('../../../services/joseExecutionEngineService', () => ({
  runJoseCommandExecutionPipeline: vi.fn(async () => ({ ok: true, commandId: 'c7', pendingApprovalCount: 1 })),
  runPipelineShortcuts: vi.fn(async () => null),
}));

import { invoke } from '@tauri-apps/api/core';
import { runJoseCommandExecutionPipeline } from '../../../services/joseExecutionEngineService';
import { getBrand, saveBrand } from '../../../services/contentFactory/contentBrandService';
import { addCharacter, setPermission, updateCharacter } from '../../../services/contentFactory/contentCharacters';
import { trainCharacter, executeCharacterTraining, checkCharacterTraining } from '../../../services/contentFactory/contentCharacterTraining';
import { monthSpendUsd } from '../../../services/jose/joseSpend';

const settings = { outputFolder: 'D:\\Content' };
function ready(kind: 'made_up' | 'real_person' = 'made_up') {
  const brand = saveBrand({ name: 'B' });
  const c = addCharacter(brand.id, { name: 'Ana', kind, description: 'a teacher' });
  updateCharacter(brand.id, c.id, { pictures: Array.from({ length: 6 }, (_, i) => `b/characters/${c.id}/p${i}.png`) });
  return { brand, c };
}
const character = (brandId: string) => getBrand(brandId)!.characters![0];

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('alphonso_settings', JSON.stringify({ outputFolder: 'D:\\Content', zeroCostMode: false }));
  for (const k of Object.keys(backend)) delete backend[k];
  for (const k of Object.keys(creds)) delete creds[k];
  Object.assign(creds, { HIGGSFIELD_KEY_ID: 'id', HIGGSFIELD_KEY_SECRET: 'secret', HIGGSFIELD_CHARACTER_MODEL: 'soul/train', HIGGSFIELD_CHARACTER_EXTRA: '' });
  backend.higgsfield_estimate_training = () => ({ ok: true, usd: 2.5 });
  vi.clearAllMocks();
});

describe('training a character', () => {
  it('asks through one step with Higgsfield\u2019s estimate', async () => {
    const { brand, c } = ready();
    await trainCharacter(brand.id, c.id, settings);
    const args = vi.mocked(runJoseCommandExecutionPipeline).mock.calls[0][0] as any;
    expect(args.assignments).toHaveLength(1);
    expect(args.assignments[0]).toMatchObject({
      agent: 'miya', actionType: 'creative_character_train', costEstimateUsd: 2.5, payload: { brandId: brand.id, characterId: c.id },
    });
    expect(args.assignments[0].effects).toContain('spend');
  });

  it('a real person without the tick is never sent', async () => {
    const { brand, c } = ready('real_person');
    await expect(trainCharacter(brand.id, c.id, settings)).rejects.toThrow('Tick that this is you or that you have permission first.');
    expect(runJoseCommandExecutionPipeline).not.toHaveBeenCalled();
    setPermission(brand.id, c.id, true);
    await trainCharacter(brand.id, c.id, settings);
    expect(runJoseCommandExecutionPipeline).toHaveBeenCalledTimes(1);
  });

  it('the approved step saves "training" before it sends, and the result later', async () => {
    const { brand, c } = ready();
    let statusWhenSent = '';
    backend.higgsfield_train_character = (a) => {
      statusWhenSent = character(brand.id).higgsfield?.status || '';
      expect(a.request).toMatchObject({ model: 'soul/train', name: 'Ana' });
      expect(a.request.imagePaths).toHaveLength(6);
      return { ok: true, status: 'training', requestId: 'req-t' };
    };
    const result = await executeCharacterTraining({ agent: 'miya', actionType: 'creative_character_train', effects: ['write_own_work', 'spend'], costEstimateUsd: 2.5, payload: { brandId: brand.id, characterId: c.id } } as any);
    expect(result.resultState).toBe('completed');
    expect(statusWhenSent).toBe('training');
    expect(character(brand.id).higgsfield).toMatchObject({ status: 'training', requestId: 'req-t', usd: 2.5 });
    expect(monthSpendUsd()).toBe(0);
  });

  it('training kept across a restart is fetched by Check again, never trained twice', async () => {
    const { brand, c } = ready();
    updateCharacter(brand.id, c.id, { higgsfield: { status: 'training', requestId: 'req-t', usd: 2.5 } });
    await trainCharacter(brand.id, c.id, settings);
    expect(runJoseCommandExecutionPipeline).not.toHaveBeenCalled();
    backend.higgsfield_character_status = () => ({ ok: true, status: 'ready', characterId: 'soul-9', requestId: 'req-t' });
    await checkCharacterTraining(brand.id, c.id);
    expect(character(brand.id).higgsfield).toMatchObject({ status: 'ready', characterId: 'soul-9' });
    expect(monthSpendUsd()).toBeCloseTo(2.5, 6);
    expect(vi.mocked(invoke).mock.calls.some((call) => call[0] === 'higgsfield_train_character')).toBe(false);
    await checkCharacterTraining(brand.id, c.id);
    expect(monthSpendUsd()).toBeCloseTo(2.5, 6);
  });

  it('without the approval nothing is sent', async () => {
    const { brand, c } = ready();
    const result = await executeCharacterTraining({ agent: 'miya', actionType: 'creative_character_train', effects: ['write_own_work'], payload: { brandId: brand.id, characterId: c.id } } as any);
    expect(result.resultState).toBe('failed');
    expect(vi.mocked(invoke).mock.calls.some((call) => call[0] === 'higgsfield_train_character')).toBe(false);
  });
});
