import React, { useState } from 'react';
import type { MoreData } from '../../services/phone/remoteData';
import type { PhoneLock } from '../MobileApp';
import { MemoryScreen } from './Memory';
import { ProjectsScreen } from './Projects';
import { BoardroomScreen } from './Boardroom';
import { TeamsScreen } from './Teams';
import { SkillsScreen } from './Skills';
import { SettingsScreen } from './PhoneSettings';
import { ConnectorsScreen } from './Connectors';

/** Nothing is left on the computer only since phase 3 part B (2026-11-02). */
export const ON_COMPUTER_FOR_NOW: string[] = [];

type Page = 'memory' | 'projects' | 'boardroom' | 'teams' | 'skills' | 'settings' | 'connectors';
const PAGES: Array<{ id: Page; name: string }> = [
  { id: 'memory', name: 'Memory' },
  { id: 'projects', name: 'Projects' },
  { id: 'boardroom', name: 'Boardroom' },
  { id: 'teams', name: 'Teams' },
  { id: 'skills', name: 'Skills' },
  { id: 'settings', name: 'Settings' },
  { id: 'connectors', name: 'Connectors' },
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
  /** The demo (phase 3 part C): the pages need a paired computer, and Sign out becomes Leave demo. */
  demo?: boolean;
}

export const DEMO_PAIR_FIRST = 'Pair your computer to use this.';

export function MoreScreen({ more, lock, onOpenRequest, openThreadId, lockEnabled, onLockChange, onSignOut, demo = false }: MoreScreenProps) {
  const [page, setPage] = useState<Page | null>(openThreadId ? 'boardroom' : null);
  if (page && demo) {
    return (
      <div className="pt-2 text-sm">
        <button type="button" onClick={() => setPage(null)} className="text-xs text-(--accent)">Back</button>
        <p className="mt-3 text-(--text-2)">{DEMO_PAIR_FIRST}</p>
      </div>
    );
  }
  if (page) {
    return (
      <div className="pt-2">
        <button type="button" onClick={() => setPage(null)} className="text-xs text-(--accent)">Back</button>
        {page === 'memory' && <MemoryScreen more={more} />}
        {page === 'projects' && <ProjectsScreen more={more} onOpenRequest={onOpenRequest} />}
        {page === 'boardroom' && <BoardroomScreen more={more} lock={lock} openThreadId={openThreadId} />}
        {page === 'teams' && <TeamsScreen more={more} onOpenRequest={onOpenRequest} />}
        {page === 'skills' && <SkillsScreen more={more} />}
        {page === 'settings' && <SettingsScreen more={more} lock={lock} />}
        {page === 'connectors' && <ConnectorsScreen more={more} />}
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
      {!demo && (
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={lockEnabled} onChange={(e) => onLockChange(e.target.checked)} />
          Ask for Face ID or fingerprint when opening
        </label>
      )}
      <button type="button" onClick={onSignOut} className="rounded-lg bg-(--surface-3) px-4 py-2">{demo ? 'Leave demo' : 'Sign out'}</button>
    </div>
  );
}
