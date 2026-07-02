import { invoke } from '@tauri-apps/api/core';
import { AGENTS } from '../agentBusService';
import { TRUST_STATES, timestampMs } from '../trustModel';
import { sendChatGPTMessage } from '../chatgptService';
import { sendClaudeMessage } from '../claudeService';
import { appendConnectorAuditEntry } from '../connectorAuditLogService';
import { browserSendTelegram } from '../telegramBrowserConnector';
import { browserSendWhatsApp } from '../whatsappBrowserConnector';
import { getConnectorCredential } from './connectorAuth.js';
import {
  gateConnectorAction,
  requireConnectorReady,
  requireConnectorApproval,
  verifyConnectorEnvironment,
  appendConnectorAudit,
  getConnectorCircuitState,
  recordConnectorFailure,
  recordConnectorSuccess
} from './connectorRegistry.js';
import {
  isConnectorAuthenticated,
  logUnauthenticatedConnectorRequest
} from './connectorAuth.js';

const RATE_LIMIT_DEFAULTS = {
  telegram: { maxPerMinute: 30 },
  whatsapp: { maxPerMinute: 60 },
  youtube: { maxPerMinute: 10 },
  notion: { maxPerMinute: 30 },
  clickup: { maxPerMinute: 30 },
  sd_webui: { maxPerMinute: 60 },
  comfyui_video: { maxPerMinute: 30 },
  chatgpt: { maxPerMinute: 60 },
  claude: { maxPerMinute: 60 },
  qwen: { maxPerMinute: 30 },
  github: { maxPerMinute: 60 },
  slack: { maxPerMinute: 60 }
};

const rateLimitBuckets = {};

function getRateLimitBucket(connectorId) {
  if (!rateLimitBuckets[connectorId]) {
    rateLimitBuckets[connectorId] = [];
  }
  return rateLimitBuckets[connectorId];
}

function checkConnectorRateLimit(connectorId) {
  const config = RATE_LIMIT_DEFAULTS[connectorId];
  if (!config) return { ok: true };
  const bucket = getRateLimitBucket(connectorId);
  const now = Date.now();
  const windowMs = 60000;
  const cutoff = now - windowMs;
  const recent = bucket.filter((t) => t > cutoff);
  rateLimitBuckets[connectorId] = recent;
  if (recent.length >= config.maxPerMinute) {
    const oldest = recent[0] || now;
    const waitMs = oldest + windowMs - now;
    return { ok: false, waitMs: Math.max(waitMs, 100), remaining: config.maxPerMinute - recent.length };
  }
  return { ok: true, remaining: config.maxPerMinute - recent.length };
}

function trackConnectorSend(connectorId) {
  const bucket = getRateLimitBucket(connectorId);
  bucket.push(Date.now());
  rateLimitBuckets[connectorId] = bucket;
}

async function guardConnectorRateLimit(connectorId) {
  const check = checkConnectorRateLimit(connectorId);
  if (!check.ok) {
    appendConnectorAudit(connectorId, 'rate_limit_delayed', {
      waitMs: check.waitMs,
      remaining: check.remaining
    });
    await new Promise((resolve) => setTimeout(resolve, check.waitMs));
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
  const circuit = getConnectorCircuitState('telegram', 'external_send');
  if (!circuit.ok) {
    appendConnectorAudit('telegram', 'send_blocked_circuit_open', {
      failures: circuit.failures,
      remainingMs: circuit.remainingMs
    });
    return {
      ok: false, connectorId: 'telegram', blocked: true,
      error: `Circuit breaker open — ${Math.ceil(circuit.remainingMs / 1000)}s remaining`,
      trust: TRUST_STATES.FAILED
    };
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

  const token = getConnectorCredential('telegram', 'TELEGRAM_BOT_TOKEN').trim();
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

  await guardConnectorRateLimit('telegram');
  let result;
  try {
    result = await browserSendTelegram({ botToken: token, chatId: target, text: body });
  } catch (error) {
    const errMsg = String(error || '');
    recordConnectorFailure('telegram', 'external_send');
    appendConnectorAudit('telegram', 'send_failed', {
      target,
      error: errMsg
    });
    return {
      ok: false,
      connectorId: 'telegram',
      error: errMsg
    };
  }

  if (result?.ok) {
    recordConnectorSuccess('telegram', 'external_send');
    trackConnectorSend('telegram');
  } else {
    recordConnectorFailure('telegram', 'external_send');
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
  const circuit = getConnectorCircuitState('whatsapp', 'external_send');
  if (!circuit.ok) {
    appendConnectorAudit('whatsapp', 'send_blocked_circuit_open', {
      failures: circuit.failures,
      remainingMs: circuit.remainingMs
    });
    return {
      ok: false, connectorId: 'whatsapp', blocked: true,
      error: `Circuit breaker open — ${Math.ceil(circuit.remainingMs / 1000)}s remaining`,
      trust: TRUST_STATES.FAILED
    };
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
  // Check env vars in Rust process AND in the credential store.
  let envCheck = null;
  try {
    envCheck = await invoke('check_env_vars_presence', { names: ['WHATSAPP_ACCESS_TOKEN'] });
  } catch {
    envCheck = null;
  }
  const rustHasToken = Boolean(envCheck?.WHATSAPP_ACCESS_TOKEN);
  const browserToken = getConnectorCredential('whatsapp', 'WHATSAPP_ACCESS_TOKEN');
  if (!rustHasToken && !browserToken) {
    appendConnectorAudit('whatsapp', 'send_blocked_missing_key', { text: String(text || '').slice(0, 80) });
    return {
      ok: false, connectorId: 'whatsapp', blocked: true,
      error: 'WhatsApp access token missing — set WHATSAPP_ACCESS_TOKEN in connector credentials',
      code: 'MISSING_KEY', trust: TRUST_STATES.FAILED
    };
  }
  await guardConnectorRateLimit('whatsapp');
  let result;
  if (rustHasToken) {
    try {
      result = await invoke('connector_send_whatsapp', { to, text });
    } catch {
      result = null;
    }
  }
  // Fall back to browser send if Rust path unavailable or failed.
  if (!result?.ok && browserToken) {
    try {
      result = await browserSendWhatsApp({ to, text });
    } catch (browserError) {
      const errMsg = String(browserError || '');
      recordConnectorFailure('whatsapp', 'external_send');
      appendConnectorAudit('whatsapp', 'send_failed', { target: to, error: errMsg });
      return {
        ok: false, connectorId: 'whatsapp', blocked: false,
        error: `WhatsApp send error: ${errMsg}`, trust: TRUST_STATES.FAILED
      };
    }
  }
  recordConnectorSuccess('whatsapp', 'external_send');
  trackConnectorSend('whatsapp');
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

  const circuit = getConnectorCircuitState('chatgpt', 'paid_connector_send');
  if (!circuit.ok) {
    appendConnectorAudit('chatgpt', 'send_blocked_circuit_open', {
      failures: circuit.failures,
      remainingMs: circuit.remainingMs
    });
    return {
      ok: false, connectorId: 'chatgpt', blocked: true,
      error: `Circuit breaker open — ${Math.ceil(circuit.remainingMs / 1000)}s remaining`,
      trust: TRUST_STATES.FAILED
    };
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

  await guardConnectorRateLimit('chatgpt');
  try {
    const result = await sendChatGPTMessage(text, options);
    if (result?.ok) {
      recordConnectorSuccess('chatgpt', 'paid_connector_send');
      trackConnectorSend('chatgpt');
    } else {
      recordConnectorFailure('chatgpt', 'paid_connector_send');
    }
    return result;
  } catch (error) {
    const errMsg = String(error || '');
    recordConnectorFailure('chatgpt', 'paid_connector_send');
    appendConnectorAudit('chatgpt', 'send_failed', { error: errMsg });
    return {
      ok: false, connectorId: 'chatgpt', blocked: false,
      error: `ChatGPT connector error: ${errMsg}`, trust: TRUST_STATES.FAILED
    };
  }
}

export async function sendClaudeConnectorMessage(text, options = {}) {
  const auth = isConnectorAuthenticated('claude');
  if (!auth.ok) {
    return logUnauthenticatedConnectorRequest('claude', 'paid_connector_send', text, options);
  }

  const circuit = getConnectorCircuitState('claude', 'paid_connector_send');
  if (!circuit.ok) {
    appendConnectorAudit('claude', 'send_blocked_circuit_open', {
      failures: circuit.failures,
      remainingMs: circuit.remainingMs
    });
    return {
      ok: false, connectorId: 'claude', blocked: true,
      error: `Circuit breaker open — ${Math.ceil(circuit.remainingMs / 1000)}s remaining`,
      trust: TRUST_STATES.FAILED
    };
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

  await guardConnectorRateLimit('claude');
  try {
    const result = await sendClaudeMessage(text, options);
    if (result?.ok) {
      recordConnectorSuccess('claude', 'paid_connector_send');
      trackConnectorSend('claude');
    } else {
      recordConnectorFailure('claude', 'paid_connector_send');
    }
    return result;
  } catch (error) {
    const errMsg = String(error || '');
    recordConnectorFailure('claude', 'paid_connector_send');
    appendConnectorAudit('claude', 'send_failed', { error: errMsg });
    return {
      ok: false, connectorId: 'claude', blocked: false,
      error: `Claude connector error: ${errMsg}`, trust: TRUST_STATES.FAILED
    };
  }
}

export async function sendQwenConnectorMessage(text, options = {}) {
  const auth = isConnectorAuthenticated('qwen');
  if (!auth.ok) {
    return logUnauthenticatedConnectorRequest('qwen', 'paid_connector_send', text, options);
  }

  const circuit = getConnectorCircuitState('qwen', 'paid_connector_send');
  if (!circuit.ok) {
    appendConnectorAudit('qwen', 'send_blocked_circuit_open', {
      failures: circuit.failures,
      remainingMs: circuit.remainingMs
    });
    return {
      ok: false, connectorId: 'qwen', blocked: true,
      error: `Circuit breaker open — ${Math.ceil(circuit.remainingMs / 1000)}s remaining`,
      trust: TRUST_STATES.FAILED
    };
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

  await guardConnectorRateLimit('qwen');
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
    recordConnectorFailure('qwen', 'paid_connector_send');
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
    recordConnectorFailure('qwen', 'paid_connector_send');
    appendConnectorAudit('qwen', 'send_failed', { error: userError, code, httpStatus });
    return { success: false, ok: false, connectorId: 'qwen', error: userError, code, httpStatus, trust: TRUST_STATES.FAILED };
  }

  recordConnectorSuccess('qwen', 'paid_connector_send');
  trackConnectorSend('qwen');
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
  const circuit = getConnectorCircuitState('notion', 'external_write');
  if (!circuit.ok) {
    appendConnectorAudit('notion', 'send_blocked_circuit_open', {
      failures: circuit.failures,
      remainingMs: circuit.remainingMs
    });
    return {
      ok: false, connectorId: 'notion', blocked: true,
      error: `Circuit breaker open — ${Math.ceil(circuit.remainingMs / 1000)}s remaining`,
      trust: TRUST_STATES.FAILED
    };
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
  let envCheck = null;
  try {
    envCheck = await invoke('check_env_vars_presence', { names: ['NOTION_API_KEY'] });
  } catch {
    envCheck = null;
  }
  if (envCheck && !envCheck.NOTION_API_KEY) {
    appendConnectorAudit('notion', 'send_blocked_missing_key', { title: String(title || '').slice(0, 80) });
    return {
      ok: false, connectorId: 'notion', blocked: true,
      error: 'Notion API key missing — configure NOTION_API_KEY',
      code: 'MISSING_KEY', trust: TRUST_STATES.FAILED
    };
  }
  await guardConnectorRateLimit('notion');
  let result;
  try {
    result = await invoke('connector_send_notion', {
      title,
      content,
      parentPageId: parentPageId || null
    });
  } catch (error) {
    const errMsg = String(error || '');
    recordConnectorFailure('notion', 'external_write');
    appendConnectorAudit('notion', 'send_failed', { title, error: errMsg });
    return {
      ok: false, connectorId: 'notion', blocked: false,
      error: `Notion connector error: ${errMsg}`, trust: TRUST_STATES.FAILED
    };
  }
  recordConnectorSuccess('notion', 'external_write');
  trackConnectorSend('notion');
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
  const circuit = getConnectorCircuitState('clickup', 'external_write');
  if (!circuit.ok) {
    appendConnectorAudit('clickup', 'send_blocked_circuit_open', {
      failures: circuit.failures,
      remainingMs: circuit.remainingMs
    });
    return {
      ok: false, connectorId: 'clickup', blocked: true,
      error: `Circuit breaker open — ${Math.ceil(circuit.remainingMs / 1000)}s remaining`,
      trust: TRUST_STATES.FAILED
    };
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
  let envCheck = null;
  try {
    envCheck = await invoke('check_env_vars_presence', { names: ['CLICKUP_API_KEY'] });
  } catch {
    envCheck = null;
  }
  if (envCheck && !envCheck.CLICKUP_API_KEY) {
    appendConnectorAudit('clickup', 'send_blocked_missing_key', { title: String(title || '').slice(0, 80) });
    return {
      ok: false, connectorId: 'clickup', blocked: true,
      error: 'ClickUp API key missing — configure CLICKUP_API_KEY',
      code: 'MISSING_KEY', trust: TRUST_STATES.FAILED
    };
  }
  await guardConnectorRateLimit('clickup');
  let result;
  try {
    result = await invoke('connector_send_clickup', {
      title,
      content,
      listId: listId || null
    });
  } catch (error) {
    const errMsg = String(error || '');
    recordConnectorFailure('clickup', 'external_write');
    appendConnectorAudit('clickup', 'send_failed', { title, error: errMsg });
    return {
      ok: false, connectorId: 'clickup', blocked: false,
      error: `ClickUp connector error: ${errMsg}`, trust: TRUST_STATES.FAILED
    };
  }
  recordConnectorSuccess('clickup', 'external_write');
  trackConnectorSend('clickup');
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
  const circuit = getConnectorCircuitState('youtube', 'external_publish');
  if (!circuit.ok) {
    appendConnectorAudit('youtube', 'upload_blocked_circuit_open', {
      failures: circuit.failures,
      remainingMs: circuit.remainingMs
    });
    return {
      ok: false, connectorId: 'youtube', blocked: true,
      error: `Circuit breaker open — ${Math.ceil(circuit.remainingMs / 1000)}s remaining`,
      trust: TRUST_STATES.FAILED
    };
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
  let envCheck = null;
  try {
    envCheck = await invoke('check_env_vars_presence', { names: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'] });
  } catch {
    envCheck = null;
  }
  if (envCheck && (!envCheck.YOUTUBE_CLIENT_ID || !envCheck.YOUTUBE_CLIENT_SECRET)) {
    appendConnectorAudit('youtube', 'upload_blocked_missing_key', { title: String(title || '').slice(0, 80) });
    return {
      ok: false, connectorId: 'youtube', blocked: true,
      error: 'YouTube OAuth credentials missing — configure YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET',
      code: 'MISSING_KEY', trust: TRUST_STATES.FAILED
    };
  }
  await guardConnectorRateLimit('youtube');
  let result;
  try {
    result = await invoke('connector_upload_youtube', {
      filePath,
      title,
      description,
      tags,
      privacyStatus
    });
  } catch (error) {
    const errMsg = String(error || '');
    recordConnectorFailure('youtube', 'external_publish');
    appendConnectorAudit('youtube', 'upload_failed', { filePath, title, error: errMsg });
    return {
      ok: false, connectorId: 'youtube', blocked: false,
      error: `YouTube connector error: ${errMsg}`, trust: TRUST_STATES.FAILED
    };
  }
  recordConnectorSuccess('youtube', 'external_publish');
  trackConnectorSend('youtube');
  appendConnectorAudit('youtube', result?.ok ? 'upload_success' : 'upload_failed', {
    filePath,
    title,
    videoId: result?.videoId || null,
    url: result?.url || null,
    error: result?.error || null
  });
  return result;
}

export async function sendGitHubAction(action, payload, options = {}) {
  const auth = isConnectorAuthenticated('github');
  if (!auth.ok) {
    return logUnauthenticatedConnectorRequest('github', action, JSON.stringify(payload), options);
  }
  const circuit = getConnectorCircuitState('github', action);
  if (!circuit.ok) {
    appendConnectorAudit('github', 'action_blocked_circuit_open', {
      failures: circuit.failures,
      remainingMs: circuit.remainingMs
    });
    return {
      ok: false, connectorId: 'github', blocked: true,
      error: `Circuit breaker open — ${Math.ceil(circuit.remainingMs / 1000)}s remaining`,
      trust: TRUST_STATES.FAILED
    };
  }
  const approval = await requireConnectorApproval('github', action, JSON.stringify(payload), {
    ...options,
    action
  });
  if (!approval.ok) return approval;
  const readiness = await requireConnectorReady('github', action, JSON.stringify(payload), options);
  if (!readiness.ok) return readiness;
  const gate = gateConnectorAction('github', action, JSON.stringify(payload), options);
  if (!gate.ok) {
    return {
      ok: false,
      connectorId: 'github',
      blocked: true,
      trust: gate.verificationState || TRUST_STATES.PENDING,
      error: gate.reason || 'GitHub connector policy gate blocked the action.'
    };
  }
  let envCheck = null;
  try {
    envCheck = await invoke('check_env_vars_presence', { names: ['GITHUB_TOKEN'] });
  } catch {
    envCheck = null;
  }
  if (envCheck && !envCheck.GITHUB_TOKEN) {
    appendConnectorAudit('github', 'action_blocked_missing_key', { action });
    return {
      ok: false, connectorId: 'github', blocked: true,
      error: 'GitHub token is not configured — set GITHUB_TOKEN in environment',
      code: 'MISSING_KEY', trust: TRUST_STATES.FAILED
    };
  }
  await guardConnectorRateLimit('github');
  let result;
  try {
    result = await invoke('connector_github_action', { action, payload });
  } catch (error) {
    const errMsg = String(error || '');
    recordConnectorFailure('github', action);
    appendConnectorAudit('github', 'action_failed', { action, error: errMsg });
    return {
      ok: false, connectorId: 'github', blocked: false,
      error: `GitHub connector error: ${errMsg}`, trust: TRUST_STATES.FAILED
    };
  }
  recordConnectorSuccess('github', action);
  trackConnectorSend('github');
  appendConnectorAudit('github', result?.ok ? 'action_success' : 'action_failed', {
    action,
    result: result?.data || null,
    error: result?.error || null
  });
  return result;
}

export async function sendSlackMessage(channel, text, options = {}) {
  const auth = isConnectorAuthenticated('slack');
  if (!auth.ok) {
    return logUnauthenticatedConnectorRequest('slack', 'message_send', text, {
      ...options,
      target: channel
    });
  }
  const circuit = getConnectorCircuitState('slack', 'message_send');
  if (!circuit.ok) {
    appendConnectorAudit('slack', 'send_blocked_circuit_open', {
      failures: circuit.failures,
      remainingMs: circuit.remainingMs
    });
    return {
      ok: false, connectorId: 'slack', blocked: true,
      error: `Circuit breaker open — ${Math.ceil(circuit.remainingMs / 1000)}s remaining`,
      trust: TRUST_STATES.FAILED
    };
  }
  const approval = await requireConnectorApproval('slack', 'message_send', text, {
    ...options,
    target: channel
  });
  if (!approval.ok) return approval;
  const readiness = await requireConnectorReady('slack', 'message_send', text, options);
  if (!readiness.ok) return readiness;
  const gate = gateConnectorAction('slack', 'message_send', text, options);
  if (!gate.ok) {
    return {
      ok: false,
      connectorId: 'slack',
      blocked: true,
      trust: gate.verificationState || TRUST_STATES.PENDING,
      error: gate.reason || 'Slack connector policy gate blocked the action.'
    };
  }
  let envCheck = null;
  try {
    envCheck = await invoke('check_env_vars_presence', { names: ['SLACK_BOT_TOKEN'] });
  } catch {
    envCheck = null;
  }
  if (envCheck && !envCheck.SLACK_BOT_TOKEN) {
    appendConnectorAudit('slack', 'send_blocked_missing_key', { channel, text: String(text || '').slice(0, 80) });
    return {
      ok: false, connectorId: 'slack', blocked: true,
      error: 'Slack bot token is not configured — set SLACK_BOT_TOKEN in environment',
      code: 'MISSING_KEY', trust: TRUST_STATES.FAILED
    };
  }
  await guardConnectorRateLimit('slack');
  let result;
  try {
    result = await invoke('connector_slack_send', { channel, text, threadTs: options.threadTs || options.thread_ts || null });
  } catch (error) {
    const errMsg = String(error || '');
    recordConnectorFailure('slack', 'message_send');
    appendConnectorAudit('slack', 'send_failed', { channel, text, error: errMsg });
    return {
      ok: false, connectorId: 'slack', blocked: false,
      error: `Slack connector error: ${errMsg}`, trust: TRUST_STATES.FAILED
    };
  }
  recordConnectorSuccess('slack', 'message_send');
  trackConnectorSend('slack');
  appendConnectorAudit('slack', result?.ok ? 'send_success' : 'send_failed', {
    channel,
    text: String(text || '').slice(0, 200),
    ts: result?.ts || null,
    error: result?.error || null
  });
  return result;
}
