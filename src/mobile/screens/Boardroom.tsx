// Boardroom on the phone (phase 3 part A, owner 2026-11-02): the threads, newest first; a thread's last
// 30 messages with "Show earlier"; post with @mentions (the agents reply on the computer); Conclude,
// Distribute and Creative brief; acknowledge an escalation; and a message that needs the reveal stays
// hidden until Face ID or the fingerprint confirms it.
import React, { useEffect, useMemo, useState } from 'react';
import { reasonOf, type MoreData } from '../../services/phone/remoteData';
import type { PhoneThreadMessage } from '../../services/phone/phase3Mirror';
import { AGENT_NAMES } from '../../services/jose/agentNames';
import { randomId } from '../../lib/randomId';
import type { PhoneLock } from '../MobileApp';

function speakerName(speaker: string): string {
  if (speaker === 'user') return 'You';
  return AGENT_NAMES[speaker] || 'Boardroom';
}

function Message({ m, revealed, off, onAcknowledge, onReveal }: { m: PhoneThreadMessage; revealed?: string; off: boolean; onAcknowledge: () => void; onReveal: () => void }) {
  const escalation = m.kind === 'escalation';
  const failed = m.kind === 'failure';
  const tone = escalation ? 'bg-(--accent-dim)' : failed ? 'bg-(--surface-3)' : m.speaker === 'user' ? 'bg-(--surface-3)' : 'bg-(--surface-2)';
  return (
    <li className={`space-y-1 rounded-xl p-3 ${tone}`} data-testid={`boardroom-message-${m.id}`}>
      <span className="block text-xs text-(--text-3)">{escalation ? 'Needs your decision' : speakerName(m.speaker)}{failed ? ' — failed' : ''}</span>
      <span className="block whitespace-pre-wrap">{revealed ?? m.content}</span>
      {m.masked && revealed === undefined && <button type="button" disabled={off} onClick={onReveal} className="min-h-11 rounded-lg bg-(--accent) px-4 py-2 text-white">Reveal</button>}
      {escalation && !m.acknowledged && <button type="button" disabled={off} onClick={onAcknowledge} className="min-h-11 rounded-lg bg-(--surface-3) px-4 py-2">Acknowledge</button>}
    </li>
  );
}

function ThreadView({ more, lock, threadId, onBack }: { more: MoreData; lock: PhoneLock; threadId: string; onBack: () => void }) {
  const [board, setBoard] = useState(more.boardroom());
  const [earlier, setEarlier] = useState<PhoneThreadMessage[]>([]);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [text, setText] = useState('');
  const [channel, setChannel] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => more.subscribe(() => setBoard(more.boardroom())), [more]);
  const thread = board.threads.find((t) => t.id === threadId);
  const recent = board.messages[threadId] || [];
  const shown = useMemo(() => {
    const ids = new Set(recent.map((m) => m.id));
    return [...earlier.filter((m) => !ids.has(m.id)), ...recent];
  }, [earlier, recent]);
  const off = more.readOnly || busy;

  const run = async (name: Parameters<MoreData['call']>[0], args: Record<string, unknown>, done?: (value: any) => void) => {
    setBusy(true);
    try {
      const r = await more.call(name, args);
      if (r.ok) { setMessage(''); done?.(r.value); } else setMessage(reasonOf(r));
    } finally { setBusy(false); }
  };
  const send = () => {
    const clean = text.trim();
    if (!clean) return;
    void run('boardroom.send', { threadId, text: clean, messageId: randomId('msg') }, () => setText(''));
  };
  const showEarlier = () => {
    const oldest = shown[0];
    void run('boardroom.earlier', { threadId, beforeSeq: oldest ? oldest.seq : Number.MAX_SAFE_INTEGER }, (value) => {
      const older = Array.isArray(value) ? value as PhoneThreadMessage[] : [];
      if (older.length === 0) setMessage('Nothing earlier.');
      setEarlier((prev) => [...older, ...prev]);
    });
  };
  const reveal = async (m: PhoneThreadMessage) => {
    if (!(await lock.confirm('Reveal this Boardroom message', { strict: true }))) { setMessage("Not revealed: Face ID / fingerprint didn't confirm it."); return; }
    void run('boardroom.reveal', { messageId: m.id }, (value) => setRevealed((prev) => ({ ...prev, [m.id]: String(value?.content ?? '') })));
  };

  return (
    <div className="space-y-3 pt-2 text-sm" data-testid="mobile-boardroom-thread">
      <button type="button" onClick={onBack} className="text-xs text-(--accent)">Back</button>
      <h2 className="font-semibold">{thread?.topic || 'Thread'}</h2>
      {more.readOnly && more.readOnlyReason && <p className="text-xs text-(--text-3)">{more.readOnlyReason}</p>}
      {message && <p role="status" className="rounded-lg bg-(--surface-3) px-3 py-2 text-xs">{message}</p>}
      <button type="button" disabled={off} onClick={showEarlier} className="text-xs text-(--accent)">Show earlier</button>
      <ul className="space-y-2">
        {shown.map((m) => (
          <Message key={m.id} m={m} revealed={revealed[m.id]} off={off}
            onAcknowledge={() => void run('boardroom.acknowledge', { messageId: m.id })}
            onReveal={() => void reveal(m)} />
        ))}
      </ul>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input aria-label="Message" value={text} onChange={(e) => setText(e.target.value)} placeholder="Write, or @mention an agent" className="min-w-0 flex-1 rounded-lg bg-(--surface-2) px-3 py-2" />
        <button type="submit" disabled={off || !text.trim()} className="rounded-lg bg-(--accent) px-4 py-2 text-white">Send</button>
      </form>
      <section className="space-y-2 rounded-xl bg-(--surface-2) p-3">
        <div className="flex gap-2">
          <button type="button" disabled={off} onClick={() => void run('boardroom.conclude', { threadId })} className="min-h-11 flex-1 rounded-lg bg-(--surface-3) px-3 py-2">Conclude</button>
          <button type="button" disabled={off} onClick={() => void run('boardroom.creativeBrief', { threadId })} className="min-h-11 flex-1 rounded-lg bg-(--surface-3) px-3 py-2">Creative brief</button>
        </div>
        {thread?.governance ? (
          <div className="space-y-2">
            <button type="button" disabled={off} onClick={() => void run('boardroom.distribute', { threadId, mode: 'review' })} className="min-h-11 w-full rounded-lg bg-(--surface-3) px-3 py-2">Review only</button>
            <div className="flex gap-2">
              <input aria-label="Slack channel" value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="#channel" className="min-w-0 flex-1 rounded-lg bg-(--surface-1) px-3 py-2" />
              <button type="button" disabled={off || !channel.trim()} onClick={() => void run('boardroom.distribute', { threadId, mode: 'slack', channel: channel.trim() })} className="min-h-11 rounded-lg bg-(--surface-3) px-3 py-2">Post to Slack</button>
            </div>
            <p className="text-xs text-(--text-3)">A Slack post waits for your approval before anything is sent.</p>
          </div>
        ) : <p className="text-xs text-(--text-3)">Conclude the thread first to distribute it.</p>}
      </section>
    </div>
  );
}

export function BoardroomScreen({ more, lock, openThreadId }: { more: MoreData; lock: PhoneLock; openThreadId?: string }) {
  const [board, setBoard] = useState(more.boardroom());
  const [openId, setOpenId] = useState<string | null>(openThreadId || null);
  const [topic, setTopic] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => more.subscribe(() => setBoard(more.boardroom())), [more]);

  if (openId) return <ThreadView more={more} lock={lock} threadId={openId} onBack={() => setOpenId(null)} />;

  const start = async () => {
    const clean = topic.trim();
    if (!clean) return;
    setBusy(true);
    try {
      const r = await more.call('boardroom.createThread', { topic: clean });
      if (r.ok) { setTopic(''); if (r.value?.id) setOpenId(String(r.value.id)); } else setMessage(reasonOf(r));
    } finally { setBusy(false); }
  };
  const threads = [...board.threads].sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));
  return (
    <div className="space-y-3 pt-2 text-sm" data-testid="mobile-boardroom">
      {more.readOnly && more.readOnlyReason && <p className="text-xs text-(--text-3)">{more.readOnlyReason}</p>}
      {message && <p role="status" className="rounded-lg bg-(--surface-3) px-3 py-2 text-xs">{message}</p>}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void start(); }}>
        <input aria-label="New thread topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="New thread topic" className="min-w-0 flex-1 rounded-lg bg-(--surface-2) px-3 py-2" />
        <button type="submit" disabled={more.readOnly || busy || !topic.trim()} className="rounded-lg bg-(--accent) px-4 py-2 text-white">Start thread</button>
      </form>
      {threads.length === 0 && <p className="text-xs text-(--text-3)">No threads yet.</p>}
      <ul className="space-y-2">
        {threads.map((t) => {
          const last = (board.messages[t.id] || []).at(-1);
          const needsYou = (board.messages[t.id] || []).some((m) => m.kind === 'escalation' && !m.acknowledged);
          return (
            <li key={t.id} data-testid={`boardroom-thread-${t.id}`}>
              <button type="button" onClick={() => setOpenId(t.id)} className={`w-full rounded-xl p-3 text-left ${needsYou ? 'bg-(--accent-dim)' : 'bg-(--surface-2)'}`}>
                <span className="block font-medium">{t.topic}</span>
                {last && <span className="block truncate text-xs text-(--text-2)">{speakerName(last.speaker)}: {last.content}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
