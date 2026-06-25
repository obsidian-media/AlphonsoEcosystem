# Alphonso Fix Plan — Prioritized Remediation
**Based on:** `docs/BUG_REPORT.md` — full codebase audit 2026-06-24  
**Version:** v2.2.3

---

## Phase 1 — Critical Fixes (Do First, 1-2 Hours)
*These are broken features users encounter immediately.*

---

### FIX-01: Repair `retryLastMessage` Stale State (BUG-001)
**File:** `src/components/ChatView.tsx:679-685`  
**Effort:** 10 min

The fix is to not call `handleSend()` immediately. Instead, set the input value and let the user press Send, OR use a `useRef` for the value, OR pass the message directly to the send function.

Recommended approach — pass the content directly:
```ts
const retryLastMessage = () => {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  if (lastUser) {
    handleSend(lastUser.content);  // pass content directly, bypass inputValue state
  }
};
```
This requires `handleSend` to accept an optional `overrideInput?: string` parameter and use that instead of `inputValue` when provided.

---

### FIX-02: Copy `pcm-processor.worklet.ts` to `src/hooks/` (BUG-011)
**File:** `src/hooks/useJarvisVoice.ts:2` + new file `src/hooks/pcm-processor.worklet.ts`  
**Effort:** 5 min

The file exists at `voice/frontend/src/pcm-processor.worklet.ts`. Copy it to `src/hooks/pcm-processor.worklet.ts`. The import in `useJarvisVoice.ts` is already correct (`'./pcm-processor.worklet'`), so no import change needed.

Alternatively, update the import to point to the correct location:
```ts
import { PCM_WORKLET_CODE } from '../../voice/frontend/src/pcm-processor.worklet';
```
But copying the file is cleaner since it's a small string constant.

---

### FIX-03: Fix Tauri Event vs Command API (BUG-002)
**File:** `src/hooks/useAppShellState.js:89`  
**Effort:** 10 min

Change `invoke()` to `emit()`:
```js
import { emit } from '@tauri-apps/api/event';

// Before:
void invoke('alphonso-native-proof-stage', { fileName: stageFileName, ...content }).catch(() => {});

// After:
void emit('alphonso-native-proof-stage', { fileName: stageFileName, ...content }).catch(() => {});
```

---

## Phase 2 — High Priority Fixes (Next Sprint, 1-3 Hours)
*These prevent TypeScript from being useful and block voice in production.*

---

### FIX-04: Install Missing Type Packages (BUG-012)
**File:** `package.json`  
**Effort:** 10 min

```bash
npm install --save-dev @types/react @types/react-dom @types/node
```

After installing, run `npx tsc --noEmit` and fix the **real** type errors (the 29× TS2322 assignment errors and the 22× TS2339 property access errors). The majority of errors (the 1,422 TS7026 JSX errors) will disappear automatically once `@types/react` is installed.

Add a `typecheck` script to `package.json` and include it in CI:
```json
"typecheck": "tsc --noEmit",
"verify:app": "npm run lint && npm run typecheck && npm run test && npm run build"
```

---

### FIX-05: Fix Voice Sidecar Production Path (BUG-015)
**File:** `src-tauri/src/voice_sidecar.rs:13-28`  
**Effort:** 30-60 min

Option A (recommended): Use Tauri's resource resolver to find the `voice/backend` directory bundled with the app. Add `voice/backend` to `tauri.conf.json`'s `resources` array and use `app.path().resource_dir()` to construct the path at runtime:

```rust
use tauri::Manager;

pub async fn voice_start(app: tauri::AppHandle, state: State<'_, VoiceSidecar>) -> Result<String, String> {
    let resource_path = app.path().resource_dir()
        .map_err(|e| e.to_string())?
        .join("voice/backend");
    
    let child = Command::new("python")
        .args(["-m", "uvicorn", "main:app", "--host", "127.0.0.1",
               "--port", "8765", "--app-dir"])
        .arg(&resource_path)
        .spawn()
        ...
```

Option B (simpler, same effect): Use `app.path().app_data_dir()` if the backend is extracted there at install time.

Also add `voice/backend` to `src-tauri/tauri.conf.json`:
```json
"bundle": {
  "resources": ["voice/backend/**"]
}
```

---

## Phase 3 — Medium Priority Fixes (Within a Week, 2-4 Hours Total)

---

### FIX-06: Live Connector Status Updates (BUG-009)
**File:** `src/components/ConnectorStatusIndicators.jsx`  
**Effort:** 30 min

Add a polling interval or a storage event listener so connector status refreshes after credentials are saved:

```js
// ConnectorStatusDot — add interval
useEffect(() => {
  const refresh = () => {
    const connectors = listConnectors();
    const connector = connectors.find((c) => c.id === connectorId);
    setStatus(deriveStatus(connector));
  };
  refresh();
  const id = setInterval(refresh, 5000);  // poll every 5s
  return () => clearInterval(id);
}, [connectorId]);
```

Better alternative: `ConnectorSetupPanel` could dispatch a `CustomEvent` after saving credentials, and `ConnectorStatusIndicators` could listen for it, eliminating polling.

---

### FIX-07: Fix `durableRemove` Ghost Entries in SQLite (BUG-010)
**File:** `src-tauri/src/kv_store.rs` + `src/lib/durableStore.js`  
**Effort:** 30 min

Add a `kv_delete` Tauri command in `kv_store.rs`:
```rust
#[tauri::command]
pub fn kv_delete(app: AppHandle, key: String) -> Result<(), String> {
    let db_path = get_db_path(&app)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM kv WHERE key = ?1", params![key]).map_err(|e| e.to_string())?;
    Ok(())
}
```

Register it in `lib.rs` invoke handler, then update `durableStore.js`:
```js
export function durableRemove(key) {
  localStorage.removeItem(key);
  if (tauriInvoke) {
    tauriInvoke('kv_delete', { key }).catch(() => {});
  }
}
```

---

### FIX-08: Fix O(n²) Message Render (BUG-008)
**File:** `src/components/ChatView.tsx:942`  
**Effort:** 10 min

Replace `messages.indexOf(message)` with the `.map()` callback's index parameter:
```ts
// Before:
messages.map((message) => {
  const idx = messages.indexOf(message);
  ...
})

// After:
messages.map((message, idx) => {
  ...
})
```

---

### FIX-09: Fix Code Splitting for `runtimeManagerService` (BUG-006)
**File:** `src/components/OllamaOfflineBanner.tsx`, `src/components/OnboardingWizard.tsx`, `src/services/creativeRoutingService.js`  
**Effort:** 45 min

Convert all static imports of `runtimeManagerService` to dynamic imports:

**OllamaOfflineBanner.tsx:**
```ts
// Remove: import { startTool } from '../services/runtimeManagerService';

const handleStart = async () => {
  setStarting(true);
  const { startTool } = await import('../services/runtimeManagerService');
  const result = await startTool('ollama');
  ...
};
```

**OnboardingWizard.tsx** and **creativeRoutingService.js**: Apply the same pattern — only import when the function is called, not at module load time.

---

### FIX-10: Fix `voice` Prop Type Missing `liveTranscript` (BUG-016)
**File:** `src/components/ChatView.tsx:203`  
**Effort:** 5 min

```ts
// Before:
voice: { voiceStatus: string; toggleListening: () => void };

// After:
voice: { voiceStatus: string; toggleListening: () => void; liveTranscript?: string };
```

---

### FIX-11: Memoize `getAuditLog()` in RightPanel (BUG-013)
**File:** `src/components/RightPanel.tsx:210`  
**Effort:** 10 min

```ts
// Before (in render body):
const auditEntries: AuditEntry[] = getAuditLog().slice(-10).reverse();

// After (in useMemo):
const auditEntries = useMemo(
  () => getAuditLog().slice(-10).reverse(),
  [activeTab]  // re-read when user switches to Audit tab
);
```

---

## Phase 4 — Low Priority / Cleanup (When Time Permits)

---

### FIX-12: Remove Unused Imports (BUG-003, BUG-004, BUG-005)
**Files:** `src/components/ChatView.tsx`, `src/App.tsx`  
**Effort:** 5 min

Remove from `ChatView.tsx`:
- `Eye`, `EyeOff`, `History`, `Zap as ZapIcon` (line 20)
- `classifyPriorityTier` (line 41)

Remove from `App.tsx`:
- `useTransition` from React import (line 1)

Also consider enabling `no-unused-vars` in `eslint.config.js` to prevent future unused imports.

---

### FIX-13: Fix Test Output Warning Spam (BUG-007)
**File:** `scripts/run-vitest-programmatic.mjs`  
**Effort:** 20 min

The `--localstorage-file` flag is being injected somewhere in the Vitest worker environment. Investigate the Claude Code session hooks in `.claude/settings.json` or the global `NODE_OPTIONS` environment variable. If this is set by the shell profile, update the script to use `--reporter=verbose` and filter the warning lines:

```js
// In the Vitest configuration, add:
process.env.NODE_OPTIONS = (process.env.NODE_OPTIONS || '')
  .split(' ')
  .filter(f => !f.startsWith('--localstorage-file'))
  .join(' ');
```

Also try using Vitest's `--pool=threads` instead of the default to see if workers inherit the flag differently.

---

### FIX-14: Fix Stale `onCheckOllama` Pattern in RightPanel (BUG-014)
**File:** `src/components/RightPanel.tsx:136`  
**Effort:** 5 min

```ts
// Add onCheckOllama to dependency array and remove the eslint-disable:
useEffect(() => {
  const id = setInterval(onCheckOllama, 10 * 60 * 1000);
  return () => clearInterval(id);
}, [onCheckOllama]);
```

Since `onCheckOllama` is `useCallback`-wrapped in `OllamaContext`, this won't cause spurious re-subscriptions.

---

## Fix Priority Matrix

| Phase | ID | Effort | Impact | Fixes Bug |
|---|---|---|---|---|
| 1 (NOW) | FIX-01 | 10 min | CRITICAL — "Try again" works again | BUG-001 |
| 1 (NOW) | FIX-02 | 5 min | CRITICAL — Voice feature works | BUG-011 |
| 1 (NOW) | FIX-03 | 10 min | HIGH — Native proof stage works | BUG-002 |
| 2 | FIX-04 | 30 min | HIGH — TypeScript safety restored | BUG-012 |
| 2 | FIX-05 | 60 min | HIGH — Voice works in production | BUG-015 |
| 3 | FIX-06 | 30 min | MEDIUM — Connector status live | BUG-009 |
| 3 | FIX-07 | 30 min | MEDIUM — SQLite delete works | BUG-010 |
| 3 | FIX-08 | 10 min | MEDIUM — Chat render perf | BUG-008 |
| 3 | FIX-09 | 45 min | MEDIUM — Smaller initial bundle | BUG-006 |
| 3 | FIX-10 | 5 min | MEDIUM — Type safety for voice | BUG-016 |
| 3 | FIX-11 | 10 min | LOW-MED — Audit tab perf | BUG-013 |
| 4 | FIX-12 | 5 min | LOW — Clean imports | BUG-003/004/005 |
| 4 | FIX-13 | 20 min | LOW — Cleaner test output | BUG-007 |
| 4 | FIX-14 | 5 min | LOW — Pattern fix | BUG-014 |

---

## Recommended Order of Execution

1. **FIX-01 + FIX-02 + FIX-03** — One commit, ~25 minutes. Fixes all CRITICAL bugs.  
2. **FIX-04** — Install `@types/react` + fix real TS errors that surface. Add `typecheck` to CI.  
3. **FIX-06** — Connector status live refresh (high UX value, low effort).  
4. **FIX-07 + FIX-08 + FIX-10 + FIX-11 + FIX-12 + FIX-14** — One cleanup commit, ~75 minutes.  
5. **FIX-05** — Voice production path (requires Tauri bundling research, separate branch).  
6. **FIX-09** — Code splitting (separate refactor, requires testing).  
7. **FIX-13** — Test noise (investigate environment setup, deferred).

---

_Fix plan generated from `docs/BUG_REPORT.md` — 2026-06-24_
