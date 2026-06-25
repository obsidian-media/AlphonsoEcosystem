import React, { useEffect, useMemo, useState } from 'react';
import {
  RadioTower, CheckCircle2, AlertCircle, Circle, ChevronDown, ChevronUp,
  GitBranch, MessageSquare, Bot, Zap, Database, ListTodo, Phone, Video,
  Cpu, Search, Smartphone, Settings2, MessageCircle, Hash
} from 'lucide-react';
import { ToolConnectionsPanel } from './ToolConnectionsPanel';
import {
  createConnectorRoutePacket,
  listConnectorAudit,
  listConnectorAuthProfiles,
  listConnectors,
  pollTelegramConnector,
  pollWhatsAppConnector,
  simulateWhatsAppCloudInbound,
  sendTelegramConnectorMessage,
  sendWhatsAppConnectorMessage,
  sendChatGptConnectorMessage,
  sendClaudeConnectorMessage,
  sendQwenConnectorMessage,
  sendNotionConnectorEntry,
  sendClickUpConnectorTask,
  uploadYouTubeConnectorVideo,
  verifyWhatsAppCloudWebhookChallenge,
  verifyWhatsAppCloudWebhookSignature,
  setConnectorStatus,
  updateConnectorAuthProfile,
  verifyConnectorEnvironment,
  proveTelegramConnectorPath
} from '../services/connectorRegistryService';
import { getTelegramAutoPollState, runSingleTelegramPoll } from '../services/telegramAutoPollService';
import { saveConnectorCredential, getConnectorCredential } from '../services/connectors/connectorAuth';
import { verifyTelegramBotEnvironment } from '../services/telegramBrowserConnector';

// ── Connector icon map ────────────────────────────────────────────────────────
const CONNECTOR_ICONS = {
  telegram: MessageSquare,
  whatsapp: Phone,
  github: GitBranch,
  slack: Hash,
  claude: Bot,
  chatgpt: Bot,
  notion: Database,
  clickup: ListTodo,
  youtube: Video,
  qwen: Cpu,
  brave_search: Search,
  ollama: Cpu,
  sd_webui: Settings2,
  comfyui_video: Settings2,
  mobile_bridge: Smartphone,
  n8n: Zap,
};

// ── Status helpers ────────────────────────────────────────────────────────────
function getDisplayStatus(connector) {
  const status = String(connector?.status || 'unknown').trim().toLowerCase();
  const requiredEnv = Array.isArray(connector?.requiredEnv) ? connector.requiredEnv : [];
  const envMissing = requiredEnv.length > 0 && requiredEnv.some((n) => !connector?.envPresence?.[n]);
  if (status === 'foundation_only') return 'local_only';
  if (status === 'disabled_safe') return 'not_configured';
  if (status === 'configured' && envMissing) return 'error';
  if (status === 'configured' && connector?.lastTestStatus && connector.lastTestStatus !== 'verified') return 'not_configured';
  if (['configured', 'not_configured', 'invalid', 'unknown', 'setup_required'].includes(status)) {
    if (status === 'configured') return 'configured';
    return 'not_configured';
  }
  return 'not_configured';
}

function isConnectorLive(connector) {
  return getDisplayStatus(connector) === 'configured' && connector?.lastTestStatus === 'verified';
}

function isConnectorOutboundAllowed(connector, approved) {
  if (!connector || !approved) return false;
  if (['mobile_bridge', 'sd_webui', 'comfyui_video'].includes(connector.id)) return false;
  return getDisplayStatus(connector) === 'configured';
}

function isConnectorPollAllowed(connector) {
  if (!connector) return false;
  if (!['telegram', 'whatsapp'].includes(connector.id)) return false;
  return getDisplayStatus(connector) === 'configured';
}

// ── Credential section with save confirmation ─────────────────────────────────
function CredentialSection({ title, icon: Icon, borderColor, bgColor, accentColor, fields, onSave, hint, savedLabel }) {
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    onSave();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className={`rounded-2xl border ${borderColor} ${bgColor} p-5`}>
      <div className="mb-4 flex items-center gap-2">
        {Icon && <Icon className={`h-4 w-4 ${accentColor}`} />}
        <span className="text-sm font-semibold text-zinc-100">{title}</span>
      </div>
      <div className="space-y-3">
        {fields.map((f) => (
          <div key={f.key}>
            <label className="mb-1.5 block text-[11px] font-medium text-zinc-400">{f.label}</label>
            <input
              type={f.secret === false ? 'text' : 'password'}
              value={f.value || ''}
              onChange={(e) => f.onChange(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-white/20 focus:outline-none"
              placeholder={f.placeholder}
              autoComplete="off"
            />
          </div>
        ))}
      </div>
      {hint && <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">{hint}</p>}
      <div className="mt-4 flex items-center justify-between">
        {saved ? (
          <div className="flex items-center gap-1.5 text-[12px] font-medium text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {savedLabel || 'Saved successfully'}
          </div>
        ) : (
          <div />
        )}
        <button
          onClick={handleSave}
          className={`rounded-xl border ${borderColor} px-4 py-2 text-[11px] font-semibold text-zinc-100 transition-opacity hover:opacity-80`}
        >
          Save & Enable
        </button>
      </div>
    </div>
  );
}

// ── Connector status card ─────────────────────────────────────────────────────
function ConnectorCard({ connector, onVerifyEnv }) {
  const Icon = CONNECTOR_ICONS[connector.id] || MessageCircle;
  const displayStatus = getDisplayStatus(connector);
  const live = isConnectorLive(connector);

  const statusConfig = {
    configured: { label: 'Active', dot: 'bg-emerald-400', text: 'text-emerald-400', border: 'border-emerald-300/20 bg-emerald-500/5' },
    local_only: { label: 'Local', dot: 'bg-slate-400', text: 'text-slate-400', border: 'border-slate-300/20 bg-slate-500/5' },
    not_configured: { label: 'Not set up', dot: 'bg-zinc-600', text: 'text-zinc-500', border: 'border-white/10 bg-zinc-900/40' },
    error: { label: 'Error', dot: 'bg-amber-400', text: 'text-amber-400', border: 'border-amber-300/20 bg-amber-500/5' },
  };

  const cfg = statusConfig[displayStatus] || statusConfig.not_configured;

  return (
    <div className={`rounded-xl border p-3.5 ${cfg.border}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 shrink-0 ${cfg.text}`} />
          <span className="text-sm font-medium text-zinc-100">{connector.name}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
          <span className={`text-[10px] font-medium ${cfg.text}`}>{cfg.label}</span>
        </div>
      </div>
      {live && (
        <div className="mt-2 text-[10px] text-emerald-400/70">
          Verified & ready
        </div>
      )}
      {displayStatus === 'not_configured' && (
        <div className="mt-2 text-[10px] text-zinc-600">
          Enter credentials below to enable
        </div>
      )}
      <button
        onClick={onVerifyEnv}
        className="mt-3 w-full rounded-lg bg-white/5 px-3 py-1.5 text-[10px] font-medium text-zinc-400 hover:bg-white/10 hover:text-zinc-200 transition-colors"
      >
        Test Connection
      </button>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export function ConnectorSetupPanel() {
  const [connectors, setConnectors] = useState(() => listConnectors());
  const [audit, setAudit] = useState(() => listConnectorAudit());
  const [authProfiles, setAuthProfiles] = useState(() => listConnectorAuthProfiles());
  const [notice, setNotice] = useState('');
  const [noticeType, setNoticeType] = useState('info'); // 'info' | 'error' | 'success'
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [transportBusy, setTransportBusy] = useState(false);

  // Advanced / developer state
  const [connectorId, setConnectorId] = useState('telegram');
  const [simulatedText, setSimulatedText] = useState('ask hector: find latest Tauri v2 docs');
  const [senderId, setSenderId] = useState('');
  const [authInput, setAuthInput] = useState('');
  const [outboundTarget, setOutboundTarget] = useState('');
  const [outboundText, setOutboundText] = useState('Jose update: connector test message from Alphonso.');
  const [youtubeFilePath, setYoutubeFilePath] = useState('');
  const [youtubeTitle, setYoutubeTitle] = useState('');
  const [youtubeDescription, setYoutubeDescription] = useState('');
  const [youtubeTags, setYoutubeTags] = useState('');
  const [youtubePrivacy, setYoutubePrivacy] = useState('private');
  const [explicitApproval, setExplicitApproval] = useState(false);
  const [cloudWebhookPayload, setCloudWebhookPayload] = useState('{\n  "entry": []\n}');
  const [cloudWebhookSignature, setCloudWebhookSignature] = useState('');
  const [cloudWebhookMode, setCloudWebhookMode] = useState('subscribe');
  const [cloudWebhookVerifyToken, setCloudWebhookVerifyToken] = useState('');
  const [cloudWebhookChallenge, setCloudWebhookChallenge] = useState('challenge-123');
  const [autoPollState, setAutoPollState] = useState(() => getTelegramAutoPollState());

  // Telegram credentials
  const [telegramBotToken, setTelegramBotToken] = useState(() => getConnectorCredential('telegram', 'TELEGRAM_BOT_TOKEN'));
  const [telegramChatIds, setTelegramChatIds] = useState(() => getConnectorCredential('telegram', 'TELEGRAM_ALLOWED_CHAT_IDS'));
  const [telegramBotVerified, setTelegramBotVerified] = useState(null);

  // API key credentials
  const [githubToken, setGithubToken] = useState(() => getConnectorCredential('github', 'GITHUB_TOKEN'));
  const [slackBotToken, setSlackBotToken] = useState(() => getConnectorCredential('slack', 'SLACK_BOT_TOKEN'));
  const [anthropicApiKey, setAnthropicApiKey] = useState(() => getConnectorCredential('claude', 'ANTHROPIC_API_KEY'));
  const [openaiApiKey, setOpenaiApiKey] = useState(() => getConnectorCredential('chatgpt', 'OPENAI_API_KEY'));
  const [notionApiKey, setNotionApiKey] = useState(() => getConnectorCredential('notion', 'NOTION_API_KEY'));
  const [notionParentPageId, setNotionParentPageId] = useState(() => getConnectorCredential('notion', 'NOTION_PARENT_PAGE_ID'));
  const [clickupApiKey, setClickupApiKey] = useState(() => getConnectorCredential('clickup', 'CLICKUP_API_KEY'));
  const [clickupListId, setClickupListId] = useState(() => getConnectorCredential('clickup', 'CLICKUP_LIST_ID'));
  const [whatsappAccessToken, setWhatsappAccessToken] = useState(() => getConnectorCredential('whatsapp', 'WHATSAPP_ACCESS_TOKEN'));
  const [whatsappPhoneNumberId, setWhatsappPhoneNumberId] = useState(() => getConnectorCredential('whatsapp', 'WHATSAPP_PHONE_NUMBER_ID'));
  const [whatsappVerifyToken, setWhatsappVerifyToken] = useState(() => getConnectorCredential('whatsapp', 'WHATSAPP_VERIFY_TOKEN'));
  const [youtubeClientId, setYoutubeClientId] = useState(() => getConnectorCredential('youtube', 'YOUTUBE_CLIENT_ID'));
  const [youtubeClientSecret, setYoutubeClientSecret] = useState(() => getConnectorCredential('youtube', 'YOUTUBE_CLIENT_SECRET'));
  const [youtubeRefreshToken, setYoutubeRefreshToken] = useState(() => getConnectorCredential('youtube', 'YOUTUBE_REFRESH_TOKEN'));
  const [youtubeChannelId, setYoutubeChannelId] = useState(() => getConnectorCredential('youtube', 'YOUTUBE_CHANNEL_ID'));
  const [qwenApiKey, setQwenApiKey] = useState(() => getConnectorCredential('qwen', 'DASHSCOPE_API_KEY'));
  const [braveApiKey, setBraveApiKey] = useState(() => getConnectorCredential('brave_search', 'BRAVE_SEARCH_API_KEY'));
  const [tavilyApiKey, setTavilyApiKey] = useState(() => getConnectorCredential('tavily', 'TAVILY_API_KEY') || '');
  const [runwayApiKey, setRunwayApiKey] = useState(() => getConnectorCredential('runway', 'RUNWAYML_API_SECRET'));
  const [n8nBaseUrl, setN8nBaseUrl] = useState(() => getConnectorCredential('n8n', 'N8N_BASE_URL') || 'http://localhost:5678');

  useEffect(() => {
    let cancelled = false;
    const probeAll = async () => {
      const ids = listConnectors().map((c) => c.id);
      for (const id of ids) {
        if (cancelled) break;
        try { await verifyConnectorEnvironment(id); } catch { /* silent */ }
      }
      if (!cancelled) {
        setConnectors(listConnectors());
        setAuthProfiles(listConnectorAuthProfiles());
      }
    };
    probeAll();
    return () => { cancelled = true; };
  }, []);

  const selectedConnector = useMemo(
    () => connectors.find((c) => c.id === connectorId) || null,
    [connectors, connectorId]
  );

  const refresh = () => {
    setConnectors(listConnectors());
    setAudit(listConnectorAudit());
    setAuthProfiles(listConnectorAuthProfiles());
    window.dispatchEvent(new CustomEvent('alphonso-connector-saved'));
  };

  const showNotice = (msg, type = 'info') => {
    setNotice(msg);
    setNoticeType(type);
  };

  // Active connector count for summary
  const activeCount = connectors.filter((c) => getDisplayStatus(c) === 'configured').length;

  // ── Credential save helpers ─────────────────────────────────────────────────
  const saveTelegramCredentials = async () => {
    const token = telegramBotToken.trim();
    if (!token) { showNotice('Bot token is required.', 'error'); return; }
    saveConnectorCredential('telegram', 'TELEGRAM_BOT_TOKEN', token);
    saveConnectorCredential('telegram', 'TELEGRAM_ALLOWED_CHAT_IDS', telegramChatIds.trim());
    updateConnectorAuthProfile('telegram', {
      enabled: true,
      allowlist: telegramChatIds.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)
    });
    setTelegramBotVerified(null);
    try {
      const result = await verifyConnectorEnvironment('telegram');
      showNotice(result?.ok ? 'Telegram saved & verified ✓' : 'Telegram saved — use "Test Connection" to verify the bot token.', result?.ok ? 'success' : 'info');
    } catch {
      showNotice('Telegram credentials saved.', 'success');
    }
    refresh();
  };

  const saveConnectorApiKey = async (cId, fields) => {
    let hasValue = false;
    for (const [key, value] of Object.entries(fields)) {
      const trimmed = String(value || '').trim();
      if (trimmed) { saveConnectorCredential(cId, key, trimmed); hasValue = true; }
    }
    if (!hasValue) { showNotice('Please enter at least one credential value.', 'error'); return; }
    updateConnectorAuthProfile(cId, { enabled: true });
    // Auto-verify immediately so the card shows "Active" without a manual test step
    try {
      const result = await verifyConnectorEnvironment(cId);
      showNotice(result?.ok ? `${cId} saved & verified ✓` : `${cId} saved — verify check returned incomplete (check values)`, result?.ok ? 'success' : 'error');
    } catch {
      showNotice(`${cId} credentials saved.`, 'success');
    }
    refresh();
  };

  const verifyTelegramBot = async () => {
    const token = telegramBotToken.trim() || getConnectorCredential('telegram', 'TELEGRAM_BOT_TOKEN');
    if (!token) { showNotice('Enter a bot token first.', 'error'); return; }
    setTransportBusy(true);
    try {
      const result = await verifyTelegramBotEnvironment({ botToken: token });
      setTelegramBotVerified(result);
      if (result.ok) {
        showNotice(`Connected to @${result.botUsername}`, 'success');
      } else {
        showNotice(`Telegram error: ${result.error}`, 'error');
      }
    } finally { setTransportBusy(false); }
  };

  const verifyEnv = async (id) => {
    const result = await verifyConnectorEnvironment(id);
    if (result?.error) {
      showNotice(`${id}: ${result.error}`, 'error');
    } else {
      showNotice(`${id}: ${result?.ok ? 'connection verified' : 'check failed — credentials may be missing'}`, result?.ok ? 'success' : 'error');
    }
    refresh();
  };

  // ── Advanced tool handlers ──────────────────────────────────────────────────
  const createRoute = () => {
    const result = createConnectorRoutePacket(connectorId, simulatedText, senderId);
    if (result?.rejected) {
      showNotice(`Route blocked: ${result.reason}`, 'error');
    } else {
      showNotice(result?.packet?.id ? `Route packet created: ${result.packet.id}` : 'No route packet created.', 'info');
    }
    refresh();
  };

  const applyAllowlist = () => {
    const profile = updateConnectorAuthProfile(connectorId, { enabled: true, allowlist: authInput });
    showNotice(`Allowlist updated for ${connectorId}. ${profile.allowlist.length} entries.`, 'success');
    refresh();
  };

  const disableAuthProfile = () => {
    updateConnectorAuthProfile(connectorId, { enabled: false, allowlist: [] });
    showNotice(`Auth profile disabled for ${connectorId}.`, 'info');
    refresh();
  };

  const pollConnector = async () => {
    if (!['telegram', 'whatsapp'].includes(connectorId)) {
      showNotice('Polling is available for Telegram and WhatsApp only.', 'error');
      return;
    }
    setTransportBusy(true);
    try {
      const result = connectorId === 'whatsapp'
        ? await pollWhatsAppConnector(20)
        : await pollTelegramConnector(20);
      if (result.error) {
        showNotice(`Poll failed: ${result.error}`, 'error');
      } else {
        showNotice(`Poll: ${result.count} inbound, ${result.routed} routed, ${result.rejected} rejected.`, 'info');
      }
      refresh();
    } finally { setTransportBusy(false); }
  };

  const runAutoPoll = async () => {
    if (connectorId !== 'telegram') { showNotice('Auto-poll is Telegram only.', 'error'); return; }
    setTransportBusy(true);
    try {
      const result = await runSingleTelegramPoll({ limit: 12 });
      setAutoPollState(getTelegramAutoPollState());
      showNotice(result.ok
        ? `Auto-poll: ${result.count} inbound, ${result.routed} routed.`
        : `Auto-poll failed: ${result.reason || 'unknown'}`,
        result.ok ? 'info' : 'error');
      refresh();
    } finally { setTransportBusy(false); }
  };

  const sendOutbound = async () => {
    const needsTarget = !['chatgpt', 'claude', 'qwen', 'youtube'].includes(connectorId);
    if ((needsTarget && !outboundTarget.trim()) || !outboundText.trim()) {
      showNotice(needsTarget ? 'Target and message are required.' : 'Message is required.', 'error');
      return;
    }
    setTransportBusy(true);
    try {
      let result = null;
      if (connectorId === 'telegram') result = await sendTelegramConnectorMessage(outboundTarget.trim(), outboundText.trim(), { approved: explicitApproval });
      else if (connectorId === 'whatsapp') result = await sendWhatsAppConnectorMessage(outboundTarget.trim(), outboundText.trim(), { approved: explicitApproval });
      else if (connectorId === 'chatgpt') result = await sendChatGptConnectorMessage(outboundText.trim(), { approved: explicitApproval });
      else if (connectorId === 'claude') result = await sendClaudeConnectorMessage(outboundText.trim(), { approved: explicitApproval });
      else if (connectorId === 'qwen') result = await sendQwenConnectorMessage(outboundText.trim(), { approved: explicitApproval });
      else if (connectorId === 'notion') result = await sendNotionConnectorEntry({ title: outboundText.trim().slice(0, 180), content: outboundText.trim(), parentPageId: outboundTarget.trim() }, { approved: explicitApproval });
      else if (connectorId === 'clickup') result = await sendClickUpConnectorTask({ title: outboundText.trim().slice(0, 180), content: outboundText.trim(), listId: outboundTarget.trim() }, { approved: explicitApproval });
      else if (connectorId === 'youtube') result = await uploadYouTubeConnectorVideo({ filePath: youtubeFilePath.trim(), title: youtubeTitle.trim(), description: youtubeDescription.trim(), tags: youtubeTags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 20), privacyStatus: youtubePrivacy }, { approved: explicitApproval });
      else { showNotice('Outbound send not supported for this connector.', 'error'); return; }

      if (result?.ok) {
        showNotice(`${connectorId} success. ID: ${result.externalId || result.url || 'n/a'}`, 'success');
      } else if (result?.blocked) {
        showNotice(`Blocked by policy: ${result?.error || 'approval or auth gate'}`, 'error');
      } else {
        showNotice(`Failed: ${result?.error || 'unknown error'}`, 'error');
      }
      refresh();
    } finally { setTransportBusy(false); }
  };

  const runWhatsAppCloudWebhookSimulation = async () => {
    setTransportBusy(true);
    try {
      let payload = {};
      try { payload = JSON.parse(cloudWebhookPayload); } catch {
        showNotice('Webhook payload must be valid JSON.', 'error'); return;
      }
      const challengeProof = await verifyWhatsAppCloudWebhookChallenge({ mode: cloudWebhookMode, verifyToken: cloudWebhookVerifyToken, challenge: cloudWebhookChallenge });
      const signatureProof = await verifyWhatsAppCloudWebhookSignature({ rawBody: JSON.stringify(payload), signatureHeader: cloudWebhookSignature });
      const routeProof = await simulateWhatsAppCloudInbound(payload);
      showNotice(`Simulation: challenge=${challengeProof?.ok ? 'ok' : 'fail'}, signature=${signatureProof?.ok ? 'ok' : 'fail'}, routed=${routeProof?.routedCount || 0}.`, 'info');
      refresh();
    } finally { setTransportBusy(false); }
  };

  const runTelegramLiveProof = async () => {
    if (connectorId !== 'telegram') { showNotice('Select Telegram first.', 'error'); return; }
    if (!outboundTarget.trim()) { showNotice('Enter a chat ID.', 'error'); return; }
    setTransportBusy(true);
    try {
      const result = await proveTelegramConnectorPath(outboundTarget.trim(), outboundText.trim(), { approved: explicitApproval, requestedBy: 'jose' });
      if (result?.ok) showNotice(`Live proof success. ID: ${result.externalId || 'n/a'}`, 'success');
      else if (result?.blocked) showNotice(`Blocked: ${result?.error}`, 'error');
      else showNotice(`Failed: ${result?.error || 'unknown'}`, 'error');
      refresh();
    } finally { setTransportBusy(false); }
  };

  const pollAvailable = ['telegram', 'whatsapp'].includes(connectorId);
  const outboundAllowed = Boolean(selectedConnector && isConnectorOutboundAllowed(selectedConnector, explicitApproval));

  const noticeColors = {
    success: 'border-emerald-300/20 bg-emerald-500/10 text-emerald-200',
    error: 'border-red-300/20 bg-red-500/10 text-red-300',
    info: 'border-teal-300/15 bg-teal-500/10 text-teal-100/80',
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-950/72 p-5 space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <RadioTower className="h-4 w-4 text-teal-300" />
            Connectors
          </div>
          <p className="mt-1 text-[12px] text-zinc-500">
            {activeCount > 0
              ? `${activeCount} of ${connectors.length} connectors active. Your credentials are stored locally.`
              : `Connect your tools below. All credentials are stored locally on your device.`}
          </p>
        </div>
      </div>

      {/* ── Notice ── */}
      {notice && (
        <div className={`rounded-xl border px-4 py-3 text-[12px] flex items-center gap-2 ${noticeColors[noticeType]}`}>
          {noticeType === 'success' && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
          {noticeType === 'error' && <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
          {noticeType === 'info' && <Circle className="h-3.5 w-3.5 shrink-0 opacity-50" />}
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="ml-auto opacity-50 hover:opacity-100 text-xs">✕</button>
        </div>
      )}

      {/* ── Connector status cards ── */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">
        {connectors.map((connector) => (
          <ConnectorCard
            key={connector.id}
            connector={connector}
            onVerifyEnv={() => verifyEnv(connector.id)}
          />
        ))}
      </div>

      {/* ── Credential Setup ── */}
      <div>
        <h3 className="mb-4 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Configure Integrations</h3>
        <div className="space-y-4">

          {/* Telegram */}
          <div className="rounded-2xl border border-sky-300/20 bg-sky-500/8 p-5">
            <div className="mb-4 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-sky-400" />
              <span className="text-sm font-semibold text-zinc-100">Telegram</span>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-zinc-400">Bot Token</label>
                <input
                  type="password"
                  value={telegramBotToken}
                  onChange={(e) => setTelegramBotToken(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-white/20 focus:outline-none"
                  placeholder="Paste your bot token from @BotFather"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-zinc-400">Allowed Chat IDs <span className="text-zinc-600 font-normal">(optional)</span></label>
                <input
                  type="text"
                  value={telegramChatIds}
                  onChange={(e) => setTelegramChatIds(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-white/20 focus:outline-none"
                  placeholder="e.g. 123456789, 987654321"
                />
              </div>
            </div>
            <p className="mt-3 text-[11px] text-zinc-500">
              Create a bot with <span className="text-zinc-400">@BotFather</span> on Telegram to get your bot token. Allowed Chat IDs restrict who can send commands to Alphonso.
            </p>
            {telegramBotVerified !== null && (
              <div className={`mt-3 flex items-center gap-1.5 text-[12px] font-medium ${telegramBotVerified.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                {telegramBotVerified.ok
                  ? <><CheckCircle2 className="h-3.5 w-3.5" /> Connected as @{telegramBotVerified.botUsername}</>
                  : <><AlertCircle className="h-3.5 w-3.5" /> {telegramBotVerified.error}</>}
              </div>
            )}
            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={saveTelegramCredentials}
                className="rounded-xl border border-sky-300/20 px-4 py-2 text-[11px] font-semibold text-zinc-100 hover:opacity-80 transition-opacity"
              >
                Save & Enable
              </button>
              <button
                onClick={verifyTelegramBot}
                disabled={transportBusy}
                className="rounded-xl border border-white/10 px-4 py-2 text-[11px] font-medium text-zinc-400 hover:text-zinc-200 hover:border-white/20 disabled:opacity-40 transition-colors"
              >
                Verify Bot
              </button>
            </div>
          </div>

          {/* GitHub */}
          <CredentialSection
            title="GitHub"
            icon={GitBranch}
            borderColor="border-violet-300/20"
            bgColor="bg-violet-500/8"
            accentColor="text-violet-400"
            fields={[{ label: 'Personal Access Token', placeholder: 'ghp_...', value: githubToken, onChange: setGithubToken, key: 'GITHUB_TOKEN' }]}
            onSave={() => saveConnectorApiKey('github', { GITHUB_TOKEN: githubToken })}
            hint="Create a token at github.com/settings/tokens with repo and workflow scopes. Used by Marcus for releases and issue management."
            savedLabel="GitHub token saved"
          />

          {/* Slack */}
          <CredentialSection
            title="Slack"
            icon={Hash}
            borderColor="border-green-300/20"
            bgColor="bg-green-500/8"
            accentColor="text-green-400"
            fields={[{ label: 'Bot Token', placeholder: 'xoxb-...', value: slackBotToken, onChange: setSlackBotToken, key: 'SLACK_BOT_TOKEN' }]}
            onSave={() => saveConnectorApiKey('slack', { SLACK_BOT_TOKEN: slackBotToken })}
            hint="Create a Slack app at api.slack.com/apps, add the chat:write scope, install to your workspace, and copy the Bot User OAuth Token."
            savedLabel="Slack token saved"
          />

          {/* Claude */}
          <CredentialSection
            title="Claude (Anthropic)"
            icon={Bot}
            borderColor="border-orange-300/20"
            bgColor="bg-orange-500/8"
            accentColor="text-orange-400"
            fields={[{ label: 'API Key', placeholder: 'sk-ant-...', value: anthropicApiKey, onChange: setAnthropicApiKey, key: 'ANTHROPIC_API_KEY' }]}
            onSave={() => saveConnectorApiKey('claude', { ANTHROPIC_API_KEY: anthropicApiKey })}
            hint="Get your key at console.anthropic.com/settings/keys. Only used when you explicitly route a task to Claude."
            savedLabel="Anthropic key saved"
          />

          {/* ChatGPT */}
          <CredentialSection
            title="ChatGPT (OpenAI)"
            icon={Bot}
            borderColor="border-teal-300/20"
            bgColor="bg-teal-500/8"
            accentColor="text-teal-400"
            fields={[{ label: 'API Key', placeholder: 'sk-...', value: openaiApiKey, onChange: setOpenaiApiKey, key: 'OPENAI_API_KEY' }]}
            onSave={() => saveConnectorApiKey('chatgpt', { OPENAI_API_KEY: openaiApiKey })}
            hint="Get your key at platform.openai.com/api-keys. Only used when you explicitly route a task to ChatGPT."
            savedLabel="OpenAI key saved"
          />

          {/* Notion */}
          <CredentialSection
            title="Notion"
            icon={Database}
            borderColor="border-pink-300/20"
            bgColor="bg-pink-500/8"
            accentColor="text-pink-400"
            fields={[
              { label: 'Integration Secret', placeholder: 'secret_...', value: notionApiKey, onChange: setNotionApiKey, key: 'NOTION_API_KEY' },
              { label: 'Default Page ID', placeholder: 'Page UUID (optional)', value: notionParentPageId, onChange: setNotionParentPageId, key: 'NOTION_PARENT_PAGE_ID', secret: false }
            ]}
            onSave={() => saveConnectorApiKey('notion', { NOTION_API_KEY: notionApiKey, NOTION_PARENT_PAGE_ID: notionParentPageId })}
            hint="Create an integration at notion.so/my-integrations, then share the pages you want Alphonso to write to with your integration."
            savedLabel="Notion credentials saved"
          />

          {/* ClickUp */}
          <CredentialSection
            title="ClickUp"
            icon={ListTodo}
            borderColor="border-purple-300/20"
            bgColor="bg-purple-500/8"
            accentColor="text-purple-400"
            fields={[
              { label: 'API Key', placeholder: 'pk_...', value: clickupApiKey, onChange: setClickupApiKey, key: 'CLICKUP_API_KEY' },
              { label: 'Default List ID', placeholder: 'Found in the list URL (optional)', value: clickupListId, onChange: setClickupListId, key: 'CLICKUP_LIST_ID', secret: false }
            ]}
            onSave={() => saveConnectorApiKey('clickup', { CLICKUP_API_KEY: clickupApiKey, CLICKUP_LIST_ID: clickupListId })}
            hint="Find your API key under ClickUp Settings → Apps. The Default List ID is optional — Alphonso can target any list per task."
            savedLabel="ClickUp credentials saved"
          />

          {/* WhatsApp Cloud */}
          <CredentialSection
            title="WhatsApp Cloud"
            icon={Phone}
            borderColor="border-emerald-300/20"
            bgColor="bg-emerald-500/8"
            accentColor="text-emerald-400"
            fields={[
              { label: 'Access Token', placeholder: 'EAA...', value: whatsappAccessToken, onChange: setWhatsappAccessToken, key: 'WHATSAPP_ACCESS_TOKEN' },
              { label: 'Phone Number ID', placeholder: 'From Meta Business dashboard', value: whatsappPhoneNumberId, onChange: setWhatsappPhoneNumberId, key: 'WHATSAPP_PHONE_NUMBER_ID', secret: false },
              { label: 'Webhook Verify Token', placeholder: 'Your custom verify string', value: whatsappVerifyToken, onChange: setWhatsappVerifyToken, key: 'WHATSAPP_VERIFY_TOKEN', secret: false }
            ]}
            onSave={() => saveConnectorApiKey('whatsapp', { WHATSAPP_ACCESS_TOKEN: whatsappAccessToken, WHATSAPP_PHONE_NUMBER_ID: whatsappPhoneNumberId, WHATSAPP_VERIFY_TOKEN: whatsappVerifyToken })}
            hint="Get credentials from Meta Business Suite → WhatsApp → API Setup. The Verify Token is a string you choose when setting up your webhook."
            savedLabel="WhatsApp credentials saved"
          />

          {/* YouTube */}
          <CredentialSection
            title="YouTube"
            icon={Video}
            borderColor="border-red-300/20"
            bgColor="bg-red-500/8"
            accentColor="text-red-400"
            fields={[
              { label: 'Client ID', placeholder: 'From Google Cloud Console', value: youtubeClientId, onChange: setYoutubeClientId, key: 'YOUTUBE_CLIENT_ID', secret: false },
              { label: 'Client Secret', placeholder: 'From Google Cloud Console', value: youtubeClientSecret, onChange: setYoutubeClientSecret, key: 'YOUTUBE_CLIENT_SECRET' },
              { label: 'Refresh Token', placeholder: 'Run: npm run auth:youtube', value: youtubeRefreshToken, onChange: setYoutubeRefreshToken, key: 'YOUTUBE_REFRESH_TOKEN' },
              { label: 'Channel ID', placeholder: 'UC...', value: youtubeChannelId, onChange: setYoutubeChannelId, key: 'YOUTUBE_CHANNEL_ID', secret: false }
            ]}
            onSave={() => saveConnectorApiKey('youtube', { YOUTUBE_CLIENT_ID: youtubeClientId, YOUTUBE_CLIENT_SECRET: youtubeClientSecret, YOUTUBE_REFRESH_TOKEN: youtubeRefreshToken, YOUTUBE_CHANNEL_ID: youtubeChannelId })}
            hint="Create OAuth 2.0 credentials in Google Cloud Console with the YouTube Data API v3 enabled. Then run npm run auth:youtube in a terminal to generate your Refresh Token."
            savedLabel="YouTube credentials saved"
          />

          {/* Qwen */}
          <CredentialSection
            title="Qwen / DashScope"
            icon={Cpu}
            borderColor="border-yellow-300/20"
            bgColor="bg-yellow-500/8"
            accentColor="text-yellow-400"
            fields={[{ label: 'API Key', placeholder: 'sk-...', value: qwenApiKey, onChange: setQwenApiKey, key: 'DASHSCOPE_API_KEY' }]}
            onSave={() => saveConnectorApiKey('qwen', { DASHSCOPE_API_KEY: qwenApiKey })}
            hint="Get your key at dashscope.aliyuncs.com. Alphonso uses the international endpoint automatically."
            savedLabel="Qwen key saved"
          />

          {/* Brave Search */}
          <CredentialSection
            title="Brave Search"
            icon={Search}
            borderColor="border-orange-300/20"
            bgColor="bg-orange-500/8"
            accentColor="text-orange-400"
            fields={[{ label: 'API Key', placeholder: 'BSA...', value: braveApiKey, onChange: setBraveApiKey, key: 'BRAVE_SEARCH_API_KEY' }]}
            onSave={() => saveConnectorApiKey('brave_search', { BRAVE_SEARCH_API_KEY: braveApiKey })}
            hint="Free tier: 2,000 queries/month. Sign up at search.brave.com/register. Used by Hector for real-time web research. Without this key Hector falls back to DuckDuckGo HTML scraping."
            savedLabel="Brave Search key saved"
          />

          {/* Tavily Search */}
          <CredentialSection
            title="Tavily Search (Hector Fallback)"
            icon={Search}
            borderColor="border-sky-300/20"
            bgColor="bg-sky-500/8"
            accentColor="text-sky-400"
            fields={[{ label: 'API Key', placeholder: 'tvly-...', value: tavilyApiKey, onChange: setTavilyApiKey, key: 'TAVILY_API_KEY' }]}
            onSave={() => saveConnectorApiKey('tavily', { TAVILY_API_KEY: tavilyApiKey })}
            hint="Free tier: 1,000 searches/month. Sign up at app.tavily.com. Hector uses this when Brave Search is unavailable. Designed for AI agents — returns clean summaries + sources."
            savedLabel="Tavily key saved"
          />

          {/* Runway ML */}
          <CredentialSection
            title="Runway ML (Video Generation)"
            icon={Video}
            borderColor="border-fuchsia-300/20"
            bgColor="bg-fuchsia-500/8"
            accentColor="text-fuchsia-400"
            fields={[{ label: 'API Secret', placeholder: 'key_...', value: runwayApiKey, onChange: setRunwayApiKey, key: 'RUNWAYML_API_SECRET' }]}
            onSave={() => saveConnectorApiKey('runway', { RUNWAYML_API_SECRET: runwayApiKey })}
            hint="Get your key at app.runwayml.com/account/api-keys. Used by Miya Studio for AI video generation (Gen-4.5). Free trial credits included."
            savedLabel="Runway key saved"
          />

          {/* n8n Automation */}
          <CredentialSection
            title="n8n Automation (Docker)"
            icon={Zap}
            borderColor="border-orange-300/20"
            bgColor="bg-orange-500/8"
            accentColor="text-orange-400"
            fields={[{ label: 'n8n Base URL', placeholder: 'http://localhost:5678', value: n8nBaseUrl, onChange: setN8nBaseUrl, key: 'N8N_BASE_URL', secret: false }]}
            onSave={() => saveConnectorApiKey('n8n', { N8N_BASE_URL: n8nBaseUrl })}
            hint="n8n must be running in Docker. Default: http://localhost:5678. Used by Marcus for workflow automation triggers."
            savedLabel="n8n URL saved"
          />
        </div>
      </div>

      {/* ── Tool Connections ── */}
      <div>
        <ToolConnectionsPanel />
      </div>

      {/* ── Advanced / Developer Tools ── */}
      <div className="rounded-xl border border-white/10">
        <button
          onClick={() => setAdvancedOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-[11px] font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <span>Developer &amp; Testing Tools</span>
          {advancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {advancedOpen && (
          <div className="border-t border-white/10 p-4 space-y-4">

            {/* Connector selector for testing */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[11rem_1fr_12rem]">
              <select value={connectorId} onChange={(e) => setConnectorId(e.target.value)} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100">
                {connectors.map((c) => <option key={`route-${c.id}`} value={c.id}>{c.name}</option>)}
              </select>
              <input value={simulatedText} onChange={(e) => setSimulatedText(e.target.value)} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" placeholder="Simulated command text" />
              <button onClick={createRoute} className="rounded-xl bg-teal-300 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-950 hover:bg-teal-200">
                Route To Jose
              </button>
            </div>

            {/* Allowlist */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_2fr_auto_auto]">
              <input value={senderId} onChange={(e) => setSenderId(e.target.value)} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" placeholder="Simulated sender id" />
              <input value={authInput} onChange={(e) => setAuthInput(e.target.value)} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" placeholder="Allowlist ids (comma or newline)" />
              <button onClick={applyAllowlist} className="rounded-xl bg-zinc-800 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-200 hover:bg-zinc-700">Save Allowlist</button>
              <button onClick={disableAuthProfile} className="rounded-xl bg-amber-500/15 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-amber-100 hover:bg-amber-500/20">Disable Auth</button>
            </div>

            {/* Outbound test */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[10rem_1fr_1fr_auto_auto]">
              <select value={connectorId} onChange={(e) => setConnectorId(e.target.value)} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100">
                {connectors.map((c) => <option key={`outbound-${c.id}`} value={c.id}>{c.name}</option>)}
              </select>
              {connectorId === 'youtube' ? (
                <>
                  <input value={youtubeFilePath} onChange={(e) => setYoutubeFilePath(e.target.value)} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" placeholder="Local video file path" />
                  <input value={youtubeTitle} onChange={(e) => setYoutubeTitle(e.target.value)} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" placeholder="YouTube title" />
                </>
              ) : (
                <>
                  <input value={outboundTarget} onChange={(e) => setOutboundTarget(e.target.value)} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" placeholder={connectorId === 'telegram' ? 'Chat ID' : connectorId === 'whatsapp' ? 'Phone (E.164)' : 'Target'} />
                  <input value={outboundText} onChange={(e) => setOutboundText(e.target.value)} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" placeholder="Outbound message" />
                </>
              )}
              <button onClick={pollConnector} disabled={transportBusy || !pollAvailable} className="rounded-xl bg-zinc-800 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-200 hover:bg-zinc-700 disabled:opacity-40">
                {pollAvailable ? 'Poll' : 'Poll N/A'}
              </button>
              <button onClick={sendOutbound} disabled={transportBusy || !outboundAllowed} className="rounded-xl bg-indigo-500/20 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-indigo-100 hover:bg-indigo-500/30 disabled:opacity-40">
                {connectorId === 'youtube' ? 'Upload' : 'Send'}
              </button>
              {connectorId === 'telegram' && (
                <button onClick={runTelegramLiveProof} disabled={transportBusy} className="rounded-xl bg-emerald-500/20 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-emerald-100 hover:bg-emerald-500/30 disabled:opacity-40">Live Proof</button>
              )}
              {connectorId === 'telegram' && (
                <button onClick={runAutoPoll} disabled={transportBusy} className="rounded-xl bg-cyan-500/20 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-cyan-100 hover:bg-cyan-500/30 disabled:opacity-40">
                  Auto-Poll {autoPollState.errors > 0 ? `(${autoPollState.errors} err)` : ''}
                </button>
              )}
            </div>

            {connectorId === 'youtube' && (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr_10rem]">
                <input value={youtubeDescription} onChange={(e) => setYoutubeDescription(e.target.value)} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" placeholder="Description (optional)" />
                <input value={youtubeTags} onChange={(e) => setYoutubeTags(e.target.value)} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" placeholder="Tags, comma-separated" />
                <select value={youtubePrivacy} onChange={(e) => setYoutubePrivacy(e.target.value)} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100">
                  <option value="private">private</option>
                  <option value="unlisted">unlisted</option>
                  <option value="public">public</option>
                </select>
              </div>
            )}

            {/* Approval gate */}
            <div className="flex items-center gap-2 rounded-xl border border-amber-300/15 bg-amber-500/10 p-3 text-[11px] text-amber-100/85">
              <input id="dev-approval" type="checkbox" checked={explicitApproval} onChange={(e) => setExplicitApproval(e.target.checked)} className="h-3.5 w-3.5 accent-amber-300" />
              <label htmlFor="dev-approval" className="cursor-pointer">Approve this outbound action (required for sends and uploads)</label>
            </div>

            {/* WhatsApp Cloud webhook simulation */}
            <div className="rounded-xl border border-teal-300/15 bg-zinc-900/55 p-4">
              <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-teal-200/75">WhatsApp Cloud Webhook Simulation</div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                <input value={cloudWebhookMode} onChange={(e) => setCloudWebhookMode(e.target.value)} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" placeholder="hub.mode" />
                <input value={cloudWebhookVerifyToken} onChange={(e) => setCloudWebhookVerifyToken(e.target.value)} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" placeholder="hub.verify_token" />
                <input value={cloudWebhookChallenge} onChange={(e) => setCloudWebhookChallenge(e.target.value)} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" placeholder="hub.challenge" />
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_20rem_auto]">
                <textarea value={cloudWebhookPayload} onChange={(e) => setCloudWebhookPayload(e.target.value)} rows={4} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" placeholder="Webhook JSON payload" />
                <input value={cloudWebhookSignature} onChange={(e) => setCloudWebhookSignature(e.target.value)} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" placeholder="X-Hub-Signature-256 header" />
                <button onClick={runWhatsAppCloudWebhookSimulation} disabled={transportBusy} className="rounded-xl bg-teal-400/20 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-teal-100 hover:bg-teal-400/30 disabled:opacity-40">Simulate</button>
              </div>
            </div>

            {/* Debug: connector state */}
            <div className="rounded-xl border border-white/10 bg-zinc-900/55 p-3 text-[10px] text-zinc-500 font-mono space-y-1">
              <div>connector: <span className="text-zinc-300">{connectorId}</span> | status: <span className="text-zinc-300">{selectedConnector ? getDisplayStatus(selectedConnector) : 'n/a'}</span> | live: <span className="text-zinc-300">{selectedConnector ? String(isConnectorLive(selectedConnector)) : 'n/a'}</span></div>
              <div>outbound_allowed: <span className="text-zinc-300">{String(outboundAllowed)}</span> | poll_available: <span className="text-zinc-300">{String(pollAvailable)}</span></div>
            </div>

            {/* Audit log */}
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-2">Connector Audit</div>
              {audit.length === 0 && <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-3 text-sm text-zinc-600">No activity yet.</div>}
              {audit.slice().reverse().slice(0, 10).map((entry) => (
                <div key={entry.id} className="rounded-xl border border-white/10 bg-zinc-900/55 px-3 py-2 text-[10px] text-zinc-500 font-mono">
                  {entry.connectorId} · {entry.action} · {new Date(entry.timestampMs).toLocaleTimeString()}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
