// A skill gives an agent only its own work and its own tools (agent roles Part B).
import { describe, it, expect } from 'vitest';
import { checkSkill } from '../../../services/skills/skillCheck';
import type { Skill } from '../../../services/skills/skillFile';

const skill = (patch: Partial<Skill>): Skill => ({
  name: 'Claim check',
  agent: 'maria',
  useWhen: 'Facts need checking.',
  taskTypes: ['audit_content_quality'],
  tools: ['read_step_output', 'read_sources'],
  steps: ['read_step_output', 'read_sources'],
  output: 'review_with_verdict',
  instructions: 'Check the facts.',
  source: 'user',
  file: 'claim-check.md',
  ...patch,
});

describe('checkSkill', () => {
  it("accepts the spec's claim check for Maria", () => {
    expect(checkSkill(skill({}))).toEqual([]);
  });

  it('refuses Nova doing research', () => {
    expect(checkSkill(skill({ agent: 'nova', taskTypes: ['research_report'], tools: [], steps: [] })))
      .toEqual(["research_report is Hector's work, not Nova's."]);
  });

  it('refuses work nobody owns', () => {
    expect(checkSkill(skill({ taskTypes: ['juggling_balls'] }))).toEqual(['No agent owns juggling_balls.']);
  });

  it("refuses a tool Maria can't use", () => {
    expect(checkSkill(skill({ tools: ['web_search'], steps: [] }))).toEqual(["Maria can't use web_search."]);
  });

  it('refuses an unknown tool', () => {
    expect(checkSkill(skill({ tools: ['teleport'], steps: [] }))).toEqual(['Unknown tool: teleport.']);
  });

  it('refuses run_command for Miya', () => {
    const problems = checkSkill(skill({ agent: 'miya', taskTypes: ['creative_script'], tools: ['run_command'], steps: [], output: 'text' }));
    expect(problems).toContain("Miya can't use run_command.");
  });

  it('refuses Jose', () => {
    expect(checkSkill(skill({ agent: 'jose', taskTypes: ['orchestration_plan'], tools: [], steps: [], output: 'text' })))
      .toContain('Jose has no skills: he plans.');
  });

  it('refuses an agent that does not exist', () => {
    expect(checkSkill(skill({ agent: 'bob' }))).toEqual(['There is no agent called bob.']);
  });

  it('refuses a step that is not one of the tools', () => {
    expect(checkSkill(skill({ steps: ['read_memory'] }))).toEqual(['The step read_memory is not one of this skill\'s tools.']);
  });

  it('refuses an unknown output', () => {
    expect(checkSkill(skill({ output: 'poem' }))).toEqual(['Unknown output: poem.']);
  });
});
