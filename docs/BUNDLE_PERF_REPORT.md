# Bundle Performance Report — Lazy Loading Audit

**Date:** 2026-05-31
**Author:** Claude Code agent
**Scope:** `src/App.jsx` — React.lazy() audit and additions

---

## Summary of Changes

### What was already lazy-loaded (pre-existing)

The following heavy view components were already using `React.lazy()` before this audit:

| Component | Import path |
|---|---|
| `AutomationView` | `./components/AutomationView` |
| `FilesView` | `./components/FilesView` |
| `EcosystemHub` | `./components/EcosystemHub` |
| `HectorResearchDesk` | `./components/dashboard/HectorResearchDesk` |
| `MiyaStudio` | `./components/MiyaStudio` |
| `ContentCatalystWorkspace` | `./features/content-catalyst` |
| `OperatorDashboard` | `./components/OperatorDashboard` |
| `OrchestratorView` | `./components/OrchestratorView` |
| `ProjectExecutionMode` | `./components/projectExecution/ProjectExecutionMode` |
| `CommandRib` | `./components/CommandRib` |
| `AgentDock` | `./components/AgentDock` |
| `MicrophoneStatus` | `./components/MicrophoneStatus` |
| `SettingsView` | `./components/SettingsView` |
| `RightPanel` | `./components/RightPanel` |

All 14 of these were correctly using `React.lazy()`. Most had `<Suspense>` wrappers at their render sites.

---

### New lazy-loading additions (this session)

Three additional conditionally-rendered components were converted from eager to lazy imports:

| Component | Before | After | Reason |
|---|---|---|---|
| `ApprovalModal` | `import { ApprovalModal } from './components/ApprovalModal'` | `lazy(() => import(...))` | Only mounts when `approvalPending` is set — not on initial render |
| `OnboardingWizard` | `import { OnboardingWizard } from './components/OnboardingWizard'` | `lazy(() => import(...))` | Only shown on first launch (one-time path) |
| `ConnectorHealthPanel` | `import { ConnectorHealthPanel } from './components/ConnectorHealthPanel'` | `lazy(() => import(...))` | Only shown when `activeTab === 'connectors'` |

All three received appropriate `<Suspense fallback={...}>` wrappers at their render sites.

---

### Bug fix: missing Suspense wrapper on CommandRib

`CommandRib` was already defined as `lazy()` (line 91) but was rendered at line 2111 **without** any `<Suspense>` boundary. This would cause a React error if the chunk had not yet loaded when the component first rendered. This was fixed by wrapping the render site:

```jsx
<Suspense fallback={null}>
  <CommandRib ... />
</Suspense>
```

---

## Chunk Analysis

### Prior build chunk inventory (from `dist/assets/`)

The prior build already produced split lazy chunks for all 14 pre-existing lazy components. The main bundle files observed were:

| Chunk | Notes |
|---|---|
| `index-Bhpxzgs2.js` | Primary app entry — the "before" main chunk (estimated ~331 KB per task spec) |
| `index-MLLMApi2.js` | Secondary index chunk (shared vendor split) |
| `vendor-DYLXRpC5.js` | Third-party vendor code |
| `react-CFCE4xZu.js` | React runtime |
| `react-dom-CxiSkglz.js` | React DOM |
| `lucide-react-CThGS2dn.js` | Icon library |
| `AgentDock-*.js` | Lazy chunk |
| `AutomationView-*.js` | Lazy chunk |
| `CommandRib-*.js` | Lazy chunk |
| `EcosystemHub-*.js` | Lazy chunk |
| `FilesView-*.js` | Lazy chunk |
| `HectorResearchDesk-*.js` | Lazy chunk |
| `MicrophoneStatus-*.js` | Lazy chunk |
| `MiyaStudio-*.js` | Lazy chunk |
| `OperatorDashboard-*.js` | Lazy chunk |
| `OrchestratorView-*.js` | Lazy chunk |
| `ProjectExecutionMode-*.js` | Lazy chunk |
| `RightPanel-*.js` | Lazy chunk |
| `SettingsView-*.js` | Lazy chunk |

### Expected new lazy chunks after fresh build

After the changes in this session, a fresh `npm run build` should produce 3 additional lazy chunks that did not exist in the prior build:

- `ApprovalModal-[hash].js`
- `OnboardingWizard-[hash].js`
- `ConnectorHealthPanel-[hash].js`

These will be deferred until first use, reducing the initial JS parse budget on app launch.

### Main chunk before vs after

| Metric | Before | After (expected) |
|---|---|---|
| Main chunk (`index-*.js`) | ~331 KB (per prior measurement) | Slightly smaller — ApprovalModal, OnboardingWizard, ConnectorHealthPanel moved out |
| New lazy chunks created | 0 (this session) | 3 new chunks |
| Total lazy chunks | 14 | 17 |

Note: an authoritative size measurement requires running `npm run build` after these changes. The prior `dist/` reflects the state before this session's edits.

---

## Debounce Analysis — ChatView onChange

**Finding: no debounce needed.**

The `onChange` handler on the chat textarea in `src/components/ChatView.jsx` (line 383) is:

```jsx
onChange={(event) => setInputValue(event.target.value)}
```

This is a plain controlled-input state update with no side effects. There is no AI call, search trigger, or expensive operation on every keystroke. No debounce was added.

---

## What Still Needs Work

1. **Run a fresh build** — `npm run build` must be executed after this session's edits to produce updated chunk hashes and confirm the 3 new lazy chunks appear. The `dist/` folder currently reflects the pre-change state.

2. **`ConnectorHealthPanel` inner Suspense** — the panel is now lazy, but if it has its own internal async sub-components those should also be audited.

3. **`ContentCatalystWorkspace`** — already lazy, but the `./features/content-catalyst` entry may pull in large service modules (`contentCatalystApi`, `marcusPublishService`, `metaPublishService`, `runwayService`) that are currently split as separate chunks. Verify these are tree-shaken correctly.

4. **`lib.rs` (Rust backend)** — still a monolithic ~7,200-line file. This is a separate concern from JS bundle splitting but remains the largest single-file maintenance risk.

5. **No Playwright E2E test for tab navigation** — lazy loading correctness (chunk loads, no render failures) is currently only verifiable manually. A smoke test covering tab switches would catch missing Suspense wrappers automatically.
