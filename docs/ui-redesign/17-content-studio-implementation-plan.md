# Content Studio Re-skin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, per this session's standing "no subagents" instruction). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute `16-phase2-content-studio-spec.md` — re-skin `ContentCatalystWorkspace.jsx` + `GeneratorForm.jsx`/`DraftPreview.jsx`/`ContentCalendar.jsx`/`BrandSettings.jsx` onto `--accent`/`--warning`/`--error`/`--text-*` tokens, add minimal smoke tests (currently zero), and record `BrandHeader.jsx`'s dead-code status in `bug-log.md`.

**Architecture:** One task per component (4 sub-components + the shell), each self-contained. Order: smallest/simplest first, shell last (same convention as the Hector plan).

**Tech Stack:** React 18 + JSX (these files are `.jsx`, not `.tsx` — no type annotations to preserve), Vitest + Testing Library.

---

### Task 1: `BrandSettings.jsx` — re-skin + smoke test

**Files:**
- Modify: `src/features/content-catalyst/workspace/BrandSettings.jsx`
- Test: `src/test/features/content-catalyst/BrandSettings.test.jsx` (new)

- [ ] **Step 1: Write the failing test**

```jsx
// src/test/features/content-catalyst/BrandSettings.test.jsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrandSettings } from '../../../features/content-catalyst/workspace/BrandSettings';

describe('BrandSettings', () => {
  it('renders the Save Brand Profile button', () => {
    render(<BrandSettings brandProfile={{}} onSave={vi.fn()} />);
    expect(screen.getByText('Save Brand Profile')).toBeTruthy();
  });

  it('calls onSave with the edited brand name when clicked', () => {
    const onSave = vi.fn();
    render(<BrandSettings brandProfile={{}} onSave={onSave} />);
    fireEvent.change(screen.getByPlaceholderText('Brand name'), { target: { value: 'Acme Co' } });
    fireEvent.click(screen.getByText('Save Brand Profile'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ brand_name: 'Acme Co' }));
  });
});
```

- [ ] **Step 2: Run test to verify it passes already (behavior, not new copy) or fails**

Run: `npx vitest run src/test/features/content-catalyst/BrandSettings.test.jsx --pool=threads`
Expected: PASS (this tests existing real behavior) — proceed to the re-skin regardless, using this as the regression guard.

- [ ] **Step 3: Replace the Save button's className in `BrandSettings.jsx`**

```jsx
        <button
          type="button"
          onClick={() => onSave?.({ ...draft, content_pillars: normalizePillars(draft.pillarsText) })}
          className="w-full rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--surface-0)] text-[10px] font-bold uppercase tracking-widest px-4 py-2 transition-colors"
        >
          Save Brand Profile
        </button>
```

- [ ] **Step 4: Run test to verify it still passes**

Run: `npx vitest run src/test/features/content-catalyst/BrandSettings.test.jsx --pool=threads`
Expected: PASS, both tests

- [ ] **Step 5: Commit**

```bash
git add src/features/content-catalyst/workspace/BrandSettings.jsx src/test/features/content-catalyst/BrandSettings.test.jsx
git commit -m "feat: re-skin BrandSettings save button onto accent tokens, add tests"
```

---

### Task 2: `ContentCalendar.jsx` — re-skin + smoke test

**Files:**
- Modify: `src/features/content-catalyst/workspace/ContentCalendar.jsx`
- Test: `src/test/features/content-catalyst/ContentCalendar.test.jsx` (new)

- [ ] **Step 1: Write the failing test**

```jsx
// src/test/features/content-catalyst/ContentCalendar.test.jsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContentCalendar } from '../../../features/content-catalyst/workspace/ContentCalendar';

describe('ContentCalendar', () => {
  it('renders the Schedule header and the current month label', () => {
    render(<ContentCalendar drafts={[]} />);
    expect(screen.getByText('Schedule')).toBeTruthy();
  });

  it('shows the no-scheduled-drafts empty state when nothing is scheduled', () => {
    render(<ContentCalendar drafts={[]} />);
    expect(screen.getByText(/No scheduled drafts/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it passes already**

Run: `npx vitest run src/test/features/content-catalyst/ContentCalendar.test.jsx --pool=threads`
Expected: PASS — proceed to re-skin regardless.

- [ ] **Step 3: Replace the 2 cyan spots in `ContentCalendar.jsx`**

Replace:
```jsx
                      {dots.slice(0, 3).map((_, di) => (
                        <span key={di} className="h-1 w-1 rounded-full bg-cyan-400" />
                      ))}
```
with:
```jsx
                      {dots.slice(0, 3).map((_, di) => (
                        <span key={di} className="h-1 w-1 rounded-full bg-[var(--accent)]" />
                      ))}
```

Replace:
```jsx
                    <button onClick={() => onAssignDay?.(d.id, selectedDate)} className="text-[9px] border border-cyan-400/30 rounded px-1.5 py-0.5 text-cyan-400">Assign</button>
```
with:
```jsx
                    <button onClick={() => onAssignDay?.(d.id, selectedDate)} className="text-[9px] border border-[var(--accent-border)] rounded px-1.5 py-0.5 text-[var(--accent)]">Assign</button>
```

- [ ] **Step 4: Run test to verify it still passes**

Run: `npx vitest run src/test/features/content-catalyst/ContentCalendar.test.jsx --pool=threads`
Expected: PASS, both tests

- [ ] **Step 5: Commit**

```bash
git add src/features/content-catalyst/workspace/ContentCalendar.jsx src/test/features/content-catalyst/ContentCalendar.test.jsx
git commit -m "feat: re-skin ContentCalendar's remaining cyan accents onto accent tokens, add tests"
```

---

### Task 3: `GeneratorForm.jsx` — re-skin + smoke test

**Files:**
- Modify: `src/features/content-catalyst/workspace/GeneratorForm.jsx`
- Test: `src/test/features/content-catalyst/GeneratorForm.test.jsx` (new)

- [ ] **Step 1: Write the failing test**

```jsx
// src/test/features/content-catalyst/GeneratorForm.test.jsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GeneratorForm } from '../../../features/content-catalyst/workspace/GeneratorForm';

const baseForm = { idea: '', business_context: '', platform: '', format: '', tone: '', pillar: '', needs: { image: false, video: false, narration: false, publish: false } };

describe('GeneratorForm', () => {
  it('renders the Create Content Job button, disabled with no idea', () => {
    render(<GeneratorForm form={baseForm} setForm={vi.fn()} brandProfile={{}} injectedIdea="" onIdeaUsed={vi.fn()} onGenerate={vi.fn()} isLoading={false} />);
    expect(screen.getByText('Create Content Job').closest('button')).toBeDisabled();
  });

  it('calls onGenerate when clicked with a non-empty idea', () => {
    const onGenerate = vi.fn();
    render(<GeneratorForm form={{ ...baseForm, idea: 'A great idea' }} setForm={vi.fn()} brandProfile={{}} injectedIdea="" onIdeaUsed={vi.fn()} onGenerate={onGenerate} isLoading={false} />);
    fireEvent.click(screen.getByText('Create Content Job'));
    expect(onGenerate).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it passes already**

Run: `npx vitest run src/test/features/content-catalyst/GeneratorForm.test.jsx --pool=threads`
Expected: PASS — proceed to re-skin regardless.

- [ ] **Step 3: Apply the re-skin substitutions in `GeneratorForm.jsx`**

Replace:
```jsx
          <span className="text-[11px] font-bold uppercase tracking-widest text-cyan-200">Creative brief</span>
```
with:
```jsx
          <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--accent)]">Creative brief</span>
```

Replace:
```jsx
        <div className="rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 flex items-start justify-between gap-2">
          <span className="line-clamp-2">{injectedIdea}</span>
          <button type="button" onClick={onIdeaUsed} className="shrink-0 text-[9px] font-bold uppercase tracking-widest border border-amber-300/30 rounded px-2 py-0.5 hover:bg-amber-400/10">Use</button>
        </div>
```
with:
```jsx
        <div className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning-dim)] px-3 py-2 text-xs text-[var(--text-2)] flex items-start justify-between gap-2">
          <span className="line-clamp-2">{injectedIdea}</span>
          <button type="button" onClick={onIdeaUsed} className="shrink-0 text-[9px] font-bold uppercase tracking-widest border border-[var(--warning)]/40 rounded px-2 py-0.5 hover:bg-[var(--warning-dim)]">Use</button>
        </div>
```

Replace:
```jsx
              form.needs[key]
                ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200'
                : 'border-[var(--border)] text-[var(--text-4)] hover:text-[var(--text-2)]'
```
with:
```jsx
              form.needs[key]
                ? 'border-[var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]'
                : 'border-[var(--border)] text-[var(--text-4)] hover:text-[var(--text-2)]'
```

Replace:
```jsx
        className="w-full flex items-center justify-center gap-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-950 text-xs font-bold uppercase tracking-widest px-4 py-2.5 transition-colors"
```
with:
```jsx
        className="w-full flex items-center justify-center gap-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed text-[var(--surface-0)] text-xs font-bold uppercase tracking-widest px-4 py-2.5 transition-colors"
```

(Check `tokens.css` for `--accent-dim` before this step — it was confirmed real during Task 3's spec-writing pass, same token already used elsewhere in this file's own textarea `focus:border-[var(--accent-border)]` styling.)

- [ ] **Step 4: Run test to verify it still passes**

Run: `npx vitest run src/test/features/content-catalyst/GeneratorForm.test.jsx --pool=threads`
Expected: PASS, both tests

- [ ] **Step 5: Commit**

```bash
git add src/features/content-catalyst/workspace/GeneratorForm.jsx src/test/features/content-catalyst/GeneratorForm.test.jsx
git commit -m "feat: re-skin GeneratorForm onto accent/warning tokens, add tests"
```

---

### Task 4: `DraftPreview.jsx` — re-skin + smoke test

**Files:**
- Modify: `src/features/content-catalyst/workspace/DraftPreview.jsx`
- Test: `src/test/features/content-catalyst/DraftPreview.test.jsx` (new)

- [ ] **Step 1: Write the failing test**

```jsx
// src/test/features/content-catalyst/DraftPreview.test.jsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DraftPreview } from '../../../features/content-catalyst/workspace/DraftPreview';

describe('DraftPreview', () => {
  it('shows the "No active job" state when activeJob is null', () => {
    render(<DraftPreview activeJob={null} busy={false} onRunStep={vi.fn()} onApprovePublish={vi.fn()} imageRuntime={{}} onStartImageRuntime={vi.fn()} onRefreshImageRuntime={vi.fn()} />);
    expect(screen.getByText('No active job')).toBeTruthy();
  });

  it('renders the Creative output header and status badges when a job is active', () => {
    render(<DraftPreview activeJob={{ id: 'j1', status: 'draft_ready', currentStep: 'draft', draft: {}, request: {} }} busy={false} onRunStep={vi.fn()} onApprovePublish={vi.fn()} imageRuntime={{}} onStartImageRuntime={vi.fn()} onRefreshImageRuntime={vi.fn()} />);
    expect(screen.getByText('Creative output')).toBeTruthy();
    expect(screen.getByText('draft_ready')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it passes already**

Run: `npx vitest run src/test/features/content-catalyst/DraftPreview.test.jsx --pool=threads`
Expected: PASS — proceed to re-skin regardless.

- [ ] **Step 3: Apply the re-skin substitutions in `DraftPreview.jsx`**

Replace:
```jsx
          <span className="text-[11px] font-bold uppercase tracking-widest text-cyan-200">Creative output</span>
```
with:
```jsx
          <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--accent)]">Creative output</span>
```

Replace:
```jsx
          <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-[9px] uppercase tracking-widest text-cyan-300">{activeJob.currentStep || 'brief'}</span>
```
with:
```jsx
          <span className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-dim)] px-2 py-0.5 text-[9px] uppercase tracking-widest text-[var(--accent)]">{activeJob.currentStep || 'brief'}</span>
```

Replace:
```jsx
              <div className="mt-2 space-y-2 text-xs text-amber-200">
                <p>{imageStatusMessage} {imageRuntime?.message || 'Checking ComfyUI…'}</p>
                {!imageRuntime?.checked ? (
                  <button type="button" onClick={onRefreshImageRuntime} className="rounded border border-amber-400/30 px-2 py-1 text-[10px] font-bold uppercase">Retry runtime check</button>
                ) : !imageRuntime?.running && (
                  <button type="button" disabled={imageRuntime?.starting || !imageRuntime?.installed} onClick={onStartImageRuntime} className="rounded border border-amber-400/30 px-2 py-1 text-[10px] font-bold uppercase disabled:opacity-40">{imageRuntime?.starting ? 'Starting ComfyUI…' : imageRuntime?.installed ? 'Start ComfyUI' : 'Install ComfyUI in Runtimes'}</button>
                )}
              </div>
```
with:
```jsx
              <div className="mt-2 space-y-2 text-xs text-[var(--text-2)]">
                <p>{imageStatusMessage} {imageRuntime?.message || 'Checking ComfyUI…'}</p>
                {!imageRuntime?.checked ? (
                  <button type="button" onClick={onRefreshImageRuntime} className="rounded border border-[var(--warning)]/40 px-2 py-1 text-[10px] font-bold uppercase">Retry runtime check</button>
                ) : !imageRuntime?.running && (
                  <button type="button" disabled={imageRuntime?.starting || !imageRuntime?.installed} onClick={onStartImageRuntime} className="rounded border border-[var(--warning)]/40 px-2 py-1 text-[10px] font-bold uppercase disabled:opacity-40">{imageRuntime?.starting ? 'Starting ComfyUI…' : imageRuntime?.installed ? 'Start ComfyUI' : 'Install ComfyUI in Runtimes'}</button>
                )}
              </div>
```

Replace:
```jsx
                accent
                  ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20'
                  : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-3)] hover:text-[var(--text-1)]'
```
with:
```jsx
                accent
                  ? 'border-[var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)] hover:bg-[var(--accent-muted)]'
                  : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-3)] hover:text-[var(--text-1)]'
```

Replace:
```jsx
            className="flex items-center gap-1 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-amber-200 hover:bg-amber-500/20 transition-colors disabled:opacity-40"
```
with:
```jsx
            className="flex items-center gap-1 rounded-lg border border-[var(--warning)]/40 bg-[var(--warning-dim)] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-2)] hover:opacity-90 transition-colors disabled:opacity-40"
```

- [ ] **Step 4: Run test to verify it still passes**

Run: `npx vitest run src/test/features/content-catalyst/DraftPreview.test.jsx --pool=threads`
Expected: PASS, both tests

- [ ] **Step 5: Commit**

```bash
git add src/features/content-catalyst/workspace/DraftPreview.jsx src/test/features/content-catalyst/DraftPreview.test.jsx
git commit -m "feat: re-skin DraftPreview onto accent/warning tokens, add tests"
```

---

### Task 5: `ContentCatalystWorkspace.jsx` — shell re-skin + smoke test

**Files:**
- Modify: `src/features/content-catalyst/components/ContentCatalystWorkspace.jsx`
- Test: `src/test/features/content-catalyst/ContentCatalystWorkspace.test.jsx` (new)

- [ ] **Step 1: Write the failing test**

```jsx
// src/test/features/content-catalyst/ContentCatalystWorkspace.test.jsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../../services/approval/approvalService', () => ({ requireApproval: vi.fn() }));
vi.mock('../../../services/agentWorkshop/accBridgeService', () => ({
  getAccBridgeConfig: vi.fn(() => ({})),
  getAccBridgeStatus: vi.fn(() => ({ configured: false })),
  listAccBridgePackets: vi.fn(() => []),
  resetAccBridgeConfig: vi.fn(),
  refreshAccBridgeStatus: vi.fn(async () => ({ configured: false })),
  syncContentCatalystJob: vi.fn(),
  updateAccBridgeConfig: vi.fn(),
}));
vi.mock('../../../features/content-catalyst/services/contentCatalystService', () => ({
  createContentBridgeRequest: vi.fn((r) => r),
  createContentBridgeResponse: vi.fn(() => null),
  generateContentDraft: vi.fn(),
  generateContentImage: vi.fn(),
  generateContentNarration: vi.fn(),
  generateContentPreview: vi.fn(),
  generateContentVideo: vi.fn(),
  listContentJobs: vi.fn(() => []),
  publishContent: vi.fn(),
  publishContentPreview: vi.fn(),
  runContentCatalystJob: vi.fn(),
  upsertContentJob: vi.fn(),
}));
vi.mock('../../../features/content-catalyst/state/contentCatalystState', () => ({
  assignDraftSchedule: vi.fn(),
  getBrandProfile: vi.fn(() => ({})),
  getContentAnalyticsSnapshot: vi.fn(() => ({ total: 0, ready: 0, published: 0 })),
  getTrendResearchSuggestions: vi.fn(() => []),
  listDraftHistory: vi.fn(() => []),
  saveBrandProfile: vi.fn(),
}));
vi.mock('../../../features/content-catalyst/services/contentPersistenceService', () => ({
  hydrateContentJobsFromSqlite: vi.fn(async () => []),
  persistContentJobsToSqlite: vi.fn(async () => {}),
}));
vi.mock('../../../services/runtimeManagerService', () => ({
  getAllStatus: vi.fn(async () => []),
  startTool: vi.fn(),
  waitForTool: vi.fn(),
}));

import { ContentCatalystWorkspace } from '../../../features/content-catalyst/components/ContentCatalystWorkspace';

describe('ContentCatalystWorkspace', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the Content Studio header and all 5 tabs, defaulting to Create', () => {
    render(<ContentCatalystWorkspace settings={{}} />);
    expect(screen.getByText('Content Studio')).toBeTruthy();
    expect(screen.getByText('Create')).toBeTruthy();
    expect(screen.getByText('Drafts')).toBeTruthy();
    expect(screen.getByText('Calendar')).toBeTruthy();
    expect(screen.getByText('Analytics')).toBeTruthy();
    expect(screen.getByText('Brand')).toBeTruthy();
  });

  it('switches to the Analytics tab', async () => {
    render(<ContentCatalystWorkspace settings={{}} />);
    fireEvent.click(screen.getByText('Analytics'));
    expect(await screen.findByText('0')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it passes or fails**

Run: `npx vitest run src/test/features/content-catalyst/ContentCatalystWorkspace.test.jsx --pool=threads`
Expected: this tests real existing behavior (not new copy) — some or all may already pass; if the second test's exact assertion doesn't match `AnalyticsDashboard.jsx`'s real rendered output, adjust the assertion to whatever it actually renders for a zero-value snapshot (check that file directly) rather than forcing a specific string. Proceed to Step 3's re-skin regardless.

- [ ] **Step 3: Apply the re-skin substitutions in `ContentCatalystWorkspace.jsx`**

Replace the header block:
```jsx
      <header className="relative overflow-hidden rounded-2xl border border-cyan-400/15 bg-gradient-to-br from-cyan-500/[0.13] via-[var(--surface-1)] to-violet-500/[0.10] px-5 py-5 flex items-center justify-between gap-4">
        <div className="relative">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">Creation room</div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">Content Studio</h1>
          <p className="mt-1 text-sm font-semibold text-zinc-200">Make the asset. Ship the story.</p>
          <p className="mt-1 text-xs text-zinc-400">Brief → copy → image → motion → approved distribution. Every output stays attached to the job.</p>
          <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-wider">
            <span className="rounded-full border border-white/10 bg-black/15 px-2.5 py-1 text-zinc-300">{analytics?.total ?? 0} drafts</span>
            <span className="rounded-full border border-white/10 bg-black/15 px-2.5 py-1 text-zinc-300">{analytics?.published ?? 0} published</span>
            <span className={`rounded-full border px-2.5 py-1 ${activeJob?.status === 'failed' ? 'border-rose-400/30 text-rose-200' : 'border-cyan-400/30 text-cyan-200'}`}>{creativeState}</span>
          </div>
        </div>
        {/* ACC Bridge pill */}
        <div className="flex items-center gap-2 shrink-0">
          <CheckCircle2 className={`h-3.5 w-3.5 ${bridgeStatus.configured ? 'text-cyan-400' : 'text-zinc-600'}`} />
          <span className="text-[11px] text-zinc-400">
            {bridgeStatus.configured ? <span className="text-cyan-300">ACC Bridge connected</span> : 'ACC Bridge off'}
          </span>
```
with:
```jsx
      <header className="relative overflow-hidden rounded-2xl border border-[var(--accent-border)] bg-[var(--surface-1)] px-5 py-5 flex items-center justify-between gap-4">
        <div className="relative">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">Creation room</div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">Content Studio</h1>
          <p className="mt-1 text-sm font-semibold text-[var(--text-2)]">Make the asset. Ship the story.</p>
          <p className="mt-1 text-xs text-[var(--text-3)]">Brief → copy → image → motion → approved distribution. Every output stays attached to the job.</p>
          <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-wider">
            <span className="rounded-full border border-white/10 bg-black/15 px-2.5 py-1 text-[var(--text-3)]">{analytics?.total ?? 0} drafts</span>
            <span className="rounded-full border border-white/10 bg-black/15 px-2.5 py-1 text-[var(--text-3)]">{analytics?.published ?? 0} published</span>
            <span className={`rounded-full border px-2.5 py-1 ${activeJob?.status === 'failed' ? 'border-[var(--error)]/30 text-[var(--error)]' : 'border-[var(--accent-border)] text-[var(--accent)]'}`}>{creativeState}</span>
          </div>
        </div>
        {/* ACC Bridge pill */}
        <div className="flex items-center gap-2 shrink-0">
          <CheckCircle2 className={`h-3.5 w-3.5 ${bridgeStatus.configured ? 'text-[var(--accent)]' : 'text-[var(--text-4)]'}`} />
          <span className="text-[11px] text-[var(--text-3)]">
            {bridgeStatus.configured ? <span className="text-[var(--accent)]">ACC Bridge connected</span> : 'ACC Bridge off'}
          </span>
```

(Note: the gradient background is deliberately dropped per the spec's color-mapping table — Content Catalyst's identity is now carried by the `--accent` border/text alone, matching a flat `--surface-1` background like every other re-skinned page, not a two-tone gradient that no other page in this redesign uses.)

Replace the bridge-refresh button and remaining shell text colors:
```jsx
          <button
            type="button"
            onClick={refreshBridge}
            className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 transition hover:text-white"
          >
            ↺
          </button>
```
with:
```jsx
          <button
            type="button"
            onClick={refreshBridge}
            className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-3)] transition hover:text-white"
          >
            ↺
          </button>
```

Replace the tab bar:
```jsx
            className={`rounded-lg px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors ${
              contentTab === tab.id
                ? 'bg-white/10 text-white'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab.label}
            {tab.id === 'drafts' && drafts.length > 0 && (
              <span className="ml-1.5 rounded-full bg-cyan-500/20 px-1.5 py-0.5 text-[9px] text-cyan-300">{drafts.length}</span>
            )}
```
with:
```jsx
            className={`rounded-lg px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors ${
              contentTab === tab.id
                ? 'bg-white/10 text-white'
                : 'text-[var(--text-3)] hover:text-[var(--text-2)]'
            }`}
          >
            {tab.label}
            {tab.id === 'drafts' && drafts.length > 0 && (
              <span className="ml-1.5 rounded-full bg-[var(--accent-dim)] px-1.5 py-0.5 text-[9px] text-[var(--accent)]">{drafts.length}</span>
            )}
```

- [ ] **Step 4: Run test to verify it still passes**

Run: `npx vitest run src/test/features/content-catalyst/ContentCatalystWorkspace.test.jsx --pool=threads`
Expected: PASS, both tests

- [ ] **Step 5: Run all 5 new test files together, plus `tsc --noEmit` and `eslint`**

Run: `npx vitest run src/test/features/content-catalyst/ --pool=threads`
Expected: PASS, all tests across all 5 new files

Run: `npx tsc --noEmit`
Expected: clean (these are `.jsx` files, not type-checked directly, but `tsc` still validates the whole project graph — confirm no ripple effect)

Run: `npx eslint src/features/content-catalyst/`
Expected: clean

- [ ] **Step 6: Add the `BrandHeader.jsx` dead-code finding to `bug-log.md`**

Append a new numbered entry (check the file's current highest number first — do not guess it, count the real existing entries) documenting: `BrandHeader.jsx` has zero import sites anywhere in `src/`, confirmed via `grep -rn "BrandHeader" src/`; it's not touched by this re-skin (re-skinning dead code is wasted effort); whether to wire it in, use it to replace the shell's inline header, or delete it is a real product decision outside this pass's scope. Status: OPEN.

- [ ] **Step 7: Commit**

```bash
git add src/features/content-catalyst/components/ContentCatalystWorkspace.jsx src/test/features/content-catalyst/ContentCatalystWorkspace.test.jsx docs/ui-redesign/bug-log.md
git commit -m "feat: re-skin ContentCatalystWorkspace shell onto accent tokens, add tests, flag BrandHeader.jsx as dead code — completes the Content Studio re-skin"
```

---

## Self-Review

**Spec coverage:** Covers every file and mapping in `16-phase2-content-studio-spec.md`: the 4 sub-components' color-token substitutions, the shell's header/tab-bar re-skin (including the deliberate gradient-drop decision), the `BrandHeader.jsx` dead-code flag, and minimal smoke tests for all 5 previously-untested components.

**Placeholder scan:** No TBD/TODO. Every substitution is a complete, real old→new string pair.

**Type consistency:** These are `.jsx` files with no TypeScript interfaces to keep in sync; prop names (`form`/`setForm`/`brandProfile`/etc.) are unchanged throughout, since this is styling-only.

**Real-token verification note:** `--accent`, `--accent-hover`, `--accent-dim`, `--accent-border`, `--accent-muted`, `--warning`, `--warning-dim`, `--error`, `--surface-0`, `--text-1` through `--text-4` were all confirmed to exist in `tokens.css` during this session's earlier passes (Mission Control / Hector Desk specs) — no new token names invented here.
