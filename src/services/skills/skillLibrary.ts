// Every agent's skills (agent roles Part B): the built-in ones bundled from
// src/skills/<agent>/*.md, and your own from the app's skills folder (loaded by
// userSkills.ts). A file that breaks the rules is kept out and listed with why.
// Your skill with a built-in skill's name sits beside it, never over it.
import { parseSkillFile, type Skill } from './skillFile';
import { checkSkill } from './skillCheck';

const BUILT_IN_FILES = import.meta.glob('../../skills/*/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export interface RefusedSkill { file: string; source: 'built_in' | 'user'; problems: string[] }

let builtIn: { skills: Skill[]; refused: RefusedSkill[] } | null = null;
let user: { skills: Skill[]; refused: RefusedSkill[] } = { skills: [], refused: [] };

function load(files: { agent: string; file: string; text: string }[], source: 'built_in' | 'user') {
  const skills: Skill[] = [];
  const refused: RefusedSkill[] = [];
  for (const { agent, file, text } of files) {
    const label = `${agent}/${file}`;
    const parsed = parseSkillFile(text, { source, file: label });
    if ('problems' in parsed) { refused.push({ file: label, source, problems: parsed.problems }); continue; }
    const problems = checkSkill(parsed.skill);
    if (parsed.skill.agent !== agent) problems.unshift(`The file is in ${agent}'s folder but names ${parsed.skill.agent}.`);
    if (problems.length) { refused.push({ file: label, source, problems }); continue; }
    skills.push(parsed.skill);
  }
  skills.sort((a, b) => a.file.localeCompare(b.file));
  return { skills, refused };
}

function builtInSkills() {
  if (!builtIn) {
    const files = Object.entries(BUILT_IN_FILES).map(([path, text]) => {
      const [agent, file] = path.split('/').slice(-2);
      return { agent, file, text };
    });
    builtIn = load(files, 'built_in');
  }
  return builtIn;
}

/** Your own skill files, as read from the skills folder. */
export function setUserSkillFiles(files: { agent: string; file: string; text: string }[]): void {
  user = load(files, 'user');
}

/** The agent's skills (or everyone's): built-in first, then yours, each by file name. */
export function listSkills(agent?: string): Skill[] {
  const all = [...builtInSkills().skills, ...user.skills];
  return agent ? all.filter((s) => s.agent === agent) : all;
}

/** Skills of this agent whose task types include this step's. */
export function skillsForTask(agent: string, actionType: string): Skill[] {
  const type = String(actionType || '').toLowerCase();
  return listSkills(agent).filter((s) => s.taskTypes.some((t) => t.toLowerCase() === type));
}

export function refusedSkills(): RefusedSkill[] {
  return [...builtInSkills().refused, ...user.refused];
}

/** What a content-factory step is asked: its built-in skill's instructions. */
export function contentAsk(actionType: string): string | null {
  const skill = builtInSkills().skills.find((s) => s.output === `content:${actionType}`);
  return skill ? skill.instructions : null;
}
