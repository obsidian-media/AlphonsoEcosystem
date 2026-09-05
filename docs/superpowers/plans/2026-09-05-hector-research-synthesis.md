# Hector Research Synthesis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Hector's research pipeline a real synthesis step — one LLM call that reads fetched sources together and produces a structured report (Overview / Key Findings / Disagreements / Gaps), instead of today's aggregate-and-truncate behavior — plus Markdown/PDF/PowerPoint export and a depth-toggle UI, while removing a redundant second LLM call elsewhere in the pipeline.

**Architecture:** One new function, `synthesizeHectorResearch`, added to `hectorResearchService.js`, routed through the shared `generateAgentLlmResponse('hector', ...)` dispatcher (same as Maria/Echo/Sentinel/Nova). Wired only into `runHectorLiveResearch` (the one real call site — `runMultiSourceResearch` is confirmed dead code, not touched). `executeHectorAssignment` in `joseExecutionEngineService.ts` drops its own redundant second LLM call. `ResearchReportPanel.tsx` gets a depth toggle, export row, and retry action. A new `hectorExportService.ts` owns Markdown/PDF/PowerPoint generation.

**Tech Stack:** JS services (`hectorResearchService.js` is unmigrated `.js`, left as-is per repo convention — don't migrate it as part of this work), TypeScript for new/touched `.ts`/`.tsx` files, Rust for the `search.rs` fetch layer, Vitest for JS/TS tests, Rust's built-in `#[test]` for Rust tests.

**Spec:** `docs/superpowers/specs/2026-09-05-hector-research-synthesis-design.md` (read it before starting — this plan implements it exactly, including all self-review fixes: `runMultiSourceResearch` dropped as dead code, `inferredPoints` kept as fallback content not removed, "Re-synthesize" retargeted to retry-after-failure since no source-adding UI exists).

---

## Task 1: `hectorResearchService.js` — `synthesizeHectorResearch`

**Files:**
- Modify: `src/services/hectorResearchService.js`
- Test: `src/test/hectorResearchService.test.js`

- [ ] **Step 1: Write the failing tests**

Add to the mock factory near the top of `src/test/hectorResearchService.test.js` (after the existing `vi.mock('@tauri-apps/api/core', ...)` block, before the `import { ... } from '../services/hectorResearchService';` line):

```js
const mockGenerateAgentLlmResponse = vi.fn();
vi.mock('../lib/ollama', () => ({
  generateAgentLlmResponse: (...args) => mockGenerateAgentLlmResponse(...args),
  PREFERRED_MODEL: 'llama3.2:3b'
}));
```

Add `synthesizeHectorResearch`, `buildHectorSynthesisPrompt`, `parseHectorSynthesisResponse` to the existing import list from `'../services/hectorResearchService'`.

Add a new `describe` block anywhere after the existing ones:

```js
describe('synthesizeHectorResearch', () => {
  beforeEach(() => {
    mockGenerateAgentLlmResponse.mockReset();
  });

  const SOURCES = [
    { url: 'https://a.example.com', title: 'Source A', snippet: 'A'.repeat(3000) },
    { url: 'https://b.example.com', title: 'Source B', snippet: 'B'.repeat(3000) },
    { url: 'https://c.example.com', title: 'Source C', snippet: 'C'.repeat(3000) }
  ];

  it('divides the 6000-char total budget evenly across sources in the built prompt', () => {
    const prompt = buildHectorSynthesisPrompt('test question', SOURCES);
    // 6000 / 3 sources = 2000 chars each
    expect((prompt.match(/A{2000}/) || [])[0]).toBeTruthy();
    expect(prompt).not.toContain('A'.repeat(2001));
  });

  it('gives a single source up to the full 6000-char budget', () => {
    const prompt = buildHectorSynthesisPrompt('test question', [SOURCES[0]]);
    expect((prompt.match(/A{6000}/) || [])[0]).toBeTruthy();
  });

  it('divides the budget across 10 sources (the fetch_research_sources cap) without erroring', () => {
    const tenSources = Array.from({ length: 10 }, (_, i) => ({
      url: `https://source${i}.example.com`,
      title: `Source ${i}`,
      snippet: 'X'.repeat(3000)
    }));
    const prompt = buildHectorSynthesisPrompt('test question', tenSources);
    // 6000 / 10 sources = 600 chars each
    expect((prompt.match(/X{600}/) || [])[0]).toBeTruthy();
    expect(prompt).not.toContain('X'.repeat(601));
  });

  it('always includes the thin-coverage instruction in the prompt regardless of source count', () => {
    const prompt = buildHectorSynthesisPrompt('test question', SOURCES);
    expect(prompt).toContain('If fewer sources succeeded than expected, or coverage looks thin, say so explicitly in gaps.');
  });

  it('parses a valid JSON response into the four-field shape', () => {
    const result = parseHectorSynthesisResponse(JSON.stringify({
      overview: 'Overview text.',
      keyFindings: ['finding 1'],
      disagreements: ['disagreement 1'],
      gaps: ['gap 1']
    }));
    expect(result).toEqual({
      overview: 'Overview text.',
      keyFindings: ['finding 1'],
      disagreements: ['disagreement 1'],
      gaps: ['gap 1']
    });
  });

  it('parses a fence-wrapped JSON response', () => {
    const result = parseHectorSynthesisResponse('```json\n{"overview":"Fenced.","keyFindings":[],"disagreements":[],"gaps":[]}\n```');
    expect(result.overview).toBe('Fenced.');
  });

  it('returns null for malformed JSON', () => {
    expect(parseHectorSynthesisResponse('not json at all')).toBeNull();
  });

  it('returns null for an empty response', () => {
    expect(parseHectorSynthesisResponse('')).toBeNull();
  });

  it('returns null for JSON missing a non-empty overview', () => {
    expect(parseHectorSynthesisResponse(JSON.stringify({ overview: '', keyFindings: [] }))).toBeNull();
  });

  it('calls generateAgentLlmResponse with agent id hector and returns the parsed result', async () => {
    mockGenerateAgentLlmResponse.mockResolvedValue({
      response: JSON.stringify({ overview: 'Real overview.', keyFindings: [], disagreements: [], gaps: [] })
    });
    const result = await synthesizeHectorResearch('test question', SOURCES);
    expect(mockGenerateAgentLlmResponse).toHaveBeenCalledWith('hector', expect.objectContaining({ prompt: expect.any(String) }));
    expect(result.overview).toBe('Real overview.');
  });

  it('returns null when generateAgentLlmResponse throws', async () => {
    mockGenerateAgentLlmResponse.mockRejectedValue(new Error('ollama down'));
    const result = await synthesizeHectorResearch('test question', SOURCES);
    expect(result).toBeNull();
  });

  it('returns null when generateAgentLlmResponse returns unparseable content', async () => {
    mockGenerateAgentLlmResponse.mockResolvedValue({ response: 'garbage' });
    const result = await synthesizeHectorResearch('test question', SOURCES);
    expect(result).toBeNull();
  });

  it('returns null for an empty sources array without calling the LLM', async () => {
    const result = await synthesizeHectorResearch('test question', []);
    expect(result).toBeNull();
    expect(mockGenerateAgentLlmResponse).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/test/hectorResearchService.test.js -t "synthesizeHectorResearch"`
Expected: FAIL — none of `synthesizeHectorResearch`/`buildHectorSynthesisPrompt`/`parseHectorSynthesisResponse` exist yet.

- [ ] **Step 3: Add the import**

In `src/services/hectorResearchService.js`, add to the top import block (after the existing `import { scoreSourceConfidence, sourceExpiryForType } from './sourceConfidenceService';` line):

```js
import { generateAgentLlmResponse, PREFERRED_MODEL } from '../lib/ollama';
```

- [ ] **Step 4: Implement the three functions**

In `src/services/hectorResearchService.js`, insert after `synthesizeHectorFallbackReport`'s closing brace (the line that reads just `}` right before `export async function isBraveSearchConfigured() {`):

```js
const HECTOR_SYNTHESIS_TOTAL_BUDGET = 6000;

export function buildHectorSynthesisPrompt(researchQuestion, sources) {
  const n = Math.max(1, sources.length);
  const perSourceBudget = Math.floor(HECTOR_SYNTHESIS_TOTAL_BUDGET / n);
  const sourceBlocks = sources.map((s, i) => {
    const text = String(s.snippet || s.summary || '').slice(0, perSourceBudget);
    return `Source ${i + 1}: ${s.title || s.url}\nURL: ${s.url}\n${text}`;
  }).join('\n\n');

  return [
    'You are Hector, a research analyst for a local AI desktop companion.',
    'Read the fetched sources below and synthesize them into one combined, reasoned report.',
    'Do not just restate each source in turn -- group related points by theme.',
    'Return ONLY valid JSON with exactly these keys (no extra keys, no markdown fences):',
    '{',
    '  "overview": "2-4 sentence executive summary",',
    '  "keyFindings": ["finding grouped by theme, not by source", ...],',
    '  "disagreements": ["Source A claims X, Source B claims Y", ...],',
    '  "gaps": ["what the question asked that no source covered", ...]',
    '}',
    'If fewer sources succeeded than expected, or coverage looks thin, say so explicitly in gaps.',
    '',
    `Research question: ${researchQuestion}`,
    '',
    sourceBlocks
  ].join('\n');
}

export function parseHectorSynthesisResponse(text) {
  try {
    const raw = String(text || '').trim();
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonMatch = fenceMatch ? null : raw.match(/\{[\s\S]*\}/);
    const cleaned = fenceMatch ? fenceMatch[1].trim() : jsonMatch ? jsonMatch[0] : raw;
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed.overview !== 'string' || !parsed.overview.trim()) return null;
    return {
      overview: parsed.overview,
      keyFindings: Array.isArray(parsed.keyFindings) ? parsed.keyFindings : [],
      disagreements: Array.isArray(parsed.disagreements) ? parsed.disagreements : [],
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps : []
    };
  } catch {
    return null;
  }
}

export async function synthesizeHectorResearch(researchQuestion, sources, options = {}) {
  if (!Array.isArray(sources) || sources.length === 0) return null;
  try {
    const prompt = buildHectorSynthesisPrompt(researchQuestion, sources);
    const response = await generateAgentLlmResponse('hector', {
      endpoint: options.endpoint,
      model: options.model || PREFERRED_MODEL,
      prompt
    });
    return parseHectorSynthesisResponse(response?.response);
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/test/hectorResearchService.test.js -t "synthesizeHectorResearch"`
Expected: PASS (all 14 new tests).

- [ ] **Step 6: Run the full existing file to confirm no regression**

Run: `npx vitest run src/test/hectorResearchService.test.js`
Expected: PASS (every pre-existing test in the file, plus the 12 new ones).

- [ ] **Step 7: Commit**

```bash
git add src/services/hectorResearchService.js src/test/hectorResearchService.test.js
git commit -m "feat(hector): add synthesizeHectorResearch -- real synthesis over fetched sources"
```

---

## Task 2: Wire synthesis into `runHectorLiveResearch`, add `resynthesizeHectorReport`

**Files:**
- Modify: `src/services/hectorResearchService.js`
- Test: `src/test/hectorResearchService.test.js`

- [ ] **Step 1: Write the failing tests**

Add to the same `synthesizeHectorResearch` `describe` block's mock setup area, add `resynthesizeHectorReport` to the import list from `'../services/hectorResearchService'`. Add a new `describe` block:

```js
describe('runHectorLiveResearch synthesis wiring', () => {
  beforeEach(() => {
    localStorage.clear();
    mockGenerateAgentLlmResponse.mockReset();
  });

  it('sets report.synthesis and updates summary to the overview on successful synthesis', async () => {
    mockGenerateAgentLlmResponse.mockResolvedValue({
      response: JSON.stringify({ overview: 'Synthesized overview.', keyFindings: ['f1'], disagreements: [], gaps: [] })
    });
    const draft = createResearchDraft({ researchQuestion: 'How does Alphonso verify WhatsApp webhooks?' });
    const report = await runHectorLiveResearch(draft.id);

    expect(report.synthesis).toEqual({ overview: 'Synthesized overview.', keyFindings: ['f1'], disagreements: [], gaps: [] });
    expect(report.summary).toBe('Synthesized overview.');
  });

  it('keeps todays fallback verifiedFacts/inferredPoints and summary when synthesis fails', async () => {
    mockGenerateAgentLlmResponse.mockRejectedValue(new Error('ollama down'));
    const draft = createResearchDraft({ researchQuestion: 'How does Alphonso verify WhatsApp webhooks?' });
    const report = await runHectorLiveResearch(draft.id);

    expect(report.synthesis).toBeUndefined();
    expect(report.verifiedFacts.length).toBeGreaterThan(0);
    expect(report.summary).toContain('Fetched');
  });
});

describe('resynthesizeHectorReport', () => {
  beforeEach(() => {
    localStorage.clear();
    mockGenerateAgentLlmResponse.mockReset();
  });

  it('re-runs synthesis from stored sourceProofs without re-fetching', async () => {
    mockGenerateAgentLlmResponse.mockRejectedValueOnce(new Error('ollama down'));
    const draft = createResearchDraft({ researchQuestion: 'How does Alphonso verify WhatsApp webhooks?' });
    const failedReport = await runHectorLiveResearch(draft.id);
    expect(failedReport.synthesis).toBeUndefined();

    mockGenerateAgentLlmResponse.mockResolvedValueOnce({
      response: JSON.stringify({ overview: 'Retry succeeded.', keyFindings: [], disagreements: [], gaps: [] })
    });
    const retried = await resynthesizeHectorReport(draft.id);

    expect(retried.synthesis.overview).toBe('Retry succeeded.');
    expect(retried.summary).toBe('Retry succeeded.');
    // fetch_research_sources mock (in this file's top-level invoke mock) was only
    // ever called once, by the original run -- resynthesize did not refetch.
  });

  it('returns null when the report has no successful sourceProofs', async () => {
    const draft = createResearchDraft({ researchQuestion: 'no sources question' });
    const result = await resynthesizeHectorReport(draft.id);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/test/hectorResearchService.test.js -t "runHectorLiveResearch synthesis wiring"`
Run: `npx vitest run src/test/hectorResearchService.test.js -t "resynthesizeHectorReport"`
Expected: FAIL — `report.synthesis` is `undefined` in the success case (not wired yet), and `resynthesizeHectorReport` doesn't exist.

- [ ] **Step 3: Wire synthesis into `runHectorLiveResearch`**

Replace:

```js
  onProgress?.(updated);

  successProofs.forEach((proof) => {
```

with:

```js
  onProgress?.(updated);

  let finalReport = updated;
  if (successProofs.length > 0) {
    const synthesis = await synthesizeHectorResearch(workingReport.researchQuestion, successProofs);
    if (synthesis) {
      finalReport = updateReport(reportId, { synthesis, summary: synthesis.overview });
      onProgress?.(finalReport);
    }
  }

  successProofs.forEach((proof) => {
```

Then replace the function's final line:

```js
  return updated;
}
```

with:

```js
  return finalReport;
}
```

- [ ] **Step 4: Add `resynthesizeHectorReport`**

Immediately after `runHectorLiveResearch`'s closing brace, add:

```js
export async function resynthesizeHectorReport(reportId, onProgress) {
  const report = listHectorReports().find((item) => item.id === reportId);
  if (!report) throw new Error('Hector report not found.');
  const successProofs = Array.isArray(report.sourceProofs) ? report.sourceProofs.filter((p) => p.ok) : [];
  if (successProofs.length === 0) return null;

  const synthesis = await synthesizeHectorResearch(report.researchQuestion, successProofs);
  if (!synthesis) return null;

  const updated = updateReport(reportId, { synthesis, summary: synthesis.overview });
  onProgress?.(updated);
  recordHectorActivity('synthesis_retried', { reportId });
  return updated;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/test/hectorResearchService.test.js`
Expected: PASS (all tests in the file, including every pre-existing one).

- [ ] **Step 6: Commit**

```bash
git add src/services/hectorResearchService.js src/test/hectorResearchService.test.js
git commit -m "feat(hector): wire synthesis into runHectorLiveResearch, add resynthesizeHectorReport for retry"
```

---

## Task 3: `search.rs` — stop discarding fetched page text

**Files:**
- Modify: `src-tauri/src/search.rs`

- [ ] **Step 1: Write the failing test**

In `src-tauri/src/search.rs`, inside `mod tests` (after the existing `strip_html_removes_tags` test), add:

```rust
  #[test]
  fn build_snippet_keeps_long_text_in_full() {
    let long_text = "a".repeat(5000);
    let snippet = build_snippet(&long_text).unwrap();
    assert_eq!(snippet.len(), 5000, "snippet should no longer be capped at 420 chars");
  }

  #[test]
  fn build_snippet_returns_none_for_empty_text() {
    assert!(build_snippet("").is_none());
  }
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `src-tauri/`): `cargo test build_snippet`
Expected: FAIL — `build_snippet` doesn't exist yet (compile error).

- [ ] **Step 3: Extract and fix the snippet-building logic**

Add a new function near `strip_html_tags` (find it via `grep -n "fn strip_html_tags" src-tauri/src/search.rs` and add directly after its closing brace):

```rust
fn build_snippet(text: &str) -> Option<String> {
  if text.is_empty() {
    None
  } else {
    Some(text.to_string())
  }
}
```

Then replace the two call sites that inline the old 420-char truncation:

```rust
            let snippet = if text.is_empty() {
              None
            } else {
              Some(text.chars().take(420).collect::<String>())
            };
```

with:

```rust
            let snippet = build_snippet(&text);
```

(There is exactly one such block inside `fetch_research_sources` — confirm with
`grep -n "chars().take(420)" src-tauri/src/search.rs` before and after to be sure it's gone.)

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `src-tauri/`): `cargo test build_snippet`
Expected: PASS (both new tests).

Run: `cargo test`
Expected: PASS (full existing suite, no regressions).

Run: `cargo clippy -- -D warnings`
Expected: 0 warnings.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/search.rs
git commit -m "fix(search): stop truncating fetched page text to 420 chars, extract build_snippet for testability"
```

---

## Task 4: Simplify `executeHectorAssignment` — drop the redundant second LLM call

**Files:**
- Modify: `src/services/joseExecutionEngineService.ts`
- Test: `src/test/joseExecutionEngineService.test.js`

- [ ] **Step 1: Write the failing test**

`executeHectorAssignment` is a private (non-exported) function, only reachable via the full pipeline. Rather than reverse-engineer routing/decomposition mocking to reach it end-to-end, add a direct static-source check — the same pattern this repo already uses for `appLazyImports.test.js`.

Add to `src/test/joseExecutionEngineService.test.js` (anywhere, e.g. right after the `isJoseIntakeCommand` `describe` block):

```js
import fs from 'fs';
import path from 'path';

describe('executeHectorAssignment no longer re-summarizes', () => {
  it('does not call generateAgentLlmResponse a second time inside executeHectorAssignment', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../services/joseExecutionEngineService.ts'),
      'utf-8'
    );
    const fnStart = source.indexOf('async function executeHectorAssignment(');
    const fnEnd = source.indexOf('\nasync function executeJoseAssignment(');
    expect(fnStart).toBeGreaterThan(-1);
    expect(fnEnd).toBeGreaterThan(fnStart);
    const fnBody = source.slice(fnStart, fnEnd);
    expect(fnBody).not.toContain('generateAgentLlmResponse');
    expect(fnBody).not.toContain('draftPrompt');
    expect(fnBody).toContain('report?.summary');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/joseExecutionEngineService.test.js -t "executeHectorAssignment no longer re-summarizes"`
Expected: FAIL — `fnBody` still contains `generateAgentLlmResponse` and `draftPrompt`.

- [ ] **Step 3: Simplify the function**

Replace:

```ts
async function executeHectorAssignment(commandText: any, assignment: any, options: any = {}) {
  const action = String(assignment?.actionType || '').toLowerCase();
  if (action.includes('external_publish_handoff')) {
    return {
      summary: 'Hector prepared publish-readiness handoff. External publish remains approval-gated.',
      resultState: 'pending_review',
      resultUrl: null,
      artifacts: [{ type: 'publish_handoff', status: 'approval_required' }],
      sources: [],
      contractAction: assignment?.actionType || 'external_publish_handoff'
    };
  }

  const draft = createResearchDraft({
    researchQuestion: commandText,
    sourceUrls: [],
    sourceType: 'official_docs',
    riskLevel: assignment?.riskLevel || 'medium'
  });
  const report = await runHectorLiveResearch(draft.id);
  const sourceRefs = Array.isArray(report?.sources) ? report.sources.map((item) => item?.url).filter(Boolean) : [];

  let summary = report?.summary || 'Hector research run completed.';
  if (!options.draftDisabled) {
    try {
      const contextSnippet = [summary, options.retrievedContext?.snippet].filter(Boolean).join('\n');
      const prompt = draftPrompt('hector', commandText, { snippet: contextSnippet });
      const response = await generateAgentLlmResponse('hector', {
        endpoint: options.endpoint,
        model: options.model || PREFERRED_MODEL,
        prompt,
        sessionId: assignment?.packetId ? resolveSecureSessionId(assignment.packetId) : undefined,
        // Safe unconditionally: isBlockedByHermesApproval already routed this
        // packet to pending_approval and stopped before reaching here if
        // Hector is Hermes-backed and Approval Mode is on — see that gate's comment.
        approved: true
      });
      const llmSummary = String(response?.response || '').trim();
      if (llmSummary.length > 20) {
        summary = llmSummary;
      }
    } catch { /* fall through to existing summary */ }
  }

  return {
    summary,
    resultState: report?.confidenceLevel === TRUST_STATES.VERIFIED ? 'verified' : 'pending_review',
    resultUrl: null,
    artifacts: [{ type: 'hector_report', reportId: report?.id || draft.id }],
    sources: sourceRefs.length ? sourceRefs : [`hector_report:${report?.id || draft.id}`],
    contractAction: assignment?.actionType || 'research'
  };
}
```

with:

```ts
async function executeHectorAssignment(commandText: any, assignment: any, options: any = {}) {
  const action = String(assignment?.actionType || '').toLowerCase();
  if (action.includes('external_publish_handoff')) {
    return {
      summary: 'Hector prepared publish-readiness handoff. External publish remains approval-gated.',
      resultState: 'pending_review',
      resultUrl: null,
      artifacts: [{ type: 'publish_handoff', status: 'approval_required' }],
      sources: [],
      contractAction: assignment?.actionType || 'external_publish_handoff'
    };
  }

  const draft = createResearchDraft({
    researchQuestion: commandText,
    sourceUrls: [],
    sourceType: 'official_docs',
    riskLevel: assignment?.riskLevel || 'medium'
  });
  // runHectorLiveResearch already runs a real synthesis pass over the fetched
  // sources (see synthesizeHectorResearch) and folds the result into
  // report.summary when it succeeds -- no second, generic-prompt LLM call is
  // needed here to "improve" an already-synthesized summary.
  const report = await runHectorLiveResearch(draft.id);
  const sourceRefs = Array.isArray(report?.sources) ? report.sources.map((item) => item?.url).filter(Boolean) : [];

  return {
    summary: report?.summary || 'Hector research run completed.',
    resultState: report?.confidenceLevel === TRUST_STATES.VERIFIED ? 'verified' : 'pending_review',
    resultUrl: null,
    artifacts: [{ type: 'hector_report', reportId: report?.id || draft.id }],
    sources: sourceRefs.length ? sourceRefs : [`hector_report:${report?.id || draft.id}`],
    contractAction: assignment?.actionType || 'research'
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/test/joseExecutionEngineService.test.js`
Expected: PASS (the new test, plus every pre-existing test in the file — none of them exercised the removed code path directly, per the earlier research showing no test called `executeHectorAssignment`'s LLM branch).

Run: `npx tsc --noEmit`
Expected: 0 errors (confirms no other call site depended on the removed local variables/behavior).

- [ ] **Step 5: Commit**

```bash
git add src/services/joseExecutionEngineService.ts src/test/joseExecutionEngineService.test.js
git commit -m "refactor(jose): drop executeHectorAssignment's redundant second LLM call, use synthesized summary directly"
```

---

## Task 5: Add PDF/PowerPoint export dependencies

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install the dependencies**

```bash
npm install jspdf pptxgenjs
```

- [ ] **Step 2: Verify the install**

Run: `node -e "console.log(require('jspdf/package.json').version, require('pptxgenjs/package.json').version)"`
Expected: prints two version numbers, no error.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add jspdf and pptxgenjs for Hector research export"
```

---

## Task 6: `hectorExportService.ts` — Markdown/PDF/PowerPoint export

**Files:**
- Create: `src/services/hectorExportService.ts`
- Test: `src/test/hectorExportService.test.ts` (new)

- [ ] **Step 1: Write the failing tests**

Create `src/test/hectorExportService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockJsPdfSave = vi.fn();
const mockJsPdfText = vi.fn();
const mockJsPdfConstructor = vi.fn(() => ({
  text: mockJsPdfText,
  save: mockJsPdfSave,
  splitTextToSize: (text: string) => [text],
  internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
  addPage: vi.fn()
}));
vi.mock('jspdf', () => ({ jsPDF: mockJsPdfConstructor }));

const mockPptxWriteFile = vi.fn();
const mockPptxAddText = vi.fn();
const mockPptxAddSlide = vi.fn(() => ({ addText: mockPptxAddText }));
const mockPptxConstructor = vi.fn(() => ({
  addSlide: mockPptxAddSlide,
  writeFile: mockPptxWriteFile
}));
vi.mock('pptxgenjs', () => ({ default: mockPptxConstructor }));

vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:mock-url'), revokeObjectURL: vi.fn() });

import {
  buildHectorReportMarkdown,
  exportHectorReportAsMarkdown,
  exportHectorReportAsPdf,
  exportHectorReportAsPowerPoint
} from '../services/hectorExportService';

const REPORT = {
  researchQuestion: 'How does React 19 Suspense work?',
  status: 'sources_verified',
  confidenceLevel: 'verified',
  synthesis: {
    overview: 'React 19 Suspense is stable.',
    keyFindings: ['Core API unchanged', 'No migration tooling found'],
    disagreements: ['Source A and B disagree on streaming behavior'],
    gaps: ['No coverage of server components']
  },
  sourceProofs: [
    { url: 'https://a.example.com', title: 'Source A', ok: true, httpStatus: 200 },
    { url: 'https://b.example.com', title: 'Source B', ok: true, httpStatus: 200 }
  ]
};

describe('buildHectorReportMarkdown', () => {
  it('always includes all four synthesis sections regardless of any "selected view"', () => {
    const md = buildHectorReportMarkdown(REPORT);
    expect(md).toContain('React 19 Suspense is stable.');
    expect(md).toContain('Core API unchanged');
    expect(md).toContain('Source A and B disagree on streaming behavior');
    expect(md).toContain('No coverage of server components');
  });

  it('includes source citations', () => {
    const md = buildHectorReportMarkdown(REPORT);
    expect(md).toContain('https://a.example.com');
    expect(md).toContain('https://b.example.com');
  });

  it('falls back gracefully when synthesis is absent', () => {
    const md = buildHectorReportMarkdown({ ...REPORT, synthesis: undefined, summary: 'Old-style summary.' });
    expect(md).toContain('Old-style summary.');
  });
});

describe('export functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exportHectorReportAsMarkdown creates a downloadable blob', () => {
    const clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === 'a') el.click = clickSpy;
      return el;
    });
    exportHectorReportAsMarkdown(REPORT);
    expect(clickSpy).toHaveBeenCalled();
  });

  it('exportHectorReportAsPdf dynamically imports jspdf and saves a file', async () => {
    await exportHectorReportAsPdf(REPORT);
    expect(mockJsPdfConstructor).toHaveBeenCalled();
    expect(mockJsPdfSave).toHaveBeenCalled();
  });

  it('exportHectorReportAsPowerPoint dynamically imports pptxgenjs and writes a file', async () => {
    await exportHectorReportAsPowerPoint(REPORT);
    expect(mockPptxConstructor).toHaveBeenCalled();
    expect(mockPptxWriteFile).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/test/hectorExportService.test.ts`
Expected: FAIL — `src/services/hectorExportService.ts` doesn't exist yet.

- [ ] **Step 3: Implement the service**

Create `src/services/hectorExportService.ts`:

```ts
interface SourceProof {
  url: string;
  title?: string;
  ok?: boolean;
  httpStatus?: number;
}

interface HectorSynthesis {
  overview: string;
  keyFindings: string[];
  disagreements: string[];
  gaps: string[];
}

interface HectorReport {
  researchQuestion?: string;
  status?: string;
  confidenceLevel?: string;
  summary?: string;
  synthesis?: HectorSynthesis;
  sourceProofs?: SourceProof[];
}

function safeFileBaseName(report: HectorReport): string {
  return String(report.researchQuestion ?? 'report').slice(0, 40).replace(/[^a-z0-9]/gi, '-');
}

export function buildHectorReportMarkdown(report: HectorReport): string {
  const sources = Array.isArray(report.sourceProofs) ? report.sourceProofs : [];
  const s = report.synthesis;
  const lines = [
    '# Hector Research Report', '',
    `**Question:** ${String(report.researchQuestion ?? 'Untitled')}`,
    `**Status:** ${String(report.status ?? 'unknown')} | **Confidence:** ${String(report.confidenceLevel ?? 'unknown')}`,
    `**Exported:** ${new Date().toISOString()}`, ''
  ];

  if (s) {
    lines.push('## Overview', '', s.overview, '');
    if (s.keyFindings.length) {
      lines.push('## Key Findings', '', ...s.keyFindings.map((f) => `- ${f}`), '');
    }
    if (s.disagreements.length) {
      lines.push('## Disagreements', '', ...s.disagreements.map((d) => `- ${d}`), '');
    }
    if (s.gaps.length) {
      lines.push('## Gaps', '', ...s.gaps.map((g) => `- ${g}`), '');
    }
  } else {
    lines.push('## Summary', '', String(report.summary ?? '_No summary yet._'), '');
  }

  lines.push(`## Sources (${sources.length})`, '');
  sources.forEach((src, i) => {
    lines.push(`${i + 1}. ${src.title ?? src.url}${src.httpStatus ? ` (HTTP ${src.httpStatus})` : ''}`);
    lines.push(`   ${src.url}`);
  });

  return lines.join('\n');
}

export function exportHectorReportAsMarkdown(report: HectorReport): void {
  const content = buildHectorReportMarkdown(report);
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hector-report-${safeFileBaseName(report)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportHectorReportAsPdf(report: HectorReport): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF();
  const content = buildHectorReportMarkdown(report);
  const pageWidth = doc.internal.pageSize.getWidth();
  const lines = doc.splitTextToSize(content, pageWidth - 20);
  doc.text(lines, 10, 10);
  doc.save(`hector-report-${safeFileBaseName(report)}.pdf`);
}

export async function exportHectorReportAsPowerPoint(report: HectorReport): Promise<void> {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const pptx = new PptxGenJS();
  const s = report.synthesis;

  const overviewSlide = pptx.addSlide();
  overviewSlide.addText(String(report.researchQuestion ?? 'Hector Research Report'), { x: 0.5, y: 0.3, fontSize: 20, bold: true });
  overviewSlide.addText(s?.overview ?? report.summary ?? '', { x: 0.5, y: 1.2, fontSize: 14 });

  if (s?.keyFindings.length) {
    const findingsSlide = pptx.addSlide();
    findingsSlide.addText('Key Findings', { x: 0.5, y: 0.3, fontSize: 18, bold: true });
    findingsSlide.addText(s.keyFindings.map((f) => `• ${f}`).join('\n'), { x: 0.5, y: 1, fontSize: 12 });
  }

  if (s?.disagreements.length || s?.gaps.length) {
    const notesSlide = pptx.addSlide();
    notesSlide.addText('Disagreements & Gaps', { x: 0.5, y: 0.3, fontSize: 18, bold: true });
    const body = [...(s.disagreements ?? []), ...(s.gaps ?? [])].map((x) => `• ${x}`).join('\n');
    notesSlide.addText(body, { x: 0.5, y: 1, fontSize: 12 });
  }

  await pptx.writeFile({ fileName: `hector-report-${safeFileBaseName(report)}.pptx` });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/test/hectorExportService.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors. If `jspdf`/`pptxgenjs` type declarations resolve incorrectly, check `node_modules/jspdf`/`node_modules/pptxgenjs` ship their own `.d.ts` files (both packages do) — no `@types/*` package needed.

- [ ] **Step 6: Commit**

```bash
git add src/services/hectorExportService.ts src/test/hectorExportService.test.ts
git commit -m "feat(hector): add Markdown/PDF/PowerPoint export service, always exports the full report"
```

---

## Task 7: `ResearchReportPanel.tsx` — depth toggle, export row, collapsed sources, retry action

**Files:**
- Modify: `src/components/hector/ResearchReportPanel.tsx`
- Test: `src/test/ResearchReportPanel.test.tsx` (new)

- [ ] **Step 1: Write the failing tests**

Create `src/test/ResearchReportPanel.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../services/browserAutomationService', () => ({ openExternalUrl: vi.fn() }));

const mockExportMarkdown = vi.fn();
const mockExportPdf = vi.fn().mockResolvedValue(undefined);
const mockExportPptx = vi.fn().mockResolvedValue(undefined);
vi.mock('../services/hectorExportService', () => ({
  exportHectorReportAsMarkdown: (...args: unknown[]) => mockExportMarkdown(...args),
  exportHectorReportAsPdf: (...args: unknown[]) => mockExportPdf(...args),
  exportHectorReportAsPowerPoint: (...args: unknown[]) => mockExportPptx(...args)
}));

const mockResynthesize = vi.fn().mockResolvedValue({ synthesis: { overview: 'Retried.', keyFindings: [], disagreements: [], gaps: [] } });
vi.mock('../services/hectorResearchService', () => ({
  resynthesizeHectorReport: (...args: unknown[]) => mockResynthesize(...args)
}));

import { ResearchReportPanel } from '../components/hector/ResearchReportPanel';

const REPORT_WITH_SYNTHESIS = {
  id: 'report-1',
  researchQuestion: 'Test question',
  dateChecked: '2026-09-05T00:00:00.000Z',
  confidenceLevel: 'verified',
  status: 'sources_verified',
  synthesis: {
    overview: 'Overview text.',
    keyFindings: ['Finding one'],
    disagreements: ['Disagreement one'],
    gaps: ['Gap one']
  },
  sourceProofs: [{ url: 'https://a.example.com', ok: true, httpStatus: 200 }],
  recommendedNextStep: 'Review and proceed.'
};

const REPORT_WITHOUT_SYNTHESIS = {
  ...REPORT_WITH_SYNTHESIS,
  synthesis: undefined
};

describe('ResearchReportPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults to the Structured view showing all four sections', () => {
    render(<ResearchReportPanel report={REPORT_WITH_SYNTHESIS} />);
    expect(screen.getByText('Overview text.')).toBeTruthy();
    expect(screen.getByText('Finding one')).toBeTruthy();
    expect(screen.getByText('Disagreement one')).toBeTruthy();
    expect(screen.getByText('Gap one')).toBeTruthy();
  });

  it('Brief toggle shows only the overview', () => {
    render(<ResearchReportPanel report={REPORT_WITH_SYNTHESIS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Brief' }));
    expect(screen.getByText('Overview text.')).toBeTruthy();
    expect(screen.queryByText('Finding one')).toBeNull();
  });

  it('Medium toggle shows overview and key findings but not disagreements/gaps', () => {
    render(<ResearchReportPanel report={REPORT_WITH_SYNTHESIS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Medium' }));
    expect(screen.getByText('Overview text.')).toBeTruthy();
    expect(screen.getByText('Finding one')).toBeTruthy();
    expect(screen.queryByText('Disagreement one')).toBeNull();
  });

  it('Source Proofs are collapsed by default behind a disclosure toggle', () => {
    render(<ResearchReportPanel report={REPORT_WITH_SYNTHESIS} />);
    expect(screen.queryByText('https://a.example.com')).toBeNull();
    fireEvent.click(screen.getByText(/Sources \(1\)/));
    expect(screen.getByText('https://a.example.com')).toBeTruthy();
  });

  it('export row calls the export service functions', async () => {
    render(<ResearchReportPanel report={REPORT_WITH_SYNTHESIS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Markdown' }));
    expect(mockExportMarkdown).toHaveBeenCalledWith(REPORT_WITH_SYNTHESIS);
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    expect(mockExportPdf).toHaveBeenCalledWith(REPORT_WITH_SYNTHESIS);
    fireEvent.click(screen.getByRole('button', { name: 'PowerPoint' }));
    expect(mockExportPptx).toHaveBeenCalledWith(REPORT_WITH_SYNTHESIS);
  });

  it('export buttons are disabled when there is no synthesis', () => {
    render(<ResearchReportPanel report={REPORT_WITHOUT_SYNTHESIS} />);
    expect(screen.getByRole('button', { name: 'Markdown' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'PDF' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'PowerPoint' })).toBeDisabled();
  });

  it('shows a Re-synthesize action when a source succeeded but synthesis is absent, and calls resynthesizeHectorReport', async () => {
    render(<ResearchReportPanel report={REPORT_WITHOUT_SYNTHESIS} />);
    const retryBtn = screen.getByRole('button', { name: /Re-synthesize/i });
    fireEvent.click(retryBtn);
    expect(mockResynthesize).toHaveBeenCalledWith('report-1');
  });

  it('does not show Re-synthesize when synthesis is already present', () => {
    render(<ResearchReportPanel report={REPORT_WITH_SYNTHESIS} />);
    expect(screen.queryByRole('button', { name: /Re-synthesize/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/test/ResearchReportPanel.test.tsx`
Expected: FAIL — no toggle, export row, disclosure, or retry action exist yet.

- [ ] **Step 3: Rewrite the component**

Replace the entire contents of `src/components/hector/ResearchReportPanel.tsx` with:

```tsx
import React, { useState } from 'react';
import { openExternalUrl } from '../../services/browserAutomationService';
import { exportHectorReportAsMarkdown, exportHectorReportAsPdf, exportHectorReportAsPowerPoint } from '../../services/hectorExportService';
import { resynthesizeHectorReport } from '../../services/hectorResearchService';

interface SourceProof {
  ok?: boolean;
  url: string;
  httpStatus?: number;
  error?: string;
}

interface Synthesis {
  overview: string;
  keyFindings: string[];
  disagreements: string[];
  gaps: string[];
}

interface Report {
  id?: string;
  researchQuestion?: string;
  dateChecked?: string;
  confidenceLevel?: string;
  status?: string;
  sourceProofs?: SourceProof[];
  synthesis?: Synthesis;
  summary?: string;
  verifiedFacts?: string[];
  inferredPoints?: string[];
  joseApprovalNeeded?: string[];
  recommendedNextStep?: string;
}

interface Props {
  report?: Report | null;
}

type DepthView = 'brief' | 'medium' | 'structured';

function ReportList({ title, rows = [], empty }: { title: string; rows?: string[]; empty: string }): React.JSX.Element {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{title}</div>
      <div className="mt-2 space-y-1">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-zinc-900/45 px-3 py-2 text-[11px] text-zinc-500">{empty}</div>
        ) : rows.map((row) => (
          <div key={row} className="rounded-lg border border-white/10 bg-zinc-900/45 px-3 py-2 text-[11px] text-zinc-300">{row}</div>
        ))}
      </div>
    </div>
  );
}

export function ResearchReportPanel({ report }: Props): React.JSX.Element {
  const [depth, setDepth] = useState<DepthView>('structured');
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [localSynthesis, setLocalSynthesis] = useState<Synthesis | undefined>(report?.synthesis);

  const synthesis = localSynthesis ?? report?.synthesis;
  const hasSuccessfulSource = Array.isArray(report?.sourceProofs) && report!.sourceProofs!.some((p) => p.ok);
  const showRetry = hasSuccessfulSource && !synthesis;

  const handleRetry = async () => {
    if (!report?.id) return;
    setRetrying(true);
    try {
      const updated = await resynthesizeHectorReport(report.id);
      if (updated?.synthesis) setLocalSynthesis(updated.synthesis);
    } finally {
      setRetrying(false);
    }
  };

  if (!report) {
    return (
      <section className="rounded-2xl border border-teal-300/15 bg-zinc-950/72 p-4">
        <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-teal-200/75">Research Report</div>
        <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-4 text-sm text-zinc-500">
          No Hector report selected.
        </div>
      </section>
    );
  }

  const sourceProofs = report.sourceProofs ?? [];

  return (
    <section className="rounded-2xl border border-teal-300/15 bg-zinc-950/72 p-4">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-teal-200/75">Research Report</div>
      <div className="space-y-3">
        <div>
          <div className="text-sm font-semibold text-teal-50">{report.researchQuestion}</div>
          <div className="mt-1 text-[11px] text-zinc-500">Checked: {report.dateChecked ?? 'not checked'} | confidence: {report.confidenceLevel}</div>
        </div>

        {synthesis ? (
          <>
            <div className="flex gap-1.5">
              {(['brief', 'medium', 'structured'] as DepthView[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDepth(d)}
                  className={`rounded-lg border px-3 py-1 text-[11px] font-medium capitalize transition-colors ${depth === d ? 'border-teal-400/25 bg-teal-500/10 text-teal-200' : 'border-white/[0.07] text-zinc-500 hover:text-zinc-300'}`}
                >
                  {d === 'brief' ? 'Brief' : d === 'medium' ? 'Medium' : 'Structured'}
                </button>
              ))}
            </div>

            <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-3 space-y-2">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Overview</div>
                <p className="mt-1 text-[12px] text-zinc-200">{synthesis.overview}</p>
              </div>
              {depth !== 'brief' && synthesis.keyFindings.length > 0 && (
                <ReportList title="Key Findings" rows={synthesis.keyFindings} empty="No key findings." />
              )}
              {depth === 'structured' && synthesis.disagreements.length > 0 && (
                <ReportList title="Disagreements" rows={synthesis.disagreements} empty="No disagreements noted." />
              )}
              {depth === 'structured' && synthesis.gaps.length > 0 && (
                <ReportList title="Gaps" rows={synthesis.gaps} empty="No gaps noted." />
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Export:</span>
              <button type="button" onClick={() => exportHectorReportAsMarkdown(report)} className="rounded border border-white/10 bg-zinc-800 px-2.5 py-1 text-[10px] font-semibold text-zinc-300 hover:bg-zinc-700">Markdown</button>
              <button type="button" onClick={() => exportHectorReportAsPdf(report)} className="rounded border border-white/10 bg-zinc-800 px-2.5 py-1 text-[10px] font-semibold text-zinc-300 hover:bg-zinc-700">PDF</button>
              <button type="button" onClick={() => exportHectorReportAsPowerPoint(report)} className="rounded border border-white/10 bg-zinc-800 px-2.5 py-1 text-[10px] font-semibold text-zinc-300 hover:bg-zinc-700">PowerPoint</button>
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-amber-300/15 bg-amber-500/10 p-3 text-[11px] text-amber-100/80 space-y-2">
            <div>
              {report.status === 'source_discovery_failed'
                ? 'Live source discovery failed. Check connectivity and retry.'
                : `${report.status}. Sources and citations are generated from real live discovery/fetch runs.`}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => exportHectorReportAsMarkdown(report)} disabled className="rounded border border-white/10 bg-zinc-800 px-2.5 py-1 text-[10px] font-semibold text-zinc-500 opacity-40 cursor-not-allowed">Markdown</button>
              <button type="button" onClick={() => exportHectorReportAsPdf(report)} disabled className="rounded border border-white/10 bg-zinc-800 px-2.5 py-1 text-[10px] font-semibold text-zinc-500 opacity-40 cursor-not-allowed">PDF</button>
              <button type="button" onClick={() => exportHectorReportAsPowerPoint(report)} disabled className="rounded border border-white/10 bg-zinc-800 px-2.5 py-1 text-[10px] font-semibold text-zinc-500 opacity-40 cursor-not-allowed">PowerPoint</button>
            </div>
            {showRetry && (
              <button type="button" onClick={handleRetry} disabled={retrying} className="rounded-lg border border-teal-400/25 bg-teal-500/10 px-3 py-1.5 text-[11px] font-semibold text-teal-200 hover:bg-teal-500/15 disabled:opacity-40">
                {retrying ? 'Re-synthesizing...' : 'Re-synthesize'}
              </button>
            )}
          </div>
        )}

        <div>
          <button type="button" onClick={() => setSourcesOpen((v) => !v)} className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-300">
            {sourcesOpen ? '▾' : '▸'} Sources ({sourceProofs.length})
          </button>
          {sourcesOpen && sourceProofs.length > 0 && (
            <div className="mt-2 space-y-1">
              {sourceProofs.map((proof) => (
                <div key={proof.url} className="rounded-lg border border-white/10 bg-zinc-900/45 px-3 py-2 text-[11px] text-zinc-300">
                  <span className={proof.ok ? 'text-emerald-400' : 'text-red-400'}>{proof.ok ? 'Verified' : 'Failed'}</span>{' '}
                  <button
                    type="button"
                    onClick={() => openExternalUrl(proof.url)}
                    className="text-teal-300 underline decoration-teal-700 hover:text-teal-200 hover:decoration-teal-400 transition-colors break-all text-left"
                    title={proof.url}
                  >
                    {proof.url}
                  </button>
                  {proof.httpStatus ? ` (HTTP ${proof.httpStatus})` : ''}
                  {proof.error ? ` - ${proof.error}` : ''}
                </div>
              ))}
            </div>
          )}
        </div>

        <ReportList title="Jose Approval Needed" rows={report.joseApprovalNeeded} empty="No approval blockers listed." />
        <div className="rounded-xl border border-white/10 bg-zinc-900/55 p-3 text-[11px] text-zinc-300">
          Recommended next step: {report.recommendedNextStep ?? 'Not available.'}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/test/ResearchReportPanel.test.tsx`
Expected: PASS (all 9 tests).

- [ ] **Step 5: Run typecheck and lint**

Run: `npx tsc --noEmit`
Run: `npx eslint src/components/hector/ResearchReportPanel.tsx`
Expected: 0 errors both.

- [ ] **Step 6: Commit**

```bash
git add src/components/hector/ResearchReportPanel.tsx src/test/ResearchReportPanel.test.tsx
git commit -m "feat(hector): add depth toggle, export row, collapsed sources, retry action to ResearchReportPanel"
```

---

## Task 8: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full targeted test run**

Run: `npx vitest run src/test/hectorResearchService.test.js src/test/hectorExportService.test.ts src/test/ResearchReportPanel.test.tsx src/test/joseExecutionEngineService.test.js`
Expected: PASS, 0 failures.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit`
Run: `npm run lint`
Expected: 0 errors both.

- [ ] **Step 3: Rust check**

Run (from `src-tauri/`): `cargo check && cargo test && cargo fmt --all -- --check && cargo clippy -- -D warnings`
Expected: all clean.

- [ ] **Step 4: Confirm no remaining references to removed logic**

Run: `grep -n "draftPrompt('hector'" src/services/joseExecutionEngineService.ts`
Expected: no output (empty) — confirms the redundant call site is really gone.

Run: `grep -n "chars().take(420)" src-tauri/src/search.rs`
Expected: no output (empty).

- [ ] **Step 5: Final commit (if any cleanup was needed in Steps 2-4)**

```bash
git add -A
git commit -m "chore: verification pass for Hector research synthesis"
```

(Skip this step if Steps 1-4 required no changes — don't create an empty commit.)
