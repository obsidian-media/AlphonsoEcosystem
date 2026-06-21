import { invoke } from '@tauri-apps/api/core';
import { getConnectorCredential, getConnectorCredentials } from './connectors/connectorAuth';
import { listApprovalQueue, approvePacket, rejectPacket } from './agentBusService';
import { listAgentActivity } from './agentActivityService';
import { listMemoryItems } from './memoryService';
import { createJoseCommandRoute, listJoseCommands } from './joseCommandRouterService';
import { getStorage, setStorage } from '../lib/appStorage';

const INBOUND_POLL_MS = 4000;
const PUSH_WATCHER_MS = 6000;
const MESSAGE_RATE_LIMIT_MS = 2100;
const MAX_MESSAGE_LENGTH = 4000;

let inboundIntervalId = null;
let watcherIntervalId = null;
let lastUpdateId = null;
let pushedCommandIds = new Set();
let pushedApprovalIds = new Set();
let lastActivityPushCount = 0;
let lastMessageSentAt = 0;

const OWNER_CHAT_KEY = 'alphonso_telegram_owner_chat_id';
const NOTIFICATIONS_PAUSED_KEY = 'alphonso_telegram_notifications_paused';

function isTauriAvailable() {
  return typeof window !== 'undefined' && window.__TAURI__ !== undefined;
}

function getOwnerChatId() {
  return getStorage(OWNER_CHAT_KEY, null);
}

function setOwnerChatId(chatId) {
  setStorage(OWNER_CHAT_KEY, chatId);
}

function isNotificationsPaused() {
  return getStorage(NOTIFICATIONS_PAUSED_KEY, false);
}

export function setNotificationsPaused(paused) {
  setStorage(NOTIFICATIONS_PAUSED_KEY, paused);
}

async function telegramInvoke(command, payload) {
  if (!isTauriAvailable()) return null;
  try {
    return await invoke(command, payload);
  } catch {
    return null;
  }
}

async function sendTelegramMessageInternal({ token, chatId, text }) {
  if (!token || !chatId) return { ok: false, error: 'missing_token_or_chatid' };
  
  const now = Date.now();
  const timeSinceLast = now - lastMessageSentAt;
  if (timeSinceLast < MESSAGE_RATE_LIMIT_MS) {
    await new Promise(resolve => setTimeout(resolve, MESSAGE_RATE_LIMIT_MS - timeSinceLast));
  }
  lastMessageSentAt = Date.now();

  const chunks = text.length > MAX_MESSAGE_LENGTH
    ? [text.slice(0, MAX_MESSAGE_LENGTH), text.slice(MAX_MESSAGE_LENGTH)]
    : [text];

  for (const chunk of chunks) {
    await telegramInvoke('telegram_send_message', {
      token,
      chatId,
      text: chunk
    });
  }

  return { ok: true };
}

async function pollTelegramUpdates(token) {
  if (!token) return { ok: false, messages: [] };
  
  const cursor = lastUpdateId;
  const result = await telegramInvoke('telegram_get_updates', {
    token,
    update_id: cursor,
    message: {}
  });

  return result || { ok: false, messages: [] };
}

function formatShortId(fullId) {
  return fullId ? String(fullId).slice(-8) : '';
}

function formatCommandList() {
  return `👋 Alphonso companion active.

Commands:
/ask <text> — send any command to Jose
/status — system status
/queue — pending approvals
/approve <id> — approve a packet
/reject <id> — reject a packet
/activity — recent agent activity
/memory — last 5 memory items
/stop — pause notifications
/resume — resume notifications
/resetowner — re-register this chat as owner`;
}

export async function handleStatusCommand(token, chatId) {
  let ollamaOnline = false;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const response = await fetch('http://localhost:11434/api/tags', {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    ollamaOnline = response.ok;
  } catch {
    ollamaOnline = false;
  }

  const approvalQueue = listApprovalQueue();
  const pendingApprovals = approvalQueue.length;
  
  const activity = listAgentActivity();
  const recentActivity = activity.filter(
    a => (Date.now() - a.ts) < 60 * 60 * 1000
  ).length;

  const commands = listJoseCommands();
  const todayCommands = commands.filter(
    c => (Date.now() - c.createdAtMs) < 24 * 60 * 60 * 1000
  ).length;

  const statusText = `🤖 Alphonso Status

Local AI: ${ollamaOnline ? 'Online' : 'Offline'}
Pending approvals: ${pendingApprovals}
Recent activity: ${recentActivity} events in last hour
Jose commands today: ${todayCommands}`;

  return sendTelegramMessageInternal({ token, chatId, text: statusText });
}

export async function handleQueueCommand(token, chatId) {
  const queue = listApprovalQueue();
  
  if (queue.length === 0) {
    return sendTelegramMessageInternal({ token, chatId, text: '✅ No pending approvals.' });
  }

  const lines = queue.slice(0, 8).map(p => {
    const shortId = formatShortId(p.id);
    const title = p.title || 'Untitled';
    const from = p.fromAgent || 'unknown';
    const risk = p.riskLevel || 'unknown';
    return `[${shortId}] ${title}\nFrom: ${from} → jose | Risk: ${risk}\n/approve ${shortId} | /reject ${shortId}`;
  });

  const queueText = `📥 Approval Queue (${queue.length} pending)

${lines.join('\n\n')}`;

  return sendTelegramMessageInternal({ token, chatId, text: queueText });
}

export async function handleApproveCommand(token, chatId, id) {
  const queue = listApprovalQueue();
  let packetId = id;
  
  const match = queue.find(p => p.id === id || formatShortId(p.id) === id);
  if (match) {
    packetId = match.id;
    pushedApprovalIds.delete(match.id);
  }

  if (!packetId) {
    return sendTelegramMessageInternal({ token, chatId, text: '❌ Packet not found.' });
  }

  approvePacket(packetId, 'telegram_operator');
  return sendTelegramMessageInternal({ token, chatId, text: '✅ Approved. Jose will proceed.' });
}

export async function handleRejectCommand(token, chatId, id) {
  const queue = listApprovalQueue();
  let packetId = id;
  
  const match = queue.find(p => p.id === id || formatShortId(p.id) === id);
  if (match) {
    packetId = match.id;
  }

  if (!packetId) {
    return sendTelegramMessageInternal({ token, chatId, text: '❌ Packet not found.' });
  }

  rejectPacket(packetId, 'Rejected via Telegram companion');
  return sendTelegramMessageInternal({ token, chatId, text: '🚫 Rejected.' });
}

async function handleActivityCommand(token, chatId) {
  const activity = listAgentActivity().slice(-8).reverse();
  
  const lines = activity.map(a => {
    const agent = a.agent || 'unknown';
    const action = a.action || 'unknown';
    const detail = a.detail || '';
    return `[${agent}] ${action}${detail ? ' — ' + detail : ''}`;
  });

  const activityText = `📡 Recent Activity

${lines.join('\n')}`;

  return sendTelegramMessageInternal({ token, chatId, text: activityText });
}

async function handleMemoryCommand(token, chatId) {
  const memory = listMemoryItems().slice(-5).reverse();
  
  const lines = memory.map(m => {
    const title = m.title || 'Untitled';
    const category = m.category || 'unknown';
    const ts = m.timestampMs ? new Date(m.timestampMs).toISOString() : '';
    return `${title} | ${category} | ${ts}`;
  });

  const memoryText = lines.length
    ? `🧠 Last 5 Memory Items

${lines.join('\n')}`
    : '🧠 No memory items found.';

  return sendTelegramMessageInternal({ token, chatId, text: memoryText });
}

export async function processInboundCommands(token, updates) {
  if (!updates || !updates.ok) return;

  const messages = Array.isArray(updates.messages) ? updates.messages : [];
  
  for (const update of messages) {
    const chatId = String(update?.chat?.id || update?.message?.chat?.id || '');
    const text = (update?.message?.text || update?.text || '').trim();
    const updateId = update?.update_id || update?.message?.update_id;

    if (updateId && (!lastUpdateId || updateId > lastUpdateId)) {
      lastUpdateId = updateId;
    }

    const ownerChatId = getOwnerChatId();

    if (!ownerChatId) {
      if (text === '/start') {
        setOwnerChatId(chatId);
        return sendTelegramMessageInternal({
          token,
          chatId,
          text: formatCommandList()
        });
      }
      return sendTelegramMessageInternal({
        token,
        chatId,
        text: 'Send /start to register this chat as the Alphonso owner.'
      });
    }

    if (chatId !== ownerChatId) {
      return sendTelegramMessageInternal({
        token,
        chatId,
        text: 'Unauthorized.'
      });
    }

    if (!text) continue;

    if (text.startsWith('/')) {
      const [cmd, ...args] = text.slice(1).split(/\s+/);
      const argument = args.join(' ');

      if (cmd === 'start') {
        return sendTelegramMessageInternal({
          token,
          chatId,
          text: 'Owner already registered. Send /resetowner to change ownership.'
        });
      }

      if (cmd === 'resetowner') {
        if (chatId === ownerChatId) {
          setOwnerChatId(chatId);
          return sendTelegramMessageInternal({
            token,
            chatId,
            text: '✅ This chat is now the Alphonso companion owner.'
          });
        }
        return sendTelegramMessageInternal({
          token,
          chatId,
          text: 'Unauthorized.'
        });
      }

      if (cmd === 'status') {
        return handleStatusCommand(token, chatId);
      }

      if (cmd === 'queue') {
        return handleQueueCommand(token, chatId);
      }

      if (cmd === 'approve' && argument) {
        return handleApproveCommand(token, chatId, argument);
      }

      if (cmd === 'reject' && argument) {
        return handleRejectCommand(token, chatId, argument);
      }

      if (cmd === 'activity') {
        return handleActivityCommand(token, chatId);
      }

      if (cmd === 'memory') {
        return handleMemoryCommand(token, chatId);
      }

      if (cmd === 'stop') {
        setNotificationsPaused(true);
        return sendTelegramMessageInternal({
          token,
          chatId,
          text: '🔇 Push notifications paused. Commands still work. /resume to re-enable.'
        });
      }

      if (cmd === 'resume') {
        setNotificationsPaused(false);
        return sendTelegramMessageInternal({
          token,
          chatId,
          text: '🔔 Push notifications resumed.'
        });
      }

      if (cmd === 'ask' && argument) {
        await createJoseCommandRoute({ commandText: argument, source: 'telegram' });
        return sendTelegramMessageInternal({
          token,
          chatId,
          text: "📋 Sent to Jose. I'll message you when it's done."
        });
      }
    } else {
      await createJoseCommandRoute({ commandText: text, source: 'telegram' });
      return sendTelegramMessageInternal({
        token,
        chatId,
        text: "📋 Sent to Jose. I'll message you when it's done."
      });
    }
  }
}

export async function runPushWatcher(token) {
  if (!token || isNotificationsPaused()) return;

  const ownerChatId = getOwnerChatId();
  if (!ownerChatId) return;

  const commands = listJoseCommands();
  
  for (const command of commands) {
    if (command.status === 'reported_to_shayan' && !pushedCommandIds.has(command.id)) {
      pushedCommandIds.add(command.id);
      
      const input = command.commandText || '';
      const summary = command.joseConfirmation || command.shayanReport?.summary || '';
      const assignmentsCompleted = command.shayanReport?.reportCount || 0;

      const text = `✅ Jose completed a task

Command: ${input.slice(0, 80)}${input.length > 80 ? '...' : ''}
Result: ${String(summary).slice(0, 800)}${summary.length > 800 ? '...' : ''}
Assignments: ${assignmentsCompleted} completed`;

      await sendTelegramMessageInternal({ token, chatId: ownerChatId, text });
    }
  }

  const queue = listApprovalQueue();
  for (const packet of queue) {
    if (!pushedApprovalIds.has(packet.id)) {
      pushedApprovalIds.add(packet.id);
      
      const shortId = formatShortId(packet.id);
      const text = `⚠️ Approval needed

[${shortId}] ${packet.title || 'Untitled'}
From: ${packet.fromAgent || 'unknown'} | Risk: ${packet.riskLevel || 'unknown'}

Reply /approve ${shortId} or /reject ${shortId}`;

      await sendTelegramMessageInternal({ token, chatId: ownerChatId, text });
    }
  }

  const activity = listAgentActivity();
  if (activity.length >= 3 + lastActivityPushCount) {
    const newEntries = activity.slice(-(activity.length - lastActivityPushCount)).slice(-3);
    const lines = newEntries.map(a => {
      const agent = a.agent || 'unknown';
      const action = a.action || 'unknown';
      return `${agent}: ${action}`;
    });

    const text = `📡 ${newEntries.length} agent actions since your last check

${lines.join('\n')}`;

    await sendTelegramMessageInternal({ token, chatId: ownerChatId, text });
    lastActivityPushCount = activity.length;
  }
}

export function isTelegramCompanionRunning() {
  return inboundIntervalId !== null || watcherIntervalId !== null;
}

export function startTelegramCompanion() {
  const token = getConnectorCredential('telegram', 'TELEGRAM_BOT_TOKEN');
  if (!token) return null;

  if (inboundIntervalId !== null) {
    return { inboundId: inboundIntervalId, watcherId: watcherIntervalId };
  }

  inboundIntervalId = setInterval(async () => {
    try {
      const updates = await pollTelegramUpdates(token);
      await processInboundCommands(token, updates);
    } catch {
      // Silent fail in web/test mode
    }
  }, INBOUND_POLL_MS);

  watcherIntervalId = setInterval(async () => {
    try {
      await runPushWatcher(token);
    } catch {
      // Silent fail in web/test mode
    }
  }, PUSH_WATCHER_MS);

  return { inboundId: inboundIntervalId, watcherId: watcherIntervalId };
}

export function stopTelegramCompanion() {
  if (inboundIntervalId !== null) {
    clearInterval(inboundIntervalId);
    inboundIntervalId = null;
  }
  if (watcherIntervalId !== null) {
    clearInterval(watcherIntervalId);
    watcherIntervalId = null;
  }
  pushedCommandIds.clear();
  pushedApprovalIds.clear();
  lastActivityPushCount = 0;
  lastUpdateId = null;
}

export async function sendTelegramMessage(text) {
  const token = getConnectorCredential('telegram', 'TELEGRAM_BOT_TOKEN');
  const ownerChatId = getOwnerChatId();
  if (!token || !ownerChatId) return { ok: false, error: 'not_configured' };
  
  return sendTelegramMessageInternal({ token, chatId: ownerChatId, text });
}