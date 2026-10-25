// Hector's step in a Jose request (agent phase 1, owner 2026-10-25). He
// researches the request's own words (never Jose's notes or the HELP line, which
// went into the search query until then), and hands on the cited report. Found
// nothing → the step waits for setup with the reason; no facts from memory.
import { createResearchDraft, listHectorReports, runHectorLiveResearch } from '../hectorResearchService';
import { fallbackQuery, NO_REPORT } from './researchRun';
import type { StepInput } from '../jose/stepInput';

export async function runHectorStep(assignment: any, stepInput: StepInput | null, opts: { large: boolean; signal?: AbortSignal }) {
  const instruction = String(assignment?.instruction || stepInput?.instruction || '').trim();
  const request = String(stepInput?.request || '').trim();
  const question = fallbackQuery(request) || instruction;
  const base = { resultUrl: null, contractAction: assignment?.actionType || 'research' };
  const urls = Array.isArray(assignment?.payload?.urls) ? assignment.payload.urls.map(String) : [];
  // The Research Desk's own report (agent phase 1): researched in place, so the Desk shows it.
  const given = assignment?.payload?.reportId ? (listHectorReports() as any[]).find((r) => r.id === assignment.payload.reportId) : null;
  const draft = given || createResearchDraft({ researchQuestion: question, sourceUrls: urls, sourceType: 'public_web', riskLevel: assignment?.riskLevel || 'low' });
  const report: any = await runHectorLiveResearch(draft.id, undefined, {
    request,
    focus: instruction && instruction !== question ? instruction : undefined,
    large: opts.large,
    signal: opts.signal,
  });
  if (report?.status === 'research_done' && report.research) {
    return {
      ...base,
      summary: String(report.text || report.summary),
      resultState: 'completed',
      schema: report.research,
      sources: report.research.sources.map((s: { url: string }) => s.url),
      artifacts: [{ type: 'hector_report', reportId: draft.id }],
    };
  }
  const reason = String(report?.summary || NO_REPORT);
  return {
    ...base,
    summary: reason,
    resultState: reason === NO_REPORT ? 'failed' : 'setup_required',
    sources: [],
    artifacts: [{ type: 'hector_report', reportId: draft.id }],
  };
}
