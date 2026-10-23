import { describe, it, expect, beforeEach } from 'vitest';
import { saveUserTemplate, listUserTemplates, deleteUserTemplate } from '../../../services/jose/joseUserTemplates';
import { scoreTemplateFit, getTemplate, TEMPLATE_FIT_THRESHOLD } from '../../../services/jose/joseTemplates';
import type { PlanStep } from '../../../services/jose/stepGraph';

const steps: PlanStep[] = [
  { stepId: 'facts', agent: 'hector', actionType: 'research_report', effects: ['read'], needs: [], instruction: 'Find the facts.' },
];

beforeEach(() => localStorage.clear());

describe('joseUserTemplates', () => {
  it('saves a plan as a template with a unique id', () => {
    const first = saveUserTemplate({ name: 'Launch video', kind: 'normal', steps, requestText: 'Plan the launch video for the bakery' });
    const second = saveUserTemplate({ name: 'Launch video', kind: 'normal', steps, requestText: 'Another launch video' });
    expect(first.id).toBe('user_launch-video');
    expect(second.id).toBe('user_launch-video-2');
    expect(listUserTemplates()).toHaveLength(2);
    expect(getTemplate('user_launch-video')?.name).toBe('Launch video');
  });

  it('is offered only for a request its words fit', () => {
    saveUserTemplate({ name: 'Bakery newsletter', kind: 'normal', steps, requestText: 'Write the monthly bakery newsletter for subscribers' });
    const fit = scoreTemplateFit('Write this month’s bakery newsletter').find((s) => s.templateId === 'user_bakery-newsletter');
    expect(fit?.score).toBeGreaterThanOrEqual(TEMPLATE_FIT_THRESHOLD);
    const unrelated = scoreTemplateFit('Plan a birthday party').find((s) => s.templateId === 'user_bakery-newsletter');
    expect(unrelated?.score).toBeLessThan(TEMPLATE_FIT_THRESHOLD);
  });

  it('can be deleted', () => {
    saveUserTemplate({ name: 'Bakery newsletter', kind: 'normal', steps, requestText: 'bakery newsletter' });
    deleteUserTemplate('user_bakery-newsletter');
    expect(getTemplate('user_bakery-newsletter')).toBeNull();
    expect(scoreTemplateFit('bakery newsletter').some((s) => s.templateId === 'user_bakery-newsletter')).toBe(false);
  });
});
