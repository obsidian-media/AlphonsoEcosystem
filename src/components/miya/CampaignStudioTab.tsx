import React, { useState } from 'react';
import { Badge, Button } from '../ui';
import { StepPanel } from './StepPanel';
import { PostsPanel } from './PostsPanel';
import { AD_NETWORKS, adsForNetwork, writeAdCsv, type AdNetwork } from '../../services/contentFactory/adCopyExport';
import { chosenVersionOf } from '../../services/contentFactory/contentProjectService';
import { visiblePieces } from '../../services/contentFactory/contentQualityGate';
import type { StepTabProps } from './ScriptStudioTab';
import type { ContentBrand } from '../../services/contentFactory/contentTypes';
import { textItems } from '../../lib/readableValue';

interface CampaignOutput {
  miya?: {
    platforms?: { platform: string; caption: string; hashtags?: string[]; description?: string }[];
    ads?: { network: string; headline: string; body: string }[];
    calendar?: { platform: string; suggestedAt: string; reason: string }[];
  };
  nova?: { times?: { platform: string; dayOfWeek?: string; time: string; reason?: string }[] };
}

function copy(text: string) {
  try { navigator.clipboard?.writeText(text); } catch { /* clipboard unavailable */ }
}

/** Captions, hashtags, ad copy and posting times, Maria's quality gate, then the posts (phase 3a). */
export function CampaignStudioTab({ project, brand, runStep, chooseVersion, approve, sendBack, outputRoot = '', onChange = () => undefined }: StepTabProps & {
  brand: ContentBrand | null;
  outputRoot?: string;
  onChange?(): void;
}) {
  const campaignVersion = chosenVersionOf(project, 'campaign');
  const campaign = campaignVersion?.output as CampaignOutput | undefined;
  const [exported, setExported] = useState<Record<string, string>>({});
  const exportAds = (network: AdNetwork) => {
    if (!brand || !campaignVersion) return;
    const ads = adsForNetwork(campaign?.miya?.ads || [], network);
    writeAdCsv(outputRoot, brand, project, network, ads, { campaign: `${brand.name} - ${project.name}`, adGroup: project.name }, campaignVersion.version)
      .then((path) => setExported((e) => ({ ...e, [network]: `Saved: ${path}` })))
      .catch((error) => setExported((e) => ({ ...e, [network]: `Not saved: ${error instanceof Error ? error.message : String(error)}` })));
  };
  const pieces = brand ? visiblePieces(project, brand) : [];
  const hidden = pieces.filter((p) => !p.visible).length;
  // Sentinel's check of the campaign (agent phase 4), saved with the quality step.
  const qualitySentinel = (chosenVersionOf(project, 'quality')?.output as { sentinel?: { issues?: unknown[] } } | undefined)?.sentinel;
  const sentinelCheck = qualitySentinel
    ? { issues: (qualitySentinel.issues || []).map((i: any) => (typeof i === 'string' ? { what: i, where: '', fix: '' } : { what: String(i?.what || ''), where: String(i?.where || ''), fix: String(i?.fix || '') })).filter((i) => i.what) }
    : null;
  return (
    <div className="space-y-4">
      <h2 className="font-serif text-lg font-bold text-(--text-1)">Campaign Studio</h2>
      <StepPanel project={project} step="campaign" onRun={() => runStep('campaign')} onChooseVersion={(v) => chooseVersion('campaign', v)}>
        {campaign?.miya && (
          <div className="space-y-3 text-[12px]">
            {(campaign.miya.platforms || []).map((p) => {
              const text = [p.caption, (p.hashtags || []).join(' ')].filter(Boolean).join('\n\n');
              return (
                <div key={p.platform} className="rounded-xl bg-(--surface-2) p-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-(--text-1)">{p.platform}</div>
                    <Button size="sm" variant="ghost" onClick={() => copy(text)}>Copy</Button>
                  </div>
                  <div className="whitespace-pre-wrap text-(--text-1)">{p.caption}</div>
                  {textItems(p.hashtags).length > 0 && <div className="text-(--text-3)">{textItems(p.hashtags).join(' ')}</div>}
                  {p.description && <div className="whitespace-pre-wrap text-(--text-2)">{p.description}</div>}
                </div>
              );
            })}
            {(campaign.miya.ads || []).length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-widest text-(--text-3)">Ad copy</div>
                {AD_NETWORKS.map((network) => {
                  const ads = adsForNetwork(campaign.miya!.ads || [], network.id);
                  if (!ads.length) return null;
                  return (
                    <div key={network.id} className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge>{network.label}</Badge>
                        <Button size="sm" variant="secondary" aria-label={`Export ${network.label} CSV`} disabled={!outputRoot} onClick={() => exportAds(network.id)}>Export CSV</Button>
                        <span className="text-(--text-3)">{outputRoot ? `For ${network.importer}; check the columns against your own template.` : 'Choose an output folder in Settings to export.'}</span>
                      </div>
                      {exported[network.id] && <div className="text-(--text-2)">{exported[network.id]}</div>}
                      {ads.map((ad) => (
                        <div key={`${ad.network}-${ad.headline}`} className="rounded-xl bg-(--surface-2) p-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-(--text-1)">{ad.headline}</span>
                            <Button size="sm" variant="ghost" onClick={() => copy(`${ad.headline}\n${ad.body}`)}>Copy</Button>
                          </div>
                          <div className="text-(--text-2)">{ad.body}</div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
            {((campaign.miya.calendar || []).length > 0 || (campaign.nova?.times || []).length > 0) && (
              <div className="space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-widest text-(--text-3)">When to post</div>
                {(campaign.nova?.times || []).map((t) => (
                  <div key={`${t.platform}-${t.time}`} className="text-(--text-2)">{t.platform}: {[t.dayOfWeek, t.time].filter(Boolean).join(' ')}{t.reason ? ` — ${t.reason}` : ''}</div>
                ))}
                {(campaign.miya.calendar || []).map((c) => (
                  <div key={`${c.platform}-${c.suggestedAt}`} className="text-(--text-2)">{c.platform}: {c.suggestedAt} — {c.reason}</div>
                ))}
                {brand?.schedule && <div className="text-(--text-3)">Your schedule: {brand.schedule}</div>}
              </div>
            )}
          </div>
        )}
      </StepPanel>

      <StepPanel
        project={project}
        step="quality"
        onRun={() => runStep('quality')}
        onChooseVersion={(v) => chooseVersion('quality', v)}
        onApprove={() => approve('quality')}
        onSendBack={(reason) => sendBack('quality', reason)}
      >
        {(pieces.length > 0 || sentinelCheck) && (
          <div className="space-y-1 text-[12px]">
            <div className="text-[11px] text-(--text-3)">Scored by Maria against your references. Threshold: {brand?.qualityThreshold ?? 7}/10.</div>
            {pieces.filter((p) => p.visible).map((p) => (
              <div key={p.pieceId} className="text-(--text-1)">
                {p.pieceId}: <strong>{p.score}/10</strong>{p.comparedTo ? ` (compared to ${p.comparedTo})` : ''}{textItems(p.weakPoints).length ? ` — ${textItems(p.weakPoints).join('; ')}` : ''}
              </div>
            ))}
            {sentinelCheck && (
              <div className="pt-1">
                <div className="text-[11px] text-(--text-3)">Checked by Sentinel</div>
                {sentinelCheck.issues.length === 0
                  ? <div className="text-(--success)">Nothing unsafe found.</div>
                  : sentinelCheck.issues.map((issue, i) => (
                    <div key={i} className="text-(--warning)">{issue.what}{issue.where ? ` (${issue.where})` : ''}{issue.fix ? ` — ${issue.fix}` : ''}</div>
                  ))}
              </div>
            )}
            {hidden > 0 && <div className="text-(--warning)">{hidden} piece{hidden === 1 ? '' : 's'} scored below {brand?.qualityThreshold}/10 and {hidden === 1 ? 'is' : 'are'} hidden. Turn on “Show everything” in the brief to see {hidden === 1 ? 'it' : 'them'}.</div>}
          </div>
        )}
      </StepPanel>

      <PostsPanel project={project} brand={brand} approvePosts={() => approve('publish')} onChange={onChange} />
      <StepPanel project={project} step="publish" onRun={() => approve('publish')} onChooseVersion={(v) => chooseVersion('publish', v)} />
    </div>
  );
}
