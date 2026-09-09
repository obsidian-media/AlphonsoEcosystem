# Research / Hector Desk Re-skin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, per this session's standing "no subagents" instruction). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute `14-phase2-hector-research-desk-spec.md` — re-skin `HectorResearchDesk.tsx` and its 5 sub-panels onto the real design-token system (`Zone mood="hector"`, `--surface-*`/`--text-*`/`--agent-hector`/`--success`/`--error`/`--warning-dim`), add the synthesis-gap honesty notice, relabel `SourceBoard`/`CitationPanel`, and add test coverage (currently zero) to all 6 components.

**Architecture:** One task per component (5 sub-panels + the shell), each self-contained (add tests first, then re-skin, verify, commit). The shell's task is last since it renders all 5 sub-panels and is easiest to verify once they're already done.

**Tech Stack:** React 18 + TypeScript/JSX (these files are `.tsx` already), Vitest + Testing Library (matching the pattern already used in `MissionControlHome.test.tsx`), the existing `Zone` primitive (`hector`/`cool` moods, both already real).

---

### Task 1: `SourceBoard.tsx` — re-skin + relabel + tests

**Files:**
- Modify: `src/components/hector/SourceBoard.tsx`
- Test: `src/test/components/hector/SourceBoard.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/components/hector/SourceBoard.test.tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../../services/browserAutomationService', () => ({
  openExternalUrl: vi.fn(),
}));

import { openExternalUrl } from '../../../services/browserAutomationService';
import { SourceBoard } from '../../../components/hector/SourceBoard';

describe('SourceBoard', () => {
  it('shows the "Discovered Sources" label and empty-state copy when there are no sources', () => {
    render(<SourceBoard report={null} />);
    expect(screen.getByText('Discovered Sources')).toBeTruthy();
    expect(screen.getByText('No sources recorded. Hector will not invent citations.')).toBeTruthy();
  });

  it('renders a source row with its url/type/verification state', () => {
    render(<SourceBoard report={{ sources: [{ url: 'https://example.com', type: 'official_docs', verificationState: 'verified', httpStatus: 200 }] }} />);
    expect(screen.getByText('https://example.com')).toBeTruthy();
    expect(screen.getByText(/official_docs.*verified.*HTTP 200/)).toBeTruthy();
  });

  it('clicking a source url calls openExternalUrl with that url', () => {
    render(<SourceBoard report={{ sources: [{ url: 'https://example.com' }] }} />);
    fireEvent.click(screen.getByText('https://example.com'));
    expect(openExternalUrl).toHaveBeenCalledWith('https://example.com');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/components/hector/SourceBoard.test.tsx --pool=threads`
Expected: FAIL — the label still says "Source Board", not "Discovered Sources".

- [ ] **Step 3: Replace `src/components/hector/SourceBoard.tsx` entirely**

```tsx
import React from 'react';
import { openExternalUrl } from '../../services/browserAutomationService';
import { Zone } from '../ui/Zone';

interface Source {
  url: string;
  type?: string;
  verificationState?: string;
  confidence?: string;
  httpStatus?: number;
  expiresAt?: string | number;
  title?: string;
  error?: string;
  snippet?: string;
  confidenceReason?: string;
}

interface Report {
  sources?: Source[];
}

interface Props {
  report?: Report | null;
}

export function SourceBoard({ report }: Props): React.JSX.Element {
  const sources = report?.sources ?? [];
  return (
    <Zone mood="hector">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--agent-hector)]">Discovered Sources</div>
      {sources.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-[var(--surface-1)] p-4 text-sm text-[var(--text-3)]">
          No sources recorded. Hector will not invent citations.
        </div>
      ) : (
        <div className="space-y-2">
          {sources.map((source) => (
            <div key={source.url} className="rounded-xl border border-white/10 bg-[var(--surface-1)] p-3">
              <button
                type="button"
                onClick={() => openExternalUrl(source.url)}
                className="block truncate text-xs font-semibold text-[var(--agent-hector)] underline decoration-[var(--agent-hector)]/40 hover:decoration-[var(--agent-hector)] transition-colors text-left"
                title={source.url}
              >
                {source.url}
              </button>
              <div className="mt-1 text-[11px] text-[var(--text-3)]">
                {source.type} | {source.verificationState ?? source.confidence} | {source.httpStatus ? `HTTP ${source.httpStatus}` : 'not fetched'} | expires {source.expiresAt ? new Date(source.expiresAt).toLocaleDateString() : 'n/a'}
              </div>
              {source.title && <div className="mt-2 text-xs font-semibold text-[var(--text-2)]">{source.title}</div>}
              <div className="mt-1 text-[11px] text-[var(--text-3)]">{source.error ?? source.snippet ?? source.confidenceReason}</div>
            </div>
          ))}
        </div>
      )}
    </Zone>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/components/hector/SourceBoard.test.tsx --pool=threads`
Expected: PASS, all 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/components/hector/SourceBoard.tsx src/test/components/hector/SourceBoard.test.tsx
git commit -m "feat: re-skin SourceBoard onto Zone/tokens, relabel to Discovered Sources, add tests"
```

---

### Task 2: `CitationPanel.tsx` — re-skin + relabel + tests

**Files:**
- Modify: `src/components/hector/CitationPanel.tsx`
- Test: `src/test/components/hector/CitationPanel.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/components/hector/CitationPanel.test.tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../../services/browserAutomationService', () => ({
  openExternalUrl: vi.fn(),
}));

import { CitationPanel } from '../../../components/hector/CitationPanel';

describe('CitationPanel', () => {
  it('shows the "Citations" label and empty-state copy when there is nothing to cite', () => {
    render(<CitationPanel report={null} />);
    expect(screen.getByText('Citations')).toBeTruthy();
    expect(screen.getByText('Citation list is empty because this report has not completed a live run yet.')).toBeTruthy();
  });

  it('renders numbered citations from sourceProofs, with the subhead shown', () => {
    render(<CitationPanel report={{ sourceProofs: [{ url: 'https://a.com', verificationState: 'verified', httpStatus: 200 }] }} />);
    expect(screen.getByText(/\[1\]/)).toBeTruthy();
    expect(screen.getByText('https://a.com')).toBeTruthy();
    expect(screen.getByText("Numbered bibliography for this report's approval handoff.")).toBeTruthy();
  });

  it('falls back to report.urls when sourceProofs is absent', () => {
    render(<CitationPanel report={{ urls: ['https://b.com'] }} />);
    expect(screen.getByText('https://b.com')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/components/hector/CitationPanel.test.tsx --pool=threads`
Expected: FAIL

- [ ] **Step 3: Replace `src/components/hector/CitationPanel.tsx` entirely**

```tsx
import React from 'react';
import { openExternalUrl } from '../../services/browserAutomationService';
import { Zone } from '../ui/Zone';

interface SourceProof {
  url: string;
  dateChecked?: string;
  verificationState?: string;
  httpStatus?: number;
}

interface Report {
  sourceProofs?: SourceProof[];
  urls?: string[];
}

interface Props {
  report?: Report | null;
}

export function CitationPanel({ report }: Props): React.JSX.Element {
  const proofs = report?.sourceProofs ?? [];
  const urls = proofs.length ? proofs.map((proof) => proof.url) : report?.urls ?? [];
  return (
    <Zone mood="hector">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--agent-hector)]">Citations</div>
      {urls.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-[var(--surface-1)] p-4 text-sm text-[var(--text-3)]">
          Citation list is empty because this report has not completed a live run yet.
        </div>
      ) : (
        <>
          <p className="mb-2 text-[11px] text-[var(--text-3)]">Numbered bibliography for this report's approval handoff.</p>
          <ol className="space-y-2">
            {urls.map((url, index) => (
              <li key={url} className="rounded-xl border border-white/10 bg-[var(--surface-1)] p-3 text-[11px] text-[var(--text-2)]">
                [{index + 1}]{' '}
                <button
                  type="button"
                  onClick={() => openExternalUrl(url)}
                  className="text-[var(--agent-hector)] underline decoration-[var(--agent-hector)]/40 hover:decoration-[var(--agent-hector)] transition-colors break-all text-left"
                  title={url}
                >
                  {url}
                </button>
                {proofs[index] && (
                  <div className="mt-1 text-[var(--text-3)]">
                    checked {proofs[index].dateChecked ?? 'n/a'} | {proofs[index].verificationState} | {proofs[index].httpStatus ? `HTTP ${proofs[index].httpStatus}` : 'no status'}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </Zone>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/components/hector/CitationPanel.test.tsx --pool=threads`
Expected: PASS, all 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/components/hector/CitationPanel.tsx src/test/components/hector/CitationPanel.test.tsx
git commit -m "feat: re-skin CitationPanel onto Zone/tokens, relabel to Citations with a clarifying subhead, add tests"
```

---

### Task 3: `ResearchReportPanel.tsx` — re-skin + synthesis-gap notice + tests

**Files:**
- Modify: `src/components/hector/ResearchReportPanel.tsx`
- Test: `src/test/components/hector/ResearchReportPanel.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/components/hector/ResearchReportPanel.test.tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../../services/browserAutomationService', () => ({
  openExternalUrl: vi.fn(),
}));

import { ResearchReportPanel } from '../../../components/hector/ResearchReportPanel';

describe('ResearchReportPanel', () => {
  it('shows the "no report selected" state when report is null', () => {
    render(<ResearchReportPanel report={null} />);
    expect(screen.getByText('No Hector report selected.')).toBeTruthy();
  });

  it('shows the synthesis-gap honesty notice whenever a report is selected', () => {
    render(<ResearchReportPanel report={{ researchQuestion: 'Q', status: 'draft' }} />);
    expect(screen.getByText(/doesn't yet combine these into one written report/i)).toBeTruthy();
  });

  it('renders verified facts, inferred points, and approval-needed lists', () => {
    render(<ResearchReportPanel report={{
      researchQuestion: 'Q',
      status: 'complete',
      verifiedFacts: ['Fact A'],
      inferredPoints: ['Inference A'],
      joseApprovalNeeded: ['Approval A'],
      recommendedNextStep: 'Send to Jose',
    }} />);
    expect(screen.getByText('Fact A')).toBeTruthy();
    expect(screen.getByText('Inference A')).toBeTruthy();
    expect(screen.getByText('Approval A')).toBeTruthy();
    expect(screen.getByText(/Send to Jose/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/components/hector/ResearchReportPanel.test.tsx --pool=threads`
Expected: FAIL — no synthesis-gap notice exists yet.

- [ ] **Step 3: Replace `src/components/hector/ResearchReportPanel.tsx` entirely**

```tsx
import React from 'react';
import { openExternalUrl } from '../../services/browserAutomationService';
import { Zone } from '../ui/Zone';

interface SourceProof {
  ok?: boolean;
  url: string;
  httpStatus?: number;
  error?: string;
}

interface Report {
  researchQuestion?: string;
  dateChecked?: string;
  confidenceLevel?: string;
  status?: string;
  sourceProofs?: SourceProof[];
  verifiedFacts?: string[];
  inferredPoints?: string[];
  joseApprovalNeeded?: string[];
  recommendedNextStep?: string;
}

interface Props {
  report?: Report | null;
}

interface ReportListProps {
  title: string;
  rows?: string[];
  empty: string;
}

function ReportList({ title, rows = [], empty }: ReportListProps): React.JSX.Element {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-3)]">{title}</div>
      <div className="mt-2 space-y-1">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-[var(--surface-1)] px-3 py-2 text-[11px] text-[var(--text-3)]">{empty}</div>
        ) : rows.map((row) => (
          <div key={row} className="rounded-lg border border-white/10 bg-[var(--surface-1)] px-3 py-2 text-[11px] text-[var(--text-2)]">{row}</div>
        ))}
      </div>
    </div>
  );
}

export function ResearchReportPanel({ report }: Props): React.JSX.Element {
  return (
    <Zone mood="hector">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--agent-hector)]">Research Report</div>
      {!report ? (
        <div className="rounded-xl border border-white/10 bg-[var(--surface-1)] p-4 text-sm text-[var(--text-3)]">
          No Hector report selected.
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="text-sm font-semibold text-[var(--text-1)]">{report.researchQuestion}</div>
            <div className="mt-1 text-[11px] text-[var(--text-3)]">Checked: {report.dateChecked ?? 'not checked'} | confidence: {report.confidenceLevel}</div>
          </div>
          <Zone mood="cool" className="text-[11px] text-[var(--text-2)]">
            Per-source findings below — Hector doesn't yet combine these into one written report.
          </Zone>
          <div className="rounded-xl border border-white/10 bg-[var(--warning-dim)] p-3 text-[11px] text-[var(--text-2)]">
            {report.status === 'source_discovery_failed'
              ? 'Live source discovery failed. Check connectivity and retry.'
              : `${report.status}. Sources and citations are generated from real live discovery/fetch runs.`}
          </div>
          {Array.isArray(report.sourceProofs) && report.sourceProofs.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-3)]">Source Proofs</div>
              <div className="mt-2 space-y-1">
                {report.sourceProofs.map((proof) => (
                  <div key={proof.url} className="rounded-lg border border-white/10 bg-[var(--surface-1)] px-3 py-2 text-[11px] text-[var(--text-2)]">
                    <span className={proof.ok ? 'text-[var(--success)]' : 'text-[var(--error)]'}>{proof.ok ? 'Verified' : 'Failed'}</span>{' '}
                    <button
                      type="button"
                      onClick={() => openExternalUrl(proof.url)}
                      className="text-[var(--agent-hector)] underline decoration-[var(--agent-hector)]/40 hover:decoration-[var(--agent-hector)] transition-colors break-all text-left"
                      title={proof.url}
                    >
                      {proof.url}
                    </button>
                    {proof.httpStatus ? ` (HTTP ${proof.httpStatus})` : ''}
                    {proof.error ? ` - ${proof.error}` : ''}
                  </div>
                ))}
              </div>
            </div>
          )}
          <ReportList title="Verified Facts" rows={report.verifiedFacts} empty="No verified facts yet." />
          <ReportList title="Inferred Points" rows={report.inferredPoints} empty="No inferred points yet." />
          <ReportList title="Jose Approval Needed" rows={report.joseApprovalNeeded} empty="No approval blockers listed." />
          <div className="rounded-xl border border-white/10 bg-[var(--surface-1)] p-3 text-[11px] text-[var(--text-2)]">
            Recommended next step: {report.recommendedNextStep ?? 'Not available.'}
          </div>
        </div>
      )}
    </Zone>
  );
}
```

(`Zone`'s `className` prop is appended, not replacing its own `rounded-2xl p-4 ${moodClasses[mood]}` base — confirm this renders as a reasonably-sized inline strip, not a full-height section, when reviewed visually in Step 5 below; if it reads too large, tighten with a `text-[11px]` wrapper only, not a `Zone` prop change.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/components/hector/ResearchReportPanel.test.tsx --pool=threads`
Expected: PASS, all 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/components/hector/ResearchReportPanel.tsx src/test/components/hector/ResearchReportPanel.test.tsx
git commit -m "feat: re-skin ResearchReportPanel onto Zone/tokens, add synthesis-gap honesty notice (bug-log.md #3), add tests"
```

---

### Task 4: `HectorActivityLog.tsx` — re-skin + tests

**Files:**
- Modify: `src/components/hector/HectorActivityLog.tsx`
- Test: `src/test/components/hector/HectorActivityLog.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/components/hector/HectorActivityLog.test.tsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HectorActivityLog } from '../../../components/hector/HectorActivityLog';

describe('HectorActivityLog', () => {
  it('shows empty-state copy with no rows', () => {
    render(<HectorActivityLog rows={[]} />);
    expect(screen.getByText('No Hector activity yet.')).toBeTruthy();
  });

  it('renders rows in reverse-chronological order', () => {
    render(<HectorActivityLog rows={[
      { id: '1', type: 'draft_created', timestampMs: 1000 },
      { id: '2', type: 'source_fetched', timestampMs: 2000 },
    ]} />);
    const rendered = screen.getAllByText(/draft_created|source_fetched/).map((el) => el.textContent);
    expect(rendered).toEqual(['source_fetched', 'draft_created']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/components/hector/HectorActivityLog.test.tsx --pool=threads`
Expected: FAIL — no such file exists to import yet as a proper test target (it exists as a component already, but confirm the test itself runs and reveals whatever gap exists once re-skinned; if it unexpectedly passes before any change, that's fine too — the re-skin is a visual change, not a behavior change, so this test may legitimately pass immediately. Proceed to Step 3 regardless, to complete the re-skin.)

- [ ] **Step 3: Replace `src/components/hector/HectorActivityLog.tsx` entirely**

```tsx
import React from 'react';
import { Zone } from '../ui/Zone';

interface ActivityRow {
  id: string;
  type: string;
  timestampMs: number;
  confidence?: string;
}

interface Props {
  rows?: ActivityRow[];
}

export function HectorActivityLog({ rows = [] }: Props): React.JSX.Element {
  return (
    <Zone mood="hector">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--agent-hector)]">Hector Activity Log</div>
      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
        {rows.length === 0 && <div className="rounded-xl border border-white/10 bg-[var(--surface-1)] p-4 text-sm text-[var(--text-3)]">No Hector activity yet.</div>}
        {rows.slice().reverse().map((row) => (
          <div key={row.id} className="rounded-xl border border-white/10 bg-[var(--surface-1)] p-3">
            <div className="text-xs font-semibold text-[var(--text-1)]">{row.type}</div>
            <div className="mt-1 text-[11px] text-[var(--text-3)]">{new Date(row.timestampMs).toLocaleString()} | {row.confidence}</div>
          </div>
        ))}
      </div>
    </Zone>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/components/hector/HectorActivityLog.test.tsx --pool=threads`
Expected: PASS, both tests

- [ ] **Step 5: Commit**

```bash
git add src/components/hector/HectorActivityLog.tsx src/test/components/hector/HectorActivityLog.test.tsx
git commit -m "feat: re-skin HectorActivityLog onto Zone/tokens, add tests"
```

---

### Task 5: `HectorApprovalHandoff.tsx` — re-skin + tests

**Files:**
- Modify: `src/components/hector/HectorApprovalHandoff.tsx`
- Test: `src/test/components/hector/HectorApprovalHandoff.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/components/hector/HectorApprovalHandoff.test.tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HectorApprovalHandoff } from '../../../components/hector/HectorApprovalHandoff';

describe('HectorApprovalHandoff', () => {
  it('disables the button when there is no report', () => {
    const onCreateHandoff = vi.fn();
    render(<HectorApprovalHandoff report={null} onCreateHandoff={onCreateHandoff} />);
    expect(screen.getByText('Send Report To Jose').closest('button')).toBeDisabled();
  });

  it('calls onCreateHandoff with the report id when clicked', () => {
    const onCreateHandoff = vi.fn();
    render(<HectorApprovalHandoff report={{ id: 'report-1' }} onCreateHandoff={onCreateHandoff} />);
    fireEvent.click(screen.getByText('Send Report To Jose'));
    expect(onCreateHandoff).toHaveBeenCalledWith('report-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/components/hector/HectorApprovalHandoff.test.tsx --pool=threads`
Expected: this may pass immediately since it tests existing behavior, not new copy — that's fine, proceed to the re-skin in Step 3 regardless (behavior is unchanged, only styling changes).

- [ ] **Step 3: Replace `src/components/hector/HectorApprovalHandoff.tsx` entirely**

```tsx
import React from 'react';
import { Zone } from '../ui/Zone';

interface Report {
  id: string;
}

interface Props {
  report?: Report | null;
  onCreateHandoff: (reportId: string) => void;
}

export function HectorApprovalHandoff({ report, onCreateHandoff }: Props): React.JSX.Element {
  return (
    <Zone mood="hector">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--agent-hector)]">Jose Approval Handoff</div>
      <p className="text-[11px] leading-relaxed text-[var(--text-3)]">
        Hector cannot execute, post, download executables, access accounts, or bypass Jose. Research reports become supervised handoff packets.
      </p>
      <button
        onClick={() => report && onCreateHandoff(report.id)}
        disabled={!report}
        className="mt-3 rounded-xl bg-[var(--agent-hector)] px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[var(--surface-0)] hover:opacity-90 transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
      >
        Send Report To Jose
      </button>
    </Zone>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/components/hector/HectorApprovalHandoff.test.tsx --pool=threads`
Expected: PASS, both tests

- [ ] **Step 5: Commit**

```bash
git add src/components/hector/HectorApprovalHandoff.tsx src/test/components/hector/HectorApprovalHandoff.test.tsx
git commit -m "feat: re-skin HectorApprovalHandoff onto Zone/tokens, add tests"
```

---

### Task 6: `HectorResearchDesk.tsx` — shell re-skin + tests

**Files:**
- Modify: `src/components/dashboard/HectorResearchDesk.tsx`
- Test: `src/test/components/dashboard/HectorResearchDesk.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/components/dashboard/HectorResearchDesk.test.tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../../services/hectorResearchService', () => ({
  createHectorApprovalPacket: vi.fn(),
  createResearchDraft: vi.fn((opts) => ({ id: 'draft-1', researchQuestion: opts.researchQuestion, status: 'draft', confidenceLevel: 'unknown' })),
  fetchSuppliedSourcesForReport: vi.fn(),
  listHectorActivity: vi.fn(() => []),
  listHectorReports: vi.fn(() => []),
}));
vi.mock('../../../services/browserAutomationService', () => ({
  openExternalUrl: vi.fn(),
}));

import { HectorResearchDesk } from '../../../components/dashboard/HectorResearchDesk';

describe('HectorResearchDesk', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders all 3 tabs, defaulting to New Research', () => {
    render(<HectorResearchDesk />);
    expect(screen.getByText('New Research')).toBeTruthy();
    expect(screen.getByText('Reports')).toBeTruthy();
    expect(screen.getByText('Live Run')).toBeTruthy();
    expect(screen.getByPlaceholderText('What do you want Hector to research?')).toBeTruthy();
  });

  it('switches to the Reports tab and shows the empty state when there are no reports', () => {
    render(<HectorResearchDesk />);
    fireEvent.click(screen.getByText('Reports'));
    expect(screen.getByText('No research reports yet')).toBeTruthy();
  });

  it('creating a research draft switches to the Reports tab', () => {
    render(<HectorResearchDesk />);
    fireEvent.change(screen.getByPlaceholderText('What do you want Hector to research?'), { target: { value: 'What is Alphonso?' } });
    fireEvent.click(screen.getByText('Create Research Draft'));
    expect(screen.getByText('All Reports')).toBeTruthy();
  });

  it('switches to the Live Run tab and shows the select-a-report prompt with no report selected', () => {
    render(<HectorResearchDesk />);
    fireEvent.click(screen.getByText('Live Run'));
    expect(screen.getByText('Select a report first to view live telemetry.')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails or passes appropriately**

Run: `npx vitest run src/test/components/dashboard/HectorResearchDesk.test.tsx --pool=threads`
Expected: these test real existing behavior (tabs, draft creation) rather than new copy, so some may already pass before any change — that's fine. The point of this task is the re-skin below; use this file as the regression guard for it, not as a strict red/green gate on the visual change itself.

- [ ] **Step 3: Re-skin `HectorResearchDesk.tsx` in place**

Apply these token substitutions to the existing file (structure, handlers, and state are all unchanged — this is styling only):

In the header block, replace:
```tsx
<div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-400/70">
```
with:
```tsx
<div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--agent-hector)]">
```

Replace the tab bar's active/inactive classes:
```tsx
className={`rounded-lg px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors ${activeTab === tab.id ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
```
with:
```tsx
className={`rounded-lg px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors ${activeTab === tab.id ? 'bg-white/10 text-[var(--text-1)]' : 'text-[var(--text-3)] hover:text-[var(--text-2)]'}`}
```

In the "New Research" tab's input/select/textarea (3 occurrences of the same base classes), replace:
```
border-white/[0.08] bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-[var(--agent-hector)]/40
```
with:
```
border-white/[0.08] bg-[var(--surface-1)] px-3 py-2.5 text-sm text-[var(--text-1)] placeholder:text-[var(--text-4)] outline-none focus:border-[var(--agent-hector)]/40
```
(the select element has no placeholder text — apply only the `bg`/`text` part there, keep `outline-none` as-is).

In the Permissions panel, replace:
```tsx
<div className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400 mb-2">Allowed</div>
<div className="space-y-1">{(HECTOR_ALLOWED_ACTIONS as string[]).map((row) => <div key={row} className="text-[11px] text-zinc-400">{row.replace(/_/g, ' ')}</div>)}</div>
```
with:
```tsx
<div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--success)] mb-2">Allowed</div>
<div className="space-y-1">{(HECTOR_ALLOWED_ACTIONS as string[]).map((row) => <div key={row} className="text-[11px] text-[var(--text-3)]">{row.replace(/_/g, ' ')}</div>)}</div>
```
and similarly:
```tsx
<div className="text-[10px] font-semibold uppercase tracking-widest text-red-400 mb-2">Blocked</div>
<div className="space-y-1">{(HECTOR_BLOCKED_ACTIONS as string[]).map((row) => <div key={row} className="text-[11px] text-zinc-400">{row.replace(/_/g, ' ')}</div>)}</div>
```
becomes:
```tsx
<div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--error)] mb-2">Blocked</div>
<div className="space-y-1">{(HECTOR_BLOCKED_ACTIONS as string[]).map((row) => <div key={row} className="text-[11px] text-[var(--text-3)]">{row.replace(/_/g, ' ')}</div>)}</div>
```

In the Reports tab's report-list buttons, replace:
```tsx
className={`w-full rounded-xl border p-3 text-left transition-colors ${selectedReport && (selectedReport as { id: string }).id === rr.id ? 'border-[var(--agent-hector)]/30 bg-[var(--agent-hector)]/10' : 'border-white/[0.06] bg-zinc-900/40 hover:bg-zinc-900/60'}`}>
                          <div className="text-[12px] font-medium text-zinc-200 line-clamp-2">{String(rr.researchQuestion ?? '')}</div>
                          <div className="mt-1 text-[11px] text-zinc-600">{String(rr.status ?? '')} · {String(rr.confidenceLevel ?? '')}</div>
```
with:
```tsx
className={`w-full rounded-xl border p-3 text-left transition-colors ${selectedReport && (selectedReport as { id: string }).id === rr.id ? 'border-[var(--agent-hector)]/30 bg-[var(--agent-hector)]/10' : 'border-white/[0.06] bg-[var(--surface-1)] hover:bg-[var(--surface-2)]'}`}>
                          <div className="text-[12px] font-medium text-[var(--text-2)] line-clamp-2">{String(rr.researchQuestion ?? '')}</div>
                          <div className="mt-1 text-[11px] text-[var(--text-4)]">{String(rr.status ?? '')} · {String(rr.confidenceLevel ?? '')}</div>
```

Replace the fetch-error box:
```tsx
{fetchError && <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-[11px] text-red-300">{fetchError}</div>}
```
with:
```tsx
{fetchError && <div className="rounded-xl border border-[var(--error)]/20 bg-[var(--error-dim)] p-3 text-[11px] text-[var(--error)]">{fetchError}</div>}
```

In the `InfoCell` helper component, replace:
```tsx
function InfoCell({ label, value }: InfoCellProps): React.JSX.Element {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-zinc-900/40 p-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">{label}</div>
      <div className="mt-1 text-[12px] text-zinc-300">{value}</div>
    </div>
  );
}
```
with:
```tsx
function InfoCell({ label, value }: InfoCellProps): React.JSX.Element {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-[var(--surface-1)] p-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-4)]">{label}</div>
      <div className="mt-1 text-[12px] text-[var(--text-2)]">{value}</div>
    </div>
  );
}
```

In the Live Run tab's "Selected Report" and "Run Log" cards, replace every occurrence of `bg-zinc-950/60` with `bg-[var(--surface-1)]`, every `text-zinc-500` with `text-[var(--text-3)]`, every `text-zinc-200` with `text-[var(--text-2)]`, `bg-zinc-900/40` with `bg-[var(--surface-1)]`, and `text-zinc-600` with `text-[var(--text-4)]` (this covers: the "Selected Report"/"Run Log" section labels, the run-log entry rows' message/meta text, and the "No run logs yet" copy).

Replace the "Select a report first" prompt:
```tsx
<div className="rounded-2xl border border-white/[0.06] bg-zinc-950/50 p-10 text-center">
                <p className="text-sm text-zinc-500">Select a report first to view live telemetry.</p>
                <button type="button" onClick={() => setActiveTab('reports')} className="mt-3 text-[11px] font-semibold text-teal-400 hover:text-teal-300">Go to Reports →</button>
```
with:
```tsx
<div className="rounded-2xl border border-white/[0.06] bg-[var(--surface-1)] p-10 text-center">
                <p className="text-sm text-[var(--text-3)]">Select a report first to view live telemetry.</p>
                <button type="button" onClick={() => setActiveTab('reports')} className="mt-3 text-[11px] font-semibold text-[var(--agent-hector)] hover:opacity-80">Go to Reports →</button>
```

Replace the footer profile line:
```tsx
<p className="text-[11px] text-zinc-700 pb-2">
```
with:
```tsx
<p className="text-[11px] text-[var(--text-4)] pb-2">
```

- [ ] **Step 4: Run to verify all tests pass**

Run: `npx vitest run src/test/components/dashboard/HectorResearchDesk.test.tsx --pool=threads`
Expected: PASS, all 4 tests

- [ ] **Step 5: Run the full re-skin's test suite together, plus `tsc --noEmit`**

Run: `npx vitest run src/test/components/hector/ src/test/components/dashboard/HectorResearchDesk.test.tsx --pool=threads`
Expected: PASS, all tests across all 6 new test files

Run: `npx tsc --noEmit`
Expected: clean

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/HectorResearchDesk.tsx src/test/components/dashboard/HectorResearchDesk.test.tsx
git commit -m "feat: re-skin HectorResearchDesk shell onto Zone/tokens, add tests — completes the Research/Hector Desk re-skin"
```

---

## Self-Review

**Spec coverage:** Covers every section of `14-phase2-hector-research-desk-spec.md`: visual re-skin (all 6 files), synthesis-gap honesty notice (Task 3), `SourceBoard`/`CitationPanel` relabeling (Tasks 1-2), and test coverage for all 6 previously-untested components (one task each).

**Placeholder scan:** No TBD/TODO. Every re-skin substitution is a complete, real old→new string pair, not a description of what to change.

**Type consistency:** `Zone` is imported identically (`from '../ui/Zone'` for the 5 sub-panels one directory under `components/hector/`, matching their real relative path) across Tasks 1-5; `report`/`onCreateHandoff` prop shapes are unchanged from the current real interfaces throughout, since this is a styling-only pass.

**Real-token verification note:** every CSS custom property referenced (`--agent-hector`, `--success`, `--error`, `--error-dim`, `--warning-dim`, `--surface-0`/`-1`/`-2`, `--text-1`through`-4`) was confirmed to exist in `src/styles/tokens.css` during the spec-writing pass, not assumed.
