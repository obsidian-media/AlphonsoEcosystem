import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Send, Zap } from 'lucide-react';
import { askMarcusToSend } from '../../services/marcus/askMarcus';

// Agent phase 5: the panel asks Marcus. The send is one Marcus step, prepared and shown with the
// exact text, approved on the board, and checked by Sentinel first. It used to send at once
// after a tick box, with no Sentinel check.
const CHANNELS = [
  { id: 'slack', label: 'Slack', where: '#channel (optional: your default)' },
  { id: 'discord', label: 'Discord', where: '#channel (optional: your default)' },
  { id: 'telegram', label: 'Telegram', where: 'team or me' },
  { id: 'whatsapp', label: 'WhatsApp', where: 'Phone number' },
  { id: 'notion', label: 'Notion', where: 'Page ID (optional: your default)' },
  { id: 'clickup', label: 'ClickUp', where: 'List ID (optional: your default)' },
] as const;

interface AuditReport {
  title?: string;
  summary?: string;
  riskLevel?: string;
  status?: string;
}

interface Props {
  auditReport?: AuditReport | null;
}

function riskColor(level?: string): string {
  if (level === 'critical') return 'text-(--error)';
  if (level === 'high') return 'text-(--error)';
  if (level === 'medium') return 'text-(--warning)';
  return 'text-(--success)';
}

const fieldCls = 'w-full rounded-lg bg-(--surface-2) px-3 py-2 text-sm text-(--text-1) placeholder-(--text-4) focus:outline-hidden focus:border-(--warning-border)';
const labelCls = 'block text-[10px] uppercase tracking-widest text-(--text-3) mb-1';

export function MarcusAuditPanel({ auditReport }: Props): React.JSX.Element {
  const [channel, setChannel] = useState<string>('slack');
  const [where, setWhere] = useState('');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<{ ok: boolean; text: string } | null>(null);
  const def = CHANNELS.find((c) => c.id === channel)!;
  const needsTitle = channel === 'notion' || channel === 'clickup';

  const ask = async () => {
    setBusy(true);
    setReply(null);
    try {
      const result = await askMarcusToSend({
        text, connector: channel, ...(where.trim() ? { target: where.trim() } : {}), ...(needsTitle && title.trim() ? { title: title.trim() } : {}), source: 'Project Execution',
      });
      setReply(result.ok ? { ok: true, text: 'Waiting for your approval on the board.' } : { ok: false, text: result.reason || 'Marcus could not be asked.' });
    } catch (err) {
      setReply({ ok: false, text: String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {auditReport && (
        <div className="rounded-xl bg-(--surface-2) p-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-(--text-3) font-bold mb-2">Marcus Audit</div>
          <div className="text-sm font-semibold text-(--text-2)">{auditReport.title}</div>
          <div className="mt-1 text-xs text-(--text-3)">{auditReport.summary}</div>
          <div className="mt-1 text-[11px] text-(--text-3)">
            Risk: <span className={riskColor(auditReport.riskLevel)}>{auditReport.riskLevel}</span>
            {' '}| Status: {auditReport.status}
          </div>
        </div>
      )}

      <div className="rounded-xl bg-(--surface-2) p-4">
        <div className="flex items-center gap-2 mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-(--warning)">
          <Zap className="h-4 w-4" />
          Ask Marcus to send
        </div>
        <p className="text-[11px] text-(--text-3)">Marcus sends it once you approve it on the board, after Sentinel checks it.</p>
        <p className="mb-4 text-[11px] text-(--text-3)">Posts to Instagram, Facebook and YouTube go through Miya Studio's Campaign Studio.</p>

        <div className="flex flex-wrap gap-2 mb-4">
          {CHANNELS.map((c) => (
            <button
              key={c.id}
              onClick={() => { setChannel(c.id); setWhere(''); setReply(null); }}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest border transition-colors ${
                channel === c.id
                  ? 'bg-(--warning-dim) border-(--warning-border) text-(--warning)'
                  : 'bg-(--surface-2) border-(--border) text-(--text-3) hover:border-(--border-strong)'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="space-y-2 mb-4">
          <div>
            <label className={labelCls} htmlFor="marcus-where">Where</label>
            <input id="marcus-where" value={where} onChange={(e) => setWhere(e.target.value)} placeholder={def.where} className={fieldCls} />
          </div>
          {needsTitle && (
            <div>
              <label className={labelCls} htmlFor="marcus-title">Title</label>
              <input id="marcus-title" value={title} onChange={(e) => setTitle(e.target.value)} className={fieldCls} />
            </div>
          )}
          <div>
            <label className={labelCls} htmlFor="marcus-text">Message</label>
            <textarea id="marcus-text" value={text} onChange={(e) => setText(e.target.value)} rows={3} className={fieldCls} />
          </div>
        </div>

        <button onClick={ask} disabled={busy || !text.trim()}
          className="flex items-center gap-2 rounded-xl bg-(--warning-dim) px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-(--warning) hover:bg-(--warning-dim) disabled:opacity-40 transition-colors">
          <Send className="h-3.5 w-3.5" />
          {busy ? 'Asking…' : 'Ask Marcus to send'}
        </button>

        {reply && (
          <div className={`mt-3 flex items-start gap-2 rounded-xl p-3 text-[11px] ${reply.ok ? 'bg-(--success-dim) text-(--success)' : 'bg-(--error-dim) text-(--error)'}`}>
            {reply.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
            {reply.text}
          </div>
        )}
      </div>
    </div>
  );
}
