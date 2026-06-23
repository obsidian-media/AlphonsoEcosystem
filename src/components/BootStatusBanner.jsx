import React, { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';

export function BootStatusBanner() {
  const [items, setItems] = useState([]);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let unlisten;
    listen('runtime://boot_status', (event) => {
      const { tool, displayName, status, message } = event.payload;
      setVisible(true);
      setItems((prev) => {
        const existing = prev.findIndex((i) => i.tool === tool);
        const entry = { tool, displayName, status, message };
        if (existing >= 0) {
          const next = [...prev];
          next[existing] = entry;
          return next;
        }
        return [...prev, entry];
      });
    }).then((fn) => { unlisten = fn; });

    return () => { unlisten?.(); };
  }, []);

  useEffect(() => {
    if (items.length === 0 || dismissed) return;
    const allDone = items.every((i) => ['running', 'started', 'skipped', 'failed'].includes(i.status));
    if (allDone) {
      const t = setTimeout(() => setVisible(false), 6000);
      return () => clearTimeout(t);
    }
  }, [items, dismissed]);

  if (!visible || dismissed || items.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-xl bg-surface-2 border border-white/10 shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06]">
        <span className="text-xs font-semibold text-zinc-300">Starting AI Runtimes</span>
        <button
          onClick={() => setDismissed(true)}
          className="text-zinc-500 hover:text-white text-xs transition-colors"
          aria-label="Dismiss boot status"
        >
          ✕
        </button>
      </div>
      <div className="px-4 py-3 space-y-2 max-h-56 overflow-y-auto">
        {items.map((item) => (
          <div key={item.tool} className="flex items-center gap-2">
            <StatusDot status={item.status} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-zinc-200 truncate">{item.displayName}</p>
              <p className="text-[10px] text-zinc-500 truncate">{item.message}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusDot({ status }) {
  const colors = {
    starting: 'bg-yellow-400 animate-pulse',
    started: 'bg-green-400',
    running: 'bg-green-400',
    skipped: 'bg-zinc-500',
    failed: 'bg-red-400',
  };
  return (
    <span className={`w-2 h-2 rounded-full shrink-0 ${colors[status] ?? 'bg-zinc-500'}`} />
  );
}
