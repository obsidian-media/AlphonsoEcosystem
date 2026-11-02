// Connectors on the phone (phase 3 part B, owner 2026-11-02): each connector's status, its last check and
// its on/off switch. Keys are set up on the computer only.
import React, { useEffect, useState } from 'react';
import { reasonOf, type MoreData } from '../../services/phone/remoteData';
import { PhoneSwitch } from './PhoneSwitch';

export function ConnectorsScreen({ more }: { more: MoreData }) {
  const [list, setList] = useState(more.connectors());
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => more.subscribe(() => setList(more.connectors())), [more]);
  const toggle = async (id: string, enabled: boolean, base: boolean) => {
    setBusy(id);
    try {
      const r = await more.call('connector.setEnabled', { id, enabled, base });
      setMessage(r.ok ? '' : reasonOf(r));
    } finally { setBusy(null); }
  };
  return (
    <div className="space-y-3 pt-2 text-sm" data-testid="mobile-connectors">
      {more.readOnly && more.readOnlyReason && <p className="text-xs text-(--text-3)">{more.readOnlyReason}</p>}
      {message && <p role="status" className="rounded-lg bg-(--surface-3) px-3 py-2 text-xs">{message}</p>}
      <ul className="space-y-2">
        {list.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl bg-(--surface-2) p-3">
            <div className="min-w-0">
              <span className="block font-medium">{c.name}</span>
              <span className="block text-xs text-(--text-2)">{c.statusLabel}</span>
              {c.lastCheck && (
                <span className="block text-xs text-(--text-3)">
                  {`Last check ${new Date(c.lastCheck.atMs).toLocaleString()}: ${c.lastCheck.ok ? 'passed' : 'failed'}`}
                </span>
              )}
              {c.needsKeys && <span className="block text-xs text-(--text-3)">Set up on your computer</span>}
            </div>
            <PhoneSwitch label={c.name} on={c.enabled} disabled={more.readOnly || busy !== null} onChange={(next) => void toggle(c.id, next, c.enabled)} />
          </li>
        ))}
      </ul>
    </div>
  );
}
