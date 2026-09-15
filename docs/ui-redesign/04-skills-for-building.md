# Skills to Use While Building This, Page by Page

Checked the real stack first rather than guessing: `package.json` confirms **Tailwind CSS v3.4** (not v4 — so v4-specific skills don't apply), **Framer Motion 12**, **lucide-react** icons. Recommendations below are matched to what's actually installed.

## Core, use on every page

- **`ultimate-frontend-design`** — the broadest frontend design skill available (color theory, typography, Tailwind mastery, Framer Motion, performance, accessibility). Use as the default when starting any individual page's implementation in Phase 2+.
- **`tailwind-design-system`** — for turning Draft A's tokens (the blue-dust light/dark tint, the wash gradients, the underline-tab nav) into an actual reusable Tailwind config/design-token layer, rather than one-off inline styles per page.
- **`ui-animation`** — directly relevant to the "breathing glow" live-status animation locked into Draft A, and to any further motion work (spring easing, gesture, reveal animations).
- **`framer-motion-animator`** — since Framer Motion is already an installed dependency, use this (not raw CSS keyframes) once we're in real implementation, so animations are consistent, interruptible, and use the library already in the codebase instead of introducing a second animation approach.
- **`web-design-guidelines`** — general web design principles check, good as a sanity pass on any new page before calling it done.

## Quality gates — use before calling any page "done"

- **`accessibility`** and **`accessibility-compliance`** (WCAG 2.2) — genuinely important here: this app gates real actions behind approval flows (financial/publish/release actions), and Draft A's color-only status system (green/amber/red) needs an accessible fallback (icon/text, not color alone) for colorblind users — flag this now as a real requirement, not an afterthought.
- **`ui-ux-design-audit`** — a structured audit pass per page once built, before considering a page redesign complete.
- **`webapp-testing`** — Playwright-based; use to actually click through each redesigned page in a real running browser and verify it works, not just that it compiles. The existing `npm run test:e2e` Playwright suite in this repo is the natural place these checks plug into.

## Process skills (already governing this session, keep using them)

- **`brainstorming`** — already in use for this whole discovery phase; needs to run again, from scratch, for the normal-user design track (not started yet).
- **`writing-plans`** — the mandatory next step after a spec is approved, before any page's implementation begins (per the brainstorming skill's own hard gate — do not skip straight to code).
- **`test-driven-development`** — for any new backing logic a page redesign needs (e.g. if the "unified needs-your-attention aggregation" gap gets built, that's real logic, not just markup, and should be TDD'd).
- **`using-git-worktrees`** — already in use (this discovery work lives in `AlphonsoEcosystem-ui-redesign`); keep using isolated worktrees per page or per batch of pages during Phase 2+, especially since another session is concurrently active in the main checkout.
- **`code-review`** / **`simplify`** — run per page or per small batch of pages once implemented, not saved up for one giant end-of-project review.

## Explicitly not recommended

- Anything **v4/shadcn-specific** (`tailwind-v4-shadcn`) — this repo is on Tailwind v3.4, and a v4 migration is a separate, much bigger decision the user hasn't asked for. Don't quietly pull in v4 patterns.
- **`react-native-best-practices`** — this is a Tauri desktop app (React + Rust), not React Native; not applicable.
- Any of the `gstack` design skills (`design-consultation`, `design-review`, `design-shotgun`, `design-html`) — these appear to be a separate third-party skill suite with their own workflow assumptions; worth a deliberate look later if the built-in skills above prove insufficient, but not reached for by default alongside the primary skill set above, to avoid mixing two different design-workflow conventions mid-project.
