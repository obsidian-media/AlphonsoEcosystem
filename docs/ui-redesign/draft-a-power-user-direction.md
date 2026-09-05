# Draft A — Power-User Visual Direction

Status: **Draft, in progress, skeleton superseded once (see Revision 2 below).** Captured from live brainstorming with real mockups in the visual companion browser tool, iterated across ~15+ rounds total, including two full structural rejections and one course-correction anchored to real reference apps.

## Revision history (do not silently discard — later rounds found real problems in earlier ones)

1. **Original skeleton (below, superseded):** top nav bar with curated tabs + command palette for everything else. Tested against real page structure (Home/Work/Agents/System groups pulled from the actual `Sidebar.tsx`) with a dropdown-per-group mega-menu. **Rejected outright** — not a details problem, the user rejected the grouping, the dropdown mechanic, AND called it "still a generic SaaS nav bar" regardless of specifics.
2. **Zero-chrome/search-first attempt:** dropped all persistent nav, home screen doubles as navigation via clickable content blocks, Ctrl+P for everything else. **Also rejected outright** — too sparse/empty, search-as-primary-nav was the wrong idea, and the home-feed-as-nav concept itself didn't land.
3. **Anchored to real reference apps** (user named these directly, not guessed): **Arc browser's sidebar** (personalized, collapsible, icon/favicon-driven, "Spaces" that tint the app per context), **Notion's sidebar** (a page tree the user owns, icons per item, huge whitespace), **Superhuman** (command-palette/keyboard speed layered ON TOP of real persistent structure, not instead of it). Synthesis confirmed correct by the user before building: bring back a sidebar, but make it Arc/Notion-style — portraits instead of text labels, collapsible, organized into a small number of "Spaces" that each tint the whole app when active, plus Ctrl+P for speed.
4. **Current skeleton (Revision 2, "Rooms"):** see below — this is what's actually locked-in-progress now.

## Skeleton (structure) — Revision 2, "Rooms" concept

- **Real sidebar, Arc/Notion-style** — not a flat gray list of text nav links. ~216px wide, collapsible to icon-only. Top of sidebar: search field bound to the app's real existing `Ctrl+P` shortcut (do NOT introduce a new `Ctrl+K` — collides with `toggle_search` in `useKeyboardShortcuts.js`).
- **4 "Space" pills** at the top of the sidebar, mapped to the app's real existing nav groups (confirmed from `Sidebar.tsx`): **Home** (Dashboard, Chat), **Research** (Hector's Research Desk, Reports, Bookmarks), **Boardroom** (chat threads), **System** (Orchestrator, Connectors, Agent Performance, Runtimes, Voice, Operator).
- **Switching Space genuinely changes the room's mood** — not a faint tint, a real distinct atmosphere per space:
  - **Home:** calm, light blue-dust neutral (the original Draft A tint decision, preserved here)
  - **Research:** warm parchment/library — serif display headlines (Fraunces), citation-card content style with source/confidence metadata, evokes "library" the way Hector's own portrait does (surrounded by books)
  - **Boardroom:** deep plum/violet, conversational, softer
  - **System:** this is where the earlier-descoped **"Live Ops Wall" language actually belongs** — color-accent left-border rules, monospace numbering, dense — validated as correct once given a real, scoped home rather than being the app-wide theme
- Sidebar items use **agent portraits or icons, never plain text-only rows** — e.g. "Research Desk" shows Hector's portrait, "#launch-planning" thread shows Jose's (he routes it).
- Sidebar polish details that were explicitly missing in the first pass and added in the fix: a colored accent bar next to the active item (color-matched to the current room), small live-status dots on agent portraits, a visible collapse control, real padding/spacing rhythm instead of cramped default spacing.
- Command palette (Ctrl+P) still reaches the ~20 secondary pages not directly in a Space's sidebar list (Agent Pairing, Ecosystem Hub, etc.) — this part of the original reasoning survived the rejection of the top-nav skeleton.
- Top nav right cluster concept (search trigger, notification bell with real approval-count badge, theme toggle, avatar menu) — **not yet re-validated against the new sidebar skeleton**, was designed against the rejected top-nav version. Needs a fresh pass to confirm it still makes sense once the sidebar itself carries search.

## What's explicitly rejected (persists across revisions)

- No cards, no box-shadows, no hard borders/edges anywhere in the base theme.
- No solid-black pill-tab nav / no top-nav-with-dropdowns (see Revision History #1 — this whole family of "nav bar" pattern was rejected, not just styled wrong).
- No search-only/zero-persistent-chrome approach either (Revision History #2) — real structure is wanted, just not a flat generic one.

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

## RightPanel decision (real 3rd region, previously omitted from every mockup)

**Real gap found:** every Rooms mockup up to this point only accounted for sidebar + main content — two regions. The actual current app has a **third persistent region**, `RightPanel.tsx`, always visible with real live props (Ollama connection state, installed model list with sizes, desktop bridge status, security scan/threat level, audit log, agent status strip) across its own System/Audit/Agents tabs. This was found only because the user pushed back and asked whether mockups were illustrative or final — a real process lesson: check the actual running layout's full real surface area before calling any skeleton locked.

**Decision:** fold `RightPanel`'s always-open panel into the System room (no permanent 3rd panel pinned open at all times) — **but** preserve ambient safety awareness with a small number of persistent status indicators (e.g. a connection dot, a security dot) living in the sidebar's bottom/collapse area, visible from every room. Rationale: this is a control-plane app with approval gates and live security scanning — losing all ambient "is anything wrong right now" visibility in exchange for a cleaner layout would be a real functional regression, not just a look. The compromise keeps the visual cleanliness of removing the panel while keeping a real problem (Ollama disconnected, security threat found) glanceable from any room, not just System.

## Explicitly open / unresolved

- Normal-user (non-power-user) design direction — not started yet.
- Top-right utility cluster (search/bell/theme/avatar) needs re-validation now that the sidebar itself carries search — likely redundant or needs a different role once the sidebar owns navigation.
- Whether all 4 "Rooms" (Home/Research/Boardroom/System) hold up against every real page in each group, not just the one representative page mocked per room — Research so far only shown against the Research Desk itself, not Reports/Bookmarks; System only shown against Orchestrator, not Connectors/Agent Performance/Runtimes/Voice/Operator.
- Whether "Work" (Projects/Content/Automation — currently absent from the 4-Space list) needs its own Space, or folds into one of the existing 4 — not yet decided; the 4 Spaces mocked so far map to Home/Agents(partially)/System from the real sidebar groups, but "Work" wasn't represented at all.
- Real agent portrait crop/production pipeline (see above).
- Real connector brand SVG sourcing (licensing/attribution check not yet done).
- Desktop-specific constraints noted earlier (resizable-window collapse behavior, Coach Mode's separate webview window) still apply and haven't been re-checked against the new sidebar skeleton specifically.
