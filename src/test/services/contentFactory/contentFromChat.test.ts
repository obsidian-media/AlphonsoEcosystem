import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../services/contentFactory/contentStepRunner', () => ({ runContentProject: vi.fn(async () => ({ ok: true, requestId: 'jose-request-c1' })) }));
vi.mock('../../../services/miyaMemoryService', () => ({ listMiyaMemory: vi.fn(() => []) }));

import { runContentProject } from '../../../services/contentFactory/contentStepRunner';
import { listProjects, getProject } from '../../../services/contentFactory/contentProjectService';
import { saveBrand } from '../../../services/contentFactory/contentBrandService';
import { startContentProjectFromChat, NEEDS_OUTPUT_FOLDER } from '../../../services/contentFactory/contentFromChat';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

// Phase 6b (owner): a content video asked for in Chat becomes a Miya Studio project.
describe('startContentProjectFromChat', () => {
  it('creates a project for the default brand with the idea from the message, and starts it', async () => {
    saveBrand({ name: 'Coffee Corner' });
    const result = await startContentProjectFromChat('Make a YouTube video script about brewing coffee at home', { outputFolder: 'D:\\Content' });
    expect(result.ok).toBe(true);
    const project = getProject(result.projectId!)!;
    expect(project.brief.idea).toBe('Make a YouTube video script about brewing coffee at home');
    expect(project.name).toBe('Make a YouTube video script about brewing coffee at home');
    expect(runContentProject).toHaveBeenCalledWith(project.id, { settings: { outputFolder: 'D:\\Content' } });
    expect(result.note).toBe('Started the Miya Studio project "Make a YouTube video script about brewing coffee at home" for Coffee Corner. Jose runs it step by step and stops after the review for your approval.');
  });

  it('leaves out an "Ask Jose:" at the start', async () => {
    const result = await startContentProjectFromChat('Ask Jose: make a YouTube video about tea', { outputFolder: 'D:\Content' });
    const project = getProject(result.projectId!)!;
    expect(project.name).toBe('Make a YouTube video about tea');
    expect(project.brief.idea).toBe('Make a YouTube video about tea');
  });

  it('a long message gets a short project name, cut at a word', async () => {
    const text = 'Make a YouTube video about the history of coffee houses in Vienna and why they matter to writers today';
    const result = await startContentProjectFromChat(text, { outputFolder: 'D:\\Content' });
    const name = getProject(result.projectId!)!.name;
    expect(name.length).toBeLessThanOrEqual(60);
    expect(text.startsWith(name)).toBe(true);
    expect(text[name.length]).toBe(' ');
  });

  it('without an output folder it says to choose one and creates nothing', async () => {
    const result = await startContentProjectFromChat('Make a YouTube video about tea', {});
    expect(result).toEqual({ ok: false, note: NEEDS_OUTPUT_FOLDER });
    expect(NEEDS_OUTPUT_FOLDER).toBe('Choose an output folder in Settings first, then ask again.');
    expect(listProjects()).toEqual([]);
    expect(runContentProject).not.toHaveBeenCalled();
  });
});
