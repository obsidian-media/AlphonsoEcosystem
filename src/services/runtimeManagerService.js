import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export const TOOL_NAMES = [
  'ollama',
  'comfyui',
  'automatic1111',
  'fooocus',
  'invokeai',
  'whisper',
  'audiocraft',
];

/**
 * @returns {Promise<Array>} status for all 7 managed tools
 */
export async function getAllStatus() {
  return invoke('runtime_get_all_status');
}

/**
 * @returns {Promise<Array>} static tool catalogue (names, ports, urls)
 */
export async function listTools() {
  return invoke('runtime_list_tools');
}

/**
 * Install a tool (git clone + pip install).
 * Progress events arrive via onProgress callback.
 * @param {string} name
 * @param {Function} onProgress  (progress: {tool, stage, message, pct}) => void
 * @returns {Promise<{tool, ok, message}>}
 */
export async function installTool(name, onProgress) {
  let unlisten = null;
  if (typeof onProgress === 'function') {
    unlisten = await listen('runtime://progress', ({ payload }) => {
      if (payload.tool === name) onProgress(payload);
    });
  }
  try {
    return await invoke('runtime_install_tool', { name });
  } finally {
    if (unlisten) unlisten();
  }
}

/**
 * Start an installed tool.
 * @param {string} name
 * @returns {Promise<{tool, ok, message}>}
 */
export async function startTool(name) {
  return invoke('runtime_start_tool', { name });
}

/**
 * Stop a tool that Alphonso started.
 * @param {string} name
 * @returns {Promise<{tool, ok, message}>}
 */
export async function stopTool(name) {
  return invoke('runtime_stop_tool', { name });
}

/**
 * Subscribe to real-time progress events for any tool install.
 * @param {Function} cb  (progress) => void
 * @returns {Promise<Function>} unlisten function
 */
export async function onAnyProgress(cb) {
  return listen('runtime://progress', ({ payload }) => cb(payload));
}

/**
 * Check whether Python, Git, and Ollama are available.
 * @returns {Promise<PrereqStatus>}
 */
export async function checkPrerequisites() {
  return invoke('runtime_check_prerequisites');
}

/**
 * Install a missing prerequisite (python | git | ollama) via winget/brew.
 * @param {string} name  'python' | 'git' | 'ollama'
 * @returns {Promise<{tool, ok, message}>}
 */
export async function installPrerequisite(name) {
  return invoke('runtime_install_prerequisite', { name });
}

/**
 * Get per-tool autostart preferences.
 * @returns {Promise<Record<string, boolean>>}
 */
export async function getAutostartPrefs() {
  return invoke('runtime_get_autostart_prefs');
}

/**
 * Save a single tool's autostart preference.
 * @param {string} name
 * @param {boolean} enabled
 */
export async function saveAutostartPref(name, enabled) {
  return invoke('runtime_save_autostart_pref', { name, enabled });
}

/**
 * Subscribe to live log lines during an install or startup.
 * @param {string} tool  tool name to filter; pass null for all
 * @param {Function} cb  ({tool, line, stream}) => void
 * @returns {Promise<Function>} unlisten
 */
export async function onLogLine(tool, cb) {
  return listen('runtime://log', ({ payload }) => {
    if (!tool || payload.tool === tool) cb(payload);
  });
}

/**
 * Poll status for a single tool until `running === true` or timeout.
 * @param {string} name
 * @param {number} timeoutMs  default 60_000
 * @returns {Promise<boolean>} true if came up
 */
export async function waitForTool(name, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const statuses = await getAllStatus().catch(() => []);
    const s = statuses.find((t) => t.name === name);
    if (s?.running) return true;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}
