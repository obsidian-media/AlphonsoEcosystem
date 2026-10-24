// Miya content factory phase 3a: the campaign's ad copy as CSV files for each
// network's bulk import (Meta Ads Manager, Google Ads Editor for Google and
// YouTube). Written to `<project>/campaign/ads-<network>-v<n>.csv`. No ad
// account is touched. The column names follow each tool's standard English
// headers; check them against your own template before a large import.
import { invoke } from '@tauri-apps/api/core';
import { projectRelativeDir } from './contentProjectFiles';
import type { ContentBrand, ContentProject } from './contentTypes';

export type AdNetwork = 'meta' | 'google' | 'youtube';
export interface AdCopy { network: string; headline: string; body: string }

export const AD_NETWORKS: { id: AdNetwork; label: string; importer: string }[] = [
  { id: 'meta', label: 'Meta Ads', importer: 'Meta Ads Manager (Import & export)' },
  { id: 'google', label: 'Google Ads', importer: 'Google Ads Editor (Account → Import)' },
  { id: 'youtube', label: 'YouTube Ads', importer: 'Google Ads Editor (Account → Import)' },
];

const COLUMNS: Record<AdNetwork, string[]> = {
  meta: ['Campaign Name', 'Ad Set Name', 'Ad Name', 'Title', 'Body'],
  google: ['Campaign', 'Ad group', 'Headline 1', 'Description 1'],
  youtube: ['Campaign', 'Ad group', 'Ad name', 'Headline 1', 'Description 1'],
};

/** One CSV field: quoted when needed; a value a spreadsheet would run as a formula is kept as text. */
function field(value: string): string {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The ads the campaign wrote for `network` (the model names networks loosely). */
export function adsForNetwork(ads: AdCopy[], network: AdNetwork): AdCopy[] {
  const match: Record<AdNetwork, RegExp> = { meta: /meta|facebook|instagram/i, google: /google/i, youtube: /youtube/i };
  return ads.filter((ad) => match[network].test(ad.network || ''));
}

export function adCsv(network: AdNetwork, ads: AdCopy[], names: { campaign: string; adGroup: string }): string {
  const rows = ads.map((ad, i) => {
    const adName = `${names.adGroup} ad ${i + 1}`;
    if (network === 'meta') return [names.campaign, names.adGroup, adName, ad.headline, ad.body];
    if (network === 'google') return [names.campaign, names.adGroup, ad.headline, ad.body];
    return [names.campaign, names.adGroup, adName, ad.headline, ad.body];
  });
  return [COLUMNS[network], ...rows].map((row) => row.map(field).join(',')).join('\r\n') + '\r\n';
}

/** Writes the network's CSV into the project's campaign folder; returns its path relative to the output folder. */
export async function writeAdCsv(
  root: string,
  brand: Pick<ContentBrand, 'folderName'>,
  project: Pick<ContentProject, 'folderName'>,
  network: AdNetwork,
  ads: AdCopy[],
  names: { campaign: string; adGroup: string },
  version: number,
): Promise<string> {
  const relativePath = `${projectRelativeDir(brand, project)}/campaign/ads-${network}-v${version}.csv`;
  await invoke('write_workspace_text_file', { workspaceRoot: root, relativePath, content: adCsv(network, ads, names) });
  return relativePath;
}
