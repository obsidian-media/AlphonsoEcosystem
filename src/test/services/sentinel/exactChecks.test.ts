// Agent phase 4: Sentinel's exact checks are facts handed to his model, never a score.
import { describe, it, expect, beforeEach } from 'vitest';
import { findExactRisks, checkLink, hideSecrets, exactRiskText } from '../../../services/sentinel/exactChecks';

const KEY = 'sk-live-1234abcd5678efgh';
beforeEach(() => localStorage.clear());

describe('keys', () => {
  it('finds a key and hides it with its last four characters', () => {
    const risks = findExactRisks(`Our test key is ${KEY}.`);
    expect(risks).toEqual([expect.objectContaining({ kind: 'key', where: '[hidden key, ends …efgh]' })]);
    expect(hideSecrets(`Our test key is ${KEY}.`)).toBe('Our test key is [hidden key, ends …efgh].');
    for (const k of ['ghp_' + 'a'.repeat(36), 'xoxb-1234567890-abcdefghij', 'AKIA' + 'ABCDEFGHIJKLMNOP', '-----BEGIN RSA PRIVATE KEY-----']) {
      expect(findExactRisks(`x ${k} y`).map((r) => r.kind)).toContain('key');
      expect(hideSecrets(`x ${k} y`)).not.toContain(k);
    }
  });

  it('hides a key at the start of the text', () => {
    expect(hideSecrets(`${KEY} is the key`)).toBe('[hidden key, ends …efgh] is the key');
  });

  it('never puts the key itself in a finding', () => {
    for (const r of findExactRisks(`key ${KEY}`)) expect(JSON.stringify(r)).not.toContain(KEY);
  });
});

describe('links', () => {
  it('the fake PayPal login is disguised', () => {
    const risk = checkLink('http://paypa1-secure-login.com/verify');
    expect(risk?.kind).toBe('disguised_link');
    expect(risk?.detail).toMatch(/digits? in place of letters/);
    expect(risk?.detail).toMatch(/http/);
  });

  it('punycode, a bare IP and a different link text are disguised', () => {
    expect(checkLink('https://xn--pypal-4ve.com/')?.kind).toBe('disguised_link');
    expect(checkLink('https://185.23.4.9/login')?.kind).toBe('disguised_link');
    expect(findExactRisks('[www.mybank.com](https://evil.example.net/login)').map((r) => r.kind)).toContain('disguised_link');
  });

  it('an ordinary link is not disguised', () => {
    expect(checkLink('https://www.goodnotes.com/blog/best-free-note-taking-apps-for-students-2026')).toBeNull();
    expect(checkLink('https://web3.example.org/')).toBeNull();
  });

  it('a trusted domain is not untrusted', () => {
    expect(findExactRisks('see https://github.com/x', { links: 'sent', trustedDomains: ['github.com'] }).map((r) => r.kind)).not.toContain('untrusted_link');
  });

  it('a subdomain of a trusted domain is trusted', () => {
    expect(findExactRisks('see https://docs.github.com/x', { links: 'sent', trustedDomains: ['github.com'] }).map((r) => r.kind)).not.toContain('untrusted_link');
  });

  it('untrusted links are listed only for sent text', () => {
    expect(findExactRisks('see https://example.org/x', { links: 'sent', trustedDomains: [] }).map((r) => r.kind)).toContain('untrusted_link');
    expect(findExactRisks('see https://example.org/x').map((r) => r.kind)).not.toContain('untrusted_link');
  });
});

describe('the rest', () => {
  it('asks for a password', () => {
    expect(findExactRisks('Log in with your password to claim it.').map((r) => r.kind)).toContain('password_request');
    expect(findExactRisks('Enter your card number below.').map((r) => r.kind)).toContain('password_request');
  });

  it('deleting and code commands', () => {
    const kinds = findExactRisks('Run `git clean -fd` then `npm run test`.').map((r) => r.kind);
    expect(kinds).toContain('deleting_command');
    expect(kinds).toContain('code_command');
  });

  it('no score anywhere', () => {
    for (const r of findExactRisks(`${KEY} http://paypa1-secure-login.com/verify password`)) {
      expect(Object.keys(r).sort()).toEqual(['detail', 'kind', 'where']);
    }
  });

  it('plain wording for each fact', () => {
    expect(exactRiskText({ kind: 'key', where: '[hidden key, ends …efgh]', detail: 'a live key' })).toMatch(/^A key/);
  });
});

describe('a key already hidden', () => {
  it('the placeholder still counts as a key, and is not hidden twice', () => {
    const text = 'Our test key is [hidden key, ends …efgh].';
    expect(findExactRisks(text)).toEqual([expect.objectContaining({ kind: 'key', where: '[hidden key, ends …efgh]' })]);
    expect(hideSecrets(text)).toBe(text);
  });
});
