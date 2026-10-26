// Agent phase 4: Sentinel looks without being asked: before Marcus sends, after Alphonso's
// code, at research an acting step uses, and at a request with a key or a link.
import { describe, it, expect } from 'vitest';
import { addSecurityChecks, KEY_IN_REQUEST } from '../../../services/sentinel/addSecurityChecks';
import { checkPlan, type PlanStep } from '../../../services/jose/stepGraph';

const s = (stepId: string, agent: string, actionType: string, effects: string[], needs: string[] = [], extra: Partial<PlanStep> = {}): PlanStep =>
  ({ stepId, agent, actionType, effects, needs, instruction: '', ...extra }) as PlanStep;
const byId = (steps: PlanStep[], id: string) => steps.find((x) => x.stepId === id)!;

describe('addSecurityChecks', () => {
  it("Marcus's send gets a check of the exact text", () => {
    const { steps, added } = addSecurityChecks([s('write', 'alphonso', 'assistant_write', ['write_own_work']), s('marcus', 'marcus', 'distribution_slack', ['publish_or_send'], ['write'])], 'Write it and post it to Slack');
    const check = byId(steps, 'sentinel-send-marcus');
    expect(check).toMatchObject({ agent: 'sentinel', actionType: 'security_review', effects: ['read'], reviewOf: 'write', needs: ['write'], payload: { sending: true } });
    expect(byId(steps, 'marcus').needs).toContain('sentinel-send-marcus');
    expect(added).toEqual(['sentinel-send-marcus']);
  });

  // Agent phase 5: a Marcus send names the step it sends from, so a too-long text goes back to it.
  it('a Marcus send step reviews the step he sends from', () => {
    const { steps } = addSecurityChecks([s('write', 'alphonso', 'assistant_write', ['write_own_work']), s('marcus', 'marcus', 'distribution_execution', ['publish_or_send'], ['write'])], 'Write it and post it to Slack #news');
    expect(byId(steps, 'marcus').reviewOf).toBe('write');
    const call = addSecurityChecks([s('marcus', 'marcus', 'outreach_call', ['publish_or_send', 'spend'], [])], 'Call them').steps;
    expect(byId(call, 'marcus').reviewOf).toBeUndefined();
  });

  it('a send with text handed to Marcus directly: the check carries that text', () => {
    const { steps } = addSecurityChecks([s('marcus', 'marcus', 'distribution_slack', ['publish_or_send'], [], { payload: { channel: '#a', text: 'Hello team' } } as never)], 'Distribute');
    expect(byId(steps, 'sentinel-send-marcus')).toMatchObject({ needs: [], payload: { sending: true, text: 'Hello team' } });
  });

  it("Alphonso's code change gets a check after, and later steps need it", () => {
    const { steps } = addSecurityChecks([s('build', 'alphonso', 'code_build', ['change_project', 'run']), s('notes', 'echo', 'memory_preserve', ['write_own_work'], ['build'])], 'Build the app');
    expect(byId(steps, 'sentinel-code-build')).toMatchObject({ reviewOf: 'build', needs: ['build'] });
    expect(byId(steps, 'notes').needs).toEqual(['build', 'sentinel-code-build']);
  });

  it('a step that runs code or sends and needs research gets a check of that research first', () => {
    const { steps } = addSecurityChecks([s('hector', 'hector', 'research_report', ['read']), s('build', 'alphonso', 'code_build', ['change_project'], ['hector'])], 'Research and build');
    expect(byId(steps, 'sentinel-research-build')).toMatchObject({ reviewOf: 'hector', needs: ['hector'] });
    expect(byId(steps, 'build').needs).toContain('sentinel-research-build');
  });

  it('a key in the request: a first check, and everything waits for it', () => {
    const { steps, holdReason } = addSecurityChecks([s('write', 'alphonso', 'assistant_write', ['write_own_work'])], 'Use my key sk-live-1234abcd5678efgh in the script');
    expect(holdReason).toBe(KEY_IN_REQUEST('efgh'));
    expect(byId(steps, 'sentinel-request')).toMatchObject({ agent: 'sentinel', needs: [] });
    expect(byId(steps, 'write').needs).toContain('sentinel-request');
  });

  it('a link in the request gets a first check without a reason to wait', () => {
    const { steps, holdReason } = addSecurityChecks([s('hector', 'hector', 'research_report', ['read'])], 'Summarise https://example.org/article');
    expect(holdReason).toBeNull();
    expect(byId(steps, 'hector').needs).toContain('sentinel-request');
  });

  it('nothing added twice', () => {
    const plan = [
      s('campaign', 'miya', 'creative_campaign', ['write_own_work']),
      s('security', 'sentinel', 'security_content_check', ['read'], ['campaign']),
      s('publish', 'marcus', 'distribution_schedule_posts', ['publish_or_send'], ['campaign', 'security']),
    ];
    const once = addSecurityChecks(plan, 'Make the posts');
    expect(once.added).toEqual([]);
    const twice = addSecurityChecks(addSecurityChecks([s('w', 'alphonso', 'assistant_write', ['write_own_work']), s('m', 'marcus', 'distribution_slack', ['publish_or_send'], ['w'])], 'x').steps, 'x');
    expect(twice.added).toEqual([]);
  });

  it('the result passes checkPlan', () => {
    const { steps } = addSecurityChecks([s('hector', 'hector', 'research_report', ['read']), s('write', 'alphonso', 'assistant_write', ['write_own_work'], ['hector']), s('marcus', 'marcus', 'distribution_slack', ['publish_or_send'], ['write'])], 'Research https://example.org then post');
    expect(checkPlan(steps, { taskTypes: true }).ok).toBe(true);
  });

  it('a plan with nothing to check is unchanged', () => {
    const plan = [s('hector', 'hector', 'research_report', ['read'])];
    expect(addSecurityChecks(plan, 'Research note-taking apps').steps).toEqual(plan);
  });
});
