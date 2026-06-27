import React, { useState } from 'react';

interface WhatsAppMessage {
  id: string;
  from: string;
  timestamp: number;
  body: string;
  direction: 'inbound' | 'outbound';
  status?: string;
}

interface Props {
  messages: WhatsAppMessage[];
  onReply: (id: string, text: string) => void;
  onRetry: (id: string) => void;
}

function relativeTime(timestamp: number) {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 60) return `${diff}s ago`;
  return `${Math.floor(diff / 60)}m ago`;
}

function StatusTick({ status, onRetry, msgId }: { status: string | undefined; onRetry: (id: string) => void; msgId: string }) {
  if (!status || status === 'sending') return <span className="text-xs text-zinc-500">⏳</span>;
  if (status === 'sent') return <span className="text-xs text-zinc-400" title="Sent">✓</span>;
  if (status === 'delivered') return <span className="text-xs text-zinc-400" title="Delivered">✓✓</span>;
  if (status === 'read') return <span className="text-xs text-blue-400" title="Read">✓✓</span>;
  if (status === 'failed') return (
    <span className="flex items-center gap-1">
      <span className="text-xs text-red-400" title="Failed">✗</span>
      <button onClick={() => onRetry(msgId)} className="text-xs text-red-400 hover:text-red-300 underline">Retry</button>
    </span>
  );
  return null;
}

export function WhatsAppInboxPanel({ messages, onReply, onRetry }: Props) {
  const [openReplyId, setOpenReplyId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  if (!messages || messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-zinc-500 text-sm">
        No messages yet
      </div>
    );
  }

  function handleOpenReply(id: string) {
    setOpenReplyId(id);
    setReplyText('');
  }

  function handleSend(id: string) {
    if (!replyText.trim()) return;
    onReply(id, replyText.trim());
    setReplyText('');
    setOpenReplyId(null);
  }

  return (
    <div className="flex flex-col gap-2 overflow-y-auto">
      {messages.map((msg) => (
        <div key={msg.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-emerald-400">{msg.from}</span>
            <div className="flex items-center gap-2">
              {msg.direction === 'outbound' && (
                <StatusTick status={msg.status} onRetry={onRetry} msgId={msg.id} />
              )}
              <span className="text-xs text-zinc-500">{relativeTime(msg.timestamp)}</span>
            </div>
          </div>
          <p className="text-sm text-zinc-300 mb-2">{msg.body}</p>
          {openReplyId === msg.id ? (
            <div className="flex gap-2 mt-1">
              <input
                type="text"
                value={replyText}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReplyText(e.target.value)}
                onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleSend(msg.id)}
                placeholder="Type a reply…"
                className="flex-1 text-sm bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50"
                autoFocus
              />
              <button
                onClick={() => handleSend(msg.id)}
                className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded transition-colors"
              >
                Send
              </button>
            </div>
          ) : (
            <button
              onClick={() => handleOpenReply(msg.id)}
              className="text-xs text-zinc-400 hover:text-emerald-400 transition-colors"
            >
              Reply
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
