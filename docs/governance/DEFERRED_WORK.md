# Deferred Work Register

Rule 12 / Rule 11. This register survives the session. Future agents resume from here.

## Format
- `[DATE] <scope>: <what> — <why deferred> — <resume hint> — <status>`

## Items
- [2026-07-24] docs/AGENTS.md content-loss regression: the governance bootstrap (commit 46a1eb0) overwrote AGENTS.md's real architecture/version/test-count content with a 14-line governance-pointer stub, silently breaking 9/12 `verify-doc-counts.mjs` checks (a required CI check). Restored + fixed same session (commit 0923c90) — recorded here per R11 for visibility, not because it's still open. Resume hint: none needed, closed.
- [2026-07-24] Production-readiness T19 (auto-generate "Do Not Duplicate" map): only the numeric doc-drift half was closed this pass (AGENTS.md/README.md counts fixed, verify-doc-counts.mjs green). Full auto-generation of the ~230-row Do Not Duplicate table from the source tree (replacing hand-typed prose descriptions in CLAUDE.md) was not attempted — it needs a semantic description per service/component that isn't derivable from file structure alone. Resume hint: consider a hybrid — auto-generate the file-path column, keep descriptions hand-maintained, and add a CI check that flags any service/component file with no corresponding table row. Status: partial, open.
