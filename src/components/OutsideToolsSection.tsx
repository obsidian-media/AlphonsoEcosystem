import React, { useEffect, useState } from 'react';
import { Button } from './ui';
import {
  addServer, listServers, onServersChanged, removeServer, setToolMark, setToolOff, updateServer,
  type McpServer, type ToolMark,
} from '../services/mcp/mcpServers';
import {
  finishPastedSignIn, refreshTools, savedParts, saveServerHeader, searchRegistry, signIn, type RegistryServer,
} from '../services/mcp/mcpConnection';

const NOT_HTTPS = 'Outside tools need an https address.';
const NEEDS_CLIENT = /client ID/i;
const field = 'w-full rounded-lg border border-(--border) bg-(--surface-2) px-3 py-1.5 text-[12px] text-(--text-1)';

const MARK_LABEL: Record<ToolMark, string> = { ask: 'Asks first', reading_only: 'Reading only', deletes: 'Deletes (always asks)' };

function useServers(): McpServer[] {
  const [servers, setServers] = useState<McpServer[]>(() => listServers());
  useEffect(() => onServersChanged(() => setServers(listServers())), []);
  return servers;
}

interface HeaderField { name: string; description: string; isSecret: boolean; isRequired: boolean }

/**
 * Settings → Connectors → Outside tools (MCP) (2026-10-30, owner). Alphonso calls out to the
 * online MCP servers added here; nothing calls in. Every tool asks first until it is marked
 * "Reading only"; a change always goes through Marcus with the exact call shown first.
 */
export function OutsideToolsSection(): React.JSX.Element {
  const servers = useServers();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [cost, setCost] = useState<'free' | 'paid'>('paid');
  const [price, setPrice] = useState('');
  const [headers, setHeaders] = useState<HeaderField[]>([]);
  const [headerValues, setHeaderValues] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RegistryServer[] | null>(null);
  const [searching, setSearching] = useState(false);

  const add = async () => {
    const address = url.trim();
    if (!/^https:\/\/[^\s/]+/i.test(address)) {
      setNotice(NOT_HTTPS);
      return;
    }
    const priceUsd = price.trim() ? Number(price) : undefined;
    const server = addServer({ name: name.trim() || new URL(address).hostname, url: address, cost, ...(priceUsd !== undefined && Number.isFinite(priceUsd) ? { pricePerCallUsd: priceUsd } : {}) });
    for (const h of headers) {
      const value = (headerValues[h.name] || '').trim();
      if (value) await saveServerHeader(server.id, h.name, value);
    }
    setName(''); setUrl(''); setPrice(''); setHeaders([]); setHeaderValues({}); setCost('paid');
    const r = await refreshTools(server.id, { force: true });
    setNotice(r.ok ? `${server.name} added.` : `${server.name} added. ${r.reason || ''}`.trim());
  };

  const search = async () => {
    setSearching(true);
    try {
      setResults(await searchRegistry(query.trim()));
    } catch {
      setResults([]);
      setNotice('The MCP Registry couldn’t be reached.');
    } finally {
      setSearching(false);
    }
  };

  const use = (r: RegistryServer) => {
    const remote = r.remotes[0];
    if (!remote) return;
    setName(r.title || r.name);
    setUrl(remote.url);
    setHeaders(remote.headers || []);
    setHeaderValues({});
    setResults(null);
  };

  return (
    <div className="space-y-3 rounded-xl border border-sky-300/20 bg-sky-500/8 p-3" data-testid="outside-tools-section">
      <h4 className="text-[13px] font-semibold text-sky-400">Outside tools (MCP)</h4>
      <p className="text-[11px] text-(--text-3)">
        Let Alphonso&apos;s agents use tools from online services you connect, such as your shop or your issue tracker.
        Alphonso calls these servers; nothing can call into Alphonso. Every tool asks you first until you mark it
        &quot;Reading only&quot;, and anything that changes or sends something goes through Marcus with the exact call shown first.
        What a server sends back is treated like a web page: data, never instructions.
      </p>

      <div className="space-y-1.5">
        <label className="block text-[11px] text-(--text-2)">
          Search the MCP Registry
          <input aria-label="Search the MCP Registry" className={field} placeholder="e.g. shop, issues, calendar" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <Button size="sm" variant="secondary" data-testid="mcp-search" disabled={searching || !query.trim()} onClick={() => void search()}>
          {searching ? 'Searching…' : 'Search'}
        </Button>
        {results && (
          <ul className="space-y-1.5">
            {results.length === 0 && <li className="text-[11px] text-(--text-3)">Nothing found online for that.</li>}
            {results.map((r) => (
              <li key={r.name} className="rounded-lg border border-(--border) p-2 text-[11px]">
                <div className="font-medium text-(--text-1)">{r.title}</div>
                <div className="text-(--text-3)">{r.description}</div>
                <div className="text-(--text-3)">{r.remotes[0]?.url}</div>
                <Button size="sm" variant="ghost" onClick={() => use(r)}>Use this server</Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-1.5 rounded-lg border border-(--border) p-2">
        <label className="block text-[11px] text-(--text-2)">
          Name
          <input aria-label="Name" className={field} placeholder="e.g. My shop" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block text-[11px] text-(--text-2)">
          Server address
          <input aria-label="Server address" className={field} placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
        {headers.map((h) => (
          <label key={h.name} className="block text-[11px] text-(--text-2)">
            {h.name}{h.isRequired ? ' (needed)' : ''}{h.description ? ` — ${h.description}` : ''}
            <input aria-label={h.name} className={field} type={h.isSecret ? 'password' : 'text'} value={headerValues[h.name] || ''}
              onChange={(e) => setHeaderValues((v) => ({ ...v, [h.name]: e.target.value }))} />
          </label>
        ))}
        <fieldset className="flex flex-wrap items-center gap-3 text-[11px] text-(--text-2)">
          <legend className="sr-only">Does using it cost money?</legend>
          <label className="flex items-center gap-1"><input type="radio" name="mcp-cost" aria-label="Free" checked={cost === 'free'} onChange={() => setCost('free')} /> Free</label>
          <label className="flex items-center gap-1"><input type="radio" name="mcp-cost" aria-label="Paid" checked={cost === 'paid'} onChange={() => setCost('paid')} /> Paid (blocked in Zero-Cost Mode, always asks)</label>
          {cost === 'paid' && (
            <label className="flex items-center gap-1">
              Price per call, if you know it ($)
              <input aria-label="Price per call" className="w-20 rounded border border-(--border) bg-(--surface-2) px-2 py-1 text-[12px]" value={price} onChange={(e) => setPrice(e.target.value)} />
            </label>
          )}
        </fieldset>
        <Button size="sm" data-testid="mcp-add" onClick={() => void add()}>Add server</Button>
      </div>

      {notice && <p className="text-[11px] text-(--text-2)" role="status">{notice}</p>}

      <ul className="space-y-2">
        {servers.map((s) => <ServerRow key={s.id} server={s} />)}
      </ul>
    </div>
  );
}

function ServerRow({ server }: { server: McpServer }): React.JSX.Element {
  const [showTools, setShowTools] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [clientId, setClientId] = useState('');
  const [pasted, setPasted] = useState('');
  const [keyName, setKeyName] = useState('Authorization');
  const [keyValue, setKeyValue] = useState('');
  const [parts, setParts] = useState<{ headers: string[]; signedIn: boolean }>({ headers: [], signedIn: false });

  useEffect(() => {
    let live = true;
    void savedParts(server.id).then((p) => { if (live && p) setParts(p); });
    return () => { live = false; };
  }, [server.id, server.signIn]);

  const doSignIn = async () => {
    setBusy(true);
    setReason('');
    try {
      const r = await signIn(server.id, clientId.trim() || undefined);
      setReason(r.ok ? (r.notNeeded ? 'This server needs no sign-in.' : 'Signed in.') : r.reason || 'The sign-in didn’t finish.');
    } finally {
      setBusy(false);
    }
  };

  const finishPasted = async () => {
    const r = await finishPastedSignIn(server.id, pasted.trim());
    setReason(r.ok ? 'Signed in.' : r.reason || 'That address didn’t finish the sign-in.');
    if (r.ok) setPasted('');
  };

  const saveKey = async () => {
    try {
      await saveServerHeader(server.id, keyName.trim(), keyValue.trim());
      setKeyValue('');
      setReason(`${keyName.trim()} saved.`);
      await refreshTools(server.id, { force: true });
    } catch (e) {
      setReason(e instanceof Error ? e.message : String(e));
    }
  };

  const refresh = async () => {
    setBusy(true);
    try {
      const r = await refreshTools(server.id, { force: true });
      setReason(r.ok ? 'Tools refreshed.' : r.reason || 'The tools couldn’t be listed.');
    } finally {
      setBusy(false);
    }
  };

  const status = server.needsSignIn
    ? 'Needs a sign-in or a key.'
    : server.tools.length
      ? `${server.tools.length} tool${server.tools.length === 1 ? '' : 's'}${server.version ? ` · MCP ${server.version}` : ''}`
      : server.lastReason || 'No tools listed yet.';

  return (
    <li className="space-y-1.5 rounded-lg border border-(--border) p-2 text-[11px]" data-testid={`mcp-server-${server.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-(--text-1)">{server.name}</span>
        <span className="text-(--text-3)">{server.url}</span>
        <span className="text-(--text-2)">{status}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={server.enabled} onChange={(e) => updateServer(server.id, { enabled: e.target.checked })} /> On
        </label>
        <label className="flex items-center gap-1">
          Cost
          <select aria-label={`Cost of ${server.name}`} className="rounded border border-(--border) bg-(--surface-2) px-1 py-0.5" value={server.cost}
            onChange={(e) => updateServer(server.id, { cost: e.target.value === 'free' ? 'free' : 'paid' })}>
            <option value="free">Free</option>
            <option value="paid">Paid</option>
          </select>
        </label>
        <Button size="sm" variant="secondary" data-testid={`mcp-signin-${server.id}`} disabled={busy} onClick={() => void doSignIn()}>
          {busy ? 'Waiting for the browser…' : parts.signedIn ? 'Sign in again' : 'Sign in'}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void refresh()}>Refresh tools</Button>
        {confirmRemove ? (
          <>
            <Button size="sm" variant="danger" onClick={() => void removeServer(server.id)}>Remove {server.name} for good</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>Keep it</Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" data-testid={`mcp-remove-${server.id}`} onClick={() => setConfirmRemove(true)}>Remove</Button>
        )}
      </div>

      {(NEEDS_CLIENT.test(reason) || clientId) && (
        <label className="block text-(--text-2)">
          Client ID
          <input aria-label="Client ID" className={field} value={clientId} onChange={(e) => setClientId(e.target.value)} />
        </label>
      )}
      {busy && (
        <label className="block text-(--text-2)">
          If the browser didn&apos;t come back, paste the address it ended on
          <input aria-label="Address the browser ended on" className={field} value={pasted} onChange={(e) => setPasted(e.target.value)} />
          <Button size="sm" variant="ghost" disabled={!pasted.trim()} onClick={() => void finishPasted()}>Finish sign-in</Button>
        </label>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-(--text-2)">
          Or use a key: header
          <input aria-label={`Key header for ${server.name}`} className="w-36 rounded border border-(--border) bg-(--surface-2) px-2 py-1 text-[12px]" value={keyName} onChange={(e) => setKeyName(e.target.value)} />
        </label>
        <label className="text-(--text-2)">
          value
          <input aria-label={`Key for ${server.name}`} type="password" className="w-48 rounded border border-(--border) bg-(--surface-2) px-2 py-1 text-[12px]" value={keyValue} onChange={(e) => setKeyValue(e.target.value)} />
        </label>
        <Button size="sm" variant="ghost" disabled={!keyName.trim() || !keyValue.trim()} onClick={() => void saveKey()}>Save key</Button>
        {parts.headers.length > 0 && <span className="text-(--text-3)">Saved: {parts.headers.join(', ')}</span>}
      </div>

      {reason && <p className="text-(--text-2)" role="status">{reason}</p>}
      {server.truncated && <p className="text-(--text-3)">Only the first 200 tools are kept.</p>}
      {server.rejected && server.rejected.length > 0 && (
        <p className="text-(--text-3)">Left out: {server.rejected.join(', ')} (it breaks the MCP rules for header fields).</p>
      )}

      {server.tools.length > 0 && (
        <Button size="sm" variant="ghost" onClick={() => setShowTools((v) => !v)}>
          {showTools ? 'Hide tools' : `Show tools (${server.tools.length})`}
        </Button>
      )}
      {showTools && (
        <ul className="space-y-1">
          {server.tools.map((t) => (
            <li key={t.name} className="flex flex-wrap items-center gap-2" data-testid={`mcp-tool-${server.id}-${t.name}`}>
              <span className="text-(--text-1)" title={t.description || ''}>{t.title || t.name}</span>
              <select aria-label={`What ${t.name} may do`} className="rounded border border-(--border) bg-(--surface-2) px-1 py-0.5" value={t.mark}
                onChange={(e) => setToolMark(server.id, t.name, e.target.value as ToolMark)}>
                {(Object.keys(MARK_LABEL) as ToolMark[]).map((m) => <option key={m} value={m}>{MARK_LABEL[m]}</option>)}
              </select>
              {t.hintReadOnly && <span className="text-(--text-3)">The server says: reads only</span>}
              {t.hintDestructive && <span className="text-(--text-3)">The server says: may delete</span>}
              <label className="flex items-center gap-1 text-(--text-3)">
                <input type="checkbox" checked={Boolean(t.off)} onChange={(e) => setToolOff(server.id, t.name, e.target.checked)} /> Off
              </label>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
