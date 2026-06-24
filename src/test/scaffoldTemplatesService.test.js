import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../services/workspaceArtifactService', () => ({
  writeWorkspaceArtifact: vi.fn().mockResolvedValue(undefined)
}));

import { writeWorkspaceArtifact } from '../services/workspaceArtifactService';
import {
  detectStackTemplate,
  scaffoldProject,
  listScaffoldTemplates
} from '../services/scaffoldTemplatesService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('detectStackTemplate', () => {
  it('detects react template from "build a react spa"', () => {
    const result = detectStackTemplate('build a react spa');
    expect(result).not.toBeNull();
    expect(result.key).toBe('react');
  });

  it('detects nextjs template from "create a next.js app"', () => {
    const result = detectStackTemplate('create a next.js app');
    expect(result).not.toBeNull();
    expect(result.key).toBe('nextjs');
  });

  it('detects express template from "build an express api"', () => {
    const result = detectStackTemplate('build an express api');
    expect(result).not.toBeNull();
    expect(result.key).toBe('express');
  });

  it('detects todo template from "make a todo app"', () => {
    const result = detectStackTemplate('make a todo app');
    expect(result).not.toBeNull();
    expect(result.key).toBe('todo');
  });

  it('returns null for unrecognized description', () => {
    const result = detectStackTemplate('a completely unrecognized qwerty zxcvb xyz123');
    expect(result).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(detectStackTemplate('')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(detectStackTemplate(null)).toBeNull();
  });
});

describe('scaffoldProject', () => {
  it('scaffolds a react project and returns filesWritten', async () => {
    const result = await scaffoldProject('build a react spa', '/workspace/root');
    expect(result).not.toBeNull();
    expect(result.templateName).toContain('React');
    expect(Array.isArray(result.filesWritten)).toBe(true);
    expect(result.filesWritten.length).toBeGreaterThan(0);
  });

  it('returns null when no template matches', async () => {
    const result = await scaffoldProject('totally unrecognized xyz999', '/workspace/root');
    expect(result).toBeNull();
  });

  it('returns null when workspaceRoot is missing', async () => {
    const result = await scaffoldProject('build a react spa', '');
    expect(result).toBeNull();
  });

  it('calls writeWorkspaceArtifact for each file in the template', async () => {
    await scaffoldProject('build a react spa', '/ws');
    expect(writeWorkspaceArtifact).toHaveBeenCalled();
  });

  it('includes commands array in result', async () => {
    const result = await scaffoldProject('build a react spa', '/ws');
    expect(Array.isArray(result.commands)).toBe(true);
  });
});

describe('listScaffoldTemplates', () => {
  it('returns an array of template descriptors', () => {
    const templates = listScaffoldTemplates();
    expect(Array.isArray(templates)).toBe(true);
    expect(templates.length).toBeGreaterThan(0);
  });

  it('each descriptor has key, name, fileCount', () => {
    const templates = listScaffoldTemplates();
    for (const t of templates) {
      expect(t.key).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(typeof t.fileCount).toBe('number');
    }
  });
});
