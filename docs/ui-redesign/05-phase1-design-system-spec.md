# Phase 1 — Shared Design System Spec

Formalizes everything locked in Draft A (power-user) and Draft B (normal-user) into concrete, buildable tokens and primitives. This is the foundation Phase 2's page-by-page work builds on. Expect edits as Phase 2 surfaces real constraints — this is a living spec, not frozen on approval.

---

## 1. Two separate visual systems, one shared foundation

Draft A (power-user) and Draft B (normal-user) are genuinely different experiences, not one theme with a density toggle. They share:
- The same underlying stack: Tailwind v3.4, Framer Motion 12, lucide-react (confirmed via `package.json`)
- The same "no cards, no hard edges, no box-shadow" base rule
- The same real agent portrait assets and real connector brand logos
- The same accessibility floor (see §7)

Routing between them: existing `useUxMode.ts` (`UxMode = 'simple' | 'advanced'`, persisted `alphonso_ux_mode`) is the natural switch point — **but today it only hides nav items, doesn't swap visual systems.** Phase 1 needs a decision (flagged open in Draft B) on whether flipping this toggle swaps the entire shell (PowerUserShell ↔ NormalUserShell) or something narrower. Recommend: it should swap the whole shell — a half-measure (dense layout with warm colors, or chat-first with hairline dividers) satisfies neither audience. This is a real architecture decision for whoever implements Phase 2, not resolved further here.

---

## 2. Design tokens

### 2.1 Power-user (Draft A) — per-room color tokens

| Room | Light base | Notes |
|---|---|---|
| Home | `#fafbfc` bg / `#f3f6fa` sidebar — barely-there blue dust | Calm hub |
| Work | `#f4faf5` bg / `#eef6f0` sidebar — sage green | Productive/creative work |
| Research | `#fbf3e4` bg / `#f6ead2` sidebar — warm parchment/amber | Library mood, pairs with Fraunces serif headers |
| Boardroom | `#221527` bg / `#1a0f1f` sidebar — deep plum (dark by nature, not a light/dark pair) | Conversational |
| System | `#08090b` bg / `#0d0e11` sidebar — near-black (dark by nature) | Dense ops, "Live Ops Wall" language lives here specifically |

Dark-mode variant for Home/Work/Research (System and Boardroom are already dark-native) not yet mocked — **open item for Phase 2**, only light-mode versions of Home/Work/Research were built during brainstorming.

Status colors (fixed meaning, reserved, do not reuse decoratively): live/active = `#3ecf8e` / `#50d296`, needs-review = `#e0a030` / `#f0a860`, error/off = `#e04b4b`. Consistent across every room.

Accent-per-room "active nav item" indicator color: Home `#3b5bdb`, Work `#3a9a4a`, Research `#a97c1f`, Boardroom `#c9a8d8`, System `#50d296`.

Typography: Inter (body/UI everywhere), Fraunces 600/700 (serif, headline/greeting accent only — used in Home's "Good morning" and Research's page titles, not applied universally). IBM Plex Mono for System room's numeric/status content specifically.

Radius: 0 as the base assumption for structural elements (dividers, section boundaries). Soft-rounded zones (wash backgrounds) use ~16-22px radius — these are backgrounds, not bordered/shadowed containers, so they don't violate the "no cards" rule. Pills (nav space-selector, status badges, search field) use full `9999px` radius.

### 2.2 Normal-user (Draft B) — tokens

- Background: layered blurred organic color blobs (peach `#ffd3a8`, pink `#f3b8d8`, lavender `#c3d0f7`), 40px blur, ~50-55% opacity, positioned off-canvas-edge. Base canvas color `#fdf6f0`.
- Bubbles: mine = solid `#3a2a4a` / white text; theirs = `rgba(255,255,255,.85)` / `#3a2a4a` text, both with a tailed corner (5-6px radius on the "pointing" corner, 18-20px elsewhere).
- Typography: Inter body, Fraunces for the active agent's name/greeting only.
- Per-agent blob palette shift when an agent's shortcut is active — **not yet designed**, only the default/Alphonso palette exists (open item carried from Draft B).

### 2.3 Motion

- **Breathing glow** (power-user, active agent avatars in Home room / any agent-status strip): radial glow, color-matched to agent, 2.4s ease-in-out infinite, scale 0.9↔1.15, opacity .35↔.9. Validated as the single highest-impact "this is live" cue tested — implement via Framer Motion, not raw CSS keyframes (per the skills doc's recommendation to use the already-installed library consistently).
- **Typing indicator** (normal-user): 3 dots, 1.2s infinite ease-in-out, staggered .15s delay each, translateY(-4px) bounce + opacity .5↔1.

---

## 2.4 Multi-theme: accent hue is a separate token layer from status hue

Both user tracks get a selectable accent theme, independent of light/dark mode: **Blue, Green, Purple**, each with a light and dark variant — 6 combinations total (Blue-light/dark, Green-light/dark, Purple-light/dark), available to both power-user and normal-user tracks.

**Real conflict this creates, resolved here rather than left implicit:** status colors (`live` = green `#3ecf8e`/`#50d296`, `needs-review` = amber, `error/off` = red) are semantic and fixed — they mean the same thing regardless of which accent theme is active. If a user picks the Green accent theme, their brand color and the "this connector is live" signal would collide if they shared one token. **Fix: accent hue and status hue are two independent token layers, never merged.** Accent theme only touches non-semantic UI — active-nav indicators, primary buttons/links, the per-room "active" pill highlight, avatar ring colors. It never touches a status dot, a live/review/error badge, or anything whose color currently carries meaning about system state. When Green accent is active, status-green and accent-green will look similar — mitigate with a distinct saturation/lightness offset between the two (status green stays exactly as specified above; accent green is a different, clearly distinguishable shade), not by changing what status green means.

Room-mood colors (Draft A's Research=amber, Work=sage, Boardroom=plum) are a third, separate layer from both accent and status — they don't change when the user picks a different accent theme. Whether room-mood colors should also respect a user's accent choice (e.g. a Purple-accent user gets a slightly purple-shifted Research room) is an open item, not decided here — default assumption is rooms stay as designed regardless of accent theme, to avoid five-way color conflicts across three independent token layers.

## 3. Component primitives — what to build/extend

Existing shared kit: `src/components/ui/` (`Badge`, `Button`, `Card`, `EmptyState`, `Input`, `LoadingState`, `Modal`, `ProgressRing`, `Skeleton`, `StatusDot`, `Tabs`), re-exported from `index.ts`. Per repo convention, extend this barrel, don't create a second one.

**Real conflict to resolve in Phase 2, flagging now rather than silently deciding:** `ui/Card.tsx` exists and is presumably used across the app today — but "no cards" is a hard rule for both new visual systems. Recommend introducing a new `ui/Zone.tsx` (soft-rounded wash background, no border/shadow, takes a `mood` prop for the per-room/per-context color wash) as the actual replacement primitive for page sections, and auditing real `Card.tsx` call sites during Phase 2 to decide case-by-case whether each becomes a `Zone`, a plain divided list row, or something else — not a blanket find-replace.

New primitives needed:
- `AgentAvatar` extension — needs a "small nav crop" vs "full illustration" variant (per the production-pipeline gap noted in Draft A), a status-dot overlay, and (for Draft B) an active/dimmed state.
- `RoomShell` (power-user) — sidebar + Space-pill switcher + main content region, owns the per-room mood token application.
- `AgentShortcutRow` (normal-user) — the scrollable avatar row with skill-tag badges and tap-to-focus behavior.
- `StatusDot` may already cover the "ambient status dot" need from the RightPanel decision (§ Draft A) — check before building a new one.

---

## 4. Real IA fixes to bundle into Phase 2, not deferred further

These were found during Phase 0 discovery and are cheap to fix while already touching the relevant pages:
1. **Bug Log #1** — "Agent Performance" sidebar item is a dead link (no `App.tsx` render branch). Fix by wiring it in (it maps naturally to the System room) or deliberately removing the nav entry — needs a decision, not just a guess, from whoever picks up Phase 2.
2. **Boardroom naming collision** — `BoardroomChatView.tsx` (real chat, → Boardroom room) vs. `BoardroomPanel.tsx` (goal/batch tracker) share a name. Rename one before/while redesigning either.
3. **Orchestrator's internal duplication** — two panels showing the same dead-letter-queue data on different refresh cadences. Worth resolving while rebuilding this page for the System room anyway.

---

## 5. Asset production requirements (real work, not just wiring)

- **Agent portraits:** 9 real illustrations exist (supplied by user, staged this session). Need: a face-cropped small variant per agent (for 24-40px nav instances) distinct from the full illustration (already confirmed the full versions turn to mush at small sizes). Needs an actual asset pipeline location decision (e.g. `src/assets/agents/{id}/{full,small}.jpg`) — not decided yet, only ad hoc `.superpowers/brainstorm/` staging files exist right now.
- **Connector brand logos:** need real official SVGs (Telegram, GitHub, Slack, Discord, etc.), sourced from each platform's brand kit or a reputable aggregator (Simple Icons suggested in the inspiration doc) — every logo shown during brainstorming was a hand-approximated placeholder, not licensed/accurate.

---

## 6. Desktop-specific requirements (checked against real `tauri.conf.json`, not assumed)

- `resizable: true` — the power-user sidebar and Space-pill row need a real defined behavior at narrow window widths (not yet designed — collapse to icon-only was proposed in Draft A discussion but never actually mocked at a narrow width).
- Coach Mode opens as a **separate Tauri webview window** — whatever theming Phase 1 locks must be explicitly extended to that window's own markup, or it'll visually clash. Not yet designed against.
- `decorations: true` — native OS title bar already handles window chrome/drag region, no custom implementation needed.

---

## 7. Accessibility floor (flagged in the skills doc, restated here as a spec requirement)

Both systems use color to carry real meaning (status dots, badges, mood washes). WCAG 2.2 requires this not be color-only — every status indicator needs a paired icon or text label, not color alone, so colorblind users aren't excluded from approval-gate information. This applies to the ambient status dots (§ Draft A RightPanel decision) especially, since those are deliberately small.

---

## 8. Decisions from self-critique (user agreed with all except keeping 2 systems, which stays as-is)

- **"Days together" streak — cut from default scope.** Borrowed uncritically from Duolingo without a real justification for a productivity/control-plane tool; gamifying engagement here risks reading as manipulative rather than charming, especially once real approvals/security actions are involved. **Removed from Phase 1/2 scope** unless a real product reason for it surfaces later — don't build it by default.
- **Mascot tone vs. governance seriousness — required Phase 2 validation, with a proposed hedge.** Cute agent portraits are charming for Hector's research or Miya's creative work, but may undercut the seriousness of Maria's risk audits or Sentinel's security scans. Proposed hedge to test in Phase 2: governance-heavy agents (Maria, Sentinel, Marcus) get a slightly more composed/serious crop or framing of their existing portrait for high-stakes moments (an actual approval dialog), while the full charming illustration stays for low-stakes contexts (chat, the agent-shortcut row). Not designed yet — flagged as a required test, not assumed resolved.
- **5-room coherence — required Phase 2 pressure-test, with a mitigation.** Distinct per-room moods risk reading as five stitched-together apps rather than one product. Mitigation to carry into Phase 2: keep a consistent "spine" across all 5 rooms regardless of color — same typography scale/weights, same spacing rhythm, same motion language (the breathing-glow timing, transition easing) — so rooms differ in color mood but feel structurally like one app. Explicitly test this by moving between rooms in a real build, not just static per-room screenshots (which is all that's been validated so far).
- **Zone/wash scaling — required stress-test, not assumed to hold.** Only validated at illustrative scale (2-3 sections). Required Phase 2 stress-test cases: the real Connectors page (25 connectors) and System room's five real sub-pages. If washes become visually noisy past a handful of sections, the fallback is plain hairline-divided rows for high-density lists, reserving washes for genuinely small groupings (2-4 sections) only.
- **Empty / loading / error states — added as a real Phase 1 deliverable, not deferred.** Every mockup so far showed only the happy path. Concrete direction now specified: `EmptyState` uses the current room's mood wash + a friendly icon/illustration slot (no jargon copy); `Skeleton`/`LoadingState` use a subtle pulse animation, never a hard-edged gray box (would violate the no-cards rule); error states pair the status-red color with an icon and plain-language text per the §7 accessibility requirement (never color alone). These need real mockups in Phase 2 before any page is called done — a page redesign that only shows its happy-path state isn't complete.

## Open items carried forward (not resolved by this spec, for Phase 2 to pick up)

- Dark-mode tokens for Work/Research/normal-user tracks (only light-mode versions were mocked).
- Per-agent blob palette shift in Draft B.
- The `useUxMode` shell-swap architecture decision (§1).
- Onboarding/discoverability for the avatar-shortcut mechanic in Draft B.
- `ui/Card.tsx` audit — which real call sites become `Zone`, which become something else.
- Narrow-window collapse behavior for the power-user sidebar.
- Coach Mode's second-window theming.
