// Agent phase 6: Alphonso's projects (a list you set) and scratch folders for new code.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  listProjects, saveProjects, projectNamedIn, scratchPlace, getCodeModel, NEEDS_OUTPUT_FOLDER,
} from '../../../services/alphonso/projects';

const setSettings = (s: Record<string, unknown>) => localStorage.setItem('alphonso_settings', JSON.stringify(s));
const shop = { name: 'shop', folder: 'D:\\code\\shop' };
const blog = { name: 'blog', folder: 'D:\\code\\blog' };

beforeEach(() => localStorage.clear());

describe('projects', () => {
  it('the Workspace Root becomes the first project once', () => {
    setSettings({ workspaceRoot: 'D:\\code\\shop' });
    expect(listProjects()).toEqual([shop]);
    setSettings({ workspaceRoot: 'D:\\other' });
    expect(listProjects()).toEqual([shop]);
  });

  it('names are unique, trimmed and not empty', () => {
    expect(saveProjects([shop, blog])).toEqual({ ok: true });
    expect(listProjects()).toEqual([shop, blog]);
    expect(saveProjects([shop, { name: 'Shop', folder: 'X' }])).toEqual({ ok: false, reason: 'A project named Shop is already listed.' });
    expect(saveProjects([{ name: '  ', folder: 'X' }])).toEqual({ ok: false, reason: 'Every project needs a name and a folder.' });
    expect(listProjects()).toEqual([shop, blog]);
  });

  it('a project named in the request, as a whole word', () => {
    expect(projectNamedIn('add dark mode in Shop please', [shop, blog])).toEqual(shop);
    expect(projectNamedIn('make a shopping list', [shop])).toBeNull();
    expect(projectNamedIn('in my-shop', [{ name: 'my-shop', folder: 'X' }, shop])).toEqual({ name: 'my-shop', folder: 'X' });
  });

  it('a scratch folder under the output folder, named after the agent', () => {
    setSettings({ outputFolder: 'D:\\Content' });
    expect(scratchPlace('Rename photos', ['rename-photos'])).toEqual({
      kind: 'new', name: 'rename-photos-2', folder: 'D:\\Content/Alphonso/rename-photos-2', root: 'D:\\Content', prefix: 'Alphonso/rename-photos-2/',
    });
    localStorage.clear();
    expect(scratchPlace('x', [])).toEqual({ ok: false, reason: NEEDS_OUTPUT_FOLDER });
    expect(NEEDS_OUTPUT_FOLDER).toBe('Set the output folder in Settings → General so Alphonso has somewhere to put new code.');
  });

  it('the code model is a setting, none by default', () => {
    expect(getCodeModel()).toBeNull();
    setSettings({ alphonsoCodeModel: 'qwen2.5:7b' });
    expect(getCodeModel()).toBe('qwen2.5:7b');
  });
});
