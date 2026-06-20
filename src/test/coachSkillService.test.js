import { describe, expect, it } from 'vitest';
import { getCoachSkill, listCoachSkills } from '../services/coachSkillService';

describe('coachSkillService', () => {
  it('defines coach-specific skills distinct from agent status', () => {
    const skills = listCoachSkills();
    expect(skills.map((skill) => skill.id)).toEqual(expect.arrayContaining([
      'observe', 'unblock', 'focus', 'handoff', 'rehearse', 'protect'
    ]));
    expect(skills.every((skill) => skill.purpose && skill.prompt)).toBe(true);
  });

  it('resolves a coach skill by id', () => {
    expect(getCoachSkill('focus')?.label).toBe('Focus');
    expect(getCoachSkill('missing')).toBeNull();
  });
});
