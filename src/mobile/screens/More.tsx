import React, { useState } from 'react';
import type { MoreData } from '../../services/phone/remoteData';
import type { PhoneLock } from '../MobileApp';
import { MemoryScreen } from './Memory';
import { ProjectsScreen } from './Projects';
import { BoardroomScreen } from './Boardroom';

/** What comes to the phone in later parts of phase 3 (phone app design). */
export const ON_COMPUTER_FOR_NOW = ['Teams', 'Skills', 'Settings and connectors'];

type Page = 'memory' | 'projects' | 'boardroom';
const PAGES: Array<{ id: Page; name: string }> = [
  { id: 'memory', name: 'Memory' },
  { id: 'projects', name: 'Projects' },
  { id: 'boardroom', name: 'Boardroom' },
];

export interface MoreScreenProps {
  more: MoreData;
  lock: PhoneLock;
  onOpenRequest: (requestId: string) => void;
  /** A Boardroom notice opens its thread here. */
  openThreadId?: string;
  lockEnabled: boolean;
  onLockChange: (on: boolean) => void;
  onSignOut: () => void;
}

export function MoreScreen({ more, lock, onOpenRequest, openThreadId, lockEnabled, onLockChange, onSignOut }: MoreScreenProps) {
  const [page, setPage] = useState<Page | null>(openThreadId ? 'boardroom' : null);
  if (page) {
    return (
      <div className="pt-2">
        <button type="button" onClick={() => setPage(null)} className="text-xs text-(--accent)">Back</button>
        {page === 'memory' && <MemoryScreen more={more} />}
        {page === 'projects' && <ProjectsScreen more={more} onOpenRequest={onOpenRequest} />}
        {page === 'boardroom' && <BoardroomScreen more={more} lock={lock} openThreadId={openThreadId} />}
      </div>
    );
  }
  return (
    <div className="space-y-4 pt-2 text-sm">
      <ul className="space-y-2">
        {PAGES.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => setPage(p.id)} className="min-h-11 w-full rounded-xl bg-(--surface-2) p-3 text-left font-medium">{p.name}</button>
          </li>
        ))}
      </ul>
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
