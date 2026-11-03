// @vitest-environment node
// Phone phase 4 test round (throwaway, spike/phone-phase4): the desktop baseline. The same 20
// questions to the starter model on this computer's Ollama. Runs only with ALPHONSO_SPIKE_OLLAMA=1;
// writes spike-results/desktop.json (git-ignored).
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PHASE4_QUESTIONS, type SpikeAgent } from '../../mobile/spike/phase4Questions';
import { redactKeys, summarize, type SpikeAnswer } from '../../mobile/spike/phase4Score';
import { STARTER_MODEL_TAG } from '../../services/setupFlowService';
import { getConfiguredOllamaEndpoint } from '../../lib/ollama';

const answers: SpikeAnswer[] = [];

async function ask(system: string, prompt: string, json: boolean): Promise<{ text: string | null; ms: number; error: string | null }> {
  const started = Date.now();
  try {
    const messages = [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }];
    const res = await fetch(`${getConfiguredOllamaEndpoint().replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: STARTER_MODEL_TAG, stream: false, messages, ...(json ? { format: 'json' } : {}) }),
    });
    const body = await res.json();
    if (!res.ok) return { text: null, ms: Date.now() - started, error: redactKeys(`HTTP ${res.status}: ${JSON.stringify(body).slice(0, 300)}`) };
    return { text: redactKeys(String(body?.message?.content ?? '')), ms: Date.now() - started, error: null };
  } catch (e) {
    return { text: null, ms: Date.now() - started, error: redactKeys(String((e as Error)?.message || e)) };
  }
}

describe.skipIf(!process.env.ALPHONSO_SPIKE_OLLAMA)('phase 4 desktop baseline', () => {
  for (const agent of ['jose', 'alphonso', 'echo'] as SpikeAgent[]) {
    it(`asks ${agent}'s questions`, async () => {
      for (const q of PHASE4_QUESTIONS.filter((x) => x.agent === agent)) {
        const r = await ask(q.system, q.prompt, agent === 'jose');
        answers.push({ questionId: q.id, engine: 'desktop', model: STARTER_MODEL_TAG, ...r });
      }
      expect(answers.length).toBeGreaterThan(0);
    }, 600000);
  }

  it('writes the results', () => {
    const summary = summarize(answers);
    mkdirSync('spike-results', { recursive: true });
    writeFileSync('spike-results/desktop.json', JSON.stringify({ engine: 'desktop', model: STARTER_MODEL_TAG, answers, summary }, null, 2));
    console.log(JSON.stringify(summary, null, 2));
    expect(answers).toHaveLength(PHASE4_QUESTIONS.length);
  });
});
