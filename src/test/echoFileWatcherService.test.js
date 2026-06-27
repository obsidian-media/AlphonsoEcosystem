import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
}));

vi.mock('../lib/ollama', () => ({
  generateOllamaResponse: vi.fn().mockResolvedValue({ response: 'Test summary' }),
  PREFERRED_MODEL: 'test-model',
}));

vi.mock('../services/echoMemoryService', () => ({
  runEchoPreservation: vi.fn().mockResolvedValue(true),
}));

import {
  getWatcherConfig,
  saveWatcherConfig,
  startFileWatcher,
  stopFileWatcher,
} from '../services/echoFileWatcherService';
import { invoke } from '@tauri-apps/api/core';
import { runEchoPreservation } from '../services/echoMemoryService';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  stopFileWatcher();
  vi.useRealTimers();
});

describe('getWatcherConfig', () => {
  it('returns default config when nothing stored', () => {
    expect(getWatcherConfig()).toEqual({ enabled: false, workspaceRoot: '', inboxPath: '' });
  });

  it('returns stored config', () => {
    localStorage.setItem('alphonso_echo_watcher_config_v1', JSON.stringify({ enabled: true, workspaceRoot: '/ws', inboxPath: '/inbox' }));
    expect(getWatcherConfig()).toEqual({ enabled: true, workspaceRoot: '/ws', inboxPath: '/inbox' });
  });

  it('returns default on corrupt JSON', () => {
    localStorage.setItem('alphonso_echo_watcher_config_v1', '{invalid');
    expect(getWatcherConfig()).toEqual({ enabled: false, workspaceRoot: '', inboxPath: '' });
  });
});

describe('saveWatcherConfig', () => {
  it('saves config to localStorage', () => {
    saveWatcherConfig({ enabled: true, workspaceRoot: '/ws', inboxPath: '/inbox' });
    const stored = JSON.parse(localStorage.getItem('alphonso_echo_watcher_config_v1'));
    expect(stored).toEqual({ enabled: true, workspaceRoot: '/ws', inboxPath: '/inbox' });
  });

  it('coerces undefined fields to empty strings', () => {
    saveWatcherConfig({});
    const stored = JSON.parse(localStorage.getItem('alphonso_echo_watcher_config_v1'));
    expect(stored).toEqual({ enabled: false, workspaceRoot: '', inboxPath: '' });
  });
});

describe('stopFileWatcher', () => {
  it('does not throw when called without starting', () => {
    expect(() => stopFileWatcher()).not.toThrow();
  });
});

describe('startFileWatcher', () => {
  it('returns a stop function', () => {
    const stop = startFileWatcher(() => {});
    expect(typeof stop).toBe('function');
    stop();
  });

  it('does not poll when config is disabled', async () => {
    saveWatcherConfig({ enabled: false, workspaceRoot: '/ws', inboxPath: '/inbox' });
    startFileWatcher(() => {});
    await vi.advanceTimersByTimeAsync(60_000);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('polls invoke when config enabled', async () => {
    saveWatcherConfig({ enabled: true, workspaceRoot: '/ws', inboxPath: '/inbox' });
    invoke.mockResolvedValue([]);
    startFileWatcher(() => {});
    await vi.advanceTimersByTimeAsync(30_000);
    expect(invoke).toHaveBeenCalledWith('watch_inbox_poll', { workspaceRoot: '/ws', inboxPath: '/inbox' });
  });

  it('calls callback with ingested count on new files', async () => {
    saveWatcherConfig({ enabled: true, workspaceRoot: '/ws', inboxPath: '/inbox' });
    invoke
      .mockResolvedValueOnce([{ relativePath: 'file1.txt' }])
      .mockResolvedValueOnce({ content: 'Some content here for summary' });
    const cb = vi.fn();
    startFileWatcher(cb);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(cb).toHaveBeenCalledWith({ ingested: 1, files: ['file1.txt'] });
    expect(runEchoPreservation).toHaveBeenCalled();
  });

  it('skips files that are too short', async () => {
    saveWatcherConfig({ enabled: true, workspaceRoot: '/ws', inboxPath: '/inbox' });
    invoke
      .mockResolvedValueOnce([{ relativePath: 'tiny.txt' }])
      .mockResolvedValueOnce({ content: 'hi' });
    const cb = vi.fn();
    startFileWatcher(cb);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(cb).not.toHaveBeenCalled();
  });

  it('deduplicates files across poll cycles', async () => {
    saveWatcherConfig({ enabled: true, workspaceRoot: '/ws', inboxPath: '/inbox' });
    invoke
      .mockResolvedValueOnce([{ relativePath: 'dup.txt' }])
      .mockResolvedValueOnce({ content: 'Enough content to pass the length check easily' })
      .mockResolvedValueOnce([{ relativePath: 'dup.txt' }]);
    const cb = vi.fn();
    startFileWatcher(cb);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(cb).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('processes multiple files in a single poll', async () => {
    saveWatcherConfig({ enabled: true, workspaceRoot: '/ws', inboxPath: '/inbox' });
    invoke
      .mockResolvedValueOnce([{ relativePath: 'a.txt' }, { relativePath: 'b.txt' }])
      .mockResolvedValue({ content: 'File content that is long enough for summary' });
    const cb = vi.fn();
    startFileWatcher(cb);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(cb).toHaveBeenCalledWith({ ingested: 2, files: ['a.txt', 'b.txt'] });
  });

  it('marks files as processed on disk', async () => {
    saveWatcherConfig({ enabled: true, workspaceRoot: '/ws', inboxPath: '/inbox' });
    invoke
      .mockResolvedValueOnce([{ relativePath: 'doc.md' }])
      .mockResolvedValueOnce({ content: 'Some markdown content for testing purposes' });
    startFileWatcher(() => {});
    await vi.advanceTimersByTimeAsync(30_000);
    expect(invoke).toHaveBeenCalledWith('mark_inbox_file_processed', {
      workspaceRoot: '/ws',
      inboxPath: '/inbox',
      relativePath: 'doc.md',
    });
  });
});
