# Alphonso Bug Report — Full Codebase Audit
**Date:** 2026-06-24  
**Version:** v2.2.3  
**Scope:** Every file in `src/`, `src-tauri/src/`, `voice/`, `.github/workflows/`  
**Method:** Manual code inspection + `tsc --noEmit` + `npm run build` + `npm run test`

---

## Severity Legend

| Severity | Meaning |
|---|---|
| CRITICAL | Feature is broken or silently broken at runtime — user-visible failure |
| HIGH | Significant correctness, safety, or maintainability problem |
| MEDIUM | Affects UX, correctness in edge cases, or causes technical debt |
| LOW | Cosmetic, dead code, or DX-only issue |

---

## Confirmed Bugs

---

### BUG-001 — "Try Again" Button Is Completely Broken
**File:** `src/components/ChatView.tsx:679-685`  
**Severity:** CRITICAL  
**Category:** React State / Async Timing

**Code:**
```js
const retryLastMessage = () => {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  if (lastUser) {
    setInputValue(lastUser.content);  // schedules async state update
    handleSend();                     // reads STALE inputValue immediately
  }
};
```

**Evidence:** `setInputValue` is a React `useState` setter — it schedules an async state update. `handleSend()` is called on the very next line and reads the **current** (old) value of `inputValue` from the closure, not the value just set. The user's last message is never re-sent.

**Impact:** The "Try again" button does nothing useful. It sends whatever was already in the input box (possibly empty), not the last user message.

---

### BUG-002 — Native Proof Stage Silently Never Written
**File:** `src/hooks/useAppShellState.js:89`  
**Severity:** HIGH  
**Category:** Tauri API Misuse

**Code:**
```js
void invoke('alphonso-native-proof-stage', { fileName: stageFileName, ...content }).catch(() => {});
```

**Evidence:** In `src-tauri/src/lib.rs:1747`, `alphonso-native-proof-stage` is registered as a **Tauri event listener**:
```rust
app.listen("alphonso-native-proof-stage", move |event| { ... })
```
Events are triggered via `emit()` from `@tauri-apps/api/event`, NOT via `invoke()`. `invoke()` is for registered Tauri commands only. The `.catch(() => {})` silently swallows the failure.

**Impact:** Native self-development proof stages are never written to disk. The `.catch(() => {})` hides the error entirely. The proof file is always incomplete.

---

### BUG-011 — Voice Is Broken: Missing `pcm-processor.worklet` File
**File:** `src/hooks/useJarvisVoice.ts:2`  
**Severity:** CRITICAL  
**Category:** Missing File / Broken Import

**Code:**
```ts
import { PCM_WORKLET_CODE } from './pcm-processor.worklet';
```

**Evidence:**  
- `src/hooks/pcm-processor.worklet.ts` does NOT exist.  
- The only matching file is at `voice/frontend/src/pcm-processor.worklet.ts` — a completely different package.  
- `tsc --noEmit` reports: `error TS2307: Cannot find module './pcm-processor.worklet' or its corresponding type declarations.`  
- `npm run build` succeeds because `@vitejs/plugin-react-oxc` uses OXC (no type-checking) and Vite silently skips unresolvable static imports in some configurations.  
- At runtime, `PCM_WORKLET_CODE` is `undefined`, so the AudioWorklet blob contains the string `"undefined"`, which fails to register and throws.

**Impact:** The Jarvis voice feature (AudioWorklet WebSocket pipeline) is completely non-functional. The voice-to-text pipeline crashes immediately on start.

---

### BUG-012 — 1,867 TypeScript Errors: Missing `@types/react` and `@types/react-dom`
**File:** `package.json` (devDependencies)  
**Severity:** HIGH  
**Category:** Missing Dependencies / Build Configuration

**Evidence:**  
Running `npx tsc --noEmit` produces 1,867 TypeScript errors:
- 1,422 × `TS7026`: JSX element implicitly has type 'any' (no `JSX.IntrinsicElements` interface)
- 154 × `TS7006`: Parameter implicitly has 'any' type
- 64 × `TS7016`: Could not find declaration file for module
- 29 × `TS2322`: Type assignment errors
- And more

Root cause: `@types/react`, `@types/react-dom`, and `@types/node` are **not installed**. The CI pipeline does not run `tsc --noEmit` (only `lint + test + build`). The Vite build uses OXC which doesn't type-check, hiding all errors.

**Impact:** TypeScript provides **zero type safety** for the entire React component tree. Prop contract violations, missing properties, and wrong types all go undetected. Developers writing TypeScript components are working with false confidence.

---

### BUG-015 — Voice Server Fails in Production: Hardcoded Relative Path
**File:** `src-tauri/src/voice_sidecar.rs:13-28`  
**Severity:** HIGH  
**Category:** Production Path Resolution

**Code:**
```rust
let child = Command::new("python")
    .args(["-m", "uvicorn", "main:app", "--host", "127.0.0.1",
           "--port", "8765", "--app-dir", "voice/backend"])
    ...
    .spawn()
```

**Evidence:**  
- The `"voice/backend"` path is relative to the process CWD.  
- In development (`npm run tauri dev`), CWD is the repo root — this works.  
- In production (NSIS/MSI installer), Tauri's CWD is typically the installation directory or `%APPDATA%`. `voice/backend` won't exist there.  
- Additionally, `"python"` assumes Python is on `PATH`, which is handled by the Runtime Manager prereq system but is not guaranteed at Tauri app start.

**Impact:** `voice_start` Tauri command fails silently in production installs. The Voice OS feature (advertised in CLAUDE.md) is broken in any deployed build.

---

### BUG-006 — Code Splitting Defeat: `runtimeManagerService` Always in Main Bundle
**File:** Multiple files (static imports)  
**Severity:** MEDIUM  
**Category:** Build / Performance

**Evidence:** Build output confirms:
```
[INEFFECTIVE_DYNAMIC_IMPORT] src/services/runtimeManagerService.js is dynamically
imported by src/App.tsx but also statically imported by:
  src/components/OllamaOfflineBanner.tsx
  src/components/OnboardingWizard.tsx
  src/components/RuntimeManagerView.jsx
  src/services/creativeRoutingService.js
```
The static imports force `runtimeManagerService.js` (a large service with Tauri invoke calls) into the main `index-C3hpk8iR.js` bundle (292kB). It can't be split into a lazy chunk.

**Impact:** Slower initial parse/load. All users pay the cost of loading the runtime manager even if they never open the Runtimes tab.

---

### BUG-008 — O(n²) Render in ChatView: `messages.indexOf` Inside `.map()`
**File:** `src/components/ChatView.tsx:942`  
**Severity:** MEDIUM  
**Category:** Performance

**Code:**
```js
messages.map((message) => {
  const idx = messages.indexOf(message);  // O(n) search inside O(n) map
  ...
})
```

**Evidence:** `Array.prototype.indexOf` performs a linear scan. Inside a `.map()` over the same array, this is O(n²). For a chat with 100 messages, this is 10,000 iterations on every render.

**Impact:** Chat rendering becomes noticeably laggy for longer conversations, especially during streaming (where re-renders are frequent).

---

### BUG-009 — Connector Status Indicators Never Update After Mount
**File:** `src/components/ConnectorStatusIndicators.jsx:32-39` and `:56-60`  
**Severity:** MEDIUM  
**Category:** Stale State

**Code:**
```js
// ConnectorStatusDot
useEffect(() => {
  const connectors = listConnectors();
  const connector = connectors.find((c) => c.id === connectorId);
  setStatus(deriveStatus(connector));
}, [connectorId]);  // only re-runs when connectorId changes

// ConnectorStatusStrip
useEffect(() => {
  setConnectors(listConnectors());
}, []);  // only runs once on mount
```

**Evidence:** Both components read connector state once and never subscribe to updates. After a user saves credentials in `ConnectorSetupPanel`, the sidebar status dot still shows "disabled" or "missing_config" until the user reloads the page.

**Impact:** Connector setup UX is broken — saving credentials appears to have no effect visually. Users have no confirmation that their connector is now live without reloading.

---

### BUG-010 — `durableRemove` Sets Key to Empty String Instead of Deleting
**File:** `src/lib/durableStore.js:22-25`  
**Severity:** MEDIUM  
**Category:** Data Integrity

**Code:**
```js
export function durableRemove(key) {
  localStorage.removeItem(key);   // correct: removes from localStorage
  if (tauriInvoke) {
    tauriInvoke('kv_set', { key, value: '' }).catch(() => {});  // BUG: sets to '' not deletes
  }
}
```

**Evidence:** `src-tauri/src/kv_store.rs` only exposes `kv_set` and `kv_get` — there is no `kv_delete` command. `durableRemove` calls `kv_set(key, '')` which stores an empty string in SQLite. On next boot, `kv_get` returns `''` (not `null`). Any code that does `if (raw)` or `JSON.parse(raw)` would get an empty string instead of `null`, potentially causing parse errors or treating deleted data as present.

**Impact:** After removing data (e.g., clearing crash logs, removing nova history), the SQLite store retains ghost entries. On the next cold boot where Tauri KV is the source of truth, data appears to still exist.

---

### BUG-013 — `getAuditLog()` Called in Render Body (Not Memoized)
**File:** `src/components/RightPanel.tsx:210`  
**Severity:** LOW-MEDIUM  
**Category:** Performance / Pattern

**Code:**
```ts
// Outside useMemo, called directly in render:
const auditEntries: AuditEntry[] = getAuditLog().slice(-10).reverse();
```

**Evidence:** `getAuditLog()` reads from `localStorage`. This runs on every render of `RightPanel`. While `RightPanel` doesn't re-render often, localStorage reads in the render path block the main thread synchronously.

**Impact:** Minor performance overhead. Pattern violation — side-effectful reads should be in `useMemo` with appropriate dependencies.

---

### BUG-016 — `voice` Prop Type Missing `liveTranscript` in ChatView
**File:** `src/components/ChatView.tsx:203` and `277-280`  
**Severity:** MEDIUM  
**Category:** TypeScript Type Gap

**Code:**
```ts
// Prop type (line 203):
voice: { voiceStatus: string; toggleListening: () => void };

// Usage (line 277-280):
useEffect(() => {
  if (voice?.liveTranscript) {  // TypeScript: Property 'liveTranscript' does not exist
    setInputValue(voice.liveTranscript);
  }
}, [voice?.liveTranscript]);
```

**Evidence:** `useVoiceInput.js:123` returns `liveTranscript` in its result, and it IS passed through from App.tsx. The TypeScript prop interface just doesn't declare it. TypeScript reports `TS2339: Property 'liveTranscript' does not exist on type '{ voiceStatus: string; toggleListening: () => void }'`.

**Impact:** TypeScript provides no type-checking for `liveTranscript` usage. If `useVoiceInput`'s API changes to rename this field, TypeScript won't catch the breakage.

---

### BUG-003 — Unused Imports in ChatView
**File:** `src/components/ChatView.tsx:20`  
**Severity:** LOW  
**Category:** Dead Code

**Evidence:** Imported but never referenced in the file:
- `Eye` from lucide-react  
- `EyeOff` from lucide-react  
- `History` from lucide-react  
- `Zap as ZapIcon` from lucide-react

ESLint doesn't catch these because `no-unused-vars` is set to `'off'` in `eslint.config.js:43`.

**Impact:** Minor bundle size increase. Noise in imports.

---

### BUG-004 — `useTransition` Unused Import in App.tsx
**File:** `src/App.tsx:1`  
**Severity:** LOW  
**Category:** Dead Code

**Evidence:**
```ts
import React, { Suspense, lazy, useCallback, useEffect, useMemo,
  useRef, useState, useTransition } from 'react';
```
Searching `src/App.tsx` for `useTransition` or `startTransition` only returns line 1 (the import). The actual usage is in `src/hooks/useAppShellState.js`, which imports it independently.

**Impact:** Dead import. No runtime effect.

---

### BUG-005 — `classifyPriorityTier` Unused Import in ChatView
**File:** `src/components/ChatView.tsx:41`  
**Severity:** LOW  
**Category:** Dead Code

**Evidence:** Imported but no reference exists anywhere in ChatView.tsx.

**Impact:** Dead import, minor bundle size.

---

### BUG-007 — `--localstorage-file` Warning Spams 100+ Times Per Test Run
**File:** `scripts/run-vitest-programmatic.mjs` + Vitest config  
**Severity:** LOW  
**Category:** Developer Experience

**Evidence:** The script sanitizes `process.env.NODE_OPTIONS` to remove `--localstorage-file` before calling `startVitest`. However, Vitest spawns worker processes that re-inherit the full environment, including the unsanitized `NODE_OPTIONS`. Each worker emits the warning independently, resulting in 100+ identical warning lines per `npm run test` invocation.

**Impact:** Test output is extremely noisy. Real warnings or errors are buried under the repeated `--localstorage-file` noise.

---

### BUG-014 — `onCheckOllama` Stale Closure Risk in RightPanel
**File:** `src/components/RightPanel.tsx:136-139`  
**Severity:** LOW  
**Category:** React Hooks / Correctness

**Code:**
```ts
useEffect(() => {
  const id = setInterval(onCheckOllama, 10 * 60 * 1000);
  return () => clearInterval(id);
}, []); // eslint-disable-line react-hooks/exhaustive-deps
```

**Evidence:** `onCheckOllama` is captured at mount time. If the reference changes (it's `useCallback`-wrapped in `OllamaContext` but deps could change), the interval would hold a stale closure. The lint disable comment explicitly suppresses the warning.

**Impact:** Low risk in practice (the callback is stable), but is a pattern violation that could silently break if `OllamaContext` is refactored.

---

## Summary Table

| ID | File | Severity | Description |
|---|---|---|---|
| BUG-001 | `ChatView.tsx:679` | CRITICAL | Stale state in `retryLastMessage` — "Try again" broken |
| BUG-011 | `useJarvisVoice.ts:2` | CRITICAL | Missing `pcm-processor.worklet` — voice broken |
| BUG-002 | `useAppShellState.js:89` | HIGH | `invoke()` used for Tauri event — should be `emit()` |
| BUG-012 | `package.json` | HIGH | Missing `@types/react`/`@types/react-dom` — 1867 TS errors |
| BUG-015 | `voice_sidecar.rs:13` | HIGH | Relative `voice/backend` path fails in production builds |
| BUG-006 | Multiple files | MEDIUM | Static imports defeat dynamic code splitting for runtimeManagerService |
| BUG-008 | `ChatView.tsx:942` | MEDIUM | O(n²) `messages.indexOf` in render |
| BUG-009 | `ConnectorStatusIndicators.jsx` | MEDIUM | Connector status never refreshes after mount |
| BUG-010 | `durableStore.js:22` | MEDIUM | `durableRemove` sets to `''` instead of deleting from SQLite |
| BUG-013 | `RightPanel.tsx:210` | MEDIUM | `getAuditLog()` called in render, not memoized |
| BUG-016 | `ChatView.tsx:203` | MEDIUM | `voice` prop type missing `liveTranscript` |
| BUG-003 | `ChatView.tsx:20` | LOW | Unused imports: Eye, EyeOff, History, ZapIcon |
| BUG-004 | `App.tsx:1` | LOW | Unused `useTransition` import |
| BUG-005 | `ChatView.tsx:41` | LOW | Unused `classifyPriorityTier` import |
| BUG-007 | Test runner | LOW | `--localstorage-file` warning spam in tests |
| BUG-014 | `RightPanel.tsx:137` | LOW | `onCheckOllama` stale closure risk |

---

## What Was NOT Examined (Partial Coverage)

The following files were not read in depth due to context limits:
- `src/agents/` — 9 agent profile/schema files (skimmed, no bugs identified)
- `src/services/telegramCompanionService.js`, `whatsappBrowserConnector.js`, `marcusExecutionService.js` — only glanced
- `src/services/sessionIntelligenceService.js`, `runtimeLedgerService.js`, `missionRoomService.js`
- `src-tauri/src/companion_*.rs`, `runtime_manager.rs` (deeper logic)
- `voice/backend/` — Python FastAPI source
- All `src/test/` files (144 test files)
- `src/components/SettingsView.tsx` (depth), `src/components/OnboardingWizard.tsx`

All tooling (tests, lint, Rust clippy) **passes clean**. The bugs above are runtime and type-system issues invisible to the current CI pipeline.

---

_Generated by full codebase audit — 2026-06-24_
