// Agent phase 4: the Sentinel allowlist panel's domains are what Sentinel trusts.
import { describe, it, expect, beforeEach } from 'vitest';
import { listTrustedDomains, addTrustedDomain, removeTrustedDomain, isTrustedDomain } from '../../../services/sentinel/sentinelTrust';

beforeEach(() => localStorage.clear());

describe('trusted domains', () => {
  it("the panel's saved domains are trusted", () => {
    localStorage.setItem('alphonso_sentinel_allowlist_v1', JSON.stringify([{ id: 'a', pattern: 'mybrand.com', type: 'domain', note: '', addedAt: 1 }, { id: 'b', pattern: '/tmp', type: 'path', note: '', addedAt: 1 }]));
    expect(listTrustedDomains()).toEqual(['mybrand.com']);
    expect(isTrustedDomain('shop.mybrand.com')).toBe(true);
    expect(isTrustedDomain('mybrand.com.evil.net')).toBe(false);
  });

  it('adds and removes', () => {
    const entry = addTrustedDomain('https://Example.org/path', 'mine');
    expect(listTrustedDomains()).toEqual(['example.org']);
    removeTrustedDomain(entry.id);
    expect(listTrustedDomains()).toEqual([]);
  });

  it('nothing is trusted that you did not add', () => {
    expect(listTrustedDomains()).toEqual([]);
    expect(isTrustedDomain('github.com')).toBe(false);
  });
});
