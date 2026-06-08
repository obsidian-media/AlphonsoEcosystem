import { useEffect, useRef } from 'react';

const SHORTCUTS = [
  { key: 'n', ctrl: true, action: 'new_chat', label: 'New chat' },
  { key: 'k', ctrl: true, action: 'focus_input', label: 'Focus input' },
  { key: '/', action: 'focus_input', label: 'Focus input' },
  { key: 'Escape', action: 'abort_generation', label: 'Stop generation' },
  { key: 'b', ctrl: true, action: 'toggle_boardroom', label: 'Toggle boardroom' },
  { key: 's', ctrl: true, action: 'open_settings', label: 'Open settings' },
  { key: 'd', ctrl: true, action: 'toggle_agent_dock', label: 'Toggle agent dock' },
  { key: 'm', ctrl: true, action: 'toggle_metrics', label: 'Toggle metrics' },
  { key: 'e', ctrl: true, action: 'export_backup', label: 'Export backup' },
  { key: 'l', ctrl: true, action: 'clear_chat', label: 'Clear chat' },
  { key: 'p', ctrl: true, action: 'toggle_search', label: 'Search memory' },
  { key: '?', action: 'show_shortcuts', label: 'Show shortcuts' }
];

export function useKeyboardShortcuts(handlers = {}) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target.tagName.toLowerCase();
      const isInput = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;

      for (const shortcut of SHORTCUTS) {
        const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase() || e.key === shortcut.key;
        const ctrlMatch = shortcut.ctrl ? (e.ctrlKey || e.metaKey) : !e.ctrlKey && !e.metaKey;
        const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;

        if (keyMatch && ctrlMatch && shiftMatch) {
          // Don't trigger input-focus shortcuts when already in input
          if (shortcut.action === 'focus_input' && isInput) return;

          e.preventDefault();
          const handler = handlersRef.current[shortcut.action];
          if (handler) handler(e);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}

export function getShortcutList() {
  return SHORTCUTS.map((s) => ({
    label: s.label,
    keys: [
      s.ctrl ? (navigator.platform.includes('Mac') ? '⌘' : 'Ctrl') : null,
      s.shift ? 'Shift' : null,
      s.key === 'Escape' ? 'Esc' : s.key === ' ' ? 'Space' : s.key.toUpperCase()
    ].filter(Boolean).join(' + ')
  }));
}
