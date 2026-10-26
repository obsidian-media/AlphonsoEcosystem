import { invoke } from '@tauri-apps/api/core';
import { getConnectorCredential, getConnectorCredentials } from './connectors/connectorAuth';
import { listApprovalQueue, approvePacket, rejectPacket, getPacketById } from './agentBusService';
import { collectJoseNotifications, getJoseTelegramSettings, sentKeys, markSent, seedSentLog, buttonToken, readButtonToken } from './jose/joseTelegram';
import { getJoseRequest, listJoseRequests, findRequestByPacket } from './jose/joseRequestStore';
import { agentName } from './jose/agentNames';
import { answerOrPlan, inboundReply } from './jose/joseInbound';
import { listAgentActivity } from './agentActivityService';
import { listMemoryItems } from './memoryService';
import { listJoseCommands } from './joseCommandRouterService';
import { getStorage, setStorage } from '../lib/appStorage';
import { listAgentProfiles } from '../agents/agentRegistry';
import { listVerdicts, verdictsText } from './nova/novaVerdicts';
import { listOrchestrationReceipts } from './orchestrationReceiptService';
import { getConfiguredOllamaEndpoint } from '../lib/ollama';

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
  return typeof window !== 'undefined' && window.__TAURI_INTERNALS__ !== undefined;
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

// The chat that first sends /start with no owner yet registered would
// otherwise become the permanent owner with full command authority over
// Jose — a race an attacker can win if they find the bot's (publicly
// discoverable) username before the real owner sends /start. Gate first-time
// registration on TELEGRAM_ALLOWED_CHAT_IDS, an allowlist credential field
// that already existed in ConnectorSetupPanel.tsx but was never read/enforced
// here. Requires the user to look up their own numeric chat ID (e.g. via
// @userinfobot) and set it in Settings before the first /start.
function getAllowedChatIds() {
  const raw = getConnectorCredential('telegram', 'TELEGRAM_ALLOWED_CHAT_IDS') || '';
  return raw.split(/[,\n]/).map((value) => value.trim()).filter(Boolean);
}

export function setNotificationsPaused(paused) {
  setStorage(NOTIFICATIONS_PAUSED_KEY, paused);
}

async function telegramInvoke(command, payload) {
  try {
    return await invoke(command, payload);
  } catch (error) {
    console.error(`[telegram] invoke("${command}") failed:`, error);
    return null;
  }
}

async function sendTelegramMessageInternal({ token, chatId, text, buttons }) {
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

  for (const [index, chunk] of chunks.entries()) {
    await telegramInvoke('connector_send_telegram', {
      token,
      chatId,
      text: chunk,
      // Buttons go on the first part (phase 5).
      ...(buttons && index === 0 ? { buttons } : {})
    });
  }

  return { ok: true };
}

async function pollTelegramUpdates(token) {
  if (!token) return { ok: false, messages: [] };

  const result = await telegramInvoke('connector_poll_telegram', {
    token,
    limit: 10
  });

  if (!result) return { ok: false, messages: [] };
  if (!result.ok) {
    console.error('[telegram] poll failed:', result.error);
  }
  return result;
}

function formatShortId(fullId) {
  return fullId ? String(fullId).slice(-8) : '';
}

function formatCommandList() {
  return `👋 Alphonso companion active.

🤖 Core:
/ask <text> — send a command to Jose
/status — system + Ollama status
/report — full summary: status + queue + activity
/ping — check Alphonso is alive

📥 Approvals:
/queue — pending approvals
/approve <id> — approve a packet
/reject <id> — reject a packet

🔍 Research & Memory:
/research <topic> — live web research via Hector
/memory [query] — search or list recent memories
/nova — Nova's last verdicts

📡 Agents & Security:
/agents — show all 9 agent statuses
/activity — recent agent activity (last 8)
/scan — run Sentinel security scan
/receipts — last 5 completed task receipts

📂 Files & Workspace:
/files — list workspace files
/read <filename> — read a workspace file

⚙️ Settings:
/stop — pause push notifications
/resume — resume push notifications
/resetowner — re-register this chat
/help — show this list`;
}

export async function handleStatusCommand(token, chatId) {
  let ollamaOnline = false;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(`${getConfiguredOllamaEndpoint()}/api/tags`, {
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

  // A step of a saved Jose request: approving carries the request on (phase 5).
  if (findRequestByPacket(packetId)) {
    const { executeApprovedPackets } = await import('./joseExecutionEngineService');
    executeApprovedPackets([packetId]).catch(() => { /* the request shows what happened */ });
    return sendTelegramMessageInternal({ token, chatId, text: '✅ Approved. Jose carries on.' });
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

  // A step of a saved Jose request: rejecting cancels the request (phase 5).
  const request = findRequestByPacket(packetId);
  const stepId = getPacketById(packetId)?.payload?.assignment?.stepId;
  if (request && stepId) {
    const { rejectRequestStep } = await import('./joseExecutionEngineService');
    const result = rejectRequestStep(request.id, stepId);
    return sendTelegramMessageInternal({ token, chatId, text: result.ok ? '🚫 Rejected. The request was cancelled.' : result.summary });
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

export async function handleHelpCommand(token, chatId) {
  return sendTelegramMessageInternal({ token, chatId, text: formatCommandList() });
}

export async function handlePingCommand(token, chatId) {
  const now = new Date().toLocaleTimeString();
  return sendTelegramMessageInternal({ token, chatId, text: `🏓 Pong! Alphonso is alive. ${now}` });
}

export async function handleAgentsCommand(token, chatId) {
  const profiles = listAgentProfiles();
  const activity = listAgentActivity();
  const activeIds = new Set(
    activity.filter(a => (Date.now() - a.ts) < 5 * 60 * 1000).map(a => a.agentId || a.agent)
  );

  const lines = profiles.map(p => {
    const active = activeIds.has(p.id) || activeIds.has(p.name?.toLowerCase());
    const icon = active ? '🟢' : '⚪';
    return `${icon} ${p.name || p.id} — ${p.role || 'agent'}`;
  });

  return sendTelegramMessageInternal({ token, chatId, text: `🤖 Agent Roster (9)\n\n${lines.join('\n')}` });
}

export async function handleNovaCommand(token, chatId) {
  // Nova's last verdicts (agent phase 2): what each was about and what to do first.
  return sendTelegramMessageInternal({ token, chatId, text: `📊 Nova's last verdicts

${verdictsText(listVerdicts(5))}` });
}

export async function handleScanCommand(token, chatId) {
  // Agent phase 4: /scan asks Sentinel for one real review of the last week, as a request on
  // the board, and says how it ended. It used to scan an empty string and always say ✅.
  try {
    const { recentActivityText } = await import('./sentinelSecurityService');
    const { text, items } = recentActivityText(7);
    if (!items) {
      return sendTelegramMessageInternal({ token, chatId, text: '🔍 Nothing for Sentinel to review: no agent activity in the last 7 days.' });
    }
    await sendTelegramMessageInternal({ token, chatId, text: "🔍 Sentinel is reviewing the last 7 days. I'll tell you when he's done." });
    const { askSentinelWeekReview } = await import('./sentinel/sentinelWeekly');
    // Not awaited, so other commands keep being answered while he works.
    void askSentinelWeekReview(text, { source: 'telegram' })
      .then((result) => sendTelegramMessageInternal({ token, chatId, text: `🛡️ ${result.summary}` }))
      .catch(() => sendTelegramMessageInternal({ token, chatId, text: "⚠️ Sentinel's review didn't finish. See the board." }));
    return undefined;
  } catch {
    return sendTelegramMessageInternal({ token, chatId, text: '⚠️ Scan failed. Ensure Alphonso is running.' });
  }
}

export async function handleReportCommand(token, chatId) {
  let ollamaOnline = false;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(`${getConfiguredOllamaEndpoint()}/api/tags`, {
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

  const statusSection = `Local AI: ${ollamaOnline ? 'Online' : 'Offline'}
Pending approvals: ${pendingApprovals}
Recent activity: ${recentActivity} events in last hour
Jose commands today: ${todayCommands}`;

  let queueSection;
  if (approvalQueue.length === 0) {
    queueSection = 'No pending approvals.';
  } else {
    const lines = approvalQueue.slice(0, 3).map(p => {
      const shortId = formatShortId(p.id);
      const title = p.title || 'Untitled';
      const risk = p.riskLevel || 'unknown';
      return `[${shortId}] ${title} | Risk: ${risk}`;
    });
    queueSection = lines.join('\n');
    if (approvalQueue.length > 3) {
      queueSection += `\n…and ${approvalQueue.length - 3} more. /queue for full list.`;
    }
  }

  const recentEntries = activity.slice(-5).reverse();
  let activitySection;
  if (recentEntries.length === 0) {
    activitySection = 'No recent activity.';
  } else {
    activitySection = recentEntries.map(a => {
      const agent = a.agent || 'unknown';
      const action = a.action || 'unknown';
      const detail = a.detail ? ` — ${a.detail}` : '';
      return `[${agent}] ${action}${detail}`;
    }).join('\n');
  }

  const reportText = `📊 Alphonso Report

${statusSection}

📥 Queue:
${queueSection}

📡 Activity:
${activitySection}`;

  return sendTelegramMessageInternal({ token, chatId, text: reportText.slice(0, 3800) });
}

export async function handleFilesCommand(token, chatId) {
  if (!isTauriAvailable()) {
    return sendTelegramMessageInternal({
      token,
      chatId,
      text: 'Workspace files only available on desktop.'
    });
  }

  const entries = await telegramInvoke('list_workspace_directory', { path: '', maxDepth: 1 });

  if (!entries || !Array.isArray(entries) || entries.length === 0) {
    return sendTelegramMessageInternal({
      token,
      chatId,
      text: '📂 No workspace files found.'
    });
  }

  const lines = entries.slice(0, 15).map(entry => {
    if (entry.isDir) {
      return `📁 ${entry.path}/`;
    }
    const kb = entry.sizeBytes != null ? Math.round(entry.sizeBytes / 1024) : 0;
    return `📄 ${entry.path} (${kb} KB)`;
  });

  const filesText = `📂 Workspace Files (${Math.min(entries.length, 15)} of ${entries.length})

${lines.join('\n')}`;

  return sendTelegramMessageInternal({ token, chatId, text: filesText });
}

/**
 * A message for Jose (phase 6a): he answers it, or plans and runs it in the
 * background. Jose's own Telegram messages then tell you when a plan or a
 * step waits for you and how it ended.
 */
async function sendToJose(token, chatId, text) {
  try {
    const result = await answerOrPlan(text, { source: 'telegram', background: true });
    await sendTelegramMessageInternal({ token, chatId, text: inboundReply(result, 'telegram') });
    if (result.kind === 'started') {
      result.done.catch((error) => sendTelegramMessageInternal({ token, chatId, text: `Jose couldn't finish that: ${error?.message || error}` }));
    }
  } catch (error) {
    await sendTelegramMessageInternal({ token, chatId, text: `Jose couldn't take that: ${error?.message || error}` });
  }
}

async function handleResearchCommand(token, chatId, query) {
  if (!query) {
    return sendTelegramMessageInternal({ token, chatId, text: 'Usage: /research <topic>' });
  }
  // Asked by name, so Jose plans it (phase 6a).
  return sendToJose(token, chatId, `Ask Jose: research ${query}`);
}

async function handleMemorySearchCommand(token, chatId, query) {
  const items = listMemoryItems();
  const filtered = query
    ? items.filter(m => {
        const haystack = `${m.title || ''} ${m.content || ''} ${m.category || ''}`.toLowerCase();
        return query.toLowerCase().split(' ').every(word => haystack.includes(word));
      }).slice(-8)
    : items.slice(-8);

  if (filtered.length === 0) {
    return sendTelegramMessageInternal({ token, chatId, text: query ? `🧠 No memories matching "${query}".` : '🧠 No memory items yet.' });
  }

  const lines = filtered.reverse().map(m => {
    const title = m.title || 'Untitled';
    const cat = m.category || m.namespace || 'general';
    const ago = m.timestampMs ? Math.round((Date.now() - m.timestampMs) / 60000) + 'm ago' : '';
    return `• ${title} [${cat}]${ago ? ' — ' + ago : ''}`;
  });

  return sendTelegramMessageInternal({
    token, chatId,
    text: `🧠 Memory${query ? ` — "${query}"` : ' (recent)'}\n\n${lines.join('\n')}`
  });
}

async function handleReceiptsCommand(token, chatId) {
  try {
    const receipts = listOrchestrationReceipts({}).slice(-5).reverse();
    if (receipts.length === 0) {
      return sendTelegramMessageInternal({ token, chatId, text: '📋 No completed receipts yet.' });
    }
    const lines = receipts.map(r => {
      const agent = r.agentId || 'unknown';
      const status = r.status === 'success' ? '✅' : '❌';
      const label = r.label || r.taskId?.slice(-8) || '';
      const ms = r.durationMs ? `${Math.round(r.durationMs / 1000)}s` : '';
      return `${status} [${agent}] ${label}${ms ? ' — ' + ms : ''}`;
    });
    return sendTelegramMessageInternal({ token, chatId, text: `📋 Last ${receipts.length} receipts\n\n${lines.join('\n')}` });
  } catch {
    return sendTelegramMessageInternal({ token, chatId, text: '⚠️ Could not load receipts.' });
  }
}

async function handleBoardroomCommand(token, chatId, topic) {
  // Phase 6a: Jose plans the discussion and runs it; his Telegram messages
  // say when it waits for you and how it ended. (This used to create packets
  // that nothing ran, and said the agents were deliberating.)
  return sendToJose(token, chatId, `Ask Jose: hold a Boardroom discussion on ${topic} and report the conclusion.`);
}

async function handleReadFileCommand(token, chatId, filename) {
  if (!filename) {
    return sendTelegramMessageInternal({ token, chatId, text: 'Usage: /read <filename>' });
  }
  if (!isTauriAvailable()) {
    return sendTelegramMessageInternal({ token, chatId, text: 'File reading only available on desktop.' });
  }
  try {
    const content = await telegramInvoke('read_workspace_file', { path: filename });
    if (!content) return sendTelegramMessageInternal({ token, chatId, text: `📄 File not found: ${filename}` });
    const preview = String(content).slice(0, 3000);
    return sendTelegramMessageInternal({ token, chatId, text: `📄 ${filename}\n\n${preview}${content.length > 3000 ? '\n\n…(truncated)' : ''}` });
  } catch (e) {
    return sendTelegramMessageInternal({ token, chatId, text: `❌ Could not read file: ${e.message}` });
  }
}

/**
 * A Jose button pressed on Telegram (phase 5). Only the paired chat may press;
 * the work is claimed at once (so a second press finds it taken) and runs on,
 * and the returned text answers the press.
 */
/**
 * Sends a file from the output folder to the paired chat (phase 4b: a Higgsfield result);
 * one over Telegram's 50 MB limit is named by its folder instead. Returns 'file', 'folder' or 'none'.
 */
export async function sendTelegramFileOrFolder({ root, relativePath, caption }) {
  const token = getConnectorCredential('telegram', 'TELEGRAM_BOT_TOKEN');
  const chatId = getOwnerChatId();
  if (!token || !chatId) return 'none';
  const sent = await telegramInvoke('connector_send_telegram_file', { token, chatId: String(chatId), workspaceRoot: root, relativePath, caption });
  if (sent?.ok) return 'file';
  if (sent?.tooLarge) {
    const { outputPath } = await import('./contentFactory/contentProjectFiles');
    const folder = outputPath(root, relativePath.split('/').slice(0, -1).join('/'));
    await sendTelegramMessageInternal({ token, chatId: String(chatId), text: `${caption} It's too large for Telegram; it's saved in ${folder}.` });
    return 'folder';
  }
  return 'none';
}

export async function handleJoseButton(token, update) {
  const ownerChatId = getOwnerChatId();
  if (!ownerChatId || String(update?.chatId || '') !== String(ownerChatId)) return 'Unauthorized.';
  // The content factory's buttons (phase 4a): lessons to keep or drop, ideas to start or dismiss.
  if (String(update?.callbackData || '').startsWith('c:')) {
    const content = await import('./contentFactory/contentTelegram');
    return content.handleContentButton(update.callbackData);
  }
  const button = readButtonToken(update?.callbackData);
  if (!button) return 'That button has expired.';
  const request = getJoseRequest(button.requestId);
  if (!request) return 'That button has expired.';
  const engine = await import('./joseExecutionEngineService');
  const quietly = (promise) => { Promise.resolve(promise).catch(() => { /* the request shows what happened */ }); };
  if (button.action === 'approve' || button.action === 'reject') {
    const step = request.steps.find((s) => s.stepId === button.stepId);
    if (request.status !== 'waiting_approval' || step?.status !== 'waiting_approval') return 'Already done.';
    if (button.action === 'reject') {
      const result = engine.rejectRequestStep(request.id, button.stepId);
      return result.ok ? 'Rejected. The request was cancelled.' : result.summary;
    }
    quietly(engine.approveRequestStep(request.id, button.stepId));
    return `Approved. ${agentName(step.agent)} carries on.`;
  }
  if (button.action === 'run' || button.action === 'cancel') {
    if (request.status !== 'waiting_plan_approval') return 'Already done.';
    const plans = await import('./jose/submitToJose');
    if (button.action === 'cancel') {
      plans.cancelPlan(request.id);
      return 'Cancelled.';
    }
    quietly(plans.runApprovedPlan(request.id));
    return 'Running the plan.';
  }
  if (button.action === 'carry_on') {
    if (request.status !== 'interrupted' && request.status !== 'waiting_setup') return 'Already done.';
    quietly(engine.carryOnRequest(request.id));
    return 'Carrying on.';
  }
  return 'That button has expired.';
}

export async function processInboundCommands(token, updates) {
  if (!updates || !updates.ok) return;

  const messages = Array.isArray(updates.messages) ? updates.messages : [];
  
  for (const update of messages) {
    const chatId = String(update?.chatId || '');
    const text = (update?.text || '').trim();
    const updateId = update?.updateId;

    if (updateId && (!lastUpdateId || updateId > lastUpdateId)) {
      lastUpdateId = updateId;
    }

    // A button press (phase 5): answer it, whatever chat it came from.
    if (update?.callbackId) {
      let answer = 'Something went wrong.';
      try { answer = await handleJoseButton(token, update); } catch { /* answered below */ }
      await telegramInvoke('connector_answer_telegram_callback', { token, callbackId: update.callbackId, text: answer });
      continue;
    }

    const ownerChatId = getOwnerChatId();

    if (!ownerChatId) {
      const allowedChatIds = getAllowedChatIds();
      if (allowedChatIds.length === 0) {
        await sendTelegramMessageInternal({
          token,
          chatId,
          text: 'Pairing blocked: set TELEGRAM_ALLOWED_CHAT_IDS (your Telegram chat ID) in Alphonso Settings → Connectors → Telegram before sending /start.'
        });
        continue;
      }
      if (!allowedChatIds.includes(chatId)) {
        await sendTelegramMessageInternal({
          token,
          chatId,
          text: 'Unauthorized. This chat is not in the configured Telegram allowlist.'
        });
        continue;
      }
      if (text === '/start') {
        setOwnerChatId(chatId);
        await sendTelegramMessageInternal({
          token,
          chatId,
          text: formatCommandList()
        });
        continue;
      }
      await sendTelegramMessageInternal({
        token,
        chatId,
        text: 'Send /start to register this chat as the Alphonso owner.'
      });
      continue;
    }

    if (chatId !== ownerChatId) {
      await sendTelegramMessageInternal({
        token,
        chatId,
        text: 'Unauthorized.'
      });
      continue;
    }

    if (!text) continue;

    if (text.startsWith('/')) {
      const [cmd, ...args] = text.slice(1).split(/\s+/);
      const argument = args.join(' ');

      if (cmd === 'start') {
        await sendTelegramMessageInternal({
          token,
          chatId,
          text: 'Owner already registered. Send /resetowner to change ownership.'
        });
        continue;
      }

      if (cmd === 'resetowner') {
        if (chatId === ownerChatId) {
          setOwnerChatId(chatId);
          await sendTelegramMessageInternal({
            token,
            chatId,
            text: '✅ This chat is now the Alphonso companion owner.'
          });
          continue;
        }
        await sendTelegramMessageInternal({
          token,
          chatId,
          text: 'Unauthorized.'
        });
        continue;
      }

      if (cmd === 'status') {
        await handleStatusCommand(token, chatId);
        continue;
      }

      if (cmd === 'queue') {
        await handleQueueCommand(token, chatId);
        continue;
      }

      if (cmd === 'approve' && argument) {
        await handleApproveCommand(token, chatId, argument);
        continue;
      }

      if (cmd === 'reject' && argument) {
        await handleRejectCommand(token, chatId, argument);
        continue;
      }

      if (cmd === 'activity') {
        await handleActivityCommand(token, chatId);
        continue;
      }

      // Bare "/memory" lists recent items; "/memory <query>" searches —
      // these used to be two separate branches with the same "memory" cmd
      // check, so the search variant (defined later in the file) was dead
      // code that could never run.
      if (cmd === 'memory') {
        if (argument) {
          await handleMemorySearchCommand(token, chatId, argument);
        } else {
          await handleMemoryCommand(token, chatId);
        }
        continue;
      }

      if (cmd === 'help') {
        await handleHelpCommand(token, chatId);
        continue;
      }

      if (cmd === 'ping') {
        await handlePingCommand(token, chatId);
        continue;
      }

      if (cmd === 'agents') {
        await handleAgentsCommand(token, chatId);
        continue;
      }

      if (cmd === 'nova') {
        await handleNovaCommand(token, chatId);
        continue;
      }

      if (cmd === 'scan') {
        await handleScanCommand(token, chatId);
        continue;
      }

      if (cmd === 'report') {
        await handleReportCommand(token, chatId);
        continue;
      }

      if (cmd === 'files') {
        await handleFilesCommand(token, chatId);
        continue;
      }

      if (cmd === 'research') {
        await handleResearchCommand(token, chatId, argument);
        continue;
      }

      if (cmd === 'receipts') {
        await handleReceiptsCommand(token, chatId);
        continue;
      }

      if (cmd === 'read') {
        await handleReadFileCommand(token, chatId, argument);
        continue;
      }

      if (cmd === 'stop') {
        setNotificationsPaused(true);
        await sendTelegramMessageInternal({
          token,
          chatId,
          text: '🔇 Push notifications paused. Commands still work. /resume to re-enable.'
        });
        continue;
      }

      if (cmd === 'resume') {
        setNotificationsPaused(false);
        await sendTelegramMessageInternal({
          token,
          chatId,
          text: '🔔 Push notifications resumed.'
        });
        continue;
      }

      if (cmd === 'boardroom' && argument) {
        await handleBoardroomCommand(token, chatId, argument);
        continue;
      }

      if (cmd === 'ask' && argument) {
        await sendToJose(token, chatId, argument);
        continue;
      }
    } else {
      await sendToJose(token, chatId, text);
      continue;
    }
  }
}

export async function runPushWatcher(token) {
  if (!token || isNotificationsPaused()) return;

  const ownerChatId = getOwnerChatId();
  if (!ownerChatId) return;

  const commands = listJoseCommands();
  // A command that belongs to a Jose request gets Jose's own Done/Failed line (phase 5).
  const requestCommandIds = new Set(listJoseRequests().map((request) => request.commandId).filter(Boolean));
  
  for (const command of commands) {
    if (command.status === 'reported_to_user' && !pushedCommandIds.has(command.id) && !requestCommandIds.has(command.id)) {
      pushedCommandIds.add(command.id);
      
      const input = command.commandText || '';
      const summary = command.joseConfirmation || command.userReport?.summary || '';
      const assignmentsCompleted = command.userReport?.reportCount || 0;

      const text = `✅ Jose completed a task

Command: ${input.slice(0, 80)}${input.length > 80 ? '...' : ''}
Result: ${String(summary).slice(0, 800)}${summary.length > 800 ? '...' : ''}
Assignments: ${assignmentsCompleted} completed`;

      await sendTelegramMessageInternal({ token, chatId: ownerChatId, text });
    }
  }

  // Jose's requests (phase 5): waiting steps and plans with buttons, results,
  // reviews that ask you, and requests cut off when the app closed.
  const requests = listJoseRequests();
  seedSentLog(requests);
  for (const notification of collectJoseNotifications(requests, sentKeys(), getJoseTelegramSettings())) {
    const buttons = notification.buttons?.map((row) => row.map((button) => ({ text: button.text, data: buttonToken(button) })));
    await sendTelegramMessageInternal({ token, chatId: ownerChatId, text: notification.text, ...(buttons ? { buttons } : {}) });
    markSent(notification.key);
  }

  // The content factory (phase 4a): the day's 7-day summary and new ideas, each sent once.
  try {
    const content = await import('./contentFactory/contentTelegram');
    for (const notification of content.collectContentNotifications(Date.now(), sentKeys(), content.getContentTelegramSettings())) {
      const buttons = notification.buttons?.map((row) => row.map((button) => ({ text: button.text, data: content.contentButtonToken(button) })));
      await sendTelegramMessageInternal({ token, chatId: ownerChatId, text: notification.text, ...(buttons ? { buttons } : {}) });
      markSent(notification.key);
    }
  } catch { /* the next pass tries again */ }

  const queue = listApprovalQueue();
  for (const packet of queue) {
    // A request's step is sent above, with buttons.
    if (findRequestByPacket(packet.id)) continue;
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

  // The older "agent actions" summaries: off unless switched on in Settings (owner, 2026-10-23).
  const activity = listAgentActivity();
  if (!getJoseTelegramSettings().activitySummaries) {
    lastActivityPushCount = activity.length;
  } else if (activity.length >= 3 + lastActivityPushCount) {
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