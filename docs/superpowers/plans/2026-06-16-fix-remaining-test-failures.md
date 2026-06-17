# Fix Remaining Test Failures — Implementation Plan

> **For agentic workers:** Each task is self-contained. Tasks are ordered by difficulty (quick wins first). Each step shows exact code changes.

**Goal:** Fix all 72 remaining test failures across 19 test files.

**Architecture:** Fix production code bugs identified by failing tests. Each bug is a clear mismatch between test expectations and actual behavior — the tests are correct.

**Tech Stack:** Vitest, jsdom, ES modules

---

## Root Cause Summary

| Area | Files | # Fails | Root Cause |
|------|-------|---------|------------|
| **A: Quick wins** | 6 files | 10 | Simple logic errors (&& vs ||, cached() async, default values) |
| **B: Events & Memory** | 3 files | 19 | Module-level caching of durableAvailable, Tauri wrapper invoke patterns |
| **C: Workflows** | 4 files | 16 | Workflow execution engine logic (Sentinel gate, dependencies, receipts) |
| **D: Notion Sync** | 2 files | 19 | Field parsing, persistence, reconciliation logic |
| **E: Connectors** | 4 files | 5 | Various connector path issues |

---

### Task 1: Fix Nova Feedback NaN check

**Bug:** `novaFeedbackService.js:45` uses `&&` instead of `||`. When `score='not-a-number'`, `opportunityScore=NaN` and `riskScore=0`, so `Number.isNaN(NaN) && Number.isNaN(0)` = `false`, and the function creates `{score: 0}` instead of returning `null`.

**Files:**
- Modify: `src/services/novaFeedbackService.js:45`

- [ ] **Step 1: Fix the NaN guard**

Change line 45 from:
```js
if (Number.isNaN(opportunityScore) && Number.isNaN(riskScore)) return null;
```
to:
```js
if (Number.isNaN(opportunityScore) || Number.isNaN(riskScore)) return null;
```

- [ ] **Step 2: Run the specific test**

Run: `npx vitest run src/test/novaFeedbackService.test.js`
Expected: All 10 tests pass

- [ ] **Step 3: Commit**

```bash
git add src/services/novaFeedbackService.js
git commit -m "fix: NaN check in storeNovaScore uses || instead of &&"
```

---

### Task 2: Fix Policy Enforcement async cached() bug

**Bug:** `policyEnforcementService.ts:68` calls `cached()` which is `async`, but `getRuntimePolicySettings()` is synchronous. The function returns a `Promise<RuntimePolicySettings>` instead of `RuntimePolicySettings`. Accessing `.approvalMode` on a Promise yields `undefined`.

**Files:**
- Modify: `src/services/policyEnforcementService.ts:67-87`

- [ ] **Step 1: Replace async cached() with manual sync cache check**

Change `getRuntimePolicySettings()` from:
```ts
export function getRuntimePolicySettings(): RuntimePolicySettings {
  return cached(policyCache, 'policy:settings:sync', () => {
    const defaults: RuntimePolicySettings = {
      approvalMode: true,
      zeroCostMode: true,
      safeMode: true,
      localOnlyMode: true
    };
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        approvalMode: parsed.approvalMode !== false,
        zeroCostMode: parsed.zeroCostMode !== false,
        safeMode: parsed.safeMode !== false,
        localOnlyMode: parsed.localOnlyMode !== false
      };
    } catch {
      return defaults;
    }
  }, SETTINGS_CACHE_TTL);
}
```
to:
```ts
export function getRuntimePolicySettings(): RuntimePolicySettings {
  const cachedSettings = policyCache.get('policy:settings:sync');
  if (cachedSettings !== null) return cachedSettings as RuntimePolicySettings;

  const defaults: RuntimePolicySettings = {
    approvalMode: true,
    zeroCostMode: true,
    safeMode: true,
    localOnlyMode: true
  };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const settings = {
      approvalMode: parsed.approvalMode !== false,
      zeroCostMode: parsed.zeroCostMode !== false,
      safeMode: parsed.safeMode !== false,
      localOnlyMode: parsed.localOnlyMode !== false
    };
    policyCache.set('policy:settings:sync', settings, SETTINGS_CACHE_TTL);
    return settings;
  } catch {
    policyCache.set('policy:settings:sync', defaults, SETTINGS_CACHE_TTL);
    return defaults;
  }
}
```

- [ ] **Step 2: Run the specific test**

Run: `npx vitest run src/test/policyEnforcementService.test.js`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add src/services/policyEnforcementService.ts
git commit -m "fix: make getRuntimePolicySettings sync (remove async cached() call)"
```

---

### Task 3: Fix Events Service Tauri wrapper tests

**Bug:** `eventsService.test.js` — the 4 Tauri wrapper tests (`recordEvent`, `listEvents`, `listEventDedup`) fail because the mock `invoke` returns `undefined` by default. The tests need specific invoke responses. The issue is likely the test expectations vs actual invoke call patterns in the service code.

**Investigation needed:** Read the specific test code and the service's Tauri wrapper functions (lines ~160-429 of eventsService.js) to understand what invoke commands they call and what responses they expect.

**Files:**
- Possibly modify: `src/services/eventsService.js`
- Possibly modify: `src/test/eventsService.test.js`

- [ ] **Step 1: Read the failing tests and service code**
- [ ] **Step 2: Fix the service code** (likely wiring issue between invoke calls and the mock's setup in the test)
- [ ] **Step 3: Run tests** — `npx vitest run src/test/eventsService.test.js`
- [ ] **Step 4: Commit**

---

### Task 4: Fix Chat Persistence durable memory caching issue

**Bug:** `chatPersistenceService.ts:4-5` — module-level `durableAvailable` variable caches the status across tests. When a test sets `durableAvailable = false`, subsequent tests skip the invoke call because `durableAvailable !== null` on line 33. The test's `beforeEach` resets the invoke mock but NOT the module-level cache.

**Files:**
- Modify: `src/services/chatPersistenceService.ts:31-42`

- [ ] **Step 1: Reset durable cache on check timeout or expose reset**

The simplest fix is to reduce the cache TTL so the test doesn't hit stale data. But the real issue is module state leaking between tests.

Add a function to reset the cache and export it:
```ts
export function resetDurableCache(): void {
  durableAvailable = null;
  durableCheckAtMs = 0;
}
```

Then call it from the test's `beforeEach`.

- [ ] **Step 2: Run the specific test**

Run: `npx vitest run src/test/chatPersistenceService.test.js`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add src/services/chatPersistenceService.ts
git commit -m "fix: add resetDurableCache() to prevent module state leak between tests"
```

---

### Task 5: Fix Memory Service tests

**Bug:** 11 failures in `memoryService.test.js`. memoryService.js re-exports from `unifiedMemoryService.js`. Tests exercise memory hydration from durable, localStorage capacity, expiry, deletion filtering.

**Investigation needed:** The actual service is in `unifiedMemoryService.js`. Need to read the specific failing test cases and understand whether the issue is:
- The same `durableAvailable` caching pattern
- Capacity capping logic (items not evicted at 1000)
- Expiry state not being applied

**Files:**
- To investigate: `src/services/unifiedMemoryService.js`
- To investigate: `src/test/memoryService.test.js`

- [ ] **Step 1: Read failing test cases and service code**
- [ ] **Step 2: Identify root cause and fix**
- [ ] **Step 3: Run tests** — `npx vitest run src/test/memoryService.test.js`
- [ ] **Step 4: Commit**

---

### Task 6: Fix Workflow Execution + Durability tests

**Bug:** 3 failures across `workflowExecutionService.test.js`, `workflowDurabilityHydration.test.js`. `result.ok` is `undefined` instead of `true`. Likely the same async `cached()` pattern as policyEnforcementService, or the execution function returns a Promise instead of a result object.

**Files:**
- To investigate: `src/services/workflowExecutionService.js`
- To investigate: `src/services/workflowDurabilityService.js` (if exists)
- To investigate: test files

- [ ] **Step 1: Read failing test cases and service code**
- [ ] **Step 2: Identify root cause** (likely async/sync mismatch similar to Task 2)
- [ ] **Step 3: Fix and verify**
- [ ] **Step 4: Commit**

---

### Task 7: Fix Jose Execution Engine (12 fails) + Jose Pipeline E2E (2 fails)

**Bug:** 14 failures in the command execution engine. Sentinel gate integration, LLM drafting, dependency-aware execution, Nova feedback hints, E2E pipeline receipts.

**Investigation needed:** These are complex multi-agent orchestration tests. Need to read the service code and test expectations to determine if the bugs are in the service logic or if they're downstream effects of the async `cached()` issue (if the execution engine depends on `getRuntimePolicySettings()`).

**Files:**
- To investigate: `src/services/joseExecutionEngineService.js`
- To investigate: `src/services/joseCommandRouterService.ts` (if it uses getRuntimePolicySettings)
- To investigate: test files

- [ ] **Step 1: Fix downstream dependencies first** (Task 2 - policy defaults — the execution engine likely calls `getRuntimePolicySettings()` which was returning a Promise)
- [ ] **Step 2: Re-run jose tests after Task 2 to see which failures remain**
- [ ] **Step 3: Fix remaining jose issues**
- [ ] **Step 4: Run all jose tests** — `npx vitest run src/test/joseExecutionEngineService.test.js src/test/josePipelineE2E.test.js`
- [ ] **Step 5: Commit**

---

### Task 8: Fix Notion Sync Service (18 fails)

**Bug:** 18 failures across 3 test slices. Field extraction from Notion pages returns `undefined`, push path doesn't call persistence, pull path has incorrect conflict detection.

**Files:**
- To investigate: `src/services/notionSyncService.js`
- To investigate: `src/test/notionSyncService.test.js`

- [ ] **Step 1: Categorize failures into sub-groups** (field extraction, push, pull)
- [ ] **Step 2: Fix field extraction in `ingestAlphonsoTaskFromNotionPage`** — title, portfolio, phase all return undefined
- [ ] **Step 3: Fix push path** — `persistScopeRows` and `pushMemoryItem` not being called
- [ ] **Step 4: Fix pull path** — conflict detection logic
- [ ] **Step 5: Run tests** — `npx vitest run src/test/notionSyncService.test.js`
- [ ] **Step 6: Commit**

---

### Task 9: Fix Single-File Connector / Agent failures (5 files, 5 fails)

**Files:** `telegramConnectorProof.test.js` (1), `toolConnectionService.test.js` (1), `hectorResearchService.test.js` (1), `accBridgeService.test.js` (1), `agentSkills.test.js` (1), `ollamaState.test.js` (1), `appUpdateService.test.js` (1), `missionRoomService.test.js` (1), `OllamaPreflightPanel.test.jsx` (1)

- [ ] **Step 1: Investigate each failure** (likely downstream of async cached() fix or other Task 2 changes)
- [ ] **Step 2: Re-run after Tasks 1-2 to see which resolve automatically**
- [ ] **Step 3: Fix remaining individually**
- [ ] **Step 4: Commit**

---

## Execution Order

```
Phase 1 — Quick wins (fixes cascading downstream issues)
├── Task 1: Nova NaN check (1 line)
├── Task 2: Policy Enforcement async cached() (fixes 6 + possibly downstream)

Phase 2 — Re-run all tests to measure cascade
├── Full suite run
├── If jose/workflow/events pass now, mark those done

Phase 3 — Memory & Persistence
├── Task 4: Chat Persistence durable cache
├── Task 5: Memory Service
├── Task 3: Events Service

Phase 4 — Workflows (after policy fix cascade)
├── Task 6: Workflow Execution + Durability
├── Task 7: Jose Engine + Pipeline

Phase 5 — Complex
├── Task 8: Notion Sync
├── Task 9: Single-file fixes
```
