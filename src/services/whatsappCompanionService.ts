import { getConnectorCredential } from './connectors/connectorAuth';
import { browserSendWhatsApp, browserPollWhatsAppGateway } from './whatsappBrowserConnector';
import { listApprovalQueue, approvePacket, rejectPacket } from './agentBusService';
import { listAgentActivity } from './agentActivityService';
import { listJoseCommands, createJoseCommandRoute } from './joseCommandRouterService';
import { listAgentProfiles } from '../agents/agentRegistry';
import { getStorage, setStorage } from '../lib/appStorage';

const POLL_MS = 15000;
const OWNER_NUMBER_KEY = 'alphonso_whatsapp_owner_number';

let pollIntervalId: ReturnType<typeof setInterval> | null = null;
const processedMessageIds = new Set<string>();

function normalizeNumber(raw: string): string {
  return String(raw || '').replace(/\D/g, '');
}

function getOwnerNumber(): string | null {
  return getStorage(OWNER_NUMBER_KEY, null);
}

function setOwnerNumber(number: string): void {
  setStorage(OWNER_NUMBER_KEY, normalizeNumber(number));
}

// Mirrors the Telegram companion's owner-pairing fix: first-come-first-served
// /start registration would let anyone who has your WhatsApp Business number
// message first and become the permanent owner. Gate registration on
// WHATSAPP_ALLOWED_NUMBERS, a credential field the user sets in Settings.
function getAllowedNumbers(): string[] {
  const raw = getConnectorCredential('whatsapp', 'WHATSAPP_ALLOWED_NUMBERS') || '';
  return raw.split(/[,\n]/).map((value) => normalizeNumber(value)).filter(Boolean);
}

function formatShortId(fullId: string): string {
  return fullId ? String(fullId).slice(-8) : '';
}

async function reply(to: string, text: string): Promise<void> {
  try {
    await browserSendWhatsApp({ to, text });
  } catch (error) {
    console.error('[whatsapp] send failed:', error);
  }
}

function formatCommandList(): string {
  return `👋 Alphonso WhatsApp companion active.

/status — system + Ollama status
/queue — pending approvals
/approve <id> — approve a packet
/reject <id> — reject a packet
/agents — agent roster with activity indicators
/report — full summary: status + queue + activity
/ping — check Alphonso is alive
/stop — pause push notifications (not yet wired for WhatsApp push)
/resume — resume push notifications
/resetowner — re-register this number as owner
/help — show this list

Anything else is routed to Jose as a command.`;
}

async function checkOllamaOnline(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const response = await fetch('http://localhost:11434/api/tags', { signal: controller.signal });
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

async function handleStatusCommand(to: string): Promise<void> {
  const ollamaOnline = await checkOllamaOnline();
  const approvalQueue = listApprovalQueue();
  const activity = listAgentActivity();
  const recentActivity = activity.filter((a: any) => (Date.now() - a.ts) < 60 * 60 * 1000).length;
  const commands = listJoseCommands();
  const todayCommands = (commands as any[]).filter((c) => (Date.now() - c.createdAtMs) < 24 * 60 * 60 * 1000).length;

  await reply(to, `🤖 Alphonso Status

Local AI: ${ollamaOnline ? 'Online' : 'Offline'}
Pending approvals: ${approvalQueue.length}
Recent activity: ${recentActivity} events in last hour
Jose commands today: ${todayCommands}`);
}

async function handleQueueCommand(to: string): Promise<void> {
  const queue = listApprovalQueue() as any[];
  if (queue.length === 0) {
    await reply(to, '✅ No pending approvals.');
    return;
  }
  const lines = queue.slice(0, 8).map((p) => {
    const shortId = formatShortId(p.id);
    return `[${shortId}] ${p.title || 'Untitled'}\nFrom: ${p.fromAgent || 'unknown'} | Risk: ${p.riskLevel || 'unknown'}\n/approve ${shortId} | /reject ${shortId}`;
  });
  await reply(to, `📥 Approval Queue (${queue.length} pending)\n\n${lines.join('\n\n')}`);
}

async function handleApproveCommand(to: string, id: string): Promise<void> {
  const queue = listApprovalQueue() as any[];
  const match = queue.find((p) => p.id === id || formatShortId(p.id) === id);
  const packetId = match ? match.id : id;
  if (!packetId) {
    await reply(to, '❌ Packet not found.');
    return;
  }
  approvePacket(packetId, 'whatsapp_operator');
  await reply(to, '✅ Approved. Jose will proceed.');
}

async function handleRejectCommand(to: string, id: string): Promise<void> {
  const queue = listApprovalQueue() as any[];
  const match = queue.find((p) => p.id === id || formatShortId(p.id) === id);
  const packetId = match ? match.id : id;
  if (!packetId) {
    await reply(to, '❌ Packet not found.');
    return;
  }
  rejectPacket(packetId, 'Rejected via WhatsApp companion');
  await reply(to, '🚫 Rejected.');
}

async function handleAgentsCommand(to: string): Promise<void> {
  const profiles = listAgentProfiles() as any[];
  const activity = listAgentActivity() as any[];
  const activeIds = new Set(
    activity.filter((a) => (Date.now() - a.ts) < 5 * 60 * 1000).map((a) => a.agentId || a.agent)
  );
  const lines = profiles.map((p) => {
    const active = activeIds.has(p.id) || activeIds.has(p.name?.toLowerCase());
    return `${active ? '🟢' : '⚪'} ${p.name || p.id} — ${p.role || 'agent'}`;
  });
  await reply(to, `🤖 Agent Roster (${profiles.length})\n\n${lines.join('\n')}`);
}

async function handleReportCommand(to: string): Promise<void> {
  const ollamaOnline = await checkOllamaOnline();
  const approvalQueue = listApprovalQueue() as any[];
  const activity = listAgentActivity() as any[];
  const recentActivity = activity.filter((a) => (Date.now() - a.ts) < 60 * 60 * 1000).length;
  const commands = listJoseCommands() as any[];
  const todayCommands = commands.filter((c) => (Date.now() - c.createdAtMs) < 24 * 60 * 60 * 1000).length;

  const statusSection = `Local AI: ${ollamaOnline ? 'Online' : 'Offline'}
Pending approvals: ${approvalQueue.length}
Recent activity: ${recentActivity} events in last hour
Jose commands today: ${todayCommands}`;

  let queueSection: string;
  if (approvalQueue.length === 0) {
    queueSection = 'No pending approvals.';
  } else {
    const lines = approvalQueue.slice(0, 3).map((p) => `[${formatShortId(p.id)}] ${p.title || 'Untitled'} | Risk: ${p.riskLevel || 'unknown'}`);
    queueSection = lines.join('\n');
    if (approvalQueue.length > 3) queueSection += `\n…and ${approvalQueue.length - 3} more. /queue for full list.`;
  }

  const recentEntries = activity.slice(-5).reverse();
  const activitySection = recentEntries.length === 0
    ? 'No recent activity.'
    : recentEntries.map((a) => `[${a.agent || 'unknown'}] ${a.action || 'unknown'}${a.detail ? ` — ${a.detail}` : ''}`).join('\n');

  await reply(to, `📊 Alphonso Report\n\n${statusSection}\n\n📥 Queue:\n${queueSection}\n\n📡 Activity:\n${activitySection}`.slice(0, 3800));
}

async function handlePingCommand(to: string): Promise<void> {
  await reply(to, `🏓 Pong! Alphonso is alive. ${new Date().toLocaleTimeString()}`);
}

async function handleHelpCommand(to: string): Promise<void> {
  await reply(to, formatCommandList());
}

export async function processInboundWhatsAppMessages(messages: Array<{ chatId?: string; fromId?: string; text?: string; messageId?: string }>): Promise<void> {
  for (const msg of messages) {
    const from = normalizeNumber(msg.fromId || msg.chatId || '');
    const text = (msg.text || '').trim();
    if (!from) continue;

    if (msg.messageId) {
      if (processedMessageIds.has(msg.messageId)) continue;
      processedMessageIds.add(msg.messageId);
      // Bound the set so a long-running session doesn't leak memory.
      if (processedMessageIds.size > 500) {
        const excess = processedMessageIds.size - 500;
        const it = processedMessageIds.values();
        for (let i = 0; i < excess; i++) processedMessageIds.delete(it.next().value as string);
      }
    }

    const ownerNumber = getOwnerNumber();

    if (!ownerNumber) {
      const allowed = getAllowedNumbers();
      if (allowed.length === 0) {
        await reply(from, 'Pairing blocked: set WHATSAPP_ALLOWED_NUMBERS (your WhatsApp number, digits only) in Alphonso Settings → Connectors → WhatsApp before sending /start.');
        continue;
      }
      if (!allowed.includes(from)) {
        await reply(from, 'Unauthorized. This number is not in the configured WhatsApp allowlist.');
        continue;
      }
      if (text === '/start') {
        setOwnerNumber(from);
        await reply(from, formatCommandList());
        continue;
      }
      await reply(from, 'Send /start to register this number as the Alphonso owner.');
      continue;
    }

    if (from !== ownerNumber) {
      await reply(from, 'Unauthorized.');
      continue;
    }

    if (!text) continue;

    if (text.startsWith('/')) {
      const [cmd, ...args] = text.slice(1).split(/\s+/);
      const argument = args.join(' ');

      if (cmd === 'start') {
        await reply(from, 'Owner already registered. Send /resetowner to change ownership.');
        continue;
      }
      if (cmd === 'resetowner') {
        setOwnerNumber(from);
        await reply(from, '✅ This number is now the Alphonso companion owner.');
        continue;
      }
      if (cmd === 'status') { await handleStatusCommand(from); continue; }
      if (cmd === 'queue') { await handleQueueCommand(from); continue; }
      if (cmd === 'approve' && argument) { await handleApproveCommand(from, argument); continue; }
      if (cmd === 'reject' && argument) { await handleRejectCommand(from, argument); continue; }
      if (cmd === 'agents') { await handleAgentsCommand(from); continue; }
      if (cmd === 'report') { await handleReportCommand(from); continue; }
      if (cmd === 'ping') { await handlePingCommand(from); continue; }
      if (cmd === 'help') { await handleHelpCommand(from); continue; }
      if (cmd === 'ask' && argument) {
        await createJoseCommandRoute({ commandText: argument, source: 'whatsapp' });
        await reply(from, "📋 Sent to Jose. I'll message you when it's done.");
        continue;
      }
      await reply(from, `Unknown command "/${cmd}". Send /help for the list.`);
      continue;
    }

    await createJoseCommandRoute({ commandText: text, source: 'whatsapp' });
    await reply(from, "📋 Sent to Jose. I'll message you when it's done.");
  }
}

export function isWhatsAppCompanionRunning(): boolean {
  return pollIntervalId !== null;
}

export function startWhatsAppCompanion(): ReturnType<typeof setInterval> | null {
  const accessToken = getConnectorCredential('whatsapp', 'WHATSAPP_ACCESS_TOKEN');
  const drainUrl = getConnectorCredential('whatsapp', 'WHATSAPP_CLOUD_GATEWAY_DRAIN_URL');
  if (!accessToken || !drainUrl) return null;
  if (pollIntervalId !== null) return pollIntervalId;

  pollIntervalId = setInterval(async () => {
    try {
      const result = await browserPollWhatsAppGateway({ limit: 12 });
      if (result?.ok && result.messages?.length) {
        await processInboundWhatsAppMessages(result.messages);
      }
    } catch (error) {
      console.error('[whatsapp] poll failed:', error);
    }
  }, POLL_MS);

  return pollIntervalId;
}

export function stopWhatsAppCompanion(): void {
  if (pollIntervalId !== null) {
    clearInterval(pollIntervalId);
    pollIntervalId = null;
  }
  processedMessageIds.clear();
}
