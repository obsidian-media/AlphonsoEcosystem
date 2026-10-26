// Asks before a disguised or listed source link opens (agent phase 4). Mounted once in App;
// every source link goes through openSourceLink(), which uses it.
import { useEffect, useRef, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { setLinkConfirmHandler } from '../../services/browserAutomationService';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface Ask { reason: string; url: string; answer: (open: boolean) => void }

export function LinkWarningHost() {
  const [ask, setAsk] = useState<Ask | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useFocusTrap(box, Boolean(ask));

  useEffect(() => {
    setLinkConfirmHandler((reason, url) => new Promise<boolean>((resolve) => setAsk({ reason, url, answer: resolve })));
    return () => setLinkConfirmHandler(null);
  }, []);

  useEffect(() => {
    if (!ask) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { ask.answer(false); setAsk(null); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ask]);

  if (!ask) return null;
  const close = (open: boolean) => { ask.answer(open); setAsk(null); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="link-warning">
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby="link-warning-title" className="max-w-md rounded-xl border border-(--error-border) bg-(--surface-1) p-4 space-y-3">
        <div id="link-warning-title" className="flex items-center gap-2 text-sm font-medium text-(--error)">
          <ShieldAlert className="w-4 h-4" /> Sentinel: check this link
        </div>
        <p className="text-sm text-(--text-1)">{ask.reason}</p>
        <p className="text-xs text-(--text-3) break-all">{ask.url}</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => close(false)} className="px-3 py-1.5 rounded-lg text-xs bg-(--surface-3) text-(--text-1)">Cancel</button>
          <button type="button" onClick={() => close(true)} className="px-3 py-1.5 rounded-lg text-xs bg-(--error-dim) border border-(--error-border) text-(--error)">Open anyway</button>
        </div>
      </div>
    </div>
  );
}
