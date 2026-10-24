// Phase 4b: the voice, picture and clip engines — a brand's default, a project's override,
// and the free one (with the reason) when a paid one isn't available.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const creds: Record<string, string> = {};
vi.mock('../../../services/connectors/connectorAuth', () => ({ getConnectorCredential: (_c: string, k: string) => creds[k] || '' }));

import { projectEngines, resolveVoice, resolvePictures, paidEngineAvailable } from '../../../services/contentFactory/engineChoice';
import { saveBrand, getBrand } from '../../../services/contentFactory/contentBrandService';
import { createProject, emptyBrief, getProject, setVideoSettings } from '../../../services/contentFactory/contentProjectService';
import { recordSpendUsd } from '../../../services/jose/joseSpend';

const settings = (s: Record<string, unknown>) => localStorage.setItem('alphonso_settings', JSON.stringify(s));

beforeEach(() => {
  localStorage.clear();
  for (const k of Object.keys(creds)) delete creds[k];
  settings({ zeroCostMode: false, paidModels: { elevenLabsPricePer1kCharsUsd: 0.3 } });
});

function setup(engines?: Record<string, unknown>) {
  const brand = saveBrand({ name: 'Acme', ...(engines ? { engines } : {}) } as any);
  const p = createProject(brand.id, 'P', emptyBrief());
  return { brand: getBrand(brand.id)!, project: getProject(p.id)! };
}

describe('projectEngines', () => {
  it('the free engines are the default', () => {
    const { brand, project } = setup();
    expect(projectEngines(project, brand)).toEqual({ voice: { engine: 'kokoro', voiceId: 'af_heart' }, pictures: 'comfyui', clips: null });
  });

  it("the brand's choice is used, and a project override wins", () => {
    const { brand, project } = setup({ voice: { engine: 'elevenlabs', voiceId: 'v2', modelId: 'm1' }, pictures: 'higgsfield', clips: 'higgsfield' });
    expect(projectEngines(project, brand)).toEqual({ voice: { engine: 'elevenlabs', voiceId: 'v2', modelId: 'm1' }, pictures: 'higgsfield', clips: 'higgsfield' });
    const overridden = setVideoSettings(project.id, { voiceEngine: 'kokoro', pictures: 'comfyui', clipEngine: 'local' } as any);
    expect(projectEngines(overridden, brand)).toEqual({ voice: { engine: 'kokoro', voiceId: 'af_heart' }, pictures: 'comfyui', clips: 'local' });
  });
});

describe('paid engines that are not available', () => {
  it('fall back to the free one with the reason', () => {
    const { brand, project } = setup({ voice: { engine: 'elevenlabs', voiceId: 'v2' }, pictures: 'higgsfield' });
    expect(resolveVoice(project, brand)).toEqual({ engine: 'kokoro', voiceId: 'af_heart', note: "ElevenLabs isn't set up; read by Kokoro." });
    expect(resolvePictures(project, brand)).toEqual({ engine: 'comfyui', note: "Higgsfield isn't set up; made with ComfyUI." });

    creds.ELEVENLABS_API_KEY = 'k';
    creds.HIGGSFIELD_KEY_ID = 'id';
    creds.HIGGSFIELD_KEY_SECRET = 'secret';
    expect(resolveVoice(project, brand)).toEqual({ engine: 'elevenlabs', voiceId: 'v2' });
    expect(resolvePictures(project, brand)).toEqual({ engine: 'higgsfield' });

    settings({ zeroCostMode: true });
    expect(resolveVoice(project, brand).note).toBe('ElevenLabs is off while Zero-Cost Mode is on; read by Kokoro.');
    expect(resolvePictures(project, brand).note).toBe('Higgsfield is off while Zero-Cost Mode is on; made with ComfyUI.');

    settings({ zeroCostMode: false, paidModels: { monthlyCapUsd: 1, elevenLabsPricePer1kCharsUsd: 0.3 } });
    recordSpendUsd(1);
    expect(paidEngineAvailable('higgsfield').reason).toMatch(/monthly cap/);
  });
});
