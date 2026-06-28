import { invoke } from '@tauri-apps/api/core';
import { generateOllamaResponse, PREFERRED_MODEL } from '../lib/ollama';
import { runEchoPreservation } from './echoMemoryService';

const WATCHER_CONFIG_KEY = 'alphonso_echo_watcher_config_v1';
const POLL_INTERVAL_MS = 30_000;
const PROCESSED_CACHE_KEY = 'alphonso_echo_watcher_processed_v1';
const MAX_FILES_PER_POLL = 3; // debounce: process at most 3 files per cycle

/**
 * @typedef {{ enabled: boolean, workspaceRoot: string, inboxPath: string }} WatcherConfig
 */

function _getProcessedCache() {
  try {
    return new Set(JSON.parse(localStorage.getItem(PROCESSED_CACHE_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function _addProcessedToCache(relativePath) {
  const cache = _getProcessedCache();
  cache.add(relativePath);
  try {
    localStorage.setItem(PROCESSED_CACHE_KEY, JSON.stringify([...cache].slice(-1000)));
  } catch { /* ignore */ }
}

function _isAlreadyProcessed(relativePath) {
  return _getProcessedCache().has(relativePath);
}

/**
 * Get the current watcher configuration.
 * @returns {WatcherConfig}
 */
export function getWatcherConfig() {
  try {
    const raw = localStorage.getItem(WATCHER_CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { enabled: false, workspaceRoot: '', inboxPath: '' };
}

/**
 * Save the watcher configuration.
 * @param {WatcherConfig} config
 */
export function saveWatcherConfig(config) {
  try {
    localStorage.setItem(WATCHER_CONFIG_KEY, JSON.stringify({
      enabled: !!config.enabled,
      workspaceRoot: String(config.workspaceRoot || ''),
      inboxPath: String(config.inboxPath || ''),
    }));
  } catch { /* ignore */ }
}

/**
 * Process a single file: read content, summarize with Ollama, save to Echo.
 * @param {string} relativePath
 * @param {string} workspaceRoot
 * @returns {Promise<{ ok: boolean, relativePath: string, summary?: string, error?: string }>}
 */
async function processFile(relativePath, workspaceRoot) {
  try {
    // Read file content
    const readResult = await invoke('read_workspace_file', {
      workspaceRoot,
      relativePath,
    });

    const content = String(readResult?.content || '');
    if (content.length < 10) {
      return { ok: false, relativePath, error: 'File too short to summarize' };
    }

    // Summarize with Ollama
    let summary = '';
    try {
      const ollamaResult = await generateOllamaResponse({
        model: PREFERRED_MODEL,
        prompt: `Summarize this file content in 2-3 sentences for knowledge preservation:\n\n${content.slice(0, 4000)}`,
      });
      summary = String(ollamaResult?.response || content.slice(0, 500));
    } catch {
      summary = content.slice(0, 500);
    }

    // Save to Echo memory
    await runEchoPreservation(
      `Auto-ingested file: ${relativePath}`,
      { commandId: `inbox_${Date.now()}`, actionType: 'file_ingestion' },
      { 'file-watcher': { summary: `Ingested from ${relativePath}: ${summary.slice(0, 300)}`, resultState: 'completed' } }
    );

    return { ok: true, relativePath, summary };
  } catch (error) {
    return { ok: false, relativePath, error: String(error?.message || error) };
  }
}

let _watcherInterval = null;

/**
 * Start the file watcher. Polls every 30s for new files in the inbox.
 * @param {(result: { ingested: number, files: string[] }) => void} callback
 * @returns {() => void} stop function
 */
export function startFileWatcher(callback) {
  stopFileWatcher();

  _watcherInterval = setInterval(async () => {
    const config = getWatcherConfig();
    if (!config.enabled || !config.workspaceRoot || !config.inboxPath) return;

    try {
      // Poll inbox for unprocessed files
      const files = await invoke('watch_inbox_poll', {
        workspaceRoot: config.workspaceRoot,
        inboxPath: config.inboxPath,
      });

      if (!Array.isArray(files) || files.length === 0) return;

      let ingested = 0;
      const processedFiles = [];

      // Debounce: process at most MAX_FILES_PER_POLL per cycle, defer rest to next poll
      const filesToProcess = files.slice(0, MAX_FILES_PER_POLL);

      for (const file of filesToProcess) {
        if (_isAlreadyProcessed(file.relativePath)) continue;

        const result = await processFile(file.relativePath, config.workspaceRoot);
        if (result.ok) {
          ingested++;
          processedFiles.push(file.relativePath);
          _addProcessedToCache(file.relativePath);

          // Mark as processed on disk
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
  }, POLL_INTERVAL_MS);

  return stopFileWatcher;
}

/**
 * Stop the file watcher.
 */
export function stopFileWatcher() {
  if (_watcherInterval !== null) {
    clearInterval(_watcherInterval);
    _watcherInterval = null;
  }
}
