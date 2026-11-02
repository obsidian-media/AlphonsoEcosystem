import React from 'react';

/** What comes to the phone in later phases (phone app design, phases 2 and 3). */
export const ON_COMPUTER_FOR_NOW = ['Memory', 'Projects', 'Teams', 'Skills', 'Boardroom', 'Settings and connectors'];

export function MoreScreen({ lockEnabled, onLockChange, onSignOut }: { lockEnabled: boolean; onLockChange: (on: boolean) => void; onSignOut: () => void }) {
  return (
    <div className="space-y-4 pt-2 text-sm">
      <section>
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-(--text-3)">On your computer for now</h2>
        <ul className="space-y-1">{ON_COMPUTER_FOR_NOW.map((name) => <li key={name} className="text-(--text-2)">{name}</li>)}</ul>
      </section>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={lockEnabled} onChange={(e) => onLockChange(e.target.checked)} />
        Ask for Face ID or fingerprint when opening
      </label>
      <button type="button" onClick={onSignOut} className="rounded-lg bg-(--surface-3) px-4 py-2">Sign out</button>
    </div>
  );
}
