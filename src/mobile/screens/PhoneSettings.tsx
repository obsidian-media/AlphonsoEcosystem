// Settings on the phone (phase 3 part B, owner 2026-11-02): see and switch approvals, money, models and
// notifications; no keys, passwords or prices. A change that makes Alphonso ask less or spend more asks
// for Face ID or the fingerprint first (owner); the computer refuses it unless the phone confirmed.
import React, { useEffect, useState } from 'react';
import { reasonOf, type MoreData } from '../../services/phone/remoteData';
import type { PhoneLock } from '../MobileApp';
import type { PhoneSettings } from '../../services/phone/phase3bMirror';
import type { JoseEffect } from '../../services/jose/joseEffects';
import { asksLess } from '../../services/phone/asksLess';
import { PhoneSwitch } from './PhoneSwitch';

const NOT_CONFIRMED = "Not changed: Face ID / fingerprint didn't confirm it.";
const NOTIFY_LABELS: Array<[keyof PhoneSettings['phoneNotify'], string]> = [
  ['stepWaiting', 'A step waits for you'],
  ['planWaiting', 'A plan waits for you'],
  ['finished', 'A request finishes'],
  ['reviewDecision', 'A review asks you to decide'],
  ['boardroomEscalations', 'Boardroom needs your decision'],
];

function Row({ label, children, note }: { label: string; children: React.ReactNode; note?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-(--surface-2) p-3">
      <div className="min-w-0">
        <span className="block">{label}</span>
        {note && <span className="block text-xs text-(--text-3)">{note}</span>}
      </div>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-(--text-3)">{title}</h2>
      {children}
    </section>
  );
}

const modelValue = (provider: string, model: string | null) => `${provider}|${model || ''}`;

export function SettingsScreen({ more, lock }: { more: MoreData; lock: PhoneLock }) {
  const [s, setS] = useState(more.settings());
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [cap, setCap] = useState('');
  const [days, setDays] = useState('');
  useEffect(() => more.subscribe(() => setS(more.settings())), [more]);
  useEffect(() => {
    setCap(s?.paidModels.monthlyCapUsd === null || s?.paidModels.monthlyCapUsd === undefined ? '' : String(s.paidModels.monthlyCapUsd));
    setDays(s ? String(s.waitingExpiryDays) : '');
  }, [s?.paidModels.monthlyCapUsd, s?.waitingExpiryDays]);

  if (!s) return <p className="pt-2 text-sm text-(--text-3)">Waiting for your computer&apos;s settings.</p>;
  const off = more.readOnly || busy;

  const confirmIfNeeded = async (needs: boolean, what: string): Promise<boolean | null> => {
    if (!needs) return false;
    if (await lock.confirm(what, { strict: true })) return true;
    setMessage(NOT_CONFIRMED);
    return null;
  };

  const change = async (setting: string, value: unknown, base: unknown, what: string) => {
    const confirmed = await confirmIfNeeded(asksLess(setting, base, value), what);
    if (confirmed === null) return;
    setBusy(true);
    try {
      const r = await more.call('settings.set', { setting, value, base, ...(confirmed ? { confirmed: true } : {}) });
      setMessage(r.ok ? '' : reasonOf(r));
    } finally { setBusy(false); }
  };

  const setModel = async (agent: PhoneSettings['agents'][number], value: string) => {
    const [provider, model] = value.split('|');
    const choice = s.providerChoices.find((c) => c.provider === provider);
    const confirmed = await confirmIfNeeded(!!choice?.paid && agent.provider !== provider, `Use a paid model for ${agent.name}`);
    if (confirmed === null) return;
    setBusy(true);
    try {
      const r = await more.call('agent.setModel', { agentId: agent.id, provider, model: model || null, base: { provider: agent.provider, model: agent.model }, ...(confirmed ? { confirmed: true } : {}) });
      setMessage(r.ok ? '' : reasonOf(r));
    } finally { setBusy(false); }
  };

  const options = (agent: PhoneSettings['agents'][number]) => {
    const list: Array<{ value: string; label: string }> = [];
    for (const c of s.providerChoices) {
      if (c.provider === 'ollama') list.push({ value: modelValue('ollama', null), label: `${c.label} (this computer’s model: ${s.computerModel})` });
      else if (c.provider === 'paid') list.push({ value: modelValue('paid', null), label: c.label });
      else {
        if (c.provider === 'openrouter') list.push({ value: modelValue('openrouter', null), label: `${c.label}: let it choose a free model` });
        for (const m of c.models) list.push({ value: modelValue(c.provider, m), label: `${c.label}: ${m}` });
      }
    }
    const current = modelValue(agent.provider, agent.provider === 'ollama' || agent.provider === 'paid' ? null : agent.model);
    if (!list.some((o) => o.value === current)) list.unshift({ value: current, label: `${agent.provider}${agent.model ? `: ${agent.model}` : ''} (set on your computer)` });
    return { list, current };
  };

  return (
    <div className="space-y-5 pt-2 text-sm" data-testid="mobile-settings">
      {more.readOnly && more.readOnlyReason && <p className="text-xs text-(--text-3)">{more.readOnlyReason}</p>}
      {message && <p role="status" className="rounded-lg bg-(--surface-3) px-3 py-2 text-xs">{message}</p>}

      <Section title="Approvals">
        <Row label="Approval Mode" note="Steps ask before they act.">
          <PhoneSwitch label="Approval Mode" on={s.approvalMode} disabled={off} onChange={(v) => void change('approvalMode', v, s.approvalMode, 'Turn Approval Mode off')} />
        </Row>
        {(Object.keys(s.effectApprovals) as JoseEffect[]).map((effect) => {
          const locked = s.lockedEffects.includes(effect);
          return (
            <Row key={effect} label={s.effectLabels[effect]} note={locked ? 'Always asks' : undefined}>
              <PhoneSwitch label={`Ask before: ${s.effectLabels[effect]}`} on={s.effectApprovals[effect]} disabled={off || locked} onChange={(v) => void change(`effect:${effect}`, v, s.effectApprovals[effect], `Stop asking before: ${s.effectLabels[effect]}`)} />
            </Row>
          );
        })}
        <Row label="Allow paid models" note={`This month: $${s.paidModels.monthSpendUsd.toFixed(2)}${s.paidModels.reason ? ` · ${s.paidModels.reason}` : ''}`}>
          <PhoneSwitch label="Allow paid models" on={s.paidModels.allowed} disabled={off} onChange={(v) => void change('paidModels.allowed', v, s.paidModels.allowed, 'Allow paid models')} />
        </Row>
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void change('paidModels.monthlyCapUsd', cap.trim() === '' ? null : Number(cap), s.paidModels.monthlyCapUsd, 'Change the monthly limit'); }}>
          <label className="block flex-1">
            <span className="block text-xs text-(--text-2)">Monthly limit in dollars (blank: no limit)</span>
            <input aria-label="Monthly limit" inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} className="w-full rounded-lg bg-(--surface-2) px-3 py-2" />
          </label>
          <button type="submit" disabled={off} className="min-h-11 rounded-lg bg-(--surface-3) px-4 py-2">Save</button>
        </form>
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void change('waitingExpiryDays', days.trim() === '' ? 0 : Number(days), s.waitingExpiryDays, ''); }}>
          <label className="block flex-1">
            <span className="block text-xs text-(--text-2)">Waiting requests expire after (days; 0: never)</span>
            <input aria-label="Waiting requests expire after" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} className="w-full rounded-lg bg-(--surface-2) px-3 py-2" />
          </label>
          <button type="submit" disabled={off} className="min-h-11 rounded-lg bg-(--surface-3) px-4 py-2">Save</button>
        </form>
      </Section>

      <Section title="Zero-Cost Mode and models">
        <Row label="Zero-Cost Mode" note="Only free services are used.">
          <PhoneSwitch label="Zero-Cost Mode" on={s.zeroCostMode} disabled={off} onChange={(v) => void change('zeroCostMode', v, s.zeroCostMode, 'Turn Zero-Cost Mode off')} />
        </Row>
        <Row label="Show model thinking">
          <PhoneSwitch label="Show model thinking" on={s.showModelThinking} disabled={off} onChange={(v) => void change('showModelThinking', v, s.showModelThinking, '')} />
        </Row>
        {s.agents.map((agent) => {
          const { list, current } = options(agent);
          return (
            <label key={agent.id} className="block">
              <span className="block text-xs text-(--text-2)">{agent.name}</span>
              <select aria-label={`Model for ${agent.name}`} value={current} disabled={off} onChange={(e) => void setModel(agent, e.target.value)} className="w-full rounded-lg bg-(--surface-2) px-3 py-2">
                {list.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          );
        })}
      </Section>

      <Section title="Notifications on this phone">
        {NOTIFY_LABELS.map(([key, label]) => (
          <Row key={key} label={label}>
            <PhoneSwitch label={label} on={s.phoneNotify[key]} disabled={off} onChange={(v) => void change(`notify:${key}`, v, s.phoneNotify[key], '')} />
          </Row>
        ))}
      </Section>
    </div>
  );
}
