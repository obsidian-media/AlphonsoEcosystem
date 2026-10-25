// Your own skills on disk (agent roles Part B, 2026-10-25).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const files = new Map<string, string>();
let importText: string | null = null;
const invoke = vi.fn(async (cmd: string, args: any = {}) => {
  if (cmd === 'skills_list_user') return [...files].map(([key, text]) => { const [agent, file] = key.split('/'); return { agent, file, text, tooLarge: false }; });
  if (cmd === 'skills_save_user') { files.set(`${args.agent}/${args.file}`, args.text); return null; }
  if (cmd === 'skills_delete_user') { files.delete(`${args.agent}/${args.file}`); return null; }
  if (cmd === 'skills_import_user') return importText;
  if (cmd === 'skills_open_folder') return 'C:/skills';
  throw new Error(`unexpected ${cmd}`);
});
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: [string, any]) => invoke(...a) }));

import { loadUserSkills, saveUserSkill, deleteUserSkill, importUserSkill, skillFileName } from '../../../services/skills/userSkills';
import { listSkills, refusedSkills, setUserSkillFiles } from '../../../services/skills/skillLibrary';
import type { Skill } from '../../../services/skills/skillFile';

const mine = (patch: Partial<Skill> = {}): Skill => ({
  name: 'Short answers', agent: 'alphonso', useWhen: 'Someone wants a one-line answer.', taskTypes: ['assistant_answer'],
  tools: [], steps: [], output: 'text', instructions: 'Answer in one line.', source: 'user', file: '', ...patch,
});

beforeEach(() => { files.clear(); importText = null; invoke.mockClear(); setUserSkillFiles([]); });

describe('your own skills', () => {
  it('names the file from the skill name', () => {
    expect(skillFileName('Short answers!')).toBe('short-answers.md');
    expect(skillFileName('Été / 2026')).toBe('ete-2026.md');
    expect(skillFileName('???')).toBe('skill.md');
  });

  it('a saved skill appears in listSkills', async () => {
    expect(await saveUserSkill(mine())).toEqual({ ok: true });
    expect(files.has('alphonso/short-answers.md')).toBe(true);
    expect(listSkills('alphonso').some((s) => s.name === 'Short answers' && s.source === 'user')).toBe(true);
  });

  it('a refused skill is not saved and says why', async () => {
    expect(await saveUserSkill(mine({ agent: 'maria', taskTypes: ['research_report'] })))
      .toEqual({ ok: false, problems: ["research_report is Hector's work, not Maria's."] });
    expect(invoke).not.toHaveBeenCalledWith('skills_save_user', expect.anything());
  });

  it('an imported file naming another agent\'s task type is refused', async () => {
    importText = '---\nname: Snoop\nagent: nova\nuse_when: x\ntask_types: [research_report]\n---\nResearch.';
    expect(await importUserSkill()).toEqual({ ok: false, problems: ["research_report is Hector's work, not Nova's."] });
    expect(files.size).toBe(0);
  });

  it('an imported good file is saved; a cancelled import does nothing', async () => {
    importText = '---\nname: Quick check\nagent: maria\nuse_when: A short check is enough.\ntask_types: [audit_quality]\noutput: review_with_verdict\n---\nCheck fast.';
    expect(await importUserSkill()).toEqual({ ok: true });
    expect(files.has('maria/quick-check.md')).toBe(true);
    importText = null;
    expect(await importUserSkill()).toEqual({ ok: false, problems: [] });
  });

  it('loading keeps good files when one is broken', async () => {
    files.set('alphonso/good.md', '---\nname: Good\nagent: alphonso\nuse_when: x\ntask_types: [assistant_answer]\n---\nFine.');
    files.set('alphonso/bad.md', 'no front matter');
    await loadUserSkills();
    expect(listSkills('alphonso').some((s) => s.name === 'Good')).toBe(true);
    expect(refusedSkills().filter((r) => r.source === 'user')).toEqual([{ file: 'alphonso/bad.md', source: 'user', problems: ['The skill file must start with a --- line.'] }]);
  });

  it('delete removes the file and the skill', async () => {
    await saveUserSkill(mine());
    await deleteUserSkill(listSkills('alphonso').find((s) => s.source === 'user')!);
    expect(files.size).toBe(0);
    expect(listSkills('alphonso').some((s) => s.source === 'user')).toBe(false);
  });
});
