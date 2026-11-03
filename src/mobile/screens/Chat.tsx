import React, { useEffect, useState } from 'react';
import type { ChatData } from '../../services/phone/remoteData';
import { MarkdownMessage } from '../../components/MarkdownMessage';
import { ENGINE_LABEL } from '../../services/phone/phoneAnswer';
import { appleModelLine, type AppleModelStatus, type PhoneOwnModels } from '../phoneModels';

/** `offline` and `models` (phone phase 4): while the computer is off, a waiting message can be answered here. */
export function ChatScreen({ chat, offline = false, models }: { chat: ChatData; offline?: boolean; models?: PhoneOwnModels }) {
  const [messages, setMessages] = useState(chat.messages());
  const [answering, setAnswering] = useState(chat.answering());
  const [text, setText] = useState('');
  const [apple, setApple] = useState<AppleModelStatus | null>(null);
  useEffect(() => chat.subscribe(() => { setMessages(chat.messages()); setAnswering(chat.answering()); }), [chat]);
  const offerHere = offline && !!models && messages.some((m) => m.queued);
  // Read when the choice shows: Apple Intelligence may have been switched off since the app started.
  useEffect(() => {
    if (!offerHere || !models) return undefined;
    let live = true;
    void models.modelStatus().then((s) => { if (live) setApple(s); }).catch(() => { if (live) setApple({ available: false, reason: null }); });
    return () => { live = false; };
  }, [offerHere, models]);
  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    await chat.send(t);
    setMessages(chat.messages());
  };
  const answerHere = async (id: string, engine: 'phone' | 'openrouter') => {
    await chat.answerHere(id, engine);
    setMessages(chat.messages());
    setAnswering(chat.answering());
  };
  return (
    <div className="flex h-full flex-col gap-2 pt-2" data-testid="mobile-chat">
      <ul className="flex-1 space-y-2">
        {messages.length === 0 && <li className="text-xs text-(--text-3)">Ask anything. Your computer does the work.</li>}
        {messages.map((m) => (
          <li key={m.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.role === 'user' ? 'ml-auto bg-(--accent-dim)' : 'bg-(--surface-2)'}`}>
            <MarkdownMessage content={m.text} />
            {m.answeredBy && <div className="mt-1 text-[10px] text-(--text-3)">{ENGINE_LABEL[m.answeredBy]}</div>}
            {m.queued && <div className="mt-1 text-[10px] text-(--text-3)">Waiting to send</div>}
            {m.queued && m.note && <div className="mt-1 text-xs">{m.note}</div>}
            {m.queued && offerHere && (answering === m.id
              ? <div className="mt-2 text-xs">Answering…</div>
              : !answering && (
                <div className="mt-2 flex flex-col gap-1">
                  {apple && !apple.available
                    ? <span className="text-xs text-(--text-3)">{appleModelLine(apple)}</span>
                    : <button type="button" onClick={() => void answerHere(m.id, 'phone')} className="min-h-9 rounded-lg bg-(--surface-1) px-3 text-xs">Answer on this phone</button>}
                  <button type="button" onClick={() => void answerHere(m.id, 'openrouter')} className="min-h-9 rounded-lg bg-(--surface-1) px-3 text-xs">Answer with OpenRouter (free)</button>
                </div>
              ))}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input aria-label="Message" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void send(); }} placeholder="Message Alphonso" className="flex-1 rounded-full border border-(--border) px-4 py-2 text-sm" />
        <button type="button" onClick={send} disabled={!text.trim()} className="rounded-full bg-(--accent) px-4 text-sm text-white">Send</button>
      </div>
    </div>
  );
}
