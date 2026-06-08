# OpenCode Read-Only Audit — AlphonsoEcosystem

**Audit date:** 2026-06-07  
**Branch:** `main`  
**HEAD:** `405dcca` (`405dccafeaa47a0cec437ca1bd3e0e80c5b46eb9`)  
**Working tree:** clean, 1 untracked dir: `plan/`  
**Remote:** `https://github.com/Thatisshayan/AlphonsoEcosystem.git`

---

## 1. Verification commands (all run, all read-only)

| Command | Result |
|---|---|
| `npm run lint` | clean, 0 errors |
| `npm run test` | **64 test files, 620 tests, all passing** (16.5s) |
| `npm run build` | built in 5.1s, main chunk 364KB / 103KB gzip |
| `npm run verify:ollama` | runtime up, `llama3.2:3b` available, ok=true |

---

## 2. Repo inventory (actual vs ground truth)

| Layer | Ground-truth claim | Actual | Drift? |
|---|---|---|---|
| Services in `src/services/` | 65+ | **94 files** (75 root + 19 in subdirs `agentWorkshop/`, `approval/`, `audit/`, `memory/`, `projectExecution/`, `research/`, `systemHealth/`) | ground truth undercount |
| Test files in `src/test/` | 64 | **64** (plus `setupTests.js`) | match |
| Tests | 620 | **620** | match |
| `.ts` services | 10 | **9** (agentContract, agentPairingConstants, appUpdate, chatPersistence, joseCommandRouter, orchestrationQueue, orchestrationReceipt, policyEnforcement, trustModel) | close (1 short) |
| Components | 47 | **48 files** in `src/components/` | match |
| Scripts | 18 listed | **18 files** in `scripts/` | match |
| GitHub workflows | 2 | 2 (`ci.yml`, `verify-app.yml`) | match |
| Rust `.rs` files | n/a | **12** | n/a |
| `lib.rs` line count | **~7,078** (AGENTS.md + ground truth) | **4,638 lines** | **DRIFT** — already substantially split |
| Total Rust LOC | n/a | 9,000 | n/a |
| 9 agents registered | yes | yes (`alphonso/jose/hector/maria/marcus/miya/echo/sentinel/nova` profiles) | match |
| Connectors policy-gated | 11 | 11 (telegram, whatsapp, youtube, mobile_bridge, chatgpt, claude, qwen, notion, clickup, sd_webui, comfyui, runway) | match |

---

## 3. Existing Notion capability (the PHASE 1 gap)

| Path | Exists? | Notes |
|---|---|---|
| `connectorRegistryService.sendNotionConnectorEntry` | YES | **outbound write only** |
| `src-tauri/src/lib.rs:1324` `connector_send_notion` | YES | single Rust command, no Notion→Alphonso pull |
| `pluginRegistryService.js` notion plugin descriptor | YES | status `not_configured`, trust `placeholder` |
| `marcusPublishService.js` notion channel | YES | outbound publish only |
| `workflowOperationsRegistryService.js` notion requirement | YES | `notion?optional` on some workflows |
| `workflowGovernanceService.js` notion | YES | routing label only |
| **Bi-directional Notion sync service** | **NO** | no pull, no correlation IDs, no sync metadata |
| **Notion `correlation_id` / `notion_page_id`** | **NO** | not stored in durable memory |
| **`scripts/export-ground-truth.mjs`** | **NO** | ground truth is hand-maintained, drift visible |
| **Canonical `events` / `event_dedup` / `scores` / `approvals` / `reports` tables** | partial | `memory_records` + `runtime_ledger` exist; no dedicated `events` / `event_dedup` / canonical event schema with `source`/`last_synced_at`/`last_actor`/`provenance`/`conflict_status`/`approval_status` |
| `task_id` / `project_id` correlation in memory | partial | `project_reference` exists in `MemoryRecord`, no first-class `task_id` |
| Onboarding flow (Ollama → model → connectors) | partial | `OnboardingWizard.jsx` exists; not wired into preflight |
| Weekly report generator | partial | `productionReadinessService.js` has report hooks; no dedicated weekly-report service that auto-saves |
| Branch protection on `main` | NO | matches ground truth gap |
| Updater signing finalization | NO | matches ground truth gap |
| Cloudflare Worker ingress | NO | local desktop only (matches Hermes plan stage 1) |

---

## 4. Strengths (must not duplicate)

The repo already has every foundational layer the plan assumes. **Do not recreate these:**

- **`policyEnforcementService.ts`** — fail-closed gate; every Notion call must go through it
- **`connectorRegistryService.js`** — 11 connectors, all policy-gated; `sendNotionConnectorEntry` is the only legitimate Notion write path
- **`durableMemoryService.js` + `src-tauri/src/memory_store.rs`** — SQLite-backed memory with `MemoryRecord {id, title, content_json, category, source_agent, source, timestamp_ms, confidence, verification_state, project_reference, expires_at, expiry_rule}`; 502 lines, schema v2, WAL mode, 2 unit tests passing
- **`runtimeLedgerService.js`** — scope/id/data/status records; perfect substrate for sync metadata
- **`orchestrationQueueService.ts` + `orchestrationReceiptService.ts`** — durable execution + receipts
- **`approval/approvalService.js`** — approval workflow with receipts
- **`workflowMemoryService.js`** — workflow-bound memory writes via `pushMemoryItem`
- **`workflowRegistryService.js`** — 10+ workflows (Marketing Ops, Social Media, etc.)
- **`workflowOperationsRegistryService.js`** — workflow catalog
- **`agentContractService.ts`** — per-agent allow/block prefixes
- **`marcusPublishService.js`** — approved distribution (Notion is a known platform)
- **`sessionIntelligenceService.js`** — agent activity timeline
- **`connectorHealthCheckService.js`** — 11 connector health probe
- **9 agents** registered with profiles + permissions
- **2 CI workflows** passing
- **`OnboardingWizard.jsx`** + **`OperatorDashboard.jsx`** — UI shells ready
- **9 `.ts` services** — TypeScript foundation present

---

## 5. Real gaps this session must close (priority order)

1. **Notion bi-directional co-source sync** (PHASE 1 — active implementation)
2. **Ground truth auto-save** (PHASE 2) — also fixes the lib.rs line count drift
3. **Ollama preflight + dashboard baseline + canonical event schema** (PHASE 3)
4. **Cloudflare Worker ingress** (P2, deferred)

---

## 6. Risks / blockers for the active task

- **Notion credentials not present** — `NOTION_API_KEY` and `NOTION_PARENT_PAGE_ID` are placeholder values in `.env.example`; the sync service must work fully offline using **durable memory as the canonical store** and treat Notion as a one-way write target until a token is configured.
- **No Notion database id is configured** — Gemini schema requires a database, not a page. Service must support both `parentPageId` (existing) and `parentDatabaseId` (new) modes.
- **No correlation ID infrastructure** — must add without breaking existing `MemoryRecord` schema. Use `content_json` enrichment + `runtime_ledger` scope.
- **`sendNotionConnectorEntry` is the only Notion write path** — must not be bypassed.
- **5 `externalAgentAdapter` returns `not_wired`** — out of scope; do not touch.
- **No destructive ops, no Railway, no paid services** — local-first preserved.

---

## 7. First implementation slice (Notion sync step 1, ≤ small)

> Add `src/services/notionSyncService.js` that defines the bi-directional sync contract:
> - correlation ID types (`notionSyncCorrelation`)
> - sync metadata shape (`source`, `last_synced_at`, `last_actor`, `provenance`, `conflict_status`, `approval_status`)
> - Notion database schema mapping (Gemini shape)
> - pure helpers: `buildCorrelationId`, `parseNotionPageId`, `normalizeNotionPhase`, `normalizeRiskLevel`
> - **no network calls yet**, no UI yet
> - unit tests for all pure helpers in `src/test/notionSyncService.test.js`
> - all writes go through the existing `sendNotionConnectorEntry` once network path is added in commit 2

This is small, testable, doesn't touch Rust, doesn't break existing flows.

---

**End of OpenCode audit. Awaiting Cline/Kanban audit.**
