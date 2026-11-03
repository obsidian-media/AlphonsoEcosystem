// "On this phone" (phone phase 4): what the phone can answer with while the computer is off. The
// OpenRouter key is typed here and kept in this phone's keychain; it never goes to the computer.
import React, { useEffect, useState } from 'react';
import { appleModelLine, type AppleModelStatus, type PhoneOwnModels } from '../phoneModels';

export function OnThisPhoneScreen({ models }: { models: PhoneOwnModels }) {
  const [status, setStatus] = useState<AppleModelStatus | null>(null);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [key, setKey] = useState('');
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void models.modelStatus().then((s) => { if (live) setStatus(s); }).catch(() => { if (live) setStatus({ available: false, reason: null }); });
    void models.hasOpenRouterKey().then((h) => { if (live) setHasKey(h); }).catch(() => { if (live) setHasKey(false); });
    return () => { live = false; };
  }, [models]);
  const save = async () => {
    const value = key.trim();
    if (!value) return;
    try {
      await models.saveOpenRouterKey(value);
      setKey('');
      setHasKey(true);
      setNote('Saved on this phone.');
    } catch {
      setNote("The key couldn't be saved on this phone.");
    }
  };
  return (
    <div className="space-y-4 pt-3 text-sm" data-testid="mobile-on-this-phone">
      <p className="text-(--text-2)">While your computer is off, a waiting message in Chat can be answered here. Anything that sends, posts or changes a project waits for your computer.</p>
      <section className="space-y-1 rounded-xl bg-(--surface-2) p-3">
        <h2 className="font-medium">Apple's model</h2>
        <p>{status === null ? "Checking Apple's model…" : appleModelLine(status)}</p>
      </section>
      <section className="space-y-2 rounded-xl bg-(--surface-2) p-3">
        <h2 className="font-medium">OpenRouter (free models only)</h2>
        {hasKey !== null && <p className="text-xs text-(--text-3)">{hasKey ? 'A key is saved on this phone.' : 'No key saved yet. A free key from openrouter.ai works.'}</p>}
        <label className="block">
          <span className="mb-1 block text-xs">OpenRouter key (free)</span>
          <input type="password" autoComplete="off" value={key} onChange={(e) => { setKey(e.target.value); setNote(null); }} className="w-full rounded-lg border border-(--border) px-3 py-2" />
        </label>
        <button type="button" onClick={save} disabled={!key.trim()} className="min-h-11 rounded-lg bg-(--accent) px-4 text-white disabled:opacity-50">Save key</button>
        {note && <p role="status" className="text-xs">{note}</p>}
      </section>
    </div>
  );
}
