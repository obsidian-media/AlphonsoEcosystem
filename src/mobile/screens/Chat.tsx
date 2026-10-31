import React, { useEffect, useState } from 'react';
import type { ChatData } from '../../services/phone/remoteData';
import { MarkdownMessage } from '../../components/MarkdownMessage';

export function ChatScreen({ chat }: { chat: ChatData }) {
  const [messages, setMessages] = useState(chat.messages());
  const [text, setText] = useState('');
  useEffect(() => chat.subscribe(() => setMessages(chat.messages())), [chat]);
  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    await chat.send(t);
    setMessages(chat.messages());
  };
  return (
    <div className="flex h-full flex-col gap-2 pt-2" data-testid="mobile-chat">
      <ul className="flex-1 space-y-2">
        {messages.length === 0 && <li className="text-xs text-(--text-3)">Ask anything. Your computer does the work.</li>}
        {messages.map((m) => (
          <li key={m.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.role === 'user' ? 'ml-auto bg-(--accent-dim)' : 'bg-(--surface-2)'}`}>
            <MarkdownMessage content={m.text} />
            {m.queued && <div className="mt-1 text-[10px] text-(--text-3)">Waiting to send</div>}
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
