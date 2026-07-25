# AlphonsoEcosystem — REPO_DIRECTIVE

> Goal-layer constitution. `REPO_RULES.md` is the law; this is the mission. Every task
> MUST carry `traces-to:`. Orphan tasks rejected by CI (scripts/verify.sh → directive-lint) + Sentinel.

## Vision

AlphonsoEcosystem is the umbrella product/brand ecosystem (Obsidian media + Tauri2/Ollama
local AI). North-star: a cohesive set of local-first AI tools under one brand, sharing
conventions, with Ollama as the default inference engine. (Vision DRAFT — confirm exact
product boundary; the ecosystem spans several repos.)

## Non-Goals

- NOT a cloud-only product; local-first (Ollama) is the default.
- NOT fragmenting brand identity across repos without a shared kit.
- NOT committing model weights or credentials.

## Phases

### P1 — Ecosystem Audit (CURRENT)
  exit criteria: each sub-project's purpose documented; shared conventions enforced.
### P2 — Shared Kit
  exit criteria: common UI/brand/conventions reused across sub-projects.
### P3 — Ollama-First
  exit criteria: Ollama is the default inference path everywhere.

## Sprints

### S1 (maps to P1) — document the ecosystem
  goal: each component's role clear; cross-repo map.
### S2 (maps to P2) — conventions
  goal: shared kit extracted.

## Epics / Chapters

### E1 — Cohesion (maps to P1/P2)
  shared brand + conventions.
### E2 — Local AI (maps to P3)
  Ollama-first inference.
### E3 — Integrity (maps to P1)
  build/test/secret hygiene per sub-project.

## Tasks

- [ ] T1 — Map sub-projects + their roles (DRAFT; ? on unclear ones) | traces-to: P1/S1/E1 | acceptance: doc lists each component + owner + purpose
- [ ] T2 — Ensure every sub-project has REPO_RULES + verify.sh green | traces-to: P1/S1/E3 | acceptance: governance present + passing
- [ ] T3 — Extract shared brand/convention kit | traces-to: P2/S2/E1 | acceptance: N duplicated conventions consolidated
- [ ] T4 — Verify Ollama is default inference in each AI sub-project | traces-to: P3/S2/E2 | acceptance: no sub-project requires cloud by default
- [ ] T5 — Confirm no credentials/weights committed across ecosystem | traces-to: P1/S1/E3 | acceptance: secret-scan clean portfolio-wide

## Sentinel Constraints

- auto-approve: docs/conventions/tests tracing to P1/E3.
- review-required: shared kit, inference config, any external API, secrets.
- locked: `main`; credentials/weights never; ecosystem scope needs Shayan.
