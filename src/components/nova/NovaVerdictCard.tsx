// Chat's Nova card (agent phase 2, owner 2026-10-25): shown only when the request had a
// Nova step, from her saved verdict: what to do first and her top three. No extra model call.
import React from 'react';
import { Lightbulb, X } from 'lucide-react';
import { verdictForCommand } from '../../services/nova/novaVerdicts';

export function NovaVerdictCard({ commandId, onDismiss }: { commandId: string | null; onDismiss?: () => void }) {
  const verdict = commandId ? verdictForCommand(commandId) : null;
  if (!verdict) return null;
  const top = verdict.text.split('\n').filter((line) => /^[1-3]\.\s/.test(line));
  return (
    <div className="w-full mt-2 rounded-2xl bg-(--surface-2) p-4 space-y-2" style={{ boxShadow: '0 0 20px var(--agent-nova-glow)' }} data-testid="nova-verdict-card">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-(--accent) shrink-0" />
          <span className="text-xs font-bold text-(--accent) uppercase tracking-widest">Nova</span>
        </div>
        {onDismiss && (
          <button onClick={onDismiss} aria-label="Hide Nova's verdict" className="text-(--text-4) hover:text-(--text-2) rounded-sm"><X className="w-3.5 h-3.5" /></button>
        )}
      </div>
      <p className="text-sm font-semibold text-(--text-1)">What to do first: {verdict.doFirst}</p>
      {top.length > 0 && (
        <ol className="space-y-1">
          {top.map((line) => <li key={line} className="text-xs text-(--text-2) leading-relaxed">{line}</li>)}
        </ol>
      )}
    </div>
  );
}
