// Training a brand's character on Higgsfield (content factory phase 4c). It runs as one Jose
// step (`creative_character_train`, `spend`), so it always asks first with Higgsfield's
// estimate, from the Brands tab or anywhere. The status is saved before anything is sent, a
// character already training or ready is never trained again, and Check again only looks.
import { invoke } from '@tauri-apps/api/core';
import { higgsfieldAvailable, higgsfieldKeys, higgsfieldModels } from '../connectors/higgsfieldConnector';
import { canSpend, recordSpendUsd } from '../jose/joseSpend';
import { submitStepsToJose } from '../jose/submitToJose';
import type { PlanStep } from '../jose/stepGraph';
import { getBrand } from './contentBrandService';
import { characterUsable, getCharacter, updateCharacter } from './contentCharacters';
import { requireOutputRoot } from './contentProjectFiles';
import { contentAppSettings } from './contentStepRecorder';
import type { BrandCharacter } from './contentTypes';

type Settings = { outputFolder?: string | null };
export const TRAINING_LABEL = 'Training a character on Higgsfield.';
export const NO_TRAINING_MODEL = 'Paste a character training model id in Settings → Connectors → Higgsfield.';

type TrainAnswer = { ok?: boolean; status?: string; characterId?: string; requestId?: string; reason?: string };

function load(brandId: string, id: string): BrandCharacter {
  const brand = getBrand(brandId);
  const c = brand ? getCharacter(brand, id) : null;
  if (!c) throw new Error('That character no longer exists.');
  return c;
}

function canTrain(): string | null {
  const can = higgsfieldAvailable();
  if (!can.ok) return can.reason || "Higgsfield isn't set up.";
  const models = higgsfieldModels();
  if (!models.character) return NO_TRAINING_MODEL;
  if (models.characterExtraProblem) return models.characterExtraProblem;
  return null;
}

/** Higgsfield's estimate for training (nothing uploaded). */
export async function estimateCharacterTraining(name: string): Promise<{ ok: boolean; usd?: number; reason?: string }> {
  const problem = canTrain();
  if (problem) return { ok: false, reason: problem };
  const models = higgsfieldModels();
  try {
    return await invoke('higgsfield_estimate_training', {
      request: { model: models.character, name, imagePaths: [], extra: models.characterExtra ?? null }, keys: higgsfieldKeys(),
    }) as { ok: boolean; usd?: number; reason?: string };
  } catch {
    return { ok: false, reason: 'Higgsfield could not be reached.' };
  }
}

/** Starts training as one step that asks first; already training or ready → nothing new. */
export async function trainCharacter(brandId: string, id: string, _settings: Settings): Promise<{ ok: boolean; already?: 'training' | 'ready'; requestId?: string | null; reason?: string }> {
  const c = load(brandId, id);
  const usable = characterUsable(c);
  if (!usable.ok) throw new Error(usable.reason);
  if (c.higgsfield?.status === 'training' || c.higgsfield?.status === 'ready') return { ok: true, already: c.higgsfield.status };
  const problem = canTrain();
  if (problem) throw new Error(problem);
  const estimate = await estimateCharacterTraining(c.name);
  if (!estimate.ok || typeof estimate.usd !== 'number') throw new Error(`${estimate.reason || 'Higgsfield gave no estimate.'} Nothing was started.`);
  const step = {
    stepId: 'miya', agent: 'miya', actionType: 'creative_character_train', effects: ['write_own_work', 'spend'], needs: [],
    instruction: `Train ${c.name} on Higgsfield from ${c.pictures.length} pictures.`, payload: { brandId, characterId: id }, costEstimateUsd: estimate.usd,
  } as PlanStep;
  const result = await submitStepsToJose({ text: `Train the character ${c.name}`, source: 'content-factory', steps: [step], label: TRAINING_LABEL, saveDecisions: false });
  return { ok: Boolean(result?.ok), requestId: result?.requestId ?? null };
}

function stepResult(state: 'completed' | 'failed', summary: string) {
  return {
    summary: `miya: ${summary}`, resultState: state,
    artifacts: [{ type: 'character_training', actionType: 'creative_character_train', data: null, raw: '' }],
    sources: [], contractAction: 'creative_character_train', ...(state === 'failed' ? { failureReason: summary } : {}),
  };
}

function saveOutcome(brandId: string, id: string, answer: TrainAnswer, usd: number | undefined): string {
  if (answer.status === 'ready' && answer.characterId) {
    if (usd !== undefined) recordSpendUsd(usd);
    updateCharacter(brandId, id, { higgsfield: { status: 'ready', characterId: answer.characterId, requestId: answer.requestId, usd } });
    return 'The character is trained on Higgsfield.';
  }
  if (answer.status === 'training' && answer.requestId) {
    updateCharacter(brandId, id, { higgsfield: { status: 'training', requestId: answer.requestId, usd } });
    return 'Higgsfield is training the character; Check again in the Brands tab.';
  }
  const reason = answer.reason || 'Higgsfield could not train this character.';
  updateCharacter(brandId, id, { higgsfield: { status: 'failed', reason, requestId: answer.requestId, usd } });
  return reason;
}

/** The step (the engine sends `creative_character_train` here): only with its approved spending. */
export async function executeCharacterTraining(assignment: { effects?: string[]; costEstimateUsd?: number; payload?: { brandId?: string; characterId?: string } }) {
  const brandId = String(assignment.payload?.brandId || '');
  const id = String(assignment.payload?.characterId || '');
  if (!(assignment.effects || []).includes('spend')) return stepResult('failed', "Training wasn't approved; nothing was sent.");
  let c: BrandCharacter;
  try { c = load(brandId, id); } catch (error) { return stepResult('failed', (error as Error).message); }
  const usable = characterUsable(c);
  if (!usable.ok) return stepResult('failed', String(usable.reason));
  if (c.higgsfield?.status === 'training' || c.higgsfield?.status === 'ready') return stepResult('completed', 'Already trained or training.');
  const problem = canTrain();
  if (problem) return stepResult('failed', problem);
  const usd = Number.isFinite(assignment.costEstimateUsd) ? Number(assignment.costEstimateUsd) : undefined;
  const cap = canSpend(usd ?? 0);
  if (!cap.ok) return stepResult('failed', `${cap.reason}; nothing was sent.`);
  let root: string;
  try { root = requireOutputRoot(contentAppSettings()); } catch (error) { return stepResult('failed', (error as Error).message); }
  // Saved first, so a restart mid-request never trains twice.
  updateCharacter(brandId, id, { higgsfield: { status: 'training', usd } });
  const models = higgsfieldModels();
  const answer = await invoke<TrainAnswer>('higgsfield_train_character', {
    request: { model: models.character, name: c.name, imagePaths: c.pictures, extra: models.characterExtra ?? null },
    workspaceRoot: root, keys: higgsfieldKeys(),
  }).catch((): TrainAnswer => ({ ok: false, status: 'failed', reason: 'Higgsfield could not be reached.' }));
  const summary = saveOutcome(brandId, id, answer, usd);
  return stepResult(answer.ok ? 'completed' : 'failed', summary);
}

/** Check again: one look at a training still running; never starts it again. */
export async function checkCharacterTraining(brandId: string, id: string): Promise<BrandCharacter> {
  const c = load(brandId, id);
  const state = c.higgsfield;
  if (state?.status !== 'training' || !state.requestId) return c;
  const answer = await invoke<TrainAnswer>('higgsfield_character_status', { requestId: state.requestId, keys: higgsfieldKeys() })
    .catch((): TrainAnswer => ({ ok: true, status: 'training', requestId: state.requestId }));
  if (answer.status !== 'training') saveOutcome(brandId, id, answer, state.usd);
  return load(brandId, id);
}
