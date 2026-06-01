# Connector Completion Report
**Date:** 2026-05-31
**Agent:** Parallel subagent — connector error handling, Brave Search, ModelSwitcher

---

## 1. Claude + ChatGPT Connector Error Handling (Task 1)

### What was improved

Both `sendClaudeConnectorMessage` and `sendChatGptConnectorMessage` in
`src/services/connectorRegistryService.js` previously called `invoke(...)` directly with no
error wrapping. If the Rust command threw (or timed out), the exception would propagate
uncaught to the caller with no structured payload.

The following improvements were added to **both** functions:

| Failure case | Before | After |
|---|---|---|
| Missing API key (env var absent) | Silent setup_required from `requireConnectorReady` | Pre-flight `check_env_vars_presence` returns `{ success: false, code: 'MISSING_KEY', error: 'API key missing — configure X_API_KEY in settings' }` |
| Rate limit (429) | Unhandled invoke error or raw Rust error string | Caught at invoke level and at HTTP-result level; returns `{ success: false, code: 'RATE_LIMITED', error: 'Rate limited — wait 60s and retry' }` |
| Timeout | Unhandled exception | `Promise.race` against a 30 s timer; returns `{ success: false, code: 'TIMEOUT', error: 'Request timed out after 30s' }` |
| 401 / 403 in result | Not detected | Mapped to `MISSING_KEY` code |
| Any other invoke error | Thrown raw | Caught and returned as `{ success: false, code: 'INVOKE_ERROR', error: 'Claude/ChatGPT connector error: <message>' }` |

**Timeout** is configurable per-call via `options.timeoutMs` (default 30 000 ms).

The `success` field mirrors `ok` so callers can use either convention.

---

## 2. Brave Search (Task 2)

### Rust command status

`search_brave_sources` was found in `src-tauri/src/lib.rs` (line 5965) and is already
registered in the Tauri command handler. No Rust changes were needed.

### What was wired

`src/services/hectorResearchService.js` already called the Rust command via
`invoke('search_brave_sources', ...)` inside `discoverResearchSourcesBrave`. However:

- If the Rust path failed silently (e.g. API key absent in the Tauri env), the function
  returned an empty array and the entire request fell through to DuckDuckGo with no trace.
- There was no frontend path using `VITE_BRAVE_SEARCH_API_KEY`.

**Changes made:**

1. Added a new exported function `searchBrave(query, count)` — a pure frontend implementation
   using `VITE_BRAVE_SEARCH_API_KEY` from the Vite env. Returns:
   - `{ success: true, results: [{ title, url, snippet, source: 'brave' }] }` on success
   - `{ success: false, error: '...', results: [] }` on key-missing or HTTP error

2. `discoverResearchSourcesBrave` now tries the Rust path first. If it returns empty or
   throws, it falls through to `searchBrave` (the frontend VITE_ key path) before giving up.
   Results from the frontend path carry `provider: 'brave_search_frontend'` so the provenance
   is visible in source objects.

3. `isBraveSearchConfigured` (already exported) checks the server-side key via
   `check_env_vars_presence`. Callers can additionally check
   `!!import.meta.env.VITE_BRAVE_SEARCH_API_KEY` for the frontend key.

**To use Brave Search in production:**
- Set `BRAVE_SEARCH_API_KEY` in the Tauri `.env` / system environment (used by Rust)
- OR set `VITE_BRAVE_SEARCH_API_KEY` in `.env` (used by the frontend fetch path)
- Both keys are optional; the service auto-falls-back to DuckDuckGo if both are absent

---

## 3. ModelSwitcher Component (Tasks 3 + 4)

### Component: `src/components/ModelSwitcher.jsx`

- On mount, fetches `http://localhost:11434/api/tags` with a 3 s timeout.
- Shows a compact `<select>` dropdown in Tailwind dark theme, sized to fit in the chat header bar.
- Gracefully handles Ollama offline: shows an amber "Ollama offline" pill instead of the dropdown.
- Shows "Loading…" while the initial fetch is in flight.
- Calls `onModelChange(modelName)` prop when selection changes.
- Persists the selected model to `localStorage` under key `alphonso_selected_model_v1`.

### Where it is mounted

`ChatView.jsx` — in the `h-12` header bar at the top of the chat view, immediately to the
right of the "CHAT SESSION: id" label. The dropdown sits alongside Export / Clear buttons.

`onModelChange` is wired through to `App.jsx` as:
```js
onModelChange={(modelName) => setSettings((current) => ({ ...current, selectedModel: modelName }))}
```

This means picking a model in the dropdown updates `settings.selectedModel` in `App` state
(and thereby persists to localStorage via the existing settings effect), exactly the same way
the Settings panel does.

---

## 4. What Still Needs Work

| Item | Notes |
|---|---|
| True streaming for Claude/ChatGPT connectors | Both still call `connector_send_claude` / `connector_send_chatgpt` which return a single response. Streaming requires a Tauri event channel (`emit`/`listen`) or a Rust SSE proxy. |
| ModelSwitcher auto-refresh | The component fetches models once on mount. If Ollama starts after the component mounts, the user must navigate away and back to refresh the list. A "retry" button or polling interval would improve UX. |
| Brave Search `searchBrave` rate-limit handling | The frontend path returns the raw HTTP status; no retry or backoff is implemented. |
| ChatGPT / Claude connector timeout option in UI | The `timeoutMs` option is accepted but there is no settings UI to configure it. |

---

## 5. How to Test Each Piece

### Claude / ChatGPT error handling

1. Ensure `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` are **absent** from the Tauri env.
2. Enable the Claude or ChatGPT connector auth profile in the Connector Setup panel.
3. Trigger `sendClaudeConnectorMessage('test')` (e.g. from the browser console via the
   injected service, or by wiring a test button).
4. Confirm the returned object has `{ success: false, code: 'MISSING_KEY' }`.
5. To test rate-limit: mock the Rust command to return `{ ok: false, httpStatus: 429 }`.
6. To test timeout: call with `options: { timeoutMs: 1 }`.

### Brave Search

1. Set `VITE_BRAVE_SEARCH_API_KEY=your_key` in `.env` and rebuild.
2. Open browser console in the running app:
   ```js
   import('/src/services/hectorResearchService.js')
     .then(m => m.searchBrave('Tauri v2 docs'))
     .then(console.log);
   ```
3. Confirm `success: true` and a `results` array with `title/url/snippet`.
4. Create a Hector research draft with no source URLs and run it — confirm the provider chain
   in the returned report includes `brave_search` or `brave_search_frontend`.

### ModelSwitcher

1. Start Ollama (`ollama serve`).
2. Run the app (`npm run tauri dev`).
3. Switch to the Chat tab — the dropdown should appear next to the session label.
4. Select a different model — confirm `alphonso_selected_model_v1` in `localStorage` updates,
   and the TopBar model badge updates to the new selection.
5. Stop Ollama and reload — confirm the "Ollama offline" amber pill renders instead of the dropdown.
