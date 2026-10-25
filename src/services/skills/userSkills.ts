// Your own skills (agent roles Part B): files in the app's skills folder,
// read and written by the backend (skills_store.rs). Every skill is checked
// before it is saved and again when it is loaded; a refused one is never
// saved, and a broken file on disk is listed with its reasons.
import { invoke } from '@tauri-apps/api/core';
import { parseSkillFile, serializeSkill, type Skill } from './skillFile';
import { checkSkill } from './skillCheck';
import { setUserSkillFiles } from './skillLibrary';

export type SaveResult = { ok: true } | { ok: false; problems: string[] };

/** "Short answers!" → "short-answers.md": small letters, digits and dashes only. */
export function skillFileName(name: string): string {
  const slug = String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
  return `${slug || 'skill'}.md`;
}

/** Reads every file in the skills folder into the library. */
export async function loadUserSkills(): Promise<void> {
  try {
    const files = await invoke<{ agent: string; file: string; text: string; tooLarge: boolean }[]>('skills_list_user');
    setUserSkillFiles((files || []).map((f) => (f.tooLarge ? { ...f, text: 'x'.repeat(65 * 1024) } : f)));
  } catch {
    setUserSkillFiles([]);
  }
}

export async function saveUserSkill(skill: Skill): Promise<SaveResult> {
  const problems = checkSkill(skill);
  const parsed = parseSkillFile(serializeSkill(skill), { source: 'user', file: '' });
  if ('problems' in parsed) problems.unshift(...parsed.problems);
  if (problems.length) return { ok: false, problems };
  const existing = skill.file.includes('/') ? skill.file.split('/')[1] : '';
  const file = existing || skillFileName(skill.name);
  try {
    await invoke('skills_save_user', { agent: skill.agent, file, text: serializeSkill(skill) });
  } catch (error) {
    return { ok: false, problems: [String(error instanceof Error ? error.message : error)] };
  }
  await loadUserSkills();
  return { ok: true };
}

export async function deleteUserSkill(skill: Skill): Promise<void> {
  const [agent, file] = skill.file.split('/');
  if (skill.source !== 'user' || !agent || !file) return;
  await invoke('skills_delete_user', { agent, file });
  await loadUserSkills();
}

/** A skill file chosen in the file dialog; nothing is saved when it breaks a rule. Cancelled → no problems, not ok. */
export async function importUserSkill(): Promise<SaveResult> {
  let text: string | null;
  try {
    text = await invoke<string | null>('skills_import_user');
  } catch (error) {
    return { ok: false, problems: [String(error instanceof Error ? error.message : error)] };
  }
  if (!text) return { ok: false, problems: [] };
  const parsed = parseSkillFile(text, { source: 'user', file: '' });
  if ('problems' in parsed) return { ok: false, problems: parsed.problems };
  return saveUserSkill(parsed.skill);
}

/** The file text, for "Export". */
export function exportSkill(skill: Skill): string {
  return serializeSkill(skill);
}

export async function openSkillsFolder(): Promise<string | null> {
  try {
    return await invoke<string>('skills_open_folder');
  } catch {
    return null;
  }
}
