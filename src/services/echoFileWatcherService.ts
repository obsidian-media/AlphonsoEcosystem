import { invoke } from '@tauri-apps/api/core';
import { generateOllamaResponse, PREFERRED_MODEL, DEFAULT_OLLAMA_ENDPOINT } from '../lib/ollama';
import { runEchoPreservation } from './echoMemoryService';

const WATCHER_CONFIG_KEY = 'alphonso_echo_watcher_config_v1';
const POLL_INTERVAL_MS = 30_000;
const PROCESSED_CACHE_KEY = 'alphonso_echo_watcher_processed_v1';

export interface WatcherConfig {
  enabled: boolean;
  workspaceRoot: string;
  inboxPath: string;
  pollIntervalSec?: number;
}

function _getProcessedCache(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(PROCESSED_CACHE_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function _addProcessedToCache(relativePath: string): void {
  const cache = _getProcessedCache();
  cache.add(relativePath);
  try {
    localStorage.setItem(PROCESSED_CACHE_KEY, JSON.stringify([...cache].slice(-1000)));
  } catch { /* ignore */ }
}

function _isAlreadyProcessed(relativePath: string): boolean {
  return _getProcessedCache().has(relativePath);
}

export function getWatcherConfig(): WatcherConfig {
  try {
    const raw = localStorage.getItem(WATCHER_CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { enabled: false, workspaceRoot: '', inboxPath: '' };
}

export function saveWatcherConfig(config: WatcherConfig): void {
  try {
    localStorage.setItem(WATCHER_CONFIG_KEY, JSON.stringify({
      enabled: !!config.enabled,
      workspaceRoot: String(config.workspaceRoot || ''),
      inboxPath: String(config.inboxPath || ''),
      pollIntervalSec: Number(config.pollIntervalSec) || 30,
    }));
  } catch { /* ignore */ }
}

interface ProcessFileResult {
  ok: boolean;
  relativePath: string;
  summary?: string;
  error?: string;
}

async function processFile(relativePath: string, workspaceRoot: string): Promise<ProcessFileResult> {
  try {
    const readResult = await invoke('read_workspace_file', {
      workspaceRoot,
      relativePath,
    }) as Record<string, unknown> | null;

    const content = String((readResult as Record<string, unknown>)?.content || '');
    if (content.length < 10) {
      return { ok: false, relativePath, error: 'File too short to summarize' };
    }

    let summary = '';
    try {
      const ollamaResult = await generateOllamaResponse({
        endpoint: DEFAULT_OLLAMA_ENDPOINT,
        model: PREFERRED_MODEL,
        prompt: `Summarize this file content in 2-3 sentences for knowledge preservation:\n\n${content.slice(0, 4000)}`,
      }) as Record<string, unknown> | null;
      summary = String(ollamaResult?.response || content.slice(0, 500));
    } catch {
      summary = content.slice(0, 500);
    }

    await runEchoPreservation(
      `Auto-ingested file: ${relativePath}`,
      { commandId: `inbox_${Date.now()}`, actionType: 'file_ingestion' },
      { 'file-watcher': { summary: `Ingested from ${relativePath}: ${summary.slice(0, 300)}`, resultState: 'completed' } }
    );

    return { ok: true, relativePath, summary };
  } catch (error) {
    return { ok: false, relativePath, error: String((error as Error)?.message || error) };
  }
}

let _watcherInterval: ReturnType<typeof setInterval> | null = null;

export function startFileWatcher(callback: (result: { ingested: number; files: string[] }) => void): () => void {
  stopFileWatcher();

  const intervalMs = (Number(getWatcherConfig().pollIntervalSec) || 30) * 1000 || POLL_INTERVAL_MS;

  _watcherInterval = setInterval(async () => {
    const config = getWatcherConfig();
    if (!config.enabled || !config.workspaceRoot || !config.inboxPath) return;

    try {
      const files = await invoke('watch_inbox_poll', {
        workspaceRoot: config.workspaceRoot,
        inboxPath: config.inboxPath,
      }) as Array<{ relativePath: string }> | null;

      if (!Array.isArray(files) || files.length === 0) return;

      let ingested = 0;
      const processedFiles: string[] = [];

      for (const file of files) {
        if (_isAlreadyProcessed(file.relativePath)) continue;

        const result = await processFile(file.relativePath, config.workspaceRoot);
        if (result.ok) {
          ingested++;
          processedFiles.push(file.relativePath);
          _addProcessedToCache(file.relativePath);

          try {
            await invoke('mark_inbox_file_processed', {
              workspaceRoot: config.workspaceRoot,
              inboxPath: config.inboxPath,
              relativePath: file.relativePath,
            });
          } catch { /* non-critical */ }
        }
      }

      if (ingested > 0) {
        callback({ ingested, files: processedFiles });
      }
    } catch { /* non-critical */ }
  }, intervalMs);

  return stopFileWatcher;
}

export function stopFileWatcher(): void {
  if (_watcherInterval !== null) {
    clearInterval(_watcherInterval);
    _watcherInterval = null;
  }
}
