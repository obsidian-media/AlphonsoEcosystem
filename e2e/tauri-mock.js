// Playwright E2E — Tauri API mock injected before app loads via addInitScript
// This file is plain JS (no ES modules) evaluated in the browser page context.
(function () {
  if (window.__TAURI_INTERNALS__) return;

  // Signal to main.jsx that this is a Playwright test environment
  window.__PLAYWRIGHT__ = true;

  var callbackId = 0;
  var callbacks = {};

  window.__TAURI_INTERNALS__ = {
    invoke: function (cmd) {
      if (cmd === 'plugin:app|version') return Promise.resolve('1.0.0');
      if (cmd === 'plugin:app|name') return Promise.resolve('Alphonso');
      if (cmd === 'plugin:app|tauri_version') return Promise.resolve('2.0.0');
      if (cmd === 'plugin:app|identifier') return Promise.resolve('com.alphonso.app');
      if (cmd === 'load_settings') return Promise.resolve(null);
      if (cmd === 'save_settings') return Promise.resolve(null);
      if (cmd === 'kv_get') return Promise.resolve(null);
      if (cmd === 'kv_set') return Promise.resolve(null);
      if (cmd === 'get_memory_store_status') return Promise.resolve({ available: false });
      if (cmd === 'list_runtime_ledger_records') return Promise.resolve([]);
      if (cmd === 'upsert_runtime_ledger_records') return Promise.resolve(null);
      if (cmd === 'append_audit_log') return Promise.resolve(null);
      if (cmd === 'read_audit_log') return Promise.resolve([]);
      if (cmd === 'read_runtime_env_value') return Promise.resolve(null);
      if (cmd === 'check_ollama_runtime') return Promise.resolve({ reachable: false });
      if (cmd === 'check_app_update') return Promise.resolve({ available: false });
      if (cmd === 'check_env_vars_presence') return Promise.resolve({});
      if (cmd === 'write_workspace_text_file') return Promise.resolve(null);
      if (cmd === 'alphonso-native-proof-stage') return Promise.resolve(null);
      if (cmd === 'connector_poll_whatsapp') return Promise.resolve(null);
      if (cmd === 'ollama_list_models') return Promise.resolve({ models: [], reason: 'mocked' });
      if (cmd === 'runtime_get_all_status') return Promise.resolve([
        { name: 'ollama', display_name: 'Ollama', installed: true, running: false, version: '0.3.0', install_dir: null, autostart: false },
        { name: 'comfyui', display_name: 'ComfyUI', installed: false, running: false, version: null, install_dir: null, autostart: false },
        { name: 'openwebui', display_name: 'Open WebUI', installed: false, running: false, version: null, install_dir: null, autostart: false },
        { name: 'automatic1111', display_name: 'AUTOMATIC1111', installed: false, running: false, version: null, install_dir: null, autostart: false },
        { name: 'fooocus', display_name: 'Fooocus', installed: false, running: false, version: null, install_dir: null, autostart: false },
        { name: 'invokeai', display_name: 'InvokeAI', installed: false, running: false, version: null, install_dir: null, autostart: false },
        { name: 'whisper', display_name: 'Whisper', installed: false, running: false, version: null, install_dir: null, autostart: false },
        { name: 'audiocraft', display_name: 'AudioCraft / MusicGen', installed: false, running: false, version: null, install_dir: null, autostart: false },
      ]);
      if (cmd === 'runtime_list_tools') return Promise.resolve(['ollama', 'comfyui', 'openwebui', 'automatic1111', 'fooocus', 'invokeai', 'whisper', 'audiocraft']);
      if (cmd === 'runtime_start_tool') return Promise.resolve({ ok: true });
      if (cmd === 'runtime_stop_tool') return Promise.resolve({ ok: true });
      if (cmd === 'runtime_install_tool') return Promise.resolve({ ok: true });
      // Keep this mock aligned with Rust PrereqStatus (camelCase through Tauri).
      if (cmd === 'runtime_check_prerequisites') return Promise.resolve({
        pythonFound: true,
        gitFound: true,
        ollamaFound: true,
        dockerFound: false,
        nodeFound: true,
        missing: [],
        installHint: 'All required runtime prerequisites are available.'
      });
      if (cmd === 'runtime_install_prerequisite') return Promise.resolve({ ok: true });
      if (cmd === 'runtime_get_autostart_prefs') return Promise.resolve({});
      if (cmd === 'runtime_save_autostart_pref') return Promise.resolve(null);
      if (cmd && cmd.indexOf('plugin:window|') === 0) return Promise.resolve(null);
      if (cmd && cmd.indexOf('plugin:event|') === 0) return Promise.resolve(null);
      if (cmd && cmd.indexOf('plugin:resources|') === 0) return Promise.resolve(null);
      return Promise.resolve(null);
    },
    transformCallback: function (callback, once) {
      var id = callbackId++;
      callbacks[id] = { callback: callback, once: !!once };
      return id;
    },
    unregisterCallback: function (id) {
      delete callbacks[id];
    },
    convertFileSrc: function (filePath) {
      return 'asset://localhost/' + filePath;
    },
    metadata: {
      currentWindow: { label: 'main' },
      currentWebview: { label: 'main' }
    }
  };

  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    registerListener: function () {},
    unregisterListener: function () {}
  };

  // Suppress setTimeout delays >= 3000ms to prevent Ollama health check polling.
  // The first health check runs from useEffect, but the scheduled polling via
  // setTimeout (5000ms / 10000ms / 15000ms / 30000ms) would re-trigger state
  // cascades. Blocking long timers stops this without affecting React internals.
  var _origSetTimeout = window.setTimeout;
  var _dummyTimerCounter = 0;
  window.setTimeout = function (fn, delay) {
    if (delay >= 3000) {
      var id = -1 * (++_dummyTimerCounter);
      return id;
    }
    return _origSetTimeout(fn, delay);
  };
  var _origClearTimeout = window.clearTimeout;
  window.clearTimeout = function (id) {
    if (typeof id === 'number' && id < 0) return;
    return _origClearTimeout(id);
  };

  // Seed localStorage to skip onboarding
  try {
    if (!localStorage.getItem('alphonso_onboarding_complete_v1')) {
      localStorage.setItem('alphonso_onboarding_complete_v1', 'true');
    }
    if (!localStorage.getItem('alphonso_settings')) {
      localStorage.setItem('alphonso_settings', JSON.stringify({
        selectedModel: 'tinyllama:latest',
        endpoint: 'http://localhost:11434',
        theme: 'dark',
        operatorMode: false,
        autoUpdateEnabled: false
      }));
    }
  } catch (e) { /* ignore */ }

  // Mock Ollama fetch
  var originalFetch = window.fetch;
  window.fetch = function (url, options) {
    var urlStr = typeof url === 'string' ? url : (url && url.url ? url.url : '');
    if (urlStr.indexOf('localhost:11434') !== -1 || urlStr.indexOf('127.0.0.1:11434') !== -1) {
      if (urlStr.indexOf('/api/tags') !== -1) {
        return Promise.resolve(new Response(JSON.stringify({
          models: [
            { name: 'tinyllama:latest', size: 637000000, modified_at: new Date().toISOString(), digest: 'mock', details: { parameter_size: '1.1B', quantization_level: 'Q4_0' } }
          ]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      if (urlStr.indexOf('/api/show') !== -1) {
        return Promise.resolve(new Response(JSON.stringify({ details: { parameter_size: '1.1B' } }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      if (urlStr.indexOf('/api/generate') !== -1 || urlStr.indexOf('/api/chat') !== -1) {
        var chunk = urlStr.indexOf('/api/chat') !== -1
          ? { model: 'tinyllama', message: { role: 'assistant', content: 'Hello!' }, done: true }
          : { model: 'tinyllama', response: 'Hello!', done: true };
        var stream = new ReadableStream({
          start: function (controller) {
            controller.enqueue(new TextEncoder().encode(JSON.stringify(chunk) + '\n'));
            controller.close();
          }
        });
        return Promise.resolve(new Response(stream, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } }));
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    return originalFetch(url, options);
  };
})();
