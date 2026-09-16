import { listAgentPackets, getPacketById, approvePacket, rejectPacket, type AgentPacket } from './agentBusService';
import { createCall, pollCallUntilTerminal, isCalleConfigured, type CalleCallTask } from './connectors/calleConnector';
import { getConnectorCredential } from './connectors/connectorAuth.js';
import { durableGet, durableSet } from '../lib/durableStore';

const SETTINGS_KEY = 'alphonso_escalation_call_settings_v1';
const RECORDS_KEY = 'alphonso_escalation_call_records_v1';

export interface EscalationSettings {
  enabled: boolean;
  phoneNumber: string;
  thresholdMinutes: number;
}

export type EscalationDecision = 'approve' | 'reject' | 'unclear';

export interface EscalationCallRecord {
  packetId: string;
  callId: string | null;
  status: 'placing' | 'in_progress' | 'resolved' | 'failed';
  decision: EscalationDecision | null;
  note: string | null;
  createdAtMs: number;
  resolvedAtMs: number | null;
}

const DEFAULT_SETTINGS: EscalationSettings = {
  enabled: false,
  phoneNumber: '',
  thresholdMinutes: 15
};

function readSettings(): EscalationSettings {
  try {
    const raw = durableGet(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed ? { ...DEFAULT_SETTINGS, ...parsed } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(settings: EscalationSettings): void {
  durableSet(SETTINGS_KEY, JSON.stringify(settings));
}

export function getEscalationSettings(): EscalationSettings {
  return readSettings();
}

export function saveEscalationSettings(settings: Partial<EscalationSettings>): EscalationSettings {
  const next = { ...readSettings(), ...settings };
  writeSettings(next);
  return next;
}

function readRecords(): EscalationCallRecord[] {
  try {
    const raw = durableGet(RECORDS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRecords(records: EscalationCallRecord[]): void {
  durableSet(RECORDS_KEY, JSON.stringify(records.slice(-200)));
}

export function listEscalationCallRecords(): EscalationCallRecord[] {
  return readRecords().slice().reverse();
}

function upsertRecord(record: EscalationCallRecord): void {
  const rows = readRecords();
  const idx = rows.findIndex((row) => row.packetId === record.packetId);
  if (idx >= 0) rows[idx] = record;
  else rows.push(record);
  writeRecords(rows);
}

// A packet only ever gets ONE escalation call, ever -- checked against the
// full record history (not just "still pending"), so a packet that got
// approved/rejected by phone and then somehow re-entered pending_approval
// (e.g. a retry) doesn't ring the phone again without a fresh look at why.
function hasBeenEscalated(packetId: string): boolean {
  return readRecords().some((row) => row.packetId === packetId);
}

// The escalation feature is opt-in at the *settings* level (enabling it +
// providing a phone number is the standing consent), not per-call -- there
// is no live human available to click "Approve" on placing THIS call, since
// the entire point of escalating is that normal channels went unanswered.
// This mirrors the existing pattern elsewhere in the app where an
// auto-started background action (Telegram/WhatsApp companion polling) is
// gated on explicit credential/config presence rather than a live approval
// click. `createCall`'s own policy gate still applies underneath this --
// Zero-Cost Mode, missing credentials, etc. all still block correctly.
async function placeEscalationCall(packet: AgentPacket, settings: EscalationSettings): Promise<void> {
  const apiKey = getConnectorCredential('calle', 'CALLE_API_KEY');
  if (!apiKey) return;

  const record: EscalationCallRecord = {
    packetId: packet.id,
    callId: null,
    status: 'placing',
    decision: null,
    note: null,
    createdAtMs: Date.now(),
    resolvedAtMs: null
  };
  upsertRecord(record);

  const detail = packet.commandPreview ? ` Details: ${packet.commandPreview}` : '';
  const task =
    `Call the number provided and speak to whoever answers. Explain: "This is Alphonso calling about ` +
    `a decision that has been waiting for approval and hasn't been answered through the app or ` +
    `messaging channels." Read them this pending decision: "${packet.title}".${detail} ` +
    `Then ask clearly: "Do you approve or reject this?" Wait for a clear verbal answer. ` +
    `If the answer is unclear, ask them to say the word approve or reject explicitly. ` +
    `Recipient phone number: ${settings.phoneNumber}.`;

  const resultSchema = {
    type: 'object',
    properties: {
      decision: { type: 'string', enum: ['approve', 'reject', 'unclear'] },
      note: { type: 'string' }
    },
    required: ['decision']
  };

  let call: CalleCallTask;
  try {
    call = await createCall(
      apiKey,
      { task, resultSchema, metadata: { packetId: packet.id, source: 'escalation' } },
      `escalation-${packet.id}`,
      { approved: true }
    );
  } catch (err) {
    upsertRecord({ ...record, status: 'failed', note: String((err as Error)?.message || err) });
    return;
  }

  upsertRecord({ ...record, callId: call.id, status: 'in_progress' });

  try {
    const finalCall = await pollCallUntilTerminal(apiKey, call.id, { timeoutMs: 10 * 60 * 1000 });
    const decisionRaw = String((finalCall.structuredResult as { decision?: string } | null)?.decision || 'unclear');
    const decision: EscalationDecision = decisionRaw === 'approve' || decisionRaw === 'reject' ? decisionRaw : 'unclear';
    const note = String((finalCall.structuredResult as { note?: string } | null)?.note || finalCall.summary || '');

    upsertRecord({
      packetId: packet.id,
      callId: call.id,
      status: 'resolved',
      decision,
      note,
      createdAtMs: record.createdAtMs,
      resolvedAtMs: Date.now()
    });

    // Only act on a call that actually reached the person and got a clear
    // answer -- "unclear" (voicemail, garbled answer, refusal to answer the
    // question) deliberately leaves the packet alone rather than guessing.
    const fresh = getPacketById(packet.id);
    if (fresh && fresh.status === 'pending_approval') {
      if (decision === 'approve') approvePacket(packet.id, 'escalation-call');
      else if (decision === 'reject') rejectPacket(packet.id, `escalation-call: ${note || 'declined by phone'}`);
    }
  } catch (err) {
    upsertRecord({
      packetId: packet.id,
      callId: call.id,
      status: 'failed',
      decision: null,
      note: String((err as Error)?.message || err),
      createdAtMs: record.createdAtMs,
      resolvedAtMs: null
    });
  }
}

function findEscalationCandidates(thresholdMinutes: number): AgentPacket[] {
  const cutoffMs = Date.now() - thresholdMinutes * 60 * 1000;
  return listAgentPackets().filter(
    (packet) => packet.status === 'pending_approval' && packet.createdAtMs <= cutoffMs && !hasBeenEscalated(packet.id)
  );
}

export async function runEscalationCheck(): Promise<void> {
  const settings = readSettings();
  if (!settings.enabled || !settings.phoneNumber.trim() || !isCalleConfigured()) return;

  const candidates = findEscalationCandidates(settings.thresholdMinutes);
  for (const packet of candidates) {
    // Sequential, not Promise.all -- these are real phone calls; no reason
    // to ring multiple numbers (or hit CALL-E's rate limits) concurrently
    // for a feature that should be rare by design.
    await placeEscalationCall(packet, settings);
  }
}

export function startEscalationPolling(intervalMs = 5 * 60 * 1000): () => void {
  const id = setInterval(() => {
    runEscalationCheck().catch(() => {});
  }, intervalMs);
  return () => clearInterval(id);
}
