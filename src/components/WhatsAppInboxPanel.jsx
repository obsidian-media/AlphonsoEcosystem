import React, { useState } from 'react';

function relativeTime(timestamp) {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 60) return `${diff}s ago`;
  return `${Math.floor(diff / 60)}m ago`;
}

export function WhatsAppInboxPanel({ messages, onReply }) {
  const [openReplyId, setOpenReplyId] = useState(null);
  const [replyText, setReplyText] = useState('');

  if (!messages || messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-zinc-500 text-sm">
        No messages yet
      </div>
    );
  }

  function handleOpenReply(id) {
    setOpenReplyId(id);
    setReplyText('');
  }

  function handleSend(id) {
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
            <span className="text-xs text-zinc-500">{relativeTime(msg.timestamp)}</span>
          </div>
          <p className="text-sm text-zinc-300 mb-2">{msg.body}</p>
          {openReplyId === msg.id ? (
            <div className="flex gap-2 mt-1">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend(msg.id)}
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
