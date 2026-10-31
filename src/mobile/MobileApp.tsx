// Alphonso on the phone (phase 1): sign in, pair with the computer, then Chat, Requests and
// More, with Face ID / fingerprint on open (on by default). The computer does the work;
// the phone shows its screens and asks through named calls (phoneSession.ts). The native
// parts (secure storage, Face ID, the camera, notifications) come from the packaging.
import React, { useEffect, useMemo, useState } from 'react';
import { BoardDataProvider } from '../services/phone/boardData';
import { createRemoteData, offlineLine } from '../services/phone/remoteData';
import { webSocketFactory } from '../services/phone/phoneLink';
import type { PhoneSignIn } from '../services/phone/phoneAccount';
import { connectPhone, pairPhone, savedPairing, type PhoneLink, type PhoneSecrets } from './phoneSession';
import { SignInScreen } from './screens/SignIn';
import { PairScreen } from './screens/Pair';
import { ChatScreen } from './screens/Chat';
import { RequestsScreen } from './screens/Requests';
import { MoreScreen } from './screens/More';
import { OfflineBanner } from './screens/Offline';

export const PHONE_LOCK_KEY = 'alphonso_phone_lock_v1';
/** Face ID / fingerprint, given by the packaging. */
export interface PhoneLock { confirm(reason: string): Promise<boolean> }

type Tab = 'chat' | 'requests' | 'more';

export interface MobileAppProps {
  signIn: PhoneSignIn;
  secrets: PhoneSecrets;
  lock: PhoneLock;
  connect?: () => PhoneLink;
  pair?: (qrText: string) => Promise<{ ok: boolean; reason?: string }>;
  scanQr?: () => Promise<string | null>;
  phoneName?: string;
}

export function lockOn(): boolean { return localStorage.getItem(PHONE_LOCK_KEY) !== 'off'; }

function LinkedApp({ link, lockEnabled, onLockChange, onSignOut }: { link: PhoneLink; lockEnabled: boolean; onLockChange: (on: boolean) => void; onSignOut: () => void }) {
  const data = useMemo(() => createRemoteData(link), [link]);
  const [tab, setTab] = useState<Tab>('chat');
  const [online, setOnline] = useState(link.online());
  const [since, setSince] = useState<number | null>(link.offlineSince());
  useEffect(() => link.onStatus((isOnline, sinceMs) => { setOnline(isOnline); setSince(sinceMs); }), [link]);
  useEffect(() => () => link.stop(), [link]);
  // Already reachable when the screens open: ask for everything once.
  useEffect(() => { if (link.online()) void data.reconnected(); }, [link, data]);
  const computerName = savedPairing()?.computerName || 'your computer';
  return (
    <div className="flex h-full flex-col bg-(--surface-1) text-(--text-1)">
      <header className="px-4 pb-2 pt-3 text-sm font-semibold">Alphonso · {computerName}</header>
      {!online && <OfflineBanner text={offlineLine(since)} />}
      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {tab === 'chat' && <ChatScreen chat={data.chat} />}
        {tab === 'requests' && <BoardDataProvider value={data.board}><RequestsScreen /></BoardDataProvider>}
        {tab === 'more' && <MoreScreen lockEnabled={lockEnabled} onLockChange={onLockChange} onSignOut={onSignOut} />}
      </main>
      <nav role="tablist" className="grid grid-cols-3 border-t border-(--border) text-xs">
        {(['chat', 'requests', 'more'] as Tab[]).map((t) => (
          <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => setTab(t)} className={`py-3 ${tab === t ? 'font-semibold text-(--accent)' : 'text-(--text-2)'}`}>
            {t === 'chat' ? 'Chat' : t === 'requests' ? 'Requests' : 'More'}
          </button>
        ))}
      </nav>
    </div>
  );
}

export function MobileApp(props: MobileAppProps) {
  const [signedIn, setSignedIn] = useState(props.signIn.signedIn());
  const [paired, setPaired] = useState(!!savedPairing());
  const [lockEnabled, setLockEnabled] = useState(lockOn());
  const [unlocked, setUnlocked] = useState(!lockOn());
  const [asking, setAsking] = useState(false);
  const [link, setLink] = useState<PhoneLink | null>(null);

  const askUnlock = async () => {
    setAsking(true);
    try { setUnlocked(await props.lock.confirm('Open Alphonso')); } finally { setAsking(false); }
  };
  // Once, when the app opens.
  useEffect(() => { if (!unlocked) void askUnlock(); }, []);

  useEffect(() => {
    if (!signedIn || !paired || !unlocked || link) return;
    setLink(props.connect ? props.connect() : connectPhone({ socket: webSocketFactory, auth: props.signIn, secrets: props.secrets }));
  }, [signedIn, paired, unlocked, link, props]);

  if (!unlocked) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-sm">
        <p>Alphonso is locked.</p>
        <button type="button" disabled={asking} onClick={askUnlock} className="rounded-lg bg-(--accent) px-4 py-2 text-white">Unlock</button>
      </div>
    );
  }
  if (!signedIn) return <SignInScreen signIn={props.signIn} onSignedIn={() => setSignedIn(true)} />;
  if (!paired) {
    const pair = props.pair ?? ((qr: string) => pairPhone(qr, { auth: props.signIn, secrets: props.secrets, phoneName: props.phoneName || 'Phone' }));
    return <PairScreen pair={pair} scanQr={props.scanQr} onPaired={() => setPaired(true)} />;
  }
  if (!link) return <div className="p-6 text-sm">Connecting…</div>;
  return (
    <LinkedApp
      link={link}
      lockEnabled={lockEnabled}
      onLockChange={(on) => { localStorage.setItem(PHONE_LOCK_KEY, on ? 'on' : 'off'); setLockEnabled(on); }}
      onSignOut={async () => { link.stop(); await props.signIn.signOut(); setLink(null); setSignedIn(false); }}
    />
  );
}
