import { describe, it, expect } from 'vitest';
import { JOSE_TEMPLATES, TEMPLATE_FIT_THRESHOLD, scoreTemplateFit, getTemplate } from '../../../services/jose/joseTemplates';
import { checkPlan } from '../../../services/jose/stepGraph';

describe('joseTemplates', () => {
  it('has the three first templates', () => {
    expect(JOSE_TEMPLATES.map((t) => t.id)).toEqual(['content_video', 'build_app', 'research_report']);
    expect(getTemplate('build_app')?.kind).toBe('project');
    expect(getTemplate('nope')).toBeNull();
  });

  it('every template passes the rule check and says what each step does', () => {
    for (const template of JOSE_TEMPLATES) {
      expect(checkPlan(template.steps), template.id).toEqual({ ok: true, problems: [] });
      for (const step of template.steps) expect(step.instruction?.trim(), `${template.id}/${step.stepId}`).toBeTruthy();
    }
  });

  it('scores a request by how well each template fits, best first', () => {
    const video = scoreTemplateFit('Make a YouTube video script about our launch');
    expect(video[0].templateId).toBe('content_video');
    expect(video[0].score).toBeGreaterThanOrEqual(TEMPLATE_FIT_THRESHOLD);
    const app = scoreTemplateFit('Build a web app with a login page');
    expect(app[0].templateId).toBe('build_app');
    expect(app[0].score).toBeGreaterThanOrEqual(TEMPLATE_FIT_THRESHOLD);
    const report = scoreTemplateFit('Research the electric bike market and write a report');
    expect(report[0].templateId).toBe('research_report');
  });

  it('finds no template for a request none of them fits', () => {
    const scores = scoreTemplateFit('Plan a birthday party for my daughter');
    expect(scores.every((s) => s.score < TEMPLATE_FIT_THRESHOLD)).toBe(true);
    // One word is not a fit: "make" alone does not make a cake an app.
    expect(scoreTemplateFit('Make a cake').every((s) => s.score < TEMPLATE_FIT_THRESHOLD)).toBe(true);
  });

  it('"a short post" is writing, not a video; "Shorts" still are', () => {
    const fit = (text: string) => scoreTemplateFit(text).find((s) => s.templateId === 'content_video')?.score;
    expect(fit('Research three facts about honeybees and write a short post about them')).toBeLessThan(TEMPLATE_FIT_THRESHOLD);
    expect(fit('Make three Shorts for our launch')).toBeGreaterThanOrEqual(TEMPLATE_FIT_THRESHOLD);
    expect(fit('Make a YouTube short about our launch')).toBeGreaterThanOrEqual(TEMPLATE_FIT_THRESHOLD);
  });

  it('matches whole words only', () => {
    // "apple" must not count as "app".
    expect(scoreTemplateFit('Buy apples').find((s) => s.templateId === 'build_app')?.score).toBe(0);
  });
});
