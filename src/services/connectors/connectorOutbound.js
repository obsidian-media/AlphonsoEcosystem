import { invoke } from '@tauri-apps/api/core';
import { AGENTS } from '../agentBusService';
import { TRUST_STATES, timestampMs } from '../trustModel';
import { sendChatGPTMessage } from '../chatgptService';
import { sendClaudeMessage } from '../claudeService';
import { appendConnectorAuditEntry } from '../connectorAuditLogService';
import { browserSendTelegram } from '../telegramBrowserConnector';
import {
  gateConnectorAction,
  requireConnectorReady,
  requireConnectorApproval,
  verifyConnectorEnvironment,
  appendConnectorAudit
} from './connectorRegistry.js';
import {
  isConnectorAuthenticated,
  logUnauthenticatedConnectorRequest
} from './connectorAuth.js';

function getConnectorEnvironment() {
  try {
    const raw = localStorage.getItem('alphonso_connector_registry_v2');
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed?.envPresence && typeof parsed.envPresence === 'object') return parsed.envPresence;
    const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];
    const telegram = rows.find((row) => row?.id === 'telegram');
    const presence = telegram?.envPresence || {};
    return presence;
  } catch {
    return {};
  }
}

export async function sendTelegramConnectorMessage(chatId, text, options = {}) {
  const auth = isConnectorAuthenticated('telegram');
  if (!auth.ok) {
    return logUnauthenticatedConnectorRequest('telegram', 'external_send', text, {
      ...options,
      target: chatId
    });
  }
  const approval = await requireConnectorApproval('telegram', 'external_send', text, {
    ...options,
    target: chatId
  });
  if (!approval.ok) return approval;
  const readiness = await requireConnectorReady('telegram', 'external_send', text, options);
  if (!readiness.ok) return readiness;
  const gate = gateConnectorAction('telegram', 'external_send', text, options);
  if (!gate.ok) {
    return {
      ok: false,
      connectorId: 'telegram',
      blocked: true,
      trust: gate.verificationState || TRUST_STATES.PENDING,
      error: gate.reason || 'Telegram policy gate blocked the action.'
    };
  }

  const env = getConnectorEnvironment();
  const token = (env?.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) {
    return {
      ok: false,
      connectorId: 'telegram',
      blocked: true,
      trust: TRUST_STATES.UNVERIFIED,
      error: 'Telegram bot token is not configured.'
    };
  }

  const target = String(chatId || '').trim();
  const body = String(text || '').trim();
  if (!target) {
    return {
      ok: false,
      connectorId: 'telegram',
      blocked: true,
      error: 'Telegram chat id is required.'
    };
  }
  if (!body) {
    return {
      ok: false,
      connectorId: 'telegram',
      blocked: true,
      error: 'Message text is required.'
    };
  }

  let result;
  try {
    result = await browserSendTelegram({ botToken: token, chatId: target, text: body });
  } catch (error) {
    appendConnectorAudit('telegram', 'send_failed', {
      target,
      error: String(error)
    });
    return {
      ok: false,
      connectorId: 'telegram',
      error: String(error)
    };
  }

  appendConnectorAudit('telegram', result?.ok ? 'send_success' : 'send_failed', {
    target,
    externalId: result?.externalId || null,
    error: result?.error || null
  });
  return result;
}

export async function proveTelegramConnectorPath(chatId, text, options = {}) {
  const proofText = String(text || '').trim() || 'Alphonso Telegram live proof.';
  const proofTarget = String(chatId || '').trim();
  if (!proofTarget) {
    return {
      ok: false,
      connectorId: 'telegram',
      blocked: true,
      setupRequired: true,
      trust: TRUST_STATES.UNVERIFIED,
      error: 'Telegram chat id is required for live proof.'
    };
  }

  const envProof = await verifyConnectorEnvironment('telegram');
  if (!envProof?.ok) {
    return {
      ok: false,
      connectorId: 'telegram',
      blocked: true,
      setupRequired: true,
      envProof,
      trust: envProof?.trust || TRUST_STATES.UNVERIFIED,
      error: envProof?.error || 'Telegram environment is not configured.'
    };
  }

  const result = await sendTelegramConnectorMessage(proofTarget, proofText, {
    ...options,
    approved: options.approved ?? true,
    requestedBy: options.requestedBy || 'jose',
    reason: options.reason || 'Telegram live connector proof path'
  });

  appendConnectorAudit('telegram', result?.ok ? 'live_proof_success' : 'live_proof_failed', {
    target: proofTarget,
    externalId: result?.externalId || null,
    error: result?.error || null
  });

  return {
    ...result,
    connectorId: 'telegram',
    proofType: 'telegram_live_send',
    proofMode: 'live_connector_proof',
    proofTarget,
    proofText,
    setupRequired: false,
    verifiedAtMs: timestampMs()
  };
}

export async function sendWhatsAppConnectorMessage(to, text, options = {}) {
  const auth = isConnectorAuthenticated('whatsapp');
  if (!auth.ok) {
    return logUnauthenticatedConnectorRequest('whatsapp', 'external_send', text, {
      ...options,
      target: to
    });
  }
  const approval = await requireConnectorApproval('whatsapp', 'external_send', text, {
    ...options,
    target: to
  });
  if (!approval.ok) return approval;
  const readiness = await requireConnectorReady('whatsapp', 'external_send', text, options);
  if (!readiness.ok) return readiness;
  const gate = gateConnectorAction('whatsapp', 'external_send', text, options);
  if (!gate.ok) {
    return {
      ok: false,
      connectorId: 'whatsapp',
      blocked: true,
      trust: gate.verificationState || TRUST_STATES.PENDING,
      error: gate.reason || 'WhatsApp policy gate blocked the action.'
    };
  }
  const result = await invoke('connector_send_whatsapp', { to, text });
  appendConnectorAudit('whatsapp', result?.ok ? 'send_success' : 'send_failed', {
    target: to,
    externalId: result?.externalId || null,
    error: result?.error || null
  });
  return result;
}

export async function sendChatGptConnectorMessage(text, options = {}) {
  const auth = isConnectorAuthenticated('chatgpt');
  if (!auth.ok) {
    return logUnauthenticatedConnectorRequest('chatgpt', 'paid_connector_send', text, options);
  }

  let envCheck = null;
  try {
    envCheck = await invoke('check_env_vars_presence', { names: ['OPENAI_API_KEY'] });
  } catch {
    envCheck = null;
  }
  if (envCheck && !envCheck['OPENAI_API_KEY']) {
    appendConnectorAudit('chatgpt', 'send_blocked_missing_key', { text: String(text || '').slice(0, 80) });
    return {
      success: false, ok: false, connectorId: 'chatgpt', blocked: true,
      error: 'API key missing — configure OPENAI_API_KEY in settings',
      code: 'MISSING_KEY', trust: TRUST_STATES.FAILED
    };
  }

  const approval = await requireConnectorApproval('chatgpt', 'paid_connector_send', text, options);
  if (!approval.ok) return approval;
  const readiness = await requireConnectorReady('chatgpt', 'paid_connector_send', text, options);
  if (!readiness.ok) return readiness;
  const gate = gateConnectorAction('chatgpt', 'paid_connector_send', text, options);
  if (!gate.ok) {
    return {
      ok: false, connectorId: 'chatgpt', blocked: true,
      trust: gate.verificationState || TRUST_STATES.PENDING,
      error: gate.reason || 'ChatGPT connector policy gate blocked the action.'
    };
  }

  return sendChatGPTMessage(text, options);
}

export async function sendClaudeConnectorMessage(text, options = {}) {
  const auth = isConnectorAuthenticated('claude');
  if (!auth.ok) {
    return logUnauthenticatedConnectorRequest('claude', 'paid_connector_send', text, options);
  }

  let envCheck = null;
  try {
    envCheck = await invoke('check_env_vars_presence', { names: ['ANTHROPIC_API_KEY'] });
  } catch {
    envCheck = null;
  }
  if (envCheck && !envCheck['ANTHROPIC_API_KEY']) {
    appendConnectorAudit('claude', 'send_blocked_missing_key', { text: String(text || '').slice(0, 80) });
    return {
      success: false, ok: false, connectorId: 'claude', blocked: true,
      error: 'API key missing — configure ANTHROPIC_API_KEY in settings',
      code: 'MISSING_KEY', trust: TRUST_STATES.FAILED
    };
  }

  const approval = await requireConnectorApproval('claude', 'paid_connector_send', text, options);
  if (!approval.ok) return approval;
  const readiness = await requireConnectorReady('claude', 'paid_connector_send', text, options);
  if (!readiness.ok) return readiness;
  const gate = gateConnectorAction('claude', 'paid_connector_send', text, options);
  if (!gate.ok) {
    return {
      ok: false, connectorId: 'claude', blocked: true,
      trust: gate.verificationState || TRUST_STATES.PENDING,
      error: gate.reason || 'Claude connector policy gate blocked the action.'
    };
  }

  return sendClaudeMessage(text, options);
}

export async function sendQwenConnectorMessage(text, options = {}) {
  const auth = isConnectorAuthenticated('qwen');
  if (!auth.ok) {
    return logUnauthenticatedConnectorRequest('qwen', 'paid_connector_send', text, options);
  }

  let envCheck = null;
  try {
    envCheck = await invoke('check_env_vars_presence', { names: ['DASHSCOPE_API_KEY'] });
  } catch {
    envCheck = null;
  }
  if (envCheck && !envCheck.DASHSCOPE_API_KEY) {
    appendConnectorAudit('qwen', 'send_blocked_missing_key', { text: String(text || '').slice(0, 80) });
    return {
      success: false,
      ok: false,
      connectorId: 'qwen',
      blocked: true,
      error: 'API key missing — configure DASHSCOPE_API_KEY in the backend environment',
      code: 'MISSING_KEY',
      trust: TRUST_STATES.FAILED
    };
  }

  const approval = await requireConnectorApproval('qwen', 'paid_connector_send', text, options);
  if (!approval.ok) return approval;
  const readiness = await requireConnectorReady('qwen', 'paid_connector_send', text, options);
  if (!readiness.ok) return readiness;
  const gate = gateConnectorAction('qwen', 'paid_connector_send', text, options);
  if (!gate.ok) {
    return {
      ok: false,
      connectorId: 'qwen',
      blocked: true,
      trust: gate.verificationState || TRUST_STATES.PENDING,
      error: gate.reason || 'Qwen connector policy gate blocked the action.'
    };
  }

  let result;
  try {
    const timeoutMs = options.timeoutMs || 30000;
    const invokePromise = invoke('connector_send_qwen', { text });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('CONNECTOR_TIMEOUT')), timeoutMs)
    );
    result = await Promise.race([invokePromise, timeoutPromise]);
  } catch (error) {
    const errMsg = String(error || '');
    const lower = errMsg.toLowerCase();
    const isTimeout = errMsg === 'CONNECTOR_TIMEOUT' || lower.includes('timeout');
    const isRateLimit = errMsg.includes('429') || lower.includes('rate limit') || lower.includes('rate_limit');
    const isMissingKey = lower.includes('api key') || lower.includes('unauthorized') || errMsg.includes('401');
    const code = isTimeout ? 'TIMEOUT' : isRateLimit ? 'RATE_LIMITED' : isMissingKey ? 'MISSING_KEY' : 'INVOKE_ERROR';
    const userError = isTimeout
      ? 'Request timed out after 30s'
      : isRateLimit
        ? 'Rate limited — wait 60s and retry'
        : isMissingKey
          ? 'API key missing — configure DASHSCOPE_API_KEY in the backend environment'
          : `Qwen connector error: ${errMsg}`;
    appendConnectorAudit('qwen', 'send_failed', { error: errMsg, code });
    return { success: false, ok: false, connectorId: 'qwen', blocked: false, error: userError, code, trust: TRUST_STATES.FAILED };
  }

  if (result && !result.ok) {
    const httpStatus = result.httpStatus || result.status || null;
    const lower = String(result.error || '').toLowerCase();
    const code = httpStatus === 429 || lower.includes('rate limit') ? 'RATE_LIMITED' : httpStatus === 401 || httpStatus === 403 ? 'MISSING_KEY' : 'SEND_FAILED';
    const userError = code === 'RATE_LIMITED'
      ? 'Rate limited — wait 60s and retry'
      : code === 'MISSING_KEY'
        ? 'API key missing — configure DASHSCOPE_API_KEY in the backend environment'
        : result.error || 'Qwen connector returned an error.';
    appendConnectorAudit('qwen', 'send_failed', { error: userError, code, httpStatus });
    return { success: false, ok: false, connectorId: 'qwen', error: userError, code, httpStatus, trust: TRUST_STATES.FAILED };
  }

  appendConnectorAudit('qwen', 'send_success', {
    target: result?.target || 'qwen',
    externalId: result?.externalId || null,
    error: result?.error || null
  });
  appendConnectorAuditEntry({ connectorId: 'qwen', ok: Boolean(result?.ok), latencyMs: null, errorCode: null });
  return result;
}

export async function sendNotionConnectorEntry({ title, content = '', parentPageId = '' }, options = {}) {
  const auth = isConnectorAuthenticated('notion');
  if (!auth.ok) {
    return logUnauthenticatedConnectorRequest('notion', 'external_write', title, {
      ...options,
      target: parentPageId || 'env:NOTION_PARENT_PAGE_ID'
    });
  }
  const approval = await requireConnectorApproval('notion', 'external_write', title, {
    ...options,
    target: parentPageId || 'env:NOTION_PARENT_PAGE_ID'
  });
  if (!approval.ok) return approval;
  const readiness = await requireConnectorReady('notion', 'external_write', title, options);
  if (!readiness.ok) return readiness;
  const gate = gateConnectorAction('notion', 'external_write', title, options);
  if (!gate.ok) {
    return {
      ok: false,
      connectorId: 'notion',
      blocked: true,
      trust: gate.verificationState || TRUST_STATES.PENDING,
      error: gate.reason || 'Notion connector policy gate blocked the action.'
    };
  }
  const result = await invoke('connector_send_notion', {
    title,
    content,
    parentPageId: parentPageId || null
  });
  appendConnectorAudit('notion', result?.ok ? 'send_success' : 'send_failed', {
    target: parentPageId || 'env:NOTION_PARENT_PAGE_ID',
    externalId: result?.externalId || null,
    error: result?.error || null
  });
  return result;
}

export async function sendClickUpConnectorTask({ title, content = '', listId = '' }, options = {}) {
  const auth = isConnectorAuthenticated('clickup');
  if (!auth.ok) {
    return logUnauthenticatedConnectorRequest('clickup', 'external_write', title, {
      ...options,
      target: listId || 'env:CLICKUP_LIST_ID'
    });
  }
  const approval = await requireConnectorApproval('clickup', 'external_write', title, {
    ...options,
    target: listId || 'env:CLICKUP_LIST_ID'
  });
  if (!approval.ok) return approval;
  const readiness = await requireConnectorReady('clickup', 'external_write', title, options);
  if (!readiness.ok) return readiness;
  const gate = gateConnectorAction('clickup', 'external_write', title, options);
  if (!gate.ok) {
    return {
      ok: false,
      connectorId: 'clickup',
      blocked: true,
      trust: gate.verificationState || TRUST_STATES.PENDING,
      error: gate.reason || 'ClickUp connector policy gate blocked the action.'
    };
  }
  const result = await invoke('connector_send_clickup', {
    title,
    content,
    listId: listId || null
  });
  appendConnectorAudit('clickup', result?.ok ? 'send_success' : 'send_failed', {
    target: listId || 'env:CLICKUP_LIST_ID',
    externalId: result?.externalId || null,
    error: result?.error || null
  });
  return result;
}

export async function uploadYouTubeConnectorVideo({
  filePath,
  title,
  description = '',
  tags = [],
  privacyStatus = 'private'
}, options = {}) {
  const auth = isConnectorAuthenticated('youtube');
  if (!auth.ok) {
    return logUnauthenticatedConnectorRequest('youtube', 'external_publish', title, {
      ...options,
      target: filePath
    });
  }
  const approval = await requireConnectorApproval('youtube', 'external_publish', title, {
    ...options,
    target: filePath
  });
  if (!approval.ok) return approval;
  const readiness = await requireConnectorReady('youtube', 'external_publish', title, options);
  if (!readiness.ok) return readiness;
  const gate = gateConnectorAction('youtube', 'external_publish', title, options);
  if (!gate.ok) {
    return {
      ok: false,
      connectorId: 'youtube',
      blocked: true,
      trust: gate.verificationState || TRUST_STATES.PENDING,
      error: gate.reason || 'YouTube connector policy gate blocked the action.'
    };
  }
  const result = await invoke('connector_upload_youtube', {
    filePath,
    title,
    description,
    tags,
    privacyStatus
  });
  appendConnectorAudit('youtube', result?.ok ? 'upload_success' : 'upload_failed', {
    filePath,
    title,
    videoId: result?.videoId || null,
    url: result?.url || null,
    error: result?.error || null
  });
  return result;
}
