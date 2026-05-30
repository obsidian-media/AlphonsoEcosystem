import { beforeEach, describe, expect, it, vi } from 'vitest';

let braveEnabled = false;

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (command, args) => {
    if (command === 'check_env_vars_presence') {
      return { BRAVE_SEARCH_API_KEY: braveEnabled };
    }

    if (command === 'search_brave_sources') {
      if (!braveEnabled) throw new Error('BRAVE_SEARCH_API_KEY not set');
      return [
        {
          url: 'https://brave.com/search/result',
          title: 'Brave Search Result',
          snippet: 'Brave search snippet.',
          sourceType: args?.sourceType || 'official_docs',
          provider: 'brave_search',
          dateChecked: '2026-05-29T00:00:00.000Z',
          confidence: 'inferred',
          riskLevel: 'medium',
          verificationState: 'inferred'
        }
      ];
    }

    if (command === 'search_research_sources') {
      const query = String(args?.request?.query || '');
      if (query === 'How does Alphonso verify WhatsApp webhooks?') {
        return [];
      }
      if (query === 'official WhatsApp webhook verification docs') {
        return [
          {
            url: 'https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks',
            sourceType: 'official_docs',
            confidence: 'verified',
            verificationState: 'verified',
            riskLevel: 'low',
            provider: 'duckduckgo_html',
            title: 'WhatsApp Cloud API Webhooks',
            snippet: 'Official webhook verification and inbound events.'
          }
        ];
      }
      return [];
    }

    if (command === 'ollama_list_models') {
      return {
        endpoint: 'http://localhost:11434',
        httpStatus: 200,
        models: [{ name: 'llama3.1' }],
        trust: 'verified',
        reason: null
      };
    }

    if (command === 'ollama_generate') {
      return {
        endpoint: 'http://localhost:11434',
        httpStatus: 200,
        model: args.model,
        response: '["official WhatsApp webhook verification docs"]',
        done: true,
        trust: 'verified',
        error: null
      };
    }

    if (command === 'fetch_research_sources') {
      return [
        {
          url: args.sources?.[0]?.url,
          sourceType: 'official_docs',
          official: true,
          fetchedAtMs: 1,
          httpStatus: 200,
          ok: true,
          title: 'WhatsApp Cloud API Webhooks',
          snippet: 'Official webhook verification and inbound events.',
          dateChecked: '2026-05-19T12:00:00.000Z',
          confidence: 'verified',
          riskLevel: 'low',
          verificationState: 'verified',
          error: null
        }
      ];
    }

    return { ok: true };
  })
}));

import { createResearchDraft, isBraveSearchConfigured, listHectorReports, runHectorLiveResearch } from '../services/hectorResearchService';

describe('hector research provider failover', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('uses ollama query refinement when the primary search returns nothing', async () => {
    const draft = createResearchDraft({
      researchQuestion: 'How does Alphonso verify WhatsApp webhooks?'
    });

    const report = await runHectorLiveResearch(draft.id);
    const saved = listHectorReports().find((item) => item.id === draft.id);

    expect(report.status).toBe('sources_verified');
    expect(report.providerUsed).toBe('duckduckgo_html_refined');
    expect(report.providerChain).toContain('ollama_query_refinement');
    expect(report.queryUsed).toBe('official WhatsApp webhook verification docs');
    expect(saved.providerUsed).toBe('duckduckgo_html_refined');
    expect(saved.sources).toHaveLength(1);
  });

  it('uses brave_search as primary provider when BRAVE_SEARCH_API_KEY is set', async () => {
    braveEnabled = true;
    const draft = createResearchDraft({
      researchQuestion: 'How does Alphonso verify WhatsApp webhooks?'
    });

    const report = await runHectorLiveResearch(draft.id);
    const saved = listHectorReports().find((item) => item.id === draft.id);

    expect(report.status).toBe('sources_verified');
    expect(report.providerUsed).toBe('brave_search');
    expect(report.providerChain).toEqual(['brave_search']);
    expect(saved.sources).toHaveLength(1);
    expect(saved.sources[0].provider).toBe('brave_search');
    braveEnabled = false;
  });

  it('isBraveSearchConfigured returns true when key is present', async () => {
    braveEnabled = true;
    const result = await isBraveSearchConfigured();
    expect(result).toBe(true);
    braveEnabled = false;
  });

  it('isBraveSearchConfigured returns false when key is absent', async () => {
    braveEnabled = false;
    const result = await isBraveSearchConfigured();
    expect(result).toBe(false);
  });
});
