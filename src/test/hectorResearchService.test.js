import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (command, args) => {
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

import { createResearchDraft, listHectorReports, runHectorLiveResearch } from '../services/hectorResearchService';

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
});
