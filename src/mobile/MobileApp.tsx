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
import { StudioScreen } from './screens/Studio';
import type { PhonePreviewParts } from '../services/phone/remoteData';
import { OfflineBanner } from './screens/Offline';
import { withLockedConfirm } from './lockedApproval';

export const PHONE_LOCK_KEY = 'alphonso_phone_lock_v1';
/** Face ID / fingerprint, given by the packaging. `strict`: a phone with no passcode can't
 *  confirm (locked approvals); without it, such a phone may still open the app. */
export interface PhoneLock { confirm(reason: string, opts?: { strict?: boolean }): Promise<boolean> }

type Tab = 'chat' | 'requests' | 'studio' | 'more';
const TAB_NAMES: Record<Tab, string> = { chat: 'Chat', requests: 'Requests', studio: 'Studio', more: 'More' };

/** A notification's button, given by the packaging once the app is open and unlocked. */
export interface NotificationAction { action: 'approve' | 'reject' | 'open'; requestId: string; stepId?: string }
export type OnNotificationAction = (fn: (a: NotificationAction) => void) => () => void;
/** How long a notification's button waits for the computer to send its requests after a cold start. */
const KNOWN_WAIT_MS = 15_000;

export interface MobileAppProps {
  signIn: PhoneSignIn;
  secrets: PhoneSecrets;
  lock: PhoneLock;
  connect?: () => PhoneLink;
  pair?: (qrText: string) => Promise<{ ok: boolean; reason?: string }>;
  scanQr?: () => Promise<string | null>;
  phoneName?: string;
  onNotificationAction?: OnNotificationAction;
  /** Where previews are kept on the phone and how it is connected (phase 2). */
  previews?: PhonePreviewParts;
}

export function lockOn(): boolean { return localStorage.getItem(PHONE_LOCK_KEY) !== 'off'; }

function LinkedApp({ link, lock, lockEnabled, onLockChange, onSignOut, onNotificationAction, previews }: { link: PhoneLink; lock: PhoneLock; lockEnabled: boolean; onLockChange: (on: boolean) => void; onSignOut: () => void; onNotificationAction?: OnNotificationAction; previews?: PhonePreviewParts }) {
  const data = useMemo(() => createRemoteData(link, previews), [link, previews]);
  // A step that spends, sends or publishes, or deletes asks for Face ID / fingerprint first.
  const board = useMemo(() => withLockedConfirm(data.board, lock), [data, lock]);
  const [tab, setTab] = useState<Tab>('chat');
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!onNotificationAction) return undefined;
    // After a cold start the requests arrive a moment later: wait for this one before acting.
    const whenKnown = (requestId: string) => new Promise<void>((resolve) => {
      if (board.request(requestId)) { resolve(); return; }
      const timer = setTimeout(() => { off(); resolve(); }, KNOWN_WAIT_MS);
      const off = board.subscribe(() => { if (board.request(requestId)) { clearTimeout(timer); off(); resolve(); } });
    });
    return onNotificationAction(async (a) => {
      setSelected(a.requestId);
      if (a.action === 'open' || !a.stepId) { setTab('requests'); return; }
      await whenKnown(a.requestId);
      const text = a.action === 'approve' ? await board.approveStep(a.requestId, a.stepId) : await board.rejectStep(a.requestId, a.stepId);
      setNotice(text);
    });
  }, [onNotificationAction, board]);
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
      {notice && <p role="status" className="mx-4 mb-2 rounded-lg bg-(--surface-3) px-3 py-2 text-xs">{notice}</p>}
      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {tab === 'chat' && <ChatScreen chat={data.chat} />}
        {tab === 'requests' && <BoardDataProvider value={board}><RequestsScreen key={selected || 'all'} selectedRequestId={selected} /></BoardDataProvider>}
        {tab === 'studio' && <StudioScreen studio={data.studio} lock={lock} />}
        {tab === 'more' && <MoreScreen lockEnabled={lockEnabled} onLockChange={onLockChange} onSignOut={onSignOut} />}
      </main>
      <nav role="tablist" className="grid grid-cols-4 border-t border-(--border) text-xs">
        {(Object.keys(TAB_NAMES) as Tab[]).map((t) => (
          <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => setTab(t)} className={`py-3 ${tab === t ? 'font-semibold text-(--accent)' : 'text-(--text-2)'}`}>
            {TAB_NAMES[t]}
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
      lock={props.lock}
      onNotificationAction={props.onNotificationAction}
      previews={props.previews}
      lockEnabled={lockEnabled}
      onLockChange={(on) => { localStorage.setItem(PHONE_LOCK_KEY, on ? 'on' : 'off'); setLockEnabled(on); }}
      onSignOut={async () => { link.stop(); await props.signIn.signOut(); setLink(null); setSignedIn(false); }}
    />
  );
}
