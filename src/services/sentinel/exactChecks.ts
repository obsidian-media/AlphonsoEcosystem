// Sentinel's exact checks (agent phase 4, owner 2026-10-25: "his model, plus exact checks").
// These are facts handed to his model and always listed in his answer, never a score:
// a key-shaped string, a request for a password, a disguised link, a link not on your trusted
// list (only for text being sent), a command that deletes or runs code.
import { deletesThings, isWorkspaceCodeExecuting } from '../commandApprovalService';
import { isTrustedDomain } from './sentinelTrust';

export type ExactRiskKind = 'key' | 'password_request' | 'disguised_link' | 'untrusted_link' | 'deleting_command' | 'code_command' | 'personal_data';
export interface ExactRisk { kind: ExactRiskKind; where: string; detail: string }

// Key-shaped strings. The value is hidden; only its last four characters are shown.
const KEY_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{12,}/g,
  /\bntn_[A-Za-z0-9_-]{12,}/g,
  /\bghp_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bxox[abps]-[A-Za-z0-9-]{10,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /(?<=\bBearer\s+)[A-Za-z0-9._-]{12,}/g,
];
// NAME=value / NAME: value where NAME says it's a secret: the value is the key.
const ASSIGNED_SECRET = /(\b[A-Za-z0-9_]*(?:API|TOKEN|SECRET|PASSWORD|PASSWD|KEY)[A-Za-z0-9_]*\s*[:=]\s*)([^\s,;"'`]{4,})/gi;
const PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g;

const ends = (value: string) => `[hidden key, ends …${value.slice(-4)}]`;

function keyHits(text: string): Array<{ start: number; end: number; hidden: string }> {
  const hits: Array<{ start: number; end: number; hidden: string }> = [];
  for (const m of text.matchAll(PRIVATE_KEY)) hits.push({ start: m.index!, end: m.index! + m[0].length, hidden: '[hidden private key]' });
  for (const pattern of KEY_PATTERNS) {
    for (const m of text.matchAll(pattern)) hits.push({ start: m.index!, end: m.index! + m[0].length, hidden: ends(m[0]) });
  }
  for (const m of text.matchAll(ASSIGNED_SECRET)) {
    const start = m.index! + m[1].length;
    hits.push({ start, end: start + m[2].length, hidden: ends(m[2]) });
  }
  // Keep the outermost of overlapping hits.
  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: typeof hits = [];
  for (const h of hits) if (!kept.length || h.start >= kept[kept.length - 1].end) kept.push(h);
  return kept;
}

/** Every key replaced with "[hidden key, ends …XXXX]", for prompts, memory and receipts. */
export function redactText(text: string): string {
  const source = String(text || '');
  let out = '';
  let at = 0;
  for (const h of keyHits(source)) {
    out += source.slice(at, h.start) + h.hidden;
    at = h.end;
  }
  return out + source.slice(at);
}

const LOGIN_WORDS = /(log-?in|sign-?in|signin|verify|verification|account|password|secure|bank|wallet|pay)/i;
const DIGIT_FOR_LETTER = /[a-z][013458](?=[a-z-]|$)|[a-z](?:[013458])$/i;

function hostOf(url: string): string | null {
  try { return new URL(url).hostname.toLowerCase(); } catch { return null; }
}

/** Why a link looks disguised, or null. */
export function checkLink(url: string): ExactRisk | null {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return null; }
  const host = parsed.hostname.toLowerCase();
  const reasons: string[] = [];
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) reasons.push('a bare IP address instead of a site name');
  if (host.split('.').some((label) => label.startsWith('xn--'))) reasons.push('an international name that can imitate another site (punycode)');
  const labels = host.split('.').slice(0, -1);
  const asksLogin = LOGIN_WORDS.test(host) || LOGIN_WORDS.test(parsed.pathname);
  if (asksLogin && labels.some((label) => DIGIT_FOR_LETTER.test(label))) reasons.push('digits in place of letters in a site asking you to log in');
  if (parsed.protocol === 'http:' && asksLogin) reasons.push('a login or payment page over http (not encrypted)');
  return reasons.length ? { kind: 'disguised_link', where: url, detail: reasons.join('; ') } : null;
}

const LINK = /https?:\/\/[^\s<>"'`)\]]+/g;
const SHOWN_LINK = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|<a\s[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([^<]+)<\/a>/gi;
const PASSWORD_ASK = /\b(?:enter|type|send|give|share|provide|confirm|submit|reply with|log ?in with|sign ?in with|with)\b[^.!?\n]{0,40}\b(password|passcode|login code|verification code|one[- ]time code|card number|cvv|security code)\b/i;
const COMMAND = /`([^`\n]+)`|^\s*\$\s+(.+)$/gm;
const CODE_PROGRAMS = new Set(['npm', 'yarn', 'pnpm', 'npx', 'node', 'python', 'python3', 'py', 'pip', 'pip3', 'cargo', 'bash', 'sh', 'zsh', 'powershell', 'pwsh', 'cmd', 'curl', 'wget']);
const DELETE_PROGRAMS = new Set(['rm', 'del', 'rmdir', 'rd', 'format']);

// Personal data (agent roles Part C2): private details about people, for Sentinel's personal-data check.
// Work details people publish themselves (a company address, a work email) are not flagged.
const FREE_MAIL = /@(gmail\.com|googlemail\.com|yahoo\.[a-z.]+|hotmail\.[a-z.]+|outlook\.com|live\.com|icloud\.com|me\.com|proton\.me|protonmail\.[a-z.]+|gmx\.[a-z.]+|aol\.com|mail\.ru)$/i;
const EMAIL = /\b[\w.+-]+@(?:[\w-]+\.)+[a-z]{2,}\b/gi;
const PHONE = /(?<![\w+])(?:\+\d{1,3}[\s.-]?)?(?:\(\d{1,4}\)[\s.-]?)?\d{2,6}(?:[\s.-]\d{2,6}){1,4}(?!\w)/g;
const ADDRESS = /\b\d{1,5}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Boulevard|Blvd)\b/g;
const ID_NUMBER = /\b\d{9,}\b/g;

function personalData(text: string): ExactRisk[] {
  const found: ExactRisk[] = [];
  for (const m of text.matchAll(EMAIL)) {
    if (FREE_MAIL.test(m[0])) found.push({ kind: 'personal_data', where: m[0], detail: 'a personal email' });
  }
  const phones = new Set<string>();
  for (const m of text.matchAll(PHONE)) {
    const value = m[0].trim();
    const digits = value.replace(/\D/g, '').length;
    // A phone number has a + , brackets or a space between its groups; dates and versions don't count.
    if (digits < 7 || digits > 15 || !/[+(\s]/.test(value) || /^\d{4}-\d{2}-\d{2}$/.test(value)) continue;
    phones.add(value);
    found.push({ kind: 'personal_data', where: value, detail: 'a private phone number' });
  }
  for (const m of text.matchAll(ADDRESS)) found.push({ kind: 'personal_data', where: m[0], detail: 'a home address' });
  for (const m of text.matchAll(ID_NUMBER)) {
    if ([...phones].some((p) => p.replace(/\D/g, '').includes(m[0]))) continue;
    found.push({ kind: 'personal_data', where: m[0], detail: 'an ID number' });
  }
  return found;
}

/** The facts in a text. `links: 'sent'` also lists links not on your trusted list; `personalData` adds private details. */
export function findExactRisks(text: string, opts: { trustedDomains?: string[]; links?: 'all' | 'sent'; personalData?: boolean } = {}): ExactRisk[] {
  const source = String(text || '');
  const risks: ExactRisk[] = [];
  for (const h of keyHits(source)) risks.push({ kind: 'key', where: h.hidden, detail: 'a key or password written in the text' });
  // A key already hidden (every step's request is, agent phase 4) is still a key in the text.
  for (const m of source.matchAll(/\[hidden (?:private )?key(?:, ends …[^\]]{1,8})?\]/g)) {
    risks.push({ kind: 'key', where: m[0], detail: 'a key or password written in the text' });
  }
  const ask = source.match(PASSWORD_ASK);
  if (ask) risks.push({ kind: 'password_request', where: ask[0].trim(), detail: `asks for a ${ask[1].toLowerCase()}` });
  const seen = new Set<string>();
  for (const m of source.matchAll(SHOWN_LINK)) {
    const shown = (m[1] || m[4] || '').trim();
    const href = m[2] || m[3];
    const shownHost = hostOf(/^https?:\/\//i.test(shown) ? shown : `https://${shown}`);
    const realHost = hostOf(href);
    if (shownHost && realHost && /\./.test(shown) && !/\s/.test(shown) && shownHost.replace(/^www\./, '') !== realHost.replace(/^www\./, '')) {
      risks.push({ kind: 'disguised_link', where: href, detail: `the link shows ${shownHost} but goes to ${realHost}` });
      seen.add(href);
    }
  }
  for (const m of source.matchAll(LINK)) {
    const url = m[0].replace(/[.,;:!?]+$/, '');
    if (seen.has(url)) continue;
    seen.add(url);
    const disguised = checkLink(url);
    if (disguised) { risks.push(disguised); continue; }
    if (opts.links === 'sent') {
      const host = hostOf(url);
      const trusted = opts.trustedDomains
        ? Boolean(host && opts.trustedDomains.some((d) => host === d || host.endsWith(`.${d}`)))
        : Boolean(host && isTrustedDomain(host));
      if (host && !trusted) risks.push({ kind: 'untrusted_link', where: url, detail: `${host} isn't on your trusted list` });
    }
  }
  for (const m of source.matchAll(COMMAND)) {
    const line = (m[1] || m[2] || '').trim();
    const [rawProgram, ...args] = line.split(/\s+/);
    const program = String(rawProgram || '').toLowerCase().replace(/\.(exe|cmd)$/, '');
    if (DELETE_PROGRAMS.has(program) || deletesThings(program, args)) {
      risks.push({ kind: 'deleting_command', where: line, detail: 'a command that deletes things' });
    } else if (CODE_PROGRAMS.has(program) && (isWorkspaceCodeExecuting(program, args) || !['npm', 'yarn', 'pnpm', 'cargo', 'pip', 'pip3'].includes(program))) {
      risks.push({ kind: 'code_command', where: line, detail: 'a command that runs code' });
    }
  }
  if (opts.personalData) risks.push(...personalData(source));
  return risks;
}

const LABELS: Record<ExactRiskKind, string> = {
  key: 'A key or password is written in the text',
  password_request: 'It asks for a password or payment details',
  disguised_link: 'A link looks disguised',
  untrusted_link: "A link goes to a site you haven't marked trusted",
  deleting_command: 'A command deletes things',
  code_command: 'A command runs code',
  personal_data: 'It holds private details about a person',
};

/** One fact in plain words: "<label>: <where> (<detail>)". */
export function exactRiskText(r: ExactRisk): string {
  return `${LABELS[r.kind]}: ${r.where} (${r.detail})`;
}
