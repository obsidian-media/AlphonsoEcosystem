import React, { useEffect } from 'react';
import { X, Keyboard } from 'lucide-react';

interface Shortcut {
  keys: string;
  description: string;
  available: boolean;
}

const SHORTCUTS: Shortcut[] = [
  { keys: 'Ctrl+?', description: 'Open keyboard shortcuts', available: true },
  { keys: 'Ctrl+J', description: 'Jump to Chat view', available: true },
  { keys: 'Ctrl+B', description: 'Open Boardroom', available: true },
  { keys: 'Ctrl+R', description: 'Open Runtime Manager', available: true },
  { keys: 'Ctrl+K', description: 'Command palette — coming soon', available: false },
];

interface KeyboardShortcutsModalProps {
  onClose: () => void;
}

export function KeyboardShortcutsModal({ onClose }: KeyboardShortcutsModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[var(--surface-1)] border border-[var(--border)] rounded-xl shadow-xl w-full max-w-md mx-4 p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-[var(--accent)]" />
            <h2 className="text-sm font-semibold text-[var(--text-1)]">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)] transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          {SHORTCUTS.map(({ keys, description, available }) => (
            <div
              key={keys}
              className={`flex items-center justify-between py-2 px-3 rounded-lg ${available ? 'bg-[var(--surface-2)]' : 'bg-[var(--surface-0)] opacity-50'}`}
            >
              <span className={`text-xs ${available ? 'text-[var(--text-2)]' : 'text-[var(--text-3)]'}`}>
                {description}
              </span>
              <kbd className="px-2 py-0.5 rounded text-[11px] font-mono bg-[var(--surface-3)] border border-[var(--border)] text-[var(--text-1)]">
                {keys}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
