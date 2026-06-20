import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Send, Shield, Zap } from 'lucide-react';
import { buildMarcusPublishPacket, executeMarcusPublish, MARCUS_PUBLISH_PLATFORMS } from '../../services/marcusPublishService';

const PLATFORM_DEFAULTS = {
  instagram: { caption: '', imageUrl: '', videoUrl: '', mediaType: '' },
  facebook:  { message: '', link: '', imageUrl: '' },
  youtube:   { filePath: '', title: '', description: '', tags: '', privacyStatus: 'private' },
  telegram:  { chatId: '', text: '' },
  whatsapp:  { to: '', text: '' },
  notion:    { title: '', content: '', parentPageId: '' },
  clickup:   { title: '', content: '', listId: '' },
};

function buildPayload(platform, fields) {
  const base = { ...PLATFORM_DEFAULTS[platform], ...fields };
  if (platform === 'youtube' && typeof base.tags === 'string') {
    base.tags = base.tags.split(',').map((t) => t.trim()).filter(Boolean);
  }
  return base;
}

export function MarcusAuditPanel({ auditReport }) {
  const [platform, setPlatform] = useState('instagram');
  const [fields, setFields] = useState({ ...PLATFORM_DEFAULTS.instagram });
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState('');
  const [createPacketOnly, setCreatePacketOnly] = useState(false);

  const platformDef = MARCUS_PUBLISH_PLATFORMS.find((p) => p.id === platform);

  const handlePlatformChange = (id) => {
    setPlatform(id);
    setFields({ ...PLATFORM_DEFAULTS[id] });
    setReceipt(null);
    setError('');
    setApproved(false);
  };

  const setField = (key, value) => setFields((prev) => ({ ...prev, [key]: value }));

  const handlePublish = async () => {
    if (!approved) { setError('You must check the approval box before publishing.'); return; }
    setError('');
    setBusy(true);
    setReceipt(null);
    try {
      if (createPacketOnly) {
        const packet = buildMarcusPublishPacket({ platform, payload: buildPayload(platform, fields) });
        setReceipt({ ok: true, packetOnly: true, packetId: packet.id, platform });
      } else {
        const result = await executeMarcusPublish({
          platform,
          payload: buildPayload(platform, fields),
          preApproved: true,
        });
        setReceipt(result);
        if (!result.ok) setError(result.error || 'Publish failed.');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {auditReport && (
        <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-bold mb-2">Marcus Audit</div>
          <div className="text-sm font-semibold text-zinc-200">{auditReport.title}</div>
          <div className="mt-1 text-xs text-zinc-400">{auditReport.summary}</div>
          <div className="mt-1 text-[11px] text-zinc-500">
            Risk: <span className={riskColor(auditReport.riskLevel)}>{auditReport.riskLevel}</span>
            {' '}| Status: {auditReport.status}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-amber-300/15 bg-zinc-950/60 p-4">
        <div className="flex items-center gap-2 mb-4 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300/80">
          <Zap className="h-4 w-4" />
          Marcus Publish — Approval-Gated Distribution
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {MARCUS_PUBLISH_PLATFORMS.map((p) => (
            <button
              key={p.id}
              onClick={() => handlePlatformChange(p.id)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest border transition-colors ${
                platform === p.id
                  ? 'bg-amber-500/20 border-amber-400/30 text-amber-200'
                  : 'bg-zinc-900 border-white/10 text-zinc-400 hover:border-white/20'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="space-y-2 mb-4">
          {platform === 'instagram' && (
            <>
              <FieldInput label="Caption" value={fields.caption || ''} onChange={(v) => setField('caption', v)} multiline />
              <FieldInput label="Image URL (public)" value={fields.imageUrl || ''} onChange={(v) => setField('imageUrl', v)} placeholder="https://..." />
              <FieldInput label="Video URL (public, optional)" value={fields.videoUrl || ''} onChange={(v) => setField('videoUrl', v)} placeholder="https://..." />
              <FieldSelect label="Media type" value={fields.mediaType || ''} onChange={(v) => setField('mediaType', v)}
                options={[{ value: '', label: 'Auto-detect' }, { value: 'IMAGE', label: 'IMAGE' }, { value: 'REELS', label: 'REELS' }, { value: 'VIDEO', label: 'VIDEO' }]} />
            </>
          )}
          {platform === 'facebook' && (
            <>
              <FieldInput label="Message" value={fields.message || ''} onChange={(v) => setField('message', v)} multiline />
              <FieldInput label="Link (optional)" value={fields.link || ''} onChange={(v) => setField('link', v)} placeholder="https://..." />
              <FieldInput label="Image URL (optional)" value={fields.imageUrl || ''} onChange={(v) => setField('imageUrl', v)} placeholder="https://..." />
            </>
          )}
          {platform === 'youtube' && (
            <>
              <FieldInput label="Local file path" value={fields.filePath || ''} onChange={(v) => setField('filePath', v)} placeholder="C:\Videos\clip.mp4" />
              <FieldInput label="Title" value={fields.title || ''} onChange={(v) => setField('title', v)} />
              <FieldInput label="Description" value={fields.description || ''} onChange={(v) => setField('description', v)} multiline />
              <FieldInput label="Tags (comma-separated)" value={fields.tags || ''} onChange={(v) => setField('tags', v)} />
              <FieldSelect label="Privacy" value={fields.privacyStatus || 'private'} onChange={(v) => setField('privacyStatus', v)}
                options={[{ value: 'private', label: 'Private' }, { value: 'unlisted', label: 'Unlisted' }, { value: 'public', label: 'Public' }]} />
            </>
          )}
          {platform === 'telegram' && (
            <>
              <FieldInput label="Chat ID" value={fields.chatId || ''} onChange={(v) => setField('chatId', v)} placeholder="Your Telegram chat id" />
              <FieldInput label="Message" value={fields.text || ''} onChange={(v) => setField('text', v)} multiline />
            </>
          )}
          {platform === 'whatsapp' && (
            <>
              <FieldInput label="To (E.164)" value={fields.to || ''} onChange={(v) => setField('to', v)} placeholder="+16475551234" />
              <FieldInput label="Message" value={fields.text || ''} onChange={(v) => setField('text', v)} multiline />
            </>
          )}
          {platform === 'notion' && (
            <>
              <FieldInput label="Title" value={fields.title || ''} onChange={(v) => setField('title', v)} />
              <FieldInput label="Content" value={fields.content || ''} onChange={(v) => setField('content', v)} multiline />
              <FieldInput label="Parent page ID (optional override)" value={fields.parentPageId || ''} onChange={(v) => setField('parentPageId', v)} />
            </>
          )}
          {platform === 'clickup' && (
            <>
              <FieldInput label="Title" value={fields.title || ''} onChange={(v) => setField('title', v)} />
              <FieldInput label="Description" value={fields.content || ''} onChange={(v) => setField('content', v)} multiline />
              <FieldInput label="List ID (optional override)" value={fields.listId || ''} onChange={(v) => setField('listId', v)} />
            </>
          )}
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 mb-4">
          <input
            id="marcus-approval"
            type="checkbox"
            checked={approved}
            onChange={(e) => setApproved(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 accent-amber-400"
          />
          <label htmlFor="marcus-approval" className="cursor-pointer text-[11px] text-amber-100/90 leading-relaxed">
            <span className="font-bold">I explicitly approve this external publish action.</span>
            {' '}Marcus will execute the distribution immediately through the {platformDef?.label} connector. This cannot be undone.
          </label>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handlePublish}
            disabled={busy || !approved}
            className="flex items-center gap-2 rounded-xl bg-amber-500/20 border border-amber-400/30 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-amber-100 hover:bg-amber-500/30 disabled:opacity-40 transition-colors"
          >
            <Send className="h-3.5 w-3.5" />
            {busy ? 'Publishing…' : `Publish to ${platformDef?.label}`}
          </button>

          <label className="flex items-center gap-2 cursor-pointer text-[11px] text-zinc-500">
            <input
              type="checkbox"
              checked={createPacketOnly}
              onChange={(e) => setCreatePacketOnly(e.target.checked)}
              className="h-3 w-3 accent-zinc-400"
            />
            Queue as packet only (no immediate execution)
          </label>
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-[11px] text-red-200">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {receipt && (
          <div className={`mt-3 rounded-xl border p-3 text-[11px] ${receipt.ok ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100' : 'border-red-400/20 bg-red-500/10 text-red-200'}`}>
            <div className="flex items-center gap-2 font-bold mb-1">
              {receipt.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
              {receipt.ok
                ? receipt.packetOnly
                  ? `Packet queued for ${receipt.platform} — awaiting execution`
                  : `Published to ${receipt.platform}`
                : `Publish failed: ${receipt.platform}`}
            </div>
            {receipt.packetOnly && <div className="text-zinc-400">Packet ID: {receipt.packetId}</div>}
            {receipt.result?.externalId && <div>External ID: {receipt.result.externalId}</div>}
            {receipt.result?.videoId && <div>Video ID: {receipt.result.videoId}</div>}
            {receipt.result?.url && (
              <div>URL: <span className="font-mono text-[10px] break-all">{receipt.result.url}</span></div>
            )}
            {receipt.error && <div>Error: {receipt.error}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function FieldInput({ label, value, onChange, placeholder = '', multiline = false }) {
  const cls = 'w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-400/40';
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-1">{label}</label>
      {multiline
        ? <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} placeholder={placeholder} className={cls} />
        : <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cls} />}
    </div>
  );
}

function FieldSelect({ label, value, onChange, options }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-1">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-400/40">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function riskColor(level) {
  if (level === 'critical') return 'text-red-400';
  if (level === 'high') return 'text-orange-400';
  if (level === 'medium') return 'text-amber-400';
  return 'text-emerald-400';
}
