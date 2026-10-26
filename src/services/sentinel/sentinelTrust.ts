// The domains you trust (agent phase 4, owner 2026-10-25: Sentinel uses the allowlist panel).
// Stored where the Sentinel allowlist panel always kept them; nothing else is trusted.
import { randomHex } from '../../lib/randomId';

export const ALLOWLIST_KEY = 'alphonso_sentinel_allowlist_v1';

export interface AllowlistEntry {
  id: string;
  pattern: string;
  type: 'domain' | 'path' | 'ip';
  note: string;
  addedAt: number;
}

export function readAllowlist(): AllowlistEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(ALLOWLIST_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeAllowlist(list: AllowlistEntry[]): void {
  try { localStorage.setItem(ALLOWLIST_KEY, JSON.stringify(list)); } catch { /* storage unavailable */ }
}

function domainOf(pattern: string): string {
  const text = String(pattern || '').trim().toLowerCase();
  try { return new URL(/^https?:\/\//.test(text) ? text : `https://${text}`).hostname.replace(/^www\./, ''); } catch { return text; }
}

/** Your trusted domains (the panel's domain entries). */
export function listTrustedDomains(): string[] {
  return readAllowlist().filter((e) => e.type === 'domain' && e.pattern).map((e) => domainOf(e.pattern));
}

/** A host on your list, or a subdomain of one. */
export function isTrustedDomain(host: string): boolean {
  const h = String(host || '').toLowerCase().replace(/^www\./, '');
  return listTrustedDomains().some((d) => h === d || h.endsWith(`.${d}`));
}

export function addTrustedDomain(domain: string, note = ''): AllowlistEntry {
  const entry: AllowlistEntry = { id: `sal-${Date.now()}-${randomHex(4)}`, pattern: domainOf(domain), type: 'domain', note, addedAt: Date.now() };
  writeAllowlist([...readAllowlist(), entry]);
  return entry;
}

export function removeTrustedDomain(id: string): void {
  writeAllowlist(readAllowlist().filter((e) => e.id !== id));
}
