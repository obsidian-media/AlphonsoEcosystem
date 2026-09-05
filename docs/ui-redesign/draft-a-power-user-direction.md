# Draft A — Power-User Visual Direction

Status: **Draft, locked as a finalist** (not yet spec'd into Phase 1). Captured from live brainstorming with real mockups in the visual companion browser tool, iterated across ~10 rounds.

## Skeleton (structure)

- No sidebar. Top nav bar instead: brand mark (left) + curated primary tabs (center, ~5-6 max) + utility cluster (right).
- Everything beyond the curated top tabs (Agent Pairing, Ecosystem Hub, Operator Dashboard, etc. — the ~20 buried/secondary destinations) is reached through **one unified command palette**, bound to the app's existing `Ctrl+P` shortcut (do NOT introduce a new `Ctrl+K` — collides with the real `toggle_search` binding already in `useKeyboardShortcuts.js`). This directly answers the ground-truth doc's documented complaint that Agent Pairing/Ecosystem Maturity are "2+ clicks deep, undiscoverable."
- Top nav right cluster: search/palette trigger with visible shortcut hint, notification bell **with a real approval-count badge** (highest-priority glanceable element in a control-plane app), light/dark toggle, user/agent avatar menu.
- Below the top nav: an optional horizontal agent-status strip (avatar row, active agents visually distinguished from idle) — validated as a real live-status device, not just decoration.
- Content areas use **section "zones"**, not cards: soft color-graded gradient washes (e.g. warm amber wash for "needs approval," cool blue wash for "connectors") separate regions instead of bordered/shadowed boxes.

## What's explicitly rejected

- No cards, no box-shadows, no hard borders/edges anywhere in the base theme.
- No vertical sidebar-with-rows skeleton (the default every dashboard defaults to — explicitly called out as "template-like").
- No solid-black pill-tab nav (still too close to current Linear/Notion-generation SaaS convention) — underline-style active tab used instead.

## Color / theme

- **Light mode:** visible ("dust of blue," but the more saturated of the two tested options — not barely-there) blue-tinted neutral base.
- **Dark mode:** near-neutral with only a whisper of blue tint — much more restrained than light mode.
- Rationale (mine, given as real design reasoning not just preference-taking): light backgrounds have headroom before added color reads as loud, since the base carries little visual weight. Dark backgrounds already carry weight, so the same saturation reads far more intense and starts fighting status colors (green=live, amber=review, red=error). Matches how Linear itself treats marketing surfaces (bold/colorful) vs. actual dark product UI (near-neutral, hairline-restrained).
- Status colors reserved for meaning only: green = live/active, amber = needs review, red = error/off. Do not reuse these hues decoratively elsewhere.

## Typography

- Base: Inter (already used across the app).
- One deliberate display-type accent for major headlines only (tested with Fraunces, a serif) — a signature detail, not applied everywhere.

## Assets (real, not placeholder)

- **Agent portraits are real and already exist** — 9 illustrated character portraits (llama/alpaca mascot style), one per agent, supplied by the user. Distinctive per-agent personality already baked into the art (e.g. Hector surrounded by books/library, Miya with neon social-media icon overlays, Alphonso in a regal robe with city bokeh).
  - Production note: these are dense, cinematic compositions. At small UI sizes (24–40px nav avatars) detail and dark backgrounds will turn to mush —**need a tighter face-crop treatment for small instances**, keep the full illustration for larger surfaces (agent profile panels, onboarding, "about this agent" screens). Real production work, not yet done — thumbnails used in mockups so far are simple center-crops, not deliberately face-cropped.
  - Source files staged during this session: `.superpowers/brainstorm/20298-1788580260/content/{alphonso,jose,hector,miya,maria,marcus,echo,sentinel,nova}.jpg` (120x120 center-crop, ffmpeg-resized from originals) — originals are 4-6MB HD renders, need a real asset pipeline decision (where do full + cropped variants live long-term, e.g. `src/assets/agents/`) before Phase 1 implementation.
  - **Agent avatar system reality check:** `agentAvatarService.ts` currently has NO default portraits at all — only a user-upload-your-own-custom-image mechanism (`processAvatarFile`, resizes to ≤256px, stores as a JPEG data URL in localStorage per agent). Wiring these real portraits in as the actual shipped defaults (not user-uploaded customizations) is real net-new integration work for Phase 1/2, not just a data-wiring task.
- **Connector logos:** real brand marks (Telegram, GitHub, etc.) belong beside each connector name — not initials. Mockups so far used hand-approximated shapes standing in for the real thing; actual implementation should pull official brand SVGs (e.g. from Simple Icons or each platform's own brand kit), not the approximated paths sketched during brainstorming.

## Scope boundary: "Live Ops Wall" is NOT part of this base theme

An earlier direction — color-coded left accent border rules per row, big monospace stat numbers, inline sparkline pulses, asymmetric multi-column grid — was explicitly **descoped from the main/home theme** by the user ("may be good on one or 2 pages... not on main page and home page and not as the theme"). Retained as a candidate treatment for specific dense operational screens only: Orchestrator Queue, Activity Log, Connector Health, Agent Performance. Needs its own follow-up decision in Phase 1/2 about exactly which screens get it, rather than assumed universal.

## Motion (not yet in mockups except one test)

- Active agents in the status strip get a soft "breathing" radial glow animation (color-matched to the agent), 2.4s ease-in-out loop — validated as the single highest-impact "this is a live system" cue tested so far, more effective than any further static-layout polish.

## Desktop-app-specific constraints (checked against real config, not assumed)

- `tauri.conf.json`: `"decorations": true` — native OS title bar/traffic-lights/drag-region already exists. No custom window chrome needed.
- `"resizable": true` — top nav must have a real collapse-to-overflow behavior for narrow window widths; the 5-6-tab mockups assumed a comfortable fixed width and have NOT been tested against a narrow resize yet.
- Coach Mode opens as a **separate Tauri webview window** (`coachModeService.ts`, `new WebviewWindow('coach', ...)`) — whatever design system Phase 1 specs must explicitly extend to that second window, or it will visually clash with the main window. Not yet designed against in this draft.

## Explicitly open / unresolved

- Normal-user (non-power-user) design direction — not started yet.
- Whether "Studio" (this direction's working name) needs further validation against more page types beyond Mission Control / Connectors / Boardroom Chat (only 3 tested).
- Exact top-nav primary tab list (mockups used an illustrative "Home, Chat, Boardroom, Automation, Connectors, Settings" — not yet checked against the real, full page inventory).
- Real agent portrait crop/production pipeline (see above).
- Real connector brand SVG sourcing (licensing/attribution check not yet done).
