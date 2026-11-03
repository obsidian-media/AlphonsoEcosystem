// Phone phase 4 test round (throwaway, spike/phone-phase4): the hidden "Phase 4 test" screen.
// Runs the 20 questions on Apple's own model and on free cloud models, then shows the results as
// JSON for the owner to copy back. Keys are kept in the phone's keychain and never in the results.
// Design: docs/superpowers/specs/2026-11-02-alphonso-mobile-phase4-design.md
import React, { useEffect, useState } from 'react';
import { PHASE4_QUESTIONS } from './phase4Questions';
import { redactKeys, summarize, type SpikeAnswer } from './phase4Score';
import { askCloud, pickFreeModel, probeTransport, type CloudProvider, type HttpCall } from './phase4Cloud';
import type { PhoneSecrets } from '../phoneSession';

export interface Phase4TestProps {
  phoneModel: { status(): Promise<{ available: boolean; reason: string | null }>; answer(system: string, prompt: string): Promise<{ text: string; ms: number }> };
  networkKind: () => Promise<'wifi' | 'cellular' | 'none'>;
  secrets: PhoneSecrets;
  http: { fetch: HttpCall; native: HttpCall };
}

const PROVIDERS: Array<{ id: CloudProvider; label: string }> = [
  { id: 'openrouter', label: 'OpenRouter key' },
  { id: 'nvidia', label: 'NVIDIA key' },
  { id: 'gemini', label: 'Gemini key' },
];

const WHY_NOT: Record<string, string> = {
  notIOS26: "Apple's model needs iOS 26 or later.",
  deviceNotEligible: "This iPhone can't run Apple's model.",
  appleIntelligenceNotEnabled: 'Apple Intelligence is off: turn it on in Settings → Apple Intelligence & Siri.',
  modelNotReady: "Apple's model is still downloading. Try again later.",
};

const keySlot = (p: CloudProvider) => `spike_${p}_key`;

export function Phase4TestScreen({ phoneModel, networkKind, secrets, http }: Phase4TestProps) {
  const [status, setStatus] = useState<{ available: boolean; reason: string | null } | null>(null);
  const [keys, setKeys] = useState<Record<CloudProvider, string>>({ openrouter: '', nvidia: '', gemini: '' });
  const [phone, setPhone] = useState<SpikeAnswer[]>([]);
  const [cloud, setCloud] = useState<SpikeAnswer[]>([]);
  const [transport, setTransport] = useState<Record<string, { fetch: string; native: string }>>({});
  const [cloudNotes, setCloudNotes] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [copyNote, setCopyNote] = useState<string | null>(null);

  useEffect(() => {
    void phoneModel.status().then(setStatus);
    void Promise.all(PROVIDERS.map(async (p) => [p.id, (await secrets.get(keySlot(p.id)).catch(() => null)) || ''] as const))
      .then((pairs) => setKeys((now) => ({ ...Object.fromEntries(pairs), ...Object.fromEntries(Object.entries(now).filter(([, v]) => v)) }) as Record<CloudProvider, string>));
  }, [phoneModel, secrets]);

  const runPhone = async () => {
    setBusy('phone');
    const out: SpikeAnswer[] = [];
    for (const q of PHASE4_QUESTIONS) {
      const network = await networkKind();
      const started = Date.now();
      try {
        const r = await phoneModel.answer(q.system, q.prompt);
        out.push({ questionId: q.id, engine: 'phone', model: 'apple-on-device', text: redactKeys(r.text), ms: r.ms, error: null, network });
      } catch (e) {
        out.push({ questionId: q.id, engine: 'phone', model: 'apple-on-device', text: null, ms: Date.now() - started, error: redactKeys(String((e as Error)?.message || e)), network });
      }
      setPhone([...out]);
    }
    setBusy(null);
  };

  const runCloud = async () => {
    setBusy('cloud');
    const out: SpikeAnswer[] = [];
    const notes: string[] = [];
    for (const p of PROVIDERS) {
      const key = keys[p.id].trim();
      if (!key) continue;
      await secrets.set(keySlot(p.id), key);
      const picked = await pickFreeModel(p.id, http.native, key);
      if ('error' in picked) { notes.push(`${p.id}: ${redactKeys(picked.error)}`); continue; }
      for (const q of PHASE4_QUESTIONS) {
        const network = await networkKind();
        const a = await askCloud(p.id, http.native, key, picked.model, q.system, q.prompt);
        out.push({ ...a, questionId: q.id, network });
        setCloud([...out]);
      }
    }
    setCloudNotes(notes);
    setBusy(null);
  };

  const runTransport = async () => {
    setBusy('transport');
    const found: Record<string, { fetch: string; native: string }> = {};
    for (const p of PROVIDERS) {
      const key = keys[p.id].trim();
      if (key) found[p.id] = await probeTransport(p.id, key, http);
    }
    setTransport(found);
    setBusy(null);
  };

  const results = JSON.stringify({
    device: { userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '' },
    appleModel: status,
    phone,
    cloud,
    cloudNotes,
    transport,
    summary: summarize([...phone, ...cloud]),
  }, null, 2);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(results);
      setCopyNote('Copied.');
    } catch {
      setCopyNote('Select the text below and copy it.');
    }
  };

  const done = (list: SpikeAnswer[]) => `${list.length} of ${PHASE4_QUESTIONS.length * (list === cloud ? Math.max(1, PROVIDERS.filter((p) => keys[p.id].trim()).length) : 1)}`;

  return (
    <div className="space-y-4 p-4 text-sm" data-testid="phase4-test">
      <h1 className="text-lg font-semibold">Phase 4 test</h1>
      <p>{status === null ? "Checking Apple's model…" : status.available ? "Apple's model is ready on this iPhone." : WHY_NOT[status.reason || ''] || "Apple's model isn't available here."}</p>
      <button type="button" disabled={!status?.available || !!busy} onClick={runPhone} className="min-h-11 w-full rounded-xl bg-(--accent) px-4 text-white disabled:opacity-50">Run on this phone</button>
      {phone.length > 0 && <p>On this phone: {done(phone)}</p>}

      {PROVIDERS.map((p) => (
        <label key={p.id} className="block space-y-1">
          <span>{p.label}</span>
          <input type="password" autoComplete="off" value={keys[p.id]} onChange={(e) => setKeys({ ...keys, [p.id]: e.target.value })} className="w-full rounded-lg bg-(--surface-2) p-2" />
        </label>
      ))}
      <button type="button" disabled={!!busy || !PROVIDERS.some((p) => keys[p.id].trim())} onClick={runCloud} className="min-h-11 w-full rounded-xl bg-(--accent) px-4 text-white disabled:opacity-50">Run with free cloud models</button>
      {cloud.length > 0 && <p>Free cloud models: {done(cloud)}</p>}
      <button type="button" disabled={!!busy || !PROVIDERS.some((p) => keys[p.id].trim())} onClick={runTransport} className="min-h-11 w-full rounded-xl bg-(--surface-3) px-4 disabled:opacity-50">Check how calls are sent</button>

      <button type="button" onClick={copy} className="min-h-11 w-full rounded-xl bg-(--surface-3) px-4">Copy results</button>
      {copyNote && <p role="status">{copyNote}</p>}
      <textarea readOnly data-testid="phase4-results" value={results} className="h-64 w-full rounded-lg bg-(--surface-2) p-2 font-mono text-xs" />
    </div>
  );
}
