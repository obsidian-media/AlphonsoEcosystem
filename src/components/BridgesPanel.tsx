import React, { useCallback, useEffect, useState } from 'react';
import {
  checkAccBridge,
  chooseAccFolder,
  getAccBridgeConfig,
  getAccLocalState,
  startAcc,
  stopAcc,
  updateAccBridgeConfig,
} from '../services/agentWorkshop/accBridgeService';

/**
 * Settings → Bridges: connections to the owner's other apps (owner, 2026-10-22).
 * Alphonso works fully without them; a bridge's features appear only when it
 * is connected. Design: docs/superpowers/specs/2026-10-22-bridges-sessionguard-acc-design.md
 */

const ACC_STATUS_TEXT: Record<string, string> = {
  connected: 'Connected: ACC answered and accepted the token.',
  unauthorized: 'ACC answered but refused the token. Check that it matches ALPHONSO_BRIDGE_TOKEN in ACC.',
  setup_required_in_acc: 'ACC answered but has no bridge token set. Add ALPHONSO_BRIDGE_TOKEN to ACC and restart it.',
  unreachable: "ACC didn't answer at this address. Is it running?",
  setup_required: "Enter ACC's address and the bridge token first.",
  failed: 'ACC answered with an error.',
};

type CheckResult = { ok?: boolean; status?: string; httpStatus?: number; error?: string; reachable?: boolean };
type LocalState = { folder?: string | null; folderProblem?: string | null; startedByAlphonso?: boolean; unavailable?: boolean };

function isLocalAddress(address: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(String(address || '').trim());
}

/**
 * Start / Stop for an ACC on this computer (owner, 2026-10-22). The folder is
 * chosen once in a dialog the backend opens and checks; Start only appears
 * when that folder is set, the address is local, and ACC isn't answering.
 */
function AccLocalControls({ address, check, onAnswer }: { address: string; check: CheckResult | null; onAnswer: (r: CheckResult) => void }) {
  const [local, setLocal] = useState<LocalState>({});
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => setLocal(await getAccLocalState()), []);
  useEffect(() => { void refresh(); }, [refresh]);

  if (local.unavailable) return null;

  const choose = async () => {
    setBusy('choose');
    setMessage('');
    const result = await chooseAccFolder();
    setBusy('');
    if (result?.state) setLocal(result.state);
    if (result?.error) setMessage(result.error);
  };

  const start = async () => {
    setBusy('start');
    setMessage('Starting ACC…');
    const result = await startAcc();
    setBusy('');
    await refresh();
    if (result.status && result.status !== 'not_started') onAnswer({ ok: result.ok, status: result.status, reachable: result.status !== 'unreachable', error: result.error });
    setMessage(result.ok ? 'ACC started.' : (result.error || ''));
  };

  const stop = async () => {
    setBusy('stop');
    await stopAcc();
    setBusy('');
    await refresh();
    setMessage('ACC stopped.');
    onAnswer({ ok: false, status: 'unreachable', reachable: false });
  };

  const notAnswering = !check || !check.reachable;
  const canStart = Boolean(local.folder) && !local.folderProblem && isLocalAddress(address) && notAnswering && !local.startedByAlphonso;
  const button = 'px-3 py-1.5 text-xs rounded-lg border border-(--border) text-(--text-2) hover:text-(--text-1) disabled:opacity-40';

  return (
    <div className="space-y-1.5 border-t border-(--border) pt-3" data-testid="acc-local">
      <div className="text-xs font-semibold text-(--text-2)">ACC on this computer</div>
      <div className="text-[11px] text-(--text-3)">
        {local.folder ? <>Folder: <span className="font-mono">{local.folder}</span></> : "Choose ACC's folder to start it from here. Not needed if ACC runs elsewhere."}
      </div>
      {local.folderProblem && <div className="text-[11px] text-(--text-2)">{local.folderProblem}</div>}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => void choose()} disabled={Boolean(busy)} className={button}>{local.folder ? 'Change folder…' : "Choose ACC's folder…"}</button>
        {canStart && <button onClick={() => void start()} disabled={Boolean(busy)} className="px-3 py-1.5 text-xs rounded-lg bg-(--accent-dim) text-(--accent) hover:bg-(--accent) hover:text-(--text-1) disabled:opacity-40">{busy === 'start' ? 'Starting…' : 'Start'}</button>}
        {local.startedByAlphonso && <button onClick={() => void stop()} disabled={Boolean(busy)} className={button}>Stop</button>}
      </div>
      {local.folder && !isLocalAddress(address) && <div className="text-[11px] text-(--text-4)">Start is for an ACC on this computer; the address above points elsewhere.</div>}
      {local.startedByAlphonso && <div className="text-[11px] text-(--text-4)">Started by Alphonso. It keeps running if you close Alphonso.</div>}
      {message && <div className="text-[11px] text-(--text-3)" role="status">{message}</div>}
    </div>
  );
}

function AccBridgeCard() {
  const [cfg, setCfg] = useState(() => getAccBridgeConfig());
  const [notice, setNotice] = useState('');
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [testing, setTesting] = useState(false);

  const save = (patch: Partial<typeof cfg> = {}) => {
    const next = updateAccBridgeConfig({ ...cfg, ...patch });
    setCfg(next);
    return next;
  };

  const test = async () => {
    save();
    setTesting(true);
    setCheck(null);
    try {
      setCheck(await checkAccBridge());
    } finally {
      setTesting(false);
    }
  };

  const input = 'w-full text-sm bg-(--surface-1) rounded-xl px-3 py-2 text-(--text-1) placeholder:text-(--text-4) focus:outline-hidden focus:ring-1 focus:ring-(--accent-border)';

  return (
    <div className="p-4 bg-(--surface-2) rounded-2xl space-y-3" data-testid="bridge-acc">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-(--text-1)">ACC (Agent Command Center)</div>
          <div className="text-xs text-(--text-3) mt-0.5">
            Your job, outreach and content automation app. When connected, Content Studio can send jobs, approvals and results to ACC.
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-(--text-2) shrink-0">
          <input
            type="checkbox"
            role="switch"
            aria-label="Use the ACC bridge"
            checked={Boolean(cfg.enabled)}
            onChange={(e) => { save({ enabled: e.target.checked }); setNotice(e.target.checked ? 'Bridge turned on.' : 'Bridge turned off.'); }}
          />
          On
        </label>
      </div>
      <div className="space-y-1">
        <label htmlFor="acc-address" className="text-xs font-semibold text-(--text-2)">ACC address</label>
        <input id="acc-address" value={cfg.baseUrl} onChange={(e) => setCfg((c) => ({ ...c, baseUrl: e.target.value }))} placeholder="http://localhost:4000" className={input} />
      </div>
      <div className="space-y-1">
        <label htmlFor="acc-token" className="text-xs font-semibold text-(--text-2)">Bridge token</label>
        <input id="acc-token" type="password" value={cfg.token} onChange={(e) => setCfg((c) => ({ ...c, token: e.target.value }))} placeholder="The same value as ALPHONSO_BRIDGE_TOKEN in ACC" className={input} />
        <div className="text-[11px] text-(--text-4)">Required: ACC refuses every request without it.</div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => { save(); setNotice('Saved.'); }} className="px-3 py-1.5 text-xs rounded-lg bg-(--accent-dim) text-(--accent) hover:bg-(--accent) hover:text-(--text-1) transition-colors">Save</button>
        <button onClick={() => void test()} disabled={testing} className="px-3 py-1.5 text-xs rounded-lg border border-(--border) text-(--text-2) hover:text-(--text-1) disabled:opacity-40">{testing ? 'Testing…' : 'Test'}</button>
        {notice && <span className="text-[11px] text-(--text-3)">{notice}</span>}
      </div>
      {check && (
        <div role="status" data-testid="acc-check" className={`text-xs ${check.ok ? 'text-(--accent)' : 'text-(--text-2)'}`}>
          {ACC_STATUS_TEXT[check.status || 'failed'] || ACC_STATUS_TEXT.failed}
          {!check.ok && check.error && check.status === 'unreachable' ? ` (${check.error})` : ''}
          {check.ok && !cfg.enabled ? ' Turn the bridge on to use it.' : ''}
        </div>
      )}
      <AccLocalControls address={cfg.baseUrl} check={check} onAnswer={setCheck} />
    </div>
  );
}

export function BridgesPanel() {
  return (
    <div className="space-y-4">
      <p className="text-xs text-(--text-3)">
        Connections to your other apps. Alphonso works fully without them; a bridge's features appear only when it is connected.
      </p>
      <AccBridgeCard />
      <div className="p-4 bg-(--surface-2) rounded-2xl space-y-1" data-testid="bridge-sessionguard">
        <div className="text-sm font-semibold text-(--text-1)">SessionGuard</div>
        <div className="text-xs text-(--text-3)">
          Your live-session safety app. When connected, Coach Mode coaches you during a session. Signing in to SessionGuard from here is the next step being built; it is not available yet.
        </div>
      </div>
    </div>
  );
}
