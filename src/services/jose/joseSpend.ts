// Paid models (phase 4): Claude or ChatGPT, used only when you allow it in
// Settings, Zero-Cost Mode is off, the connector is set up and you entered its
// prices. Every paid step asks first ("Spend money" is locked to ask), and a
// monthly cap stops spending past it. Settings: alphonso_settings.paidModels;
// the month's total: alphonso_jose_spend_v1.
// Design: docs/superpowers/specs/2026-10-23-jose-orchestration-redesign-design.md §2.10
import { isConnectorAuthenticated } from '../connectors/connectorAuth';

const SETTINGS_KEY = 'alphonso_settings';
const SPEND_KEY = 'alphonso_jose_spend_v1';

/**
 * The most a paid step may write, in tokens; also what its cost is estimated from. Models that
 * think before answering count the thinking too: 1,024 cut answers off (QA, 2026-10-31).
 */
export const PAID_MAX_OUTPUT_TOKENS = 4096;

/** Room in a paid step's estimate for what it is given besides its instruction (earlier steps' work). */
export const PAID_PROMPT_ALLOWANCE_CHARS = 4000;

export type PaidProvider = 'claude' | 'chatgpt' | 'openrouter';

export interface PaidModelSettings {
  allowed: boolean;
  provider: PaidProvider | null;
  model: string | null;
  inputPerMillionUsd: number | null;
  outputPerMillionUsd: number | null;
  monthlyCapUsd: number | null;
  /** Runway's price per second of video, entered by you (content factory phase 2b). */
  runwayPricePerSecondUsd: number | null;
  /** ElevenLabs' prices, entered by you (content factory phase 4b). */
  elevenLabsPricePer1kCharsUsd: number | null;
  elevenLabsPricePerEffectUsd: number | null;
}

const PROVIDER_NAMES: Record<PaidProvider, string> = { claude: 'Claude', chatgpt: 'ChatGPT', openrouter: 'OpenRouter' };

function readSettings(): Record<string, any> {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** A price or cap: a number of zero or more, or null when blank. */
function amount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function getPaidModelSettings(): PaidModelSettings {
  const raw = readSettings().paidModels || {};
  const provider = raw.provider === 'claude' || raw.provider === 'chatgpt' || raw.provider === 'openrouter' ? raw.provider : null;
  return {
    allowed: raw.allowed === true,
    provider,
    model: typeof raw.model === 'string' && raw.model.trim() ? raw.model.trim() : null,
    inputPerMillionUsd: amount(raw.inputPerMillionUsd),
    outputPerMillionUsd: amount(raw.outputPerMillionUsd),
    monthlyCapUsd: amount(raw.monthlyCapUsd),
    runwayPricePerSecondUsd: amount(raw.runwayPricePerSecondUsd),
    elevenLabsPricePer1kCharsUsd: amount(raw.elevenLabsPricePer1kCharsUsd),
    elevenLabsPricePerEffectUsd: amount(raw.elevenLabsPricePerEffectUsd),
  };
}

export function paidModelAvailable(): { ok: boolean; reason?: string } {
  const settings = getPaidModelSettings();
  if (!settings.allowed) return { ok: false, reason: 'Paid models are off in Settings.' };
  // Zero-Cost Mode counts as on unless it was turned off (same as the policy).
  if (readSettings().zeroCostMode !== false) return { ok: false, reason: 'Zero-Cost Mode is on.' };
  if (!settings.provider) return { ok: false, reason: 'Choose a paid model in Settings.' };
  if (!isConnectorAuthenticated(settings.provider).ok) return { ok: false, reason: `${PROVIDER_NAMES[settings.provider]} is not set up in Connectors.` };
  // OpenRouter has no model of its own to fall back on (2026-10-30).
  if (settings.provider === 'openrouter' && !settings.model) return { ok: false, reason: 'Choose an OpenRouter model in Settings.' };
  if (settings.inputPerMillionUsd === null || settings.outputPerMillionUsd === null) {
    return { ok: false, reason: 'Enter the prices for the paid model in Settings.' };
  }
  return { ok: true };
}

/** The model id a step uses: "claude:<model>", "chatgpt:<model>" ("" = the connector's own model) or "openrouter:<model>". */
export function paidModelId(): string | null {
  const settings = getPaidModelSettings();
  return settings.provider ? `${settings.provider}:${settings.model || ''}` : null;
}

function costOf(inputTokens: number, outputTokens: number): number {
  const settings = getPaidModelSettings();
  return (inputTokens * (settings.inputPerMillionUsd || 0) + outputTokens * (settings.outputPerMillionUsd || 0)) / 1_000_000;
}

/** About 4 characters per input token, at the prices you entered. */
export function estimateCostUsd(promptChars: number, maxOutputTokens: number): number {
  return costOf(Math.max(0, promptChars) / 4, Math.max(0, maxOutputTokens));
}

function monthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function monthSpendUsd(): number {
  try {
    const saved = JSON.parse(localStorage.getItem(SPEND_KEY) || '{}');
    return saved?.month === monthKey() && Number.isFinite(saved.totalUsd) ? saved.totalUsd : 0;
  } catch {
    return 0;
  }
}

/** Add a paid call's cost from its reported usage; returns this month's total. */
export function recordSpend(usage: { inputTokens: number; outputTokens: number }): number {
  const total = monthSpendUsd() + costOf(Number(usage.inputTokens) || 0, Number(usage.outputTokens) || 0);
  try { localStorage.setItem(SPEND_KEY, JSON.stringify({ month: monthKey(), totalUsd: total })); } catch { /* storage full */ }
  return total;
}

/** Add a paid call's known cost (a Runway clip); returns this month's total. */
export function recordSpendUsd(costUsd: number): number {
  const total = monthSpendUsd() + Math.max(0, Number(costUsd) || 0);
  try { localStorage.setItem(SPEND_KEY, JSON.stringify({ month: monthKey(), totalUsd: total })); } catch { /* storage full */ }
  return total;
}

const usd = (n: number) => `$${n.toFixed(2)}`;

/** ElevenLabs' cost for this many characters at your price, or null without a price (phase 4b). */
export function estimateElevenLabsUsd(characters: number): number | null {
  const price = getPaidModelSettings().elevenLabsPricePer1kCharsUsd;
  return price === null ? null : (Math.max(0, characters) / 1000) * price;
}

/** ElevenLabs' cost for this many sound effects at your price, or null without a price. */
export function estimateEffectsUsd(count: number): number | null {
  const price = getPaidModelSettings().elevenLabsPricePerEffectUsd;
  return price === null ? null : Math.max(0, count) * price;
}

export function canSpend(estimateUsd: number): { ok: boolean; reason?: string } {
  const cap = getPaidModelSettings().monthlyCapUsd;
  if (cap === null) return { ok: true };
  const spent = monthSpendUsd();
  if (spent + Math.max(0, estimateUsd) > cap) {
    return { ok: false, reason: `That would pass your monthly cap of ${usd(cap)} (${usd(spent)} spent this month).` };
  }
  return { ok: true };
}
