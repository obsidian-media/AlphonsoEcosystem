# TapCash — Managed Project Record

**Owner:** Shayan
**Primary operator lane:** Alphonso
**Runtime workers:** OpenCode (Alphonso), Ollama fallback
**Orchestrator:** Jose
**Risk classification:** revenue/payments-adjacent; approval-gated for publish/deploy/send/spend

## Repositories

- **Source of truth:** `C:\Users\Shaya\OneDrive\Desktop\STARTUP\TAP CASH` (`master`)
- **Active worktree:** `C:\Users\Shaya\OneDrive\Desktop\tapcash_work` (`main`)
- **UI/UX assets:** `C:\Users\Shaya\OneDrive\Desktop\STARTUP\TAP CASH\tapcash-ui-ux-front-end\tapcash-model-u`
- **Remote:** `https://github.com/Thatisshayan/Tapcash`
  - `main` = production-recommended branch
  - `master` = legacy/local-first div branch with unrelated history

## Production

- `https://tapcash.online` (Vercel)
- `https://tapcash.app` (Vercel/Railway)
- Current manifest: `tapcash_work/TAPCASH_STATUS.json` (v1.1.0)

## Current State

- `tapcash_work/main` is clean ahead of `origin/main` by `next-env.d.ts` paths update only.
- `STARTUP/TAP CASH/master` is dirty; contains MVP mobile + UI/UX assets not yet reviewed for upstream merge.
- `tapcash_mvp/` inside `STARTUP/TAP CASH` holds the latest API routes, middleware, and Expo mobile implementation.

## Boardroom Routing

- Jose intakes TapCash work.
- Alphonso executes verifications, git operations, and infrastructure tasks.
- Nova owns UI/UX integration scoring for `tapcash-model-u`.
- Maria owns risk review for payments/auth/fraud flows.
- Marcus is allowed to publish only after Maria approves deploy artifacts.
- Miya may export media/marketing only after Shayan approves the brief.

## Guardrails

- No unbounded pushes to `master`.
- Merge to `main` requires green test/build (`npm test`, `npm run build`).
- Secrets/credentials stay out of summaries and handoffs.
- Payments/auth/fraud path changes require Maria review before merge.
