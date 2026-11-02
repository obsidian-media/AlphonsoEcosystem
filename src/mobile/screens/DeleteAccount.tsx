// "Delete my account" (phone phase 3 part C, Apple's guideline 5.1.1(v)): shown in More and, before
// pairing, on the Pair screen. Says what goes, then asks for Face ID before anything is deleted.
import React, { useState } from 'react';
import { DELETE_ACCOUNT_LINE } from '../phoneSession';
import type { PhoneLock } from '../MobileApp';

export function DeleteAccountSection({ lock, onDeleteAccount }: { lock: PhoneLock; onDeleteAccount: () => Promise<{ ok: boolean; reason?: string }> }) {
  const [deleting, setDeleting] = useState<'ask' | 'busy' | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const deleteNow = async () => {
    setDeleting('busy');
    if (!(await lock.confirm('Delete your Alphonso account', { strict: true }))) { setDeleting(null); setNote('Not deleted: Face ID or fingerprint was not confirmed.'); return; }
    const result = await onDeleteAccount();
    setDeleting(null);
    setNote(result.ok ? null : `Not deleted: ${result.reason || 'it could not finish.'}`);
  };
  return (
    <div className="space-y-2 border-t border-(--border) pt-3 text-sm">
      {deleting === null && <button type="button" onClick={() => { setNote(null); setDeleting('ask'); }} className="text-(--danger)">Delete my account</button>}
      {deleting !== null && (
        <>
          <p>{DELETE_ACCOUNT_LINE}</p>
          <div className="flex gap-2">
            <button type="button" disabled={deleting === 'busy'} onClick={deleteNow} className="rounded-lg bg-(--danger) px-4 py-2 text-white">Delete it</button>
            <button type="button" disabled={deleting === 'busy'} onClick={() => setDeleting(null)} className="rounded-lg bg-(--surface-3) px-4 py-2">Keep my account</button>
          </div>
        </>
      )}
      {note && <p role="status" className="text-(--danger)">{note}</p>}
    </div>
  );
}
