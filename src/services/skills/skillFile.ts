// A skill: know-how for one kind of job plus the tools it needs (agent roles
// Part B, owner 2026-10-24). One Markdown file with a small front matter:
// `key: value` and `key: [a, b]` lines between two `---` lines, then the
// instructions. No YAML library: the format is deliberately this small.
// Spec: docs/superpowers/specs/2026-10-24-agent-roles-skills-handover-design.md

export interface Skill {
  name: string;
  agent: string;
  useWhen: string;
  taskTypes: string[];
  tools: string[];
  /** The tools in order, for models too small to call them themselves. */
  steps: string[];
  output: string;
  instructions: string;
  source: 'built_in' | 'user';
  file: string;
}

export const MAX_SKILL_BYTES = 64 * 1024;

function readList(value: string): string[] {
  const inner = value.trim().replace(/^\[/, '').replace(/\]$/, '');
  return inner.split(',').map((item) => item.trim()).filter(Boolean);
}

export function parseSkillFile(text: string, meta: { source: 'built_in' | 'user'; file: string }): { skill: Skill } | { problems: string[] } {
  const raw = String(text ?? '').replace(/\r\n/g, '\n');
  if (new TextEncoder().encode(raw).length > MAX_SKILL_BYTES) return { problems: ['The skill file is larger than 64 KB.'] };
  const lines = raw.split('\n');
  if (lines[0]?.trim() !== '---') return { problems: ['The skill file must start with a --- line.'] };
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
  if (end < 0) return { problems: ['The skill file has no closing --- line.'] };
  const fields: Record<string, string> = {};
  for (const line of lines.slice(1, end)) {
    const withoutComment = line.replace(/\s+#.*$/, '');
    const colon = withoutComment.indexOf(':');
    if (colon <= 0) continue;
    fields[withoutComment.slice(0, colon).trim()] = withoutComment.slice(colon + 1).trim();
  }
  const skill: Skill = {
    name: fields.name || '',
    agent: (fields.agent || '').toLowerCase(),
    useWhen: fields.use_when || '',
    taskTypes: readList(fields.task_types || ''),
    tools: readList(fields.tools || ''),
    steps: readList(fields.steps || ''),
    output: fields.output || 'text',
    instructions: lines.slice(end + 1).join('\n').trim(),
    source: meta.source,
    file: meta.file,
  };
  const problems: string[] = [];
  if (!skill.name) problems.push('The skill has no name.');
  if (!skill.agent) problems.push('The skill names no agent.');
  if (!skill.useWhen) problems.push('The skill has no "use when".');
  if (!skill.taskTypes.length) problems.push('The skill lists no task types.');
  if (!skill.instructions) problems.push('The skill has no instructions.');
  return problems.length ? { problems } : { skill };
}

/** The file text for a skill; parseSkillFile reads it back unchanged. */
export function serializeSkill(skill: Skill): string {
  const oneLine = (value: string) => String(value || '').replace(/\s*\n\s*/g, ' ').trim();
  const lines = [
    '---',
    `name: ${oneLine(skill.name)}`,
    `agent: ${oneLine(skill.agent)}`,
    `use_when: ${oneLine(skill.useWhen)}`,
    `task_types: [${skill.taskTypes.join(', ')}]`,
    `tools: [${skill.tools.join(', ')}]`,
    `steps: [${skill.steps.join(', ')}]`,
    `output: ${oneLine(skill.output || 'text')}`,
    '---',
    skill.instructions.trim(),
    '',
  ];
  return lines.join('\n');
}
