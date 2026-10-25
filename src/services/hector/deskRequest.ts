// The Research Desk asks through Jose (agent phase 1, owner 2026-10-25): each
// run is a one-step Hector request on the board, on the Desk's own report.
import { submitStepsToJose } from '../jose/submitToJose';
import { listHectorReports } from '../hectorResearchService';

export const DESK_LABEL = 'Asked on the Research Desk.';

export async function askOnResearchDesk(reportId: string): Promise<any> {
  const report: any = listHectorReports().find((r: any) => r.id === reportId);
  if (!report) return { ok: false, reason: 'Hector report not found.' };
  const question = String(report.researchQuestion || '').trim();
  return submitStepsToJose({
    text: question,
    source: 'research_desk',
    label: DESK_LABEL,
    steps: [{
      stepId: 'research',
      agent: 'hector',
      actionType: 'research_report',
      effects: ['read'],
      needs: [],
      instruction: question,
      payload: { reportId },
    }],
  });
}
