// Phase 3a: the campaign's ad copy as files for each network's bulk import. No ad account is touched.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a), convertFileSrc: (p: string) => p }));

import { adCsv, adsForNetwork, writeAdCsv, AD_NETWORKS } from '../../../services/contentFactory/adCopyExport';

const names = { campaign: 'Acme - Launch', adGroup: 'Launch' };

beforeEach(() => invoke.mockReset().mockResolvedValue(undefined));

describe('adCsv', () => {
  it('Meta Ads Manager: campaign, ad set, ad name, title and body', () => {
    const csv = adCsv('meta', [{ network: 'meta', headline: 'Try it', body: 'Fast and free' }], names);
    expect(csv.split('\r\n')).toEqual([
      'Campaign Name,Ad Set Name,Ad Name,Title,Body',
      'Acme - Launch,Launch,Launch ad 1,Try it,Fast and free',
      '',
    ]);
  });

  it('Google Ads Editor: campaign, ad group, headline 1 and description 1', () => {
    const csv = adCsv('google', [{ network: 'google', headline: 'H', body: 'D' }], names);
    expect(csv.split('\r\n')[0]).toBe('Campaign,Ad group,Headline 1,Description 1');
    expect(csv.split('\r\n')[1]).toBe('Acme - Launch,Launch,H,D');
  });

  it('quotes commas, quotes and line breaks', () => {
    const csv = adCsv('google', [{ network: 'google', headline: 'Fast, free', body: 'Say "hi"\nnow' }], names);
    expect(csv.split('\r\n')[1]).toBe('Acme - Launch,Launch,"Fast, free","Say ""hi""\nnow"');
  });

  it('a value that a spreadsheet would run as a formula is kept as text', () => {
    const csv = adCsv('meta', [{ network: 'meta', headline: '=HYPERLINK("x")', body: '-20% today' }], names);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain("'-20% today");
  });
});

describe('adsForNetwork', () => {
  it("matches the model's network names loosely", () => {
    const ads = [
      { network: 'Meta Ads', headline: 'a', body: '' }, { network: 'Facebook', headline: 'b', body: '' },
      { network: 'Google Ads', headline: 'c', body: '' }, { network: 'YouTube', headline: 'd', body: '' },
    ];
    expect(adsForNetwork(ads, 'meta').map((a) => a.headline)).toEqual(['a', 'b']);
    expect(adsForNetwork(ads, 'google').map((a) => a.headline)).toEqual(['c']);
    expect(adsForNetwork(ads, 'youtube').map((a) => a.headline)).toEqual(['d']);
    expect(AD_NETWORKS.map((n) => n.id)).toEqual(['meta', 'google', 'youtube']);
  });
});

it('writeAdCsv saves the file in the campaign folder, numbered by the campaign version', async () => {
  const rel = await writeAdCsv('D:\\Content', { folderName: 'acme' }, { folderName: 'launch' }, 'meta', [{ network: 'meta', headline: 'h', body: 'b' }], names, 2);
  expect(rel).toBe('acme/launch/campaign/ads-meta-v2.csv');
  expect(invoke).toHaveBeenCalledWith('write_workspace_text_file', expect.objectContaining({
    workspaceRoot: 'D:\\Content', relativePath: 'acme/launch/campaign/ads-meta-v2.csv', content: expect.stringContaining('Campaign Name,'),
  }));
});
