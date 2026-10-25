// Skill files (agent roles Part B, 2026-10-25).
import { describe, it, expect } from 'vitest';
import { parseSkillFile, serializeSkill } from '../../../services/skills/skillFile';

const CLAIM_CHECK = `---
name: Claim check
agent: maria
use_when: The work states facts, numbers or quotes that need checking against sources.
task_types: [audit_content_quality, audit_claims]
tools: [read_step_output, read_sources]
steps: [read_step_output, read_sources]
output: review_with_verdict
---
Check every fact against the sources.
`;

const meta = { source: 'user' as const, file: 'claim-check.md' };

describe('parseSkillFile', () => {
  it("parses the claim-check example from the spec", () => {
    const result = parseSkillFile(CLAIM_CHECK, meta);
    expect('skill' in result).toBe(true);
    if (!('skill' in result)) return;
    expect(result.skill).toEqual({
      name: 'Claim check',
      agent: 'maria',
      useWhen: 'The work states facts, numbers or quotes that need checking against sources.',
      taskTypes: ['audit_content_quality', 'audit_claims'],
      tools: ['read_step_output', 'read_sources'],
      steps: ['read_step_output', 'read_sources'],
      output: 'review_with_verdict',
      instructions: 'Check every fact against the sources.',
      source: 'user',
      file: 'claim-check.md',
    });
  });

  it('round-trips through serializeSkill', () => {
    const first = parseSkillFile(CLAIM_CHECK, meta);
    if (!('skill' in first)) throw new Error('did not parse');
    const again = parseSkillFile(serializeSkill(first.skill), meta);
    expect(again).toEqual(first);
  });

  it('defaults steps to none and output to text', () => {
    const result = parseSkillFile('---\nname: A\nagent: hector\nuse_when: x\ntask_types: [research_report]\n---\nDo it.', meta);
    if (!('skill' in result)) throw new Error('did not parse');
    expect(result.skill.steps).toEqual([]);
    expect(result.skill.tools).toEqual([]);
    expect(result.skill.output).toBe('text');
  });

  it('lists each missing field', () => {
    const result = parseSkillFile('---\ntools: [read_memory]\n---\n', meta);
    expect(result).toEqual({ problems: [
      'The skill has no name.',
      'The skill names no agent.',
      'The skill has no "use when".',
      'The skill lists no task types.',
      'The skill has no instructions.',
    ] });
  });

  it('refuses a file over 64 KB', () => {
    expect(parseSkillFile(CLAIM_CHECK + 'x'.repeat(65 * 1024), meta)).toEqual({ problems: ['The skill file is larger than 64 KB.'] });
  });

  it('refuses a file that does not start with ---', () => {
    expect(parseSkillFile('name: A\n---\nbody', meta)).toEqual({ problems: ['The skill file must start with a --- line.'] });
  });
});
