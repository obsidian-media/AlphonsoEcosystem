import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardCopy, MessageCircle, RadioTower, Smartphone } from 'lucide-react';
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
  proveTelegramConnectorPath,
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
  verifyConnectorEnvironment
} from '../services/connectorRegistryService';
import { getTelegramAutoPollState, runSingleTelegramPoll } from '../services/telegramAutoPollService';
import { saveConnectorCredential, getConnectorCredential } from '../services/connectors/connectorAuth';
import { verifyTelegramBotEnvironment } from '../services/telegramBrowserConnector';

function CredentialSection({ title, connectorId, borderColor, bgColor, labelColor, fields, onSave, hint }) {
  return (
    <div className={`mt-4 rounded-xl border ${borderColor} ${bgColor} p-4`}>
      <div className={`mb-3 text-[10px] font-bold uppercase tracking-widest ${labelColor}`}>{title}</div>
      <div className="grid grid-cols-1 gap-2">
        {fields.map((f) => (
          <div key={f.key} className="flex flex-col gap-1">
            <label className="text-[10px] text-zinc-400 uppercase tracking-wider">{f.label}</label>
            <input
              type={f.secret === false ? 'text' : 'password'}
              value={f.value || ''}
              onChange={(e) => f.onChange(e.target.value)}
              className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-white/20"
              placeholder={f.placeholder}
              autoComplete="off"
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        {hint && <p className="text-[10px] text-zinc-500 leading-relaxed flex-1">{hint}</p>}
        <button
          onClick={onSave}
          className={`rounded-xl px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-100 transition-colors ${bgColor.replace('/8', '/30')} hover:opacity-80 border ${borderColor} shrink-0`}
        >
          Save &amp; Enable
        </button>
      </div>
    </div>
  );
}

export function ConnectorSetupPanel() {
  const [connectors, setConnectors] = useState(() => listConnectors());
  const [audit, setAudit] = useState(() => listConnectorAudit());
  const [authProfiles, setAuthProfiles] = useState(() => listConnectorAuthProfiles());
  const [simulatedText, setSimulatedText] = useState('ask hector: find latest Tauri v2 docs');
  const [connectorId, setConnectorId] = useState('telegram');
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
  const [transportBusy, setTransportBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [autoPollState, setAutoPollState] = useState(() => getTelegramAutoPollState());
  const pollAvailable = ['telegram', 'whatsapp'].includes(connectorId);
  const [telegramBotToken, setTelegramBotToken] = useState(() => getConnectorCredential('telegram', 'TELEGRAM_BOT_TOKEN'));
  const [telegramChatIds, setTelegramChatIds] = useState(() => getConnectorCredential('telegram', 'TELEGRAM_ALLOWED_CHAT_IDS'));
  const [telegramBotVerified, setTelegramBotVerified] = useState(null);

  // API key credentials for all other connectors
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

  useEffect(() => {
    let cancelled = false;
    const probeAll = async () => {
      const ids = listConnectors().map((c) => c.id);
      for (const id of ids) {
        if (cancelled) break;
        try {
          await verifyConnectorEnvironment(id);
        } catch {
          // ignore individual probe failures
        }
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
    () => connectors.find((connector) => connector.id === connectorId) || null,
    [connectors, connectorId]
  );
  const selectedDisplayStatus = selectedConnector ? displayConnectorStatus(selectedConnector) : 'unknown';
  const outboundAllowed = Boolean(selectedConnector && isConnectorOutboundAllowed(selectedConnector, explicitApproval));
  const pollAllowed = Boolean(selectedConnector && isConnectorPollAllowed(selectedConnector));

  const selectedProfile = useMemo(() => authProfiles?.[connectorId] || { enabled: false, allowlist: [], mode: 'allowlist_required' }, [authProfiles, connectorId]);
  const setupChecklist = useMemo(() => buildConnectorSetupChecklist(connectors, authProfiles), [connectors, authProfiles]);

  const refresh = () => {
    setConnectors(listConnectors());
    setAudit(listConnectorAudit());
    setAuthProfiles(listConnectorAuthProfiles());
  };

  const copySetupChecklist = async () => {
    try {
      await navigator.clipboard.writeText(setupChecklist);
      setNotice('Connector setup checklist copied.');
    } catch {
      setNotice('Unable to copy checklist from this browser context.');
    }
  };

  const createRoute = () => {
    const result = createConnectorRoutePacket(connectorId, simulatedText, senderId);
    if (result?.rejected) {
      setNotice(`Route blocked: ${result.reason}`);
    } else {
      setNotice(result?.packet?.id ? `Route packet created: ${result.packet.id}` : 'No route packet was created.');
    }
    refresh();
  };

  const applyAllowlist = () => {
    const profile = updateConnectorAuthProfile(connectorId, {
      enabled: true,
      allowlist: authInput
    });
    setNotice(`Auth profile updated for ${connectorId}. Allowlist count: ${profile.allowlist.length}`);
    refresh();
  };

  const disableAuthProfile = () => {
    const profile = updateConnectorAuthProfile(connectorId, {
      enabled: false,
      allowlist: []
    });
    setNotice(`Auth profile disabled for ${connectorId}. Allowlist count: ${profile.allowlist.length}`);
    refresh();
  };

  const verifyEnv = async (id) => {
    const result = await verifyConnectorEnvironment(id);
    if (result?.error) {
      setNotice(`${id} env check failed: ${result.error}`);
    } else {
      setNotice(`${id} env check ${result?.ok ? 'passed' : 'failed'} (${result?.status}).`);
    }
    refresh();
  };

  const pollTelegram = async () => {
    if (!['telegram', 'whatsapp'].includes(connectorId)) {
      setNotice('Polling is currently available for Telegram and Twilio-based WhatsApp only.');
      return;
    }
    setTransportBusy(true);
    try {
      const result = connectorId === 'whatsapp'
        ? await pollWhatsAppConnector(20)
        : await pollTelegramConnector(20);
      if (result.error) {
        setNotice(`${connectorId} poll failed: ${result.error}`);
      } else {
        setNotice(`${connectorId} poll complete: ${result.count} inbound, ${result.routed} routed, ${result.rejected} rejected, Jose distributed ${result.joseDistributed || 0}, failures ${result.joseFailures || 0}.`);
      }
      refresh();
    } finally {
      setTransportBusy(false);
    }
  };

  const runAutoPoll = async () => {
    if (connectorId !== 'telegram') {
      setNotice('Auto-poll is only available for Telegram.');
      return;
    }
    setTransportBusy(true);
    try {
      const result = await runSingleTelegramPoll({ limit: 12 });
      setAutoPollState(getTelegramAutoPollState());
      if (result.ok) {
        setNotice(`Auto-poll complete: ${result.count} inbound, ${result.routed} routed, ${result.rejected} rejected.`);
      } else {
        setNotice(`Auto-poll failed: ${result.reason || 'unknown error'}.`);
      }
      refresh();
    } finally {
      setTransportBusy(false);
    }
  };

  const saveTelegramCredentials = () => {
    const token = telegramBotToken.trim();
    const chatIds = telegramChatIds.trim();
    if (!token) {
      setNotice('Bot token is required.');
      return;
    }
    saveConnectorCredential('telegram', 'TELEGRAM_BOT_TOKEN', token);
    saveConnectorCredential('telegram', 'TELEGRAM_ALLOWED_CHAT_IDS', chatIds);
    updateConnectorAuthProfile('telegram', { enabled: true, allowlist: chatIds.split(/[,\n]/).map((s) => s.trim()).filter(Boolean) });
    setTelegramBotVerified(null);
    setNotice('Telegram credentials saved. Click Verify Bot to test the connection.');
    refresh();
  };

  const saveConnectorApiKey = (connectorId, fields) => {
    let hasValue = false;
    for (const [key, value] of Object.entries(fields)) {
      const trimmed = String(value || '').trim();
      if (trimmed) {
        saveConnectorCredential(connectorId, key, trimmed);
        hasValue = true;
      }
    }
    if (hasValue) {
      updateConnectorAuthProfile(connectorId, { enabled: true });
      setNotice(`${connectorId} credentials saved and connector enabled.`);
    } else {
      setNotice(`No credentials provided for ${connectorId}.`);
    }
    refresh();
  };

  const verifyTelegramBot = async () => {
    const token = telegramBotToken.trim() || getConnectorCredential('telegram', 'TELEGRAM_BOT_TOKEN');
    if (!token) {
      setNotice('Enter a bot token first.');
      return;
    }
    setTransportBusy(true);
    try {
      const result = await verifyTelegramBotEnvironment({ botToken: token });
      setTelegramBotVerified(result);
      if (result.ok) {
        setNotice(`Telegram bot verified: @${result.botUsername}`);
      } else {
        setNotice(`Telegram bot verify failed: ${result.error}`);
      }
    } finally {
      setTransportBusy(false);
    }
  };

  const sendOutbound = async () => {
    const needsTarget = !['chatgpt', 'claude', 'qwen', 'youtube'].includes(connectorId);
    if ((needsTarget && !outboundTarget.trim()) || !outboundText.trim()) {
      setNotice(needsTarget ? 'Outbound target and message are required.' : 'Outbound message is required.');
      return;
    }

    setTransportBusy(true);
    try {
      let result = null;
      if (connectorId === 'telegram') {
        result = await sendTelegramConnectorMessage(outboundTarget.trim(), outboundText.trim(), {
          approved: explicitApproval
        });
      } else if (connectorId === 'whatsapp') {
        result = await sendWhatsAppConnectorMessage(outboundTarget.trim(), outboundText.trim(), {
          approved: explicitApproval
        });
      } else if (connectorId === 'chatgpt') {
        result = await sendChatGptConnectorMessage(outboundText.trim(), {
          approved: explicitApproval
        });
      } else if (connectorId === 'claude') {
        result = await sendClaudeConnectorMessage(outboundText.trim(), {
          approved: explicitApproval
        });
      } else if (connectorId === 'qwen') {
        result = await sendQwenConnectorMessage(outboundText.trim(), {
          approved: explicitApproval
        });
      } else if (connectorId === 'notion') {
        result = await sendNotionConnectorEntry({
          title: outboundText.trim().slice(0, 180),
          content: outboundText.trim(),
          parentPageId: outboundTarget.trim()
        }, {
          approved: explicitApproval
        });
      } else if (connectorId === 'clickup') {
        result = await sendClickUpConnectorTask({
          title: outboundText.trim().slice(0, 180),
          content: outboundText.trim(),
          listId: outboundTarget.trim()
        }, {
          approved: explicitApproval
        });
      } else if (connectorId === 'youtube') {
        result = await uploadYouTubeConnectorVideo({
          filePath: youtubeFilePath.trim(),
          title: youtubeTitle.trim(),
          description: youtubeDescription.trim(),
          tags: youtubeTags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean)
            .slice(0, 20),
          privacyStatus: youtubePrivacy
        }, {
          approved: explicitApproval
        });
      } else {
        setNotice('Outbound send is supported for Telegram, WhatsApp, YouTube, ChatGPT, Claude, Qwen, Notion, and ClickUp. Use Miya Studio for local media generation.');
        return;
      }

      if (result?.ok) {
        if (connectorId === 'youtube') {
          setNotice(`YouTube upload success. URL: ${result.url || 'returned without url'}`);
        } else if (connectorId === 'chatgpt') {
          setNotice(`ChatGPT connector success. Response id: ${result.externalId || 'n/a'}`);
        } else if (connectorId === 'claude') {
          setNotice(`Claude connector success. Response id: ${result.externalId || 'n/a'}`);
        } else if (connectorId === 'qwen') {
          setNotice(`Qwen connector success. Response id: ${result.externalId || 'n/a'}`);
        } else if (connectorId === 'notion') {
          setNotice(`Notion write success. Page id: ${result.externalId || 'n/a'}`);
        } else if (connectorId === 'clickup') {
          setNotice(`ClickUp task created. Task id: ${result.externalId || 'n/a'}`);
        } else {
          setNotice(`${connectorId} send success. External id: ${result.externalId || 'n/a'}`);
        }
      } else {
        if (result?.blocked) {
          setNotice(`${connectorId} action blocked by policy: ${result?.error || 'approval/zero-cost/auth gate'}`);
        } else {
          setNotice(`${connectorId} action failed: ${result?.error || 'unknown error'}`);
        }
      }
      refresh();
    } finally {
      setTransportBusy(false);
    }
  };

  const runTelegramLiveProof = async () => {
    if (connectorId !== 'telegram') {
      setNotice('Telegram live proof is only available when Telegram is the selected connector.');
      return;
    }
    if (!outboundTarget.trim()) {
      setNotice('Telegram live proof needs a chat id.');
      return;
    }
    setTransportBusy(true);
    try {
      const result = await proveTelegramConnectorPath(outboundTarget.trim(), outboundText.trim(), {
        approved: explicitApproval,
        requestedBy: 'jose'
      });
      if (result?.ok) {
        setNotice(`Telegram live proof success. External id: ${result.externalId || 'n/a'}.`);
      } else if (result?.blocked) {
        setNotice(`Telegram live proof blocked: ${result?.error || 'approval/env gate'}.`);
      } else {
        setNotice(`Telegram live proof failed: ${result?.error || 'unknown error'}.`);
      }
      refresh();
    } finally {
      setTransportBusy(false);
    }
  };

  const runWhatsAppCloudWebhookSimulation = async () => {
    setTransportBusy(true);
    try {
      let payload = {};
      try {
        payload = JSON.parse(cloudWebhookPayload);
      } catch {
        setNotice('Cloud webhook payload must be valid JSON.');
        return;
      }
      const challengeProof = await verifyWhatsAppCloudWebhookChallenge({
        mode: cloudWebhookMode,
        verifyToken: cloudWebhookVerifyToken,
        challenge: cloudWebhookChallenge
      });
      const signatureProof = await verifyWhatsAppCloudWebhookSignature({
        rawBody: JSON.stringify(payload),
        signatureHeader: cloudWebhookSignature
      });
      const routeProof = await simulateWhatsAppCloudInbound(payload);
      setNotice(
        `Cloud webhook simulation: challenge=${challengeProof?.ok ? 'ok' : 'fail'}, signature=${signatureProof?.ok ? 'ok' : 'fail'}, routed=${routeProof?.routedCount || 0}, rejected=${routeProof?.rejectedCount || 0}.`
      );
      refresh();
    } finally {
      setTransportBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-950/72 p-4">
      <div className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
        <RadioTower className="h-4 w-4 text-teal-300" />
        Connector Setup: Messaging, Publishing, Work Apps, Local Media
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-zinc-500">
        Status labels: configured, foundation_only, not_configured, invalid, unknown, setup_required. A connector is not live until env verification passes and last test is verified. setup_required is never shown as ready.
      </p>

      <div className="mb-4 rounded-xl border border-sky-300/15 bg-sky-500/10 p-3 text-[11px] text-sky-100/80">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-semibold text-sky-50">Setup checklist</div>
          <button
            onClick={copySetupChecklist}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-300/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-sky-100 hover:bg-sky-300/30"
          >
            <ClipboardCopy className="h-3.5 w-3.5" />
            Copy Setup Checklist
          </button>
        </div>
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-black/20 p-3 text-[10px] leading-relaxed text-sky-50/90">{setupChecklist}</pre>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
        {connectors.map((connector) => (
          <ConnectorCard
            key={connector.id}
            connector={connector}
            onStatus={(status) => {
              setConnectorStatus(connector.id, status, 'Manual status marker from setup panel.');
              refresh();
            }}
            onVerifyEnv={() => verifyEnv(connector.id)}
          />
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-amber-300/15 bg-amber-500/10 p-3 text-[11px] text-amber-100/80">
        External messaging remains supervised. Telegram live poll/send and WhatsApp official send are wired through Jose routing and connector audit logs. WhatsApp inbound polling is available for Twilio provider; Cloud API inbound still requires webhook wiring. YouTube upload, Notion, ClickUp, ChatGPT, Claude, and Qwen outbound actions are wired with env-based auth. Slack, Discord, and custom webhook connections are managed in the tool connection registry below. Miya Studio wires local SD WebUI and ComfyUI media connectors plus a backend-backed Runway cloud draft path. Risky external actions still require approval.
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[11rem_1fr_12rem]">
        <select value={connectorId} onChange={(event) => setConnectorId(event.target.value)} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100">
          {connectors.map((connector) => (
            <option key={`route-${connector.id}`} value={connector.id}>{connector.name}</option>
          ))}
        </select>
        <input value={simulatedText} onChange={(event) => setSimulatedText(event.target.value)} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" />
        <button onClick={createRoute} className="rounded-xl bg-teal-300 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-950 hover:bg-teal-200">
          Route To Jose
        </button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_2fr_auto_auto]">
        <input
          value={senderId}
          onChange={(event) => setSenderId(event.target.value)}
          className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          placeholder="Simulated sender id (must be allowlisted)"
        />
        <input
          value={authInput}
          onChange={(event) => setAuthInput(event.target.value)}
          className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          placeholder="Allowlist ids (comma or newline)"
        />
        <button onClick={applyAllowlist} className="rounded-xl bg-zinc-800 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-200 hover:bg-zinc-700">
          Save Allowlist
        </button>
        <button onClick={disableAuthProfile} className="rounded-xl bg-amber-500/15 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-amber-100 hover:bg-amber-500/20">
          Disable Auth
        </button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[10rem_1fr_1fr_auto_auto]">
        <select
          value={connectorId}
          onChange={(event) => setConnectorId(event.target.value)}
          className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
        >
          {connectors.map((connector) => (
            <option key={`outbound-${connector.id}`} value={connector.id}>{connector.name}</option>
          ))}
        </select>
        {connectorId === 'youtube' ? (
          <>
            <input
              value={youtubeFilePath}
              onChange={(event) => setYoutubeFilePath(event.target.value)}
              className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              placeholder="Local video file path"
            />
            <input
              value={youtubeTitle}
              onChange={(event) => setYoutubeTitle(event.target.value)}
              className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              placeholder="YouTube title"
            />
          </>
        ) : (
          <>
            <input
              value={outboundTarget}
              onChange={(event) => setOutboundTarget(event.target.value)}
              className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              placeholder={
                connectorId === 'telegram'
                  ? 'Telegram chat id'
                  : connectorId === 'whatsapp'
                    ? 'WhatsApp number (E.164)'
                    : connectorId === 'notion'
                      ? 'Notion parent page id (optional override)'
                      : connectorId === 'clickup'
                        ? 'ClickUp list id (optional override)'
                        : 'Target'
              }
            />
            <input
              value={outboundText}
              onChange={(event) => setOutboundText(event.target.value)}
              className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              placeholder="Outbound message"
            />
          </>
        )}
        <button
          onClick={pollTelegram}
          disabled={transportBusy || !pollAllowed}
          title={pollAllowed ? 'Poll inbound messages for the selected connector.' : 'Polling requires configured Telegram or WhatsApp env plus verified credentials.'}
          className="rounded-xl bg-zinc-800 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
        >
          {pollAvailable ? (connectorId === 'whatsapp' ? 'Poll WhatsApp' : 'Poll Telegram') : 'Polling N/A'}
        </button>
        <button
          onClick={sendOutbound}
          disabled={transportBusy || !outboundAllowed}
          title={outboundAllowed ? 'Send/upload with explicit approval.' : 'Blocked until connector is configured, env-verified, and approval checkbox is checked.'}
          className="rounded-xl bg-indigo-500/20 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-indigo-100 hover:bg-indigo-500/30 disabled:opacity-50"
        >
          {connectorId === 'youtube' ? 'Upload Video' : 'Send Outbound'}
        </button>
        {connectorId === 'telegram' && (
          <button
            onClick={runTelegramLiveProof}
            disabled={transportBusy}
            title="Runs a real Telegram send proof when env, approval, and chat id are present."
            className="rounded-xl bg-emerald-500/20 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-emerald-100 hover:bg-emerald-500/30 disabled:opacity-50"
          >
            Telegram Live Proof
          </button>
        )}
        {connectorId === 'telegram' && (
          <button
            onClick={runAutoPoll}
            disabled={transportBusy}
            title="Run a single auto-poll cycle with state tracking and error counting."
            className="rounded-xl bg-cyan-500/20 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-cyan-100 hover:bg-cyan-500/30 disabled:opacity-50"
          >
            Auto-Poll {autoPollState.errors > 0 ? `(${autoPollState.errors} errors)` : ''}
          </button>
        )}
      </div>

      {connectorId === 'youtube' && (
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr_10rem]">
          <input
            value={youtubeDescription}
            onChange={(event) => setYoutubeDescription(event.target.value)}
            className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            placeholder="Description (optional)"
          />
          <input
            value={youtubeTags}
            onChange={(event) => setYoutubeTags(event.target.value)}
            className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            placeholder="Tags comma-separated (optional)"
          />
          <select
            value={youtubePrivacy}
            onChange={(event) => setYoutubePrivacy(event.target.value)}
            className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          >
            <option value="private">private</option>
            <option value="unlisted">unlisted</option>
            <option value="public">public</option>
          </select>
        </div>
      )}

      {connectorId === 'telegram' && (
        <div className="mt-4 rounded-xl border border-cyan-300/20 bg-cyan-500/8 p-4">
          <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-cyan-200/80">
            Telegram Bot Credentials
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr_auto_auto]">
            <input
              type="password"
              value={telegramBotToken}
              onChange={(event) => setTelegramBotToken(event.target.value)}
              className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              placeholder="Bot token from @BotFather"
              autoComplete="off"
            />
            <input
              type="text"
              value={telegramChatIds}
              onChange={(event) => setTelegramChatIds(event.target.value)}
              className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              placeholder="Allowed chat IDs (comma-separated)"
            />
            <button
              onClick={saveTelegramCredentials}
              className="rounded-xl bg-cyan-500/20 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-cyan-100 hover:bg-cyan-500/30"
            >
              Save &amp; Enable
            </button>
            <button
              onClick={verifyTelegramBot}
              disabled={transportBusy}
              className="rounded-xl bg-emerald-500/20 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-emerald-100 hover:bg-emerald-500/30 disabled:opacity-50"
            >
              Verify Bot
            </button>
          </div>
          {telegramBotVerified !== null && (
            <div className={`mt-2 text-[11px] ${telegramBotVerified.ok ? 'text-emerald-300' : 'text-red-400'}`}>
              {telegramBotVerified.ok ? `Connected: @${telegramBotVerified.botUsername}` : `Error: ${telegramBotVerified.error}`}
            </div>
          )}
          <p className="mt-2 text-[10px] text-zinc-500">
            Commands: /start /help /status /ask &lt;text&gt; — token is stored in localStorage + SQLite, never committed to git.
          </p>
        </div>
      )}

      <div className="mt-3 rounded-xl border border-white/10 bg-zinc-900/55 p-3 text-[11px] text-zinc-400">
        <div>
          Selected connector <span className="font-mono text-zinc-200">{connectorId}</span>: display status{' '}
          <span className="font-semibold text-zinc-200">{selectedDisplayStatus}</span>
          {' '}| registry status <span className="font-mono text-zinc-300">{selectedConnector?.status || 'unknown'}</span>
        </div>
        <div className="mt-1">
          Auth: enabled={String(Boolean(selectedProfile.enabled))}, allowlist={selectedProfile.allowlist?.length || 0}
          {' '}| last test: {selectedConnector?.lastTestStatus || 'not run'}
          {' '}| external live: {isConnectorLive(selectedConnector) ? 'yes (env verified)' : 'no'}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-300/15 bg-amber-500/10 p-3 text-[11px] text-amber-100/85">
        <input
          id="connector-approval-toggle"
          type="checkbox"
          checked={explicitApproval}
          onChange={(event) => setExplicitApproval(event.target.checked)}
          className="h-3.5 w-3.5 accent-amber-300"
        />
        <label htmlFor="connector-approval-toggle" className="cursor-pointer">
          I explicitly approve risky external action for this send/upload attempt.
        </label>
      </div>

      <div className="mt-4 rounded-xl border border-teal-300/15 bg-zinc-900/55 p-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-teal-200/75">
          WhatsApp Cloud Webhook Simulation (Setup-Required Path)
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <input
            value={cloudWebhookMode}
            onChange={(event) => setCloudWebhookMode(event.target.value)}
            className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            placeholder="hub.mode"
          />
          <input
            value={cloudWebhookVerifyToken}
            onChange={(event) => setCloudWebhookVerifyToken(event.target.value)}
            className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            placeholder="hub.verify_token"
          />
          <input
            value={cloudWebhookChallenge}
            onChange={(event) => setCloudWebhookChallenge(event.target.value)}
            className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            placeholder="hub.challenge"
          />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_20rem_auto]">
          <textarea
            value={cloudWebhookPayload}
            onChange={(event) => setCloudWebhookPayload(event.target.value)}
            rows={5}
            className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            placeholder="WhatsApp Cloud webhook JSON payload"
          />
          <input
            value={cloudWebhookSignature}
            onChange={(event) => setCloudWebhookSignature(event.target.value)}
            className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            placeholder="X-Hub-Signature-256 header"
          />
          <button
            onClick={runWhatsAppCloudWebhookSimulation}
            disabled={transportBusy}
            className="rounded-xl bg-teal-400/20 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-teal-100 hover:bg-teal-400/30 disabled:opacity-50"
          >
            Simulate Cloud Inbound
          </button>
        </div>
        <p className="mt-2 text-[11px] text-zinc-500">
          This verifies challenge/signature logic and inbound normalization locally. Public webhook hosting and live Meta callback delivery remain setup-required.
        </p>
      </div>

      {/* ── API Key Credential Sections ── */}
      <CredentialSection
        title="GitHub Credentials"
        connectorId="github"
        borderColor="border-violet-300/20"
        bgColor="bg-violet-500/8"
        labelColor="text-violet-200/80"
        fields={[
          { label: 'Personal Access Token', placeholder: 'ghp_...', value: githubToken, onChange: setGithubToken, key: 'GITHUB_TOKEN' }
        ]}
        onSave={() => saveConnectorApiKey('github', { GITHUB_TOKEN: githubToken })}
        hint="Generate at github.com/settings/tokens — needs repo, workflow scopes for Marcus release actions."
      />

      <CredentialSection
        title="Slack Credentials"
        connectorId="slack"
        borderColor="border-green-300/20"
        bgColor="bg-green-500/8"
        labelColor="text-green-200/80"
        fields={[
          { label: 'Bot Token', placeholder: 'xoxb-...', value: slackBotToken, onChange: setSlackBotToken, key: 'SLACK_BOT_TOKEN' }
        ]}
        onSave={() => saveConnectorApiKey('slack', { SLACK_BOT_TOKEN: slackBotToken })}
        hint="Create a Slack app at api.slack.com, add chat:write scope, install to workspace, copy Bot User OAuth Token."
      />

      <CredentialSection
        title="Claude (Anthropic) Credentials"
        connectorId="claude"
        borderColor="border-orange-300/20"
        bgColor="bg-orange-500/8"
        labelColor="text-orange-200/80"
        fields={[
          { label: 'Anthropic API Key', placeholder: 'sk-ant-...', value: anthropicApiKey, onChange: setAnthropicApiKey, key: 'ANTHROPIC_API_KEY' }
        ]}
        onSave={() => saveConnectorApiKey('claude', { ANTHROPIC_API_KEY: anthropicApiKey })}
        hint="Get your key at console.anthropic.com/settings/keys. Stored locally, never sent to any server except Anthropic."
      />

      <CredentialSection
        title="ChatGPT (OpenAI) Credentials"
        connectorId="chatgpt"
        borderColor="border-teal-300/20"
        bgColor="bg-teal-500/8"
        labelColor="text-teal-200/80"
        fields={[
          { label: 'OpenAI API Key', placeholder: 'sk-...', value: openaiApiKey, onChange: setOpenaiApiKey, key: 'OPENAI_API_KEY' }
        ]}
        onSave={() => saveConnectorApiKey('chatgpt', { OPENAI_API_KEY: openaiApiKey })}
        hint="Get your key at platform.openai.com/api-keys. Stored locally, never sent to any server except OpenAI."
      />

      <CredentialSection
        title="Notion Credentials"
        connectorId="notion"
        borderColor="border-pink-300/20"
        bgColor="bg-pink-500/8"
        labelColor="text-pink-200/80"
        fields={[
          { label: 'Integration API Key', placeholder: 'secret_...', value: notionApiKey, onChange: setNotionApiKey, key: 'NOTION_API_KEY' },
          { label: 'Parent Page ID (optional)', placeholder: 'Page UUID from Notion URL', value: notionParentPageId, onChange: setNotionParentPageId, key: 'NOTION_PARENT_PAGE_ID', secret: false }
        ]}
        onSave={() => saveConnectorApiKey('notion', { NOTION_API_KEY: notionApiKey, NOTION_PARENT_PAGE_ID: notionParentPageId })}
        hint="Create an integration at notion.so/my-integrations. Share the target page with your integration. Copy the integration secret."
      />

      <CredentialSection
        title="ClickUp Credentials"
        connectorId="clickup"
        borderColor="border-purple-300/20"
        bgColor="bg-purple-500/8"
        labelColor="text-purple-200/80"
        fields={[
          { label: 'API Key', placeholder: 'pk_...', value: clickupApiKey, onChange: setClickupApiKey, key: 'CLICKUP_API_KEY' },
          { label: 'List ID (optional default)', placeholder: 'ClickUp list ID', value: clickupListId, onChange: setClickupListId, key: 'CLICKUP_LIST_ID', secret: false }
        ]}
        onSave={() => saveConnectorApiKey('clickup', { CLICKUP_API_KEY: clickupApiKey, CLICKUP_LIST_ID: clickupListId })}
        hint="Get your API key at app.clickup.com/settings. The List ID can be found in the list URL."
      />

      <CredentialSection
        title="WhatsApp Cloud Credentials"
        connectorId="whatsapp"
        borderColor="border-emerald-300/20"
        bgColor="bg-emerald-500/8"
        labelColor="text-emerald-200/80"
        fields={[
          { label: 'Access Token', placeholder: 'EAA...', value: whatsappAccessToken, onChange: setWhatsappAccessToken, key: 'WHATSAPP_ACCESS_TOKEN' },
          { label: 'Phone Number ID', placeholder: 'From Meta Business dashboard', value: whatsappPhoneNumberId, onChange: setWhatsappPhoneNumberId, key: 'WHATSAPP_PHONE_NUMBER_ID', secret: false },
          { label: 'Webhook Verify Token', placeholder: 'Your custom verify token', value: whatsappVerifyToken, onChange: setWhatsappVerifyToken, key: 'WHATSAPP_VERIFY_TOKEN', secret: false }
        ]}
        onSave={() => saveConnectorApiKey('whatsapp', { WHATSAPP_ACCESS_TOKEN: whatsappAccessToken, WHATSAPP_PHONE_NUMBER_ID: whatsappPhoneNumberId, WHATSAPP_VERIFY_TOKEN: whatsappVerifyToken })}
        hint="Get credentials from Meta Business Suite → WhatsApp → API Setup. The verify token is a string you choose."
      />

      <CredentialSection
        title="YouTube OAuth Credentials"
        connectorId="youtube"
        borderColor="border-red-300/20"
        bgColor="bg-red-500/8"
        labelColor="text-red-200/80"
        fields={[
          { label: 'Client ID', placeholder: 'From Google Cloud Console', value: youtubeClientId, onChange: setYoutubeClientId, key: 'YOUTUBE_CLIENT_ID', secret: false },
          { label: 'Client Secret', placeholder: 'From Google Cloud Console', value: youtubeClientSecret, onChange: setYoutubeClientSecret, key: 'YOUTUBE_CLIENT_SECRET' },
          { label: 'Refresh Token', placeholder: 'Run npm run auth:youtube to generate', value: youtubeRefreshToken, onChange: setYoutubeRefreshToken, key: 'YOUTUBE_REFRESH_TOKEN' },
          { label: 'Channel ID', placeholder: 'UC...', value: youtubeChannelId, onChange: setYoutubeChannelId, key: 'YOUTUBE_CHANNEL_ID', secret: false }
        ]}
        onSave={() => saveConnectorApiKey('youtube', { YOUTUBE_CLIENT_ID: youtubeClientId, YOUTUBE_CLIENT_SECRET: youtubeClientSecret, YOUTUBE_REFRESH_TOKEN: youtubeRefreshToken, YOUTUBE_CHANNEL_ID: youtubeChannelId })}
        hint="Create OAuth credentials in Google Cloud Console (YouTube Data API v3). Run npm run auth:youtube in terminal to get your refresh token."
      />

      <CredentialSection
        title="Qwen (DashScope) Credentials"
        connectorId="qwen"
        borderColor="border-yellow-300/20"
        bgColor="bg-yellow-500/8"
        labelColor="text-yellow-200/80"
        fields={[
          { label: 'DashScope API Key', placeholder: 'sk-...', value: qwenApiKey, onChange: setQwenApiKey, key: 'DASHSCOPE_API_KEY' }
        ]}
        onSave={() => saveConnectorApiKey('qwen', { DASHSCOPE_API_KEY: qwenApiKey })}
        hint="Get your key at dashscope.aliyuncs.com. Uses the international endpoint by default."
      />

      <div className="mt-4">
        <ToolConnectionsPanel />
      </div>

      {notice && (
        <div className="mt-3 rounded-xl border border-teal-300/15 bg-teal-500/10 p-3 text-[11px] text-teal-100/80">
          {notice}
        </div>
      )}

      <div className="mt-4 space-y-2 max-h-48 overflow-y-auto pr-1">
        {audit.length === 0 && <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-3 text-sm text-zinc-500">No connector audit entries yet.</div>}
        {audit.slice().reverse().slice(0, 10).map((entry) => (
          <div key={entry.id} className="rounded-xl border border-white/10 bg-zinc-900/55 p-3 text-[11px] text-zinc-400">
            {entry.connectorId} | {entry.action} | {new Date(entry.timestampMs).toLocaleString()}
          </div>
        ))}
      </div>
    </section>
  );
}

function ConnectorCard({ connector, onStatus, onVerifyEnv }) {
  const Icon = connector.id === 'mobile_bridge' ? Smartphone : MessageCircle;
  const displayStatus = displayConnectorStatus(connector);
  const live = isConnectorLive(connector);
  return (
    <div className={`rounded-xl border p-3 ${connectorShellClass(displayStatus)}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Icon className="h-4 w-4 text-teal-300" />
            {connector.name}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">{connector.transport}</div>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${connectorBadgeClass(displayStatus)}`}>
          {displayStatus}
        </span>
      </div>
      <div className="mt-2 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
        Registry: {connector.status || 'unknown'} | Live: {live ? 'yes' : 'no'}
      </div>
      <div className="mt-3 text-[11px] text-zinc-500">{connector.disabledReason}</div>
      <div className="mt-3 text-[10px] font-bold uppercase tracking-widest text-zinc-600">Required env</div>
      <div className="mt-1 space-y-1">
        {(connector.requiredEnv || []).length === 0 ? (
          <div className="text-[11px] text-zinc-500">No credentials defined yet.</div>
        ) : connector.requiredEnv.map((name) => {
          const present = Boolean(connector.envPresence?.[name]);
          return (
            <div key={name} className="flex items-center justify-between rounded bg-black/20 px-2 py-1 font-mono text-[10px] text-zinc-400">
              <span>{name}</span>
              <span className={present ? 'text-emerald-300' : 'text-zinc-600'}>{present ? 'present' : 'missing'}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-[11px] text-zinc-500">
        Health check: {connector.lastTestStatus || 'not run'}
        {connector.lastTestAtMs ? ` (${new Date(connector.lastTestAtMs).toLocaleString()})` : ''}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => onStatus('not_configured')} className="rounded bg-zinc-800 px-2 py-1 text-[10px] text-zinc-300">Mark not_configured</button>
        <button onClick={() => onStatus('disabled_safe')} className="rounded bg-amber-500/15 px-2 py-1 text-[10px] text-amber-200">Mark disabled_safe</button>
        <button onClick={() => onStatus('foundation_only')} className="rounded bg-slate-500/15 px-2 py-1 text-[10px] text-slate-200">Mark foundation_only</button>
        <button onClick={onVerifyEnv} className="rounded bg-indigo-500/15 px-2 py-1 text-[10px] text-indigo-200">Verify env (local)</button>
      </div>
    </div>
  );
}

function displayConnectorStatus(connector) {
  const status = String(connector?.status || 'unknown').trim().toLowerCase();
  const requiredEnv = Array.isArray(connector?.requiredEnv) ? connector.requiredEnv : [];
  const envMissing = requiredEnv.length > 0 && requiredEnv.some((name) => !connector?.envPresence?.[name]);
  if (status === 'foundation_only') {
    return 'foundation_only';
  }
  if (status === 'disabled_safe') {
    return 'setup_required';
  }
  if (status === 'configured' && envMissing) {
    return 'invalid';
  }
  if (status === 'configured' && connector?.lastTestStatus && connector.lastTestStatus !== 'verified') {
    return 'setup_required';
  }
  if (['configured', 'not_configured', 'invalid', 'unknown', 'setup_required'].includes(status)) {
    return status;
  }
  return 'unknown';
}

function isConnectorLive(connector) {
  if (!connector) return false;
  return displayConnectorStatus(connector) === 'configured' && connector.lastTestStatus === 'verified';
}

function isConnectorOutboundAllowed(connector, explicitApproval) {
  if (!connector || !explicitApproval) return false;
  if (['mobile_bridge', 'sd_webui', 'comfyui_video'].includes(connector.id)) return false;
  return displayConnectorStatus(connector) === 'configured';
}

function isConnectorPollAllowed(connector) {
  if (!connector) return false;
  if (!['telegram', 'whatsapp'].includes(connector.id)) return false;
  return displayConnectorStatus(connector) === 'configured';
}

function connectorShellClass(displayStatus) {
  if (displayStatus === 'configured') return 'border-emerald-300/25 bg-emerald-500/5';
  if (displayStatus === 'foundation_only') return 'border-slate-300/25 bg-slate-500/5';
  if (displayStatus === 'setup_required' || displayStatus === 'not_configured') return 'border-indigo-300/25 bg-indigo-500/5';
  if (displayStatus === 'invalid' || displayStatus === 'unknown') return 'border-amber-300/25 bg-amber-500/5';
  return 'border-white/10 bg-zinc-900/55';
}

function connectorBadgeClass(displayStatus) {
  if (displayStatus === 'configured') return 'border-emerald-300/20 bg-emerald-500/10 text-emerald-200';
  if (displayStatus === 'foundation_only') return 'border-slate-300/20 bg-slate-500/10 text-slate-200';
  if (displayStatus === 'setup_required' || displayStatus === 'not_configured') return 'border-indigo-300/20 bg-indigo-500/10 text-indigo-200';
  if (displayStatus === 'invalid') return 'border-amber-300/20 bg-amber-500/10 text-amber-200';
  return 'border-zinc-300/20 bg-zinc-500/10 text-zinc-200';
}

function buildConnectorSetupChecklist(connectors = [], authProfiles = {}) {
  const lines = [
    'ALPHONSO CONNECTOR SETUP CHECKLIST',
    '',
    'Truth rule: no connector is live until env verification passes, allowlist/auth is configured, and the last test is verified.',
    ''
  ];

  connectors.forEach((connector) => {
    const auth = authProfiles?.[connector.id] || { enabled: false, allowlist: [], mode: 'allowlist_required' };
    const env = Array.isArray(connector.requiredEnv) && connector.requiredEnv.length > 0
      ? connector.requiredEnv.join(', ')
      : 'none';
    const allowlist = Array.isArray(auth.allowlist) ? auth.allowlist.length : 0;
    lines.push(`- ${connector.name}`);
    lines.push(`  status: ${connector.status || 'unknown'}`);
    lines.push(`  required env: ${env}`);
    lines.push(`  allowlist: ${connector.id === 'mobile_bridge' || connector.id === 'sd_webui' || connector.id === 'comfyui_video' ? 'local-only / foundation-only' : `${allowlist} entries (${auth.enabled ? 'enabled' : 'disabled'})`}`);
    lines.push(`  next step: verify env, then run the connector test action with explicit approval if it sends or uploads externally.`);
    lines.push('');
  });

  lines.push('- Slack / Discord / Custom webhook connections');
  lines.push('  configure via Tool Connections panel with a webhook URL, label, message prefix, and optional payload template.');
  lines.push('  keep active=false until the URL is validated and a supervised test send succeeds.');
  lines.push('');
  lines.push('- WhatsApp Cloud inbound');
  lines.push('  hosted webhook + verify token + signature verification remain setup_required until deployed.');
  lines.push('');
  lines.push('- Local SD WebUI / ComfyUI');
  lines.push('  point at the local runtime endpoint and verify reachability before relying on the connector.');
  return lines.join('\n').trim();
}
