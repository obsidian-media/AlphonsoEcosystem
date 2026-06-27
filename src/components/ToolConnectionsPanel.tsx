import React, { useMemo, useState } from 'react';
import { MessageSquare, Plug, RefreshCw, Send, Trash2 } from 'lucide-react';
import {
  listToolConnectionAudit,
  listToolConnectionTypes,
  listToolConnections,
  removeToolConnection,
  proveToolConnectionPath,
  sendToolConnectionMessage,
  upsertToolConnection
} from '../services/toolConnectionService';

interface ToolConnectionType {
  id: string;
  label: string;
}

interface ToolConnection {
  id: string;
  type: string;
  label: string;
  webhookUrl: string;
  messagePrefix: string;
  payloadTemplate: string;
  notifyOn: string | string[];
  note: string;
  active: boolean;
  platform: string;
  lastTestAtMs?: number;
  lastTestStatus?: string;
}

interface AuditEntry {
  id: string;
  action: string;
  timestampMs: number;
}

function hostFromUrl(webhookUrl: string) {
  try {
    return new URL(webhookUrl).host || 'unknown-host';
  } catch {
    return 'unknown-host';
  }
}

export function ToolConnectionsPanel() {
  const [connections, setConnections] = useState<ToolConnection[]>(() => listToolConnections());
  const [audit, setAudit] = useState<AuditEntry[]>(() => listToolConnectionAudit());
  const [connectionId, setConnectionId] = useState('');
  const [connectionType, setConnectionType] = useState('slack_webhook');
  const [connectionLabel, setConnectionLabel] = useState('Slack Alerts');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [messagePrefix, setMessagePrefix] = useState('Alphonso');
  const [payloadTemplate, setPayloadTemplate] = useState('{\n  "text": "{{message}}"\n}');
  const [notifyOn, setNotifyOn] = useState('approval,blocked,executed,failed,policy,connector,dead_letter');
  const [connectionNote, setConnectionNote] = useState('');
  const [testMessage, setTestMessage] = useState('Alphonso connection test');
  const [explicitApproval, setExplicitApproval] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const types = useMemo(() => listToolConnectionTypes(), []);
  const selectedConnection = useMemo(
    () => connections.find((row) => row.id === connectionId) || null,
    [connections, connectionId]
  );

  const refresh = () => {
    setConnections(listToolConnections());
    setAudit(listToolConnectionAudit());
  };

  const saveConnection = () => {
    const result = upsertToolConnection({
      id: connectionId || undefined,
      type: connectionType,
      label: connectionLabel,
      webhookUrl,
      messagePrefix,
      payloadTemplate: connectionType === 'custom_webhook' ? payloadTemplate : '',
      notifyOn,
      note: connectionNote,
      active: true
    });

    if (result?.error) {
      setNotice(result.error);
      return;
    }

    setConnectionId(result?.connection?.id || connectionId);
    setNotice(`Saved ${result?.connection?.label || connectionLabel} (${result?.connection?.platform || connectionType}).`);
    refresh();
  };

  const loadConnection = (connection: ToolConnection) => {
    setConnectionId(connection.id);
    setConnectionType(connection.type);
    setConnectionLabel(connection.label);
    setWebhookUrl(connection.webhookUrl);
    setMessagePrefix(connection.messagePrefix || '');
    setPayloadTemplate(connection.payloadTemplate || '{\n  "text": "{{message}}"\n}');
    setNotifyOn(Array.isArray(connection.notifyOn) ? connection.notifyOn.join(',') : String(connection.notifyOn || ''));
    setConnectionNote(connection.note || '');
    setExplicitApproval(false);
    setNotice(`Loaded ${connection.label}.`);
  };

  const toggleActive = (connection: ToolConnection) => {
    const result = upsertToolConnection({
      id: connection.id,
      type: connection.type,
      label: connection.label,
      webhookUrl: connection.webhookUrl,
      messagePrefix: connection.messagePrefix,
      payloadTemplate: connection.payloadTemplate,
      notifyOn: connection.notifyOn,
      note: connection.note,
      active: !connection.active
    });
    if (result?.error) {
      setNotice(result.error);
      return;
    }
    setNotice(`${connection.label} is now ${result?.connection?.active ? 'active' : 'disabled'}.`);
    refresh();
  };

  const testConnection = async (connection: ToolConnection | null = selectedConnection) => {
    if (!connection) {
      setNotice('Save or select a connection first.');
      return;
    }
    setBusy(true);
    try {
      const result = await sendToolConnectionMessage(connection.id, testMessage, {
        approved: explicitApproval
      });
      if (result?.ok) {
        setNotice(`Connection test sent to ${connection.label} (${result.webhookHost || hostFromUrl(connection.webhookUrl)}).`);
      } else if (result?.blocked) {
        setNotice(`Connection test blocked: ${result?.error || 'approval required or connection disabled'}.`);
      } else {
        setNotice(`Connection test failed: ${result?.error || 'unknown error'}.`);
      }
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const liveProofConnection = async (connection: ToolConnection | null = selectedConnection) => {
    if (!connection) {
      setNotice('Save or select a connection first.');
      return;
    }
    setBusy(true);
    try {
      const result = await proveToolConnectionPath(connection.id, testMessage, {
        approved: true,
        requestedBy: 'jose'
      });
      if (result?.ok) {
        setNotice(`Live webhook proof sent to ${connection.label} (${result.webhookHost || hostFromUrl(connection.webhookUrl)}).`);
      } else if (result?.blocked) {
        setNotice(`Live webhook proof blocked: ${result?.error || 'approval required or connection disabled'}.`);
      } else {
        setNotice(`Live webhook proof failed: ${result?.error || 'unknown error'}.`);
      }
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const removeConnection = (connection: ToolConnection) => {
    const result = removeToolConnection(connection.id);
    if (result?.ok) {
      setNotice(result.removed ? `Removed ${connection.label}.` : 'Connection was not found.');
      if (connectionId === connection.id) {
        setConnectionId('');
      }
      refresh();
    }
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-950/72 p-4">
      <div className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
        <Plug className="h-4 w-4 text-sky-300" />
        Tool Connections: Slack, Discord, Custom Webhooks
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.2fr_1fr]">
        <div className="rounded-xl border border-white/10 bg-zinc-900/55 p-3">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <select
              value={connectionType}
              onChange={(event) => {
                const nextType = event.target.value;
                const type = types.find((row) => row.id === nextType) || types[0];
                setConnectionType(nextType);
                if (type) {
                  setConnectionLabel(type.label);
                }
              }}
              className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            >
              {types.map((type) => (
                <option key={type.id} value={type.id}>{type.label}</option>
              ))}
            </select>
            <input
              value={connectionLabel}
              onChange={(event) => setConnectionLabel(event.target.value)}
              className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              placeholder="Connection label"
            />
            <input
              value={webhookUrl}
              onChange={(event) => setWebhookUrl(event.target.value)}
              className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 lg:col-span-2"
              placeholder="Webhook URL"
            />
            <input
              value={messagePrefix}
              onChange={(event) => setMessagePrefix(event.target.value)}
              className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              placeholder="Message prefix"
            />
            <input
              value={connectionNote}
              onChange={(event) => setConnectionNote(event.target.value)}
              className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              placeholder="Operator note"
            />
          </div>

          {connectionType === 'custom_webhook' && (
            <textarea
              value={payloadTemplate}
              onChange={(event) => setPayloadTemplate(event.target.value)}
              rows={5}
              className="mt-3 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 font-mono text-[11px] text-zinc-100"
              placeholder="Custom JSON payload template"
            />
          )}

          <input
            value={notifyOn}
            onChange={(event) => setNotifyOn(event.target.value)}
            className="mt-3 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            placeholder="Notify on categories: approval, blocked, executed, failed, policy, connector, dead_letter"
          />

          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-300/15 bg-amber-500/10 p-3 text-[11px] text-amber-100/85">
            <input
              id="tool-connection-approval"
              type="checkbox"
              checked={explicitApproval}
              onChange={(event) => setExplicitApproval(event.target.checked)}
              className="h-3.5 w-3.5 accent-amber-300"
            />
            <label htmlFor="tool-connection-approval" className="cursor-pointer">
              I explicitly approve this external webhook send or test.
            </label>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto_auto]">
            <input
              value={testMessage}
              onChange={(event) => setTestMessage(event.target.value)}
              className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              placeholder="Test message"
            />
            <button
              onClick={saveConnection}
              className="rounded-xl bg-sky-400/20 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-sky-100 hover:bg-sky-400/30"
            >
              Save Connection
            </button>
            <button
              onClick={() => testConnection(selectedConnection)}
              disabled={busy}
              className="rounded-xl bg-emerald-400/20 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-100 hover:bg-emerald-400/30 disabled:opacity-50"
            >
              Send Test
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-zinc-900/55 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
              Saved Connections
            </div>
            <button
              onClick={refresh}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-200 hover:bg-zinc-700"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>
          <div className="mt-3 space-y-2 max-h-[22rem] overflow-y-auto pr-1">
            {connections.length === 0 && (
              <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-3 text-sm text-zinc-500">
                No tool connections saved yet.
              </div>
            )}
            {connections.map((connection) => (
              <div
                key={connection.id}
                className={`rounded-xl border p-3 ${connection.id === connectionId ? 'border-sky-300/30 bg-sky-500/10' : 'border-white/10 bg-zinc-900/50'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                      <MessageSquare className="h-4 w-4 text-sky-300" />
                      {connection.label}
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-500">
                      {connection.platform} | {hostFromUrl(connection.webhookUrl)}
                    </div>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${connection.active ? 'border-emerald-300/20 bg-emerald-500/10 text-emerald-200' : 'border-zinc-300/20 bg-zinc-500/10 text-zinc-300'}`}>
                    {connection.active ? 'active' : 'disabled'}
                  </span>
                </div>
                <div className="mt-2 text-[11px] text-zinc-500">
                  Last test: {connection.lastTestAtMs ? new Date(connection.lastTestAtMs).toLocaleString() : 'never'}
                  {' '}| Status: {connection.lastTestStatus || 'unknown'}
                </div>
                {connection.note && <div className="mt-2 text-[11px] text-zinc-400">{connection.note}</div>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => loadConnection(connection)}
                    className="rounded bg-zinc-800 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-zinc-200 hover:bg-zinc-700"
                  >
                    Load
                  </button>
                  <button
                    onClick={() => testConnection(connection)}
                    disabled={busy}
                    className="rounded bg-emerald-500/20 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-50"
                  >
                    <Send className="mr-1 inline h-3.5 w-3.5" />
                    Test
                  </button>
                  <button
                    onClick={() => liveProofConnection(connection)}
                    disabled={busy}
                    className="rounded bg-indigo-500/20 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-indigo-200 hover:bg-indigo-500/30 disabled:opacity-50"
                  >
                    Live Proof
                  </button>
                  <button
                    onClick={() => toggleActive(connection)}
                    className="rounded bg-amber-500/15 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-100 hover:bg-amber-500/20"
                  >
                    {connection.active ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    onClick={() => removeConnection(connection)}
                    className="rounded bg-red-500/15 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-red-100 hover:bg-red-500/20"
                  >
                    <Trash2 className="mr-1 inline h-3.5 w-3.5" />
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {notice && (
        <div className="mt-3 rounded-xl border border-teal-300/15 bg-teal-500/10 p-3 text-[11px] text-teal-100/85">
          {notice}
        </div>
      )}

      <div className="mt-3 rounded-xl border border-white/10 bg-zinc-900/55 p-3 text-[11px] text-zinc-400">
        Saved webhook connections stay local to this workstation. The live send path goes through Tauri and requires explicit approval before external delivery.
      </div>

      <div className="mt-3 space-y-2 max-h-32 overflow-y-auto pr-1">
        {audit.length === 0 && (
          <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-3 text-sm text-zinc-500">
            No tool connection audit entries yet.
          </div>
        )}
        {audit.slice().reverse().slice(0, 6).map((entry) => (
          <div key={entry.id} className="rounded-xl border border-white/10 bg-zinc-900/55 p-3 text-[11px] text-zinc-400">
            {entry.action} | {new Date(entry.timestampMs).toLocaleString()}
          </div>
        ))}
      </div>
    </section>
  );
}
