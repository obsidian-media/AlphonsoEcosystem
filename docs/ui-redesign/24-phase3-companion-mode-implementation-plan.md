# Phase 3 — Companion Mode (Draft B) Implementation Plan

Status: **Approved to build.** User confirmed Phase 3 = building `draft-b-normal-user-direction.md`'s locked skeleton, and confirmed the integration decision below via explicit choice (not assumed).

## Integration decision (locked)

Draft B **replaces** what the existing `Simple` value of `useUxMode.ts` does. Today, picking "Simple" in the `ModeToggle` just filters `Sidebar.tsx`'s nav items (`SIMPLE_MODE_ITEMS`) while keeping the exact same power-user shell (`Sidebar` + `TopBar` + `main` + `RightPanel`). After this phase, picking "Simple" instead renders a **whole different screen** — no sidebar, no right panel, no top bar as it exists today — matching Draft B's "the whole screen is a conversation" concept.

`App.tsx`'s render tree gets one new top-level branch:

```tsx
{uxMode === 'simple' ? (
  <CompanionMode ... />
) : (
  /* existing Sidebar + TopBar + main + RightPanel tree, unchanged */
)}
```

`SIMPLE_MODE_ITEMS`/the nav-filtering behavior in `Sidebar.tsx` becomes dead code once this ships (nothing renders `Sidebar` at all when `uxMode === 'simple'` anymore) — flagged for cleanup in a later pass, not removed in this one to keep the diff reviewable in case the integration decision needs to be revisited.

## Scope for this pass (MVP) — what gets built

One new page: the Companion Mode home/chat screen, per the draft's "Skeleton" section:

1. **Minimal top strip** — hamburger/menu icon (left), app name (center), settings icon (right).
   - Menu icon opens a small drawer with: the existing `ModeToggle` (so a Companion Mode user can get back to Advanced — the draft doc's own open item #6 about "graduating" to power-user mode, resolved pragmatically as "always available, one tap away" rather than a guided flow), and a link into the real `SettingsView.tsx`.
   - Settings icon is a shortcut to the same drawer's Settings link. (Two ways to reach one destination, both cheap — no separate settings screen designed for this mode; see Non-goals.)
2. **Agent shortcut row** — horizontal-scroll row of all 9 real agents from `agentRegistry.js`'s `CORE_AGENT_REGISTRY`, each rendered via the existing `AgentAvatar.tsx` (no new avatar system). Small skill-tag emoji badge per agent, using the exact emoji set the draft doc already specifies. Inactive agents dim/recede when one is active.
3. **Active agent header** — name (Fraunces) + a short greeting line. Greetings are new, hand-written per agent (not fabricated from thin air — grounded in each profile's real `purpose`/`personality` fields), added as a small local `COMPANION_GREETINGS` map in the new component, not a change to the agent profile files themselves (keeps this UI-only, no backend churn).
4. **Chat area** — tailed bubbles (mine = solid dark, theirs = soft translucent), each incoming message shows the responding agent's mini avatar. Real animated 3-dot typing indicator while a response is pending.
5. **Quick-start chip row** — shown once, right after switching agents. Miya's chips are image-gen-flavored, Hector's are research-flavored (per the draft's two clearest examples); the other 7 agents get one generic-but-real chip set grounded in their actual `purpose` field, not invented busywork. This directly resolves the draft's open item #3 with a real (if simple) answer instead of leaving it undesigned.
6. **Bottom input bar** — pill-shaped, icon-prefixed (changes per active agent), mic icon. Mic reuses the existing `useVoiceInput.ts`/`SmartVoiceButton.tsx` plumbing rather than a new voice implementation.
7. **Background** — layered blurred organic color blobs (CSS, static default palette only — see Non-goals for per-agent variation).

### Real chat, not a mockup

Sending a message calls the existing `generateAgentLlmResponse(agentId, options)` from `src/lib/ollama.ts` — the one shared per-agent dispatcher every other real agent surface in this app already goes through (see CLAUDE.md's "Shared per-agent LLM dispatcher" row). The prompt sent is built from a small per-agent system-prompt prefix (same "text-only, no tool access, no fabricated file/tool claims" contract as `chatUtils.js`'s existing `CHAT_ASSISTANT_PROMPT`, generalized across all 9 agents instead of hardcoded to Alphonso) plus the visible conversation history plus the new user message. No new backend, no new LLM client, no Jose pipeline execution — this is a real, working, single-turn-per-send text chat against a real local/cloud model, not a scripted demo.

## Non-goals for this pass (explicitly deferred, not silently dropped)

Matches the draft doc's own "Explicitly open / unresolved" list — each item below is that same item, given an explicit MVP answer:

- **Per-agent blob palette variation** (Hector = warm amber, Miya = vivid, etc.) — one default palette only this pass.
- **"Days together" streak counter's real counting logic** — a static visual placeholder (`Day 1`) only; no persistence/counting mechanism built.
- **First-run onboarding hint** explaining that avatars are tappable shortcuts — not built; ties into `GuidedTour.tsx` in a later pass.
- **A from-scratch Companion-mode Settings screen** — settings drawer link opens the real, Advanced-styled `SettingsView.tsx` as-is. A power-user-styled settings screen appearing inside an otherwise chat-first experience is a known, accepted rough edge for this pass.
- **Real tool execution / Jose orchestration / approvals inside Companion Mode** — out of scope. Companion Mode is a text conversation with a persona, same boundary `ChatView.tsx`'s existing Direct Mode already draws for non-Jose-routed messages.
- **Removing `SIMPLE_MODE_ITEMS`/`Sidebar.tsx`'s now-dead simple-mode filtering** — left in place this pass (see Integration decision above).

## Build plan (small, test-then-verify increments — same discipline as every prior phase)

1. `src/services/companionGreetingsService.ts` (or a plain data file) — `COMPANION_GREETINGS`/`COMPANION_QUICK_STARTS` maps, one entry per real agent id. Pure data, unit-testable.
2. `src/components/companion/CompanionAgentRow.tsx` — the horizontal avatar shortcut row. Component test: renders all 9, active agent highlighted, others dimmed, click switches active agent.
3. `src/components/companion/CompanionChatBubble.tsx` — tailed bubble + mini avatar + typing indicator variant. Component test: renders user vs. agent variants correctly.
4. `src/components/companion/CompanionInputBar.tsx` — pill input + mic button (wraps existing voice hook). Component test: submit calls `onSend` with trimmed text, Enter key submits.
5. `src/components/CompanionMode.tsx` — the screen itself, composing 1–4 plus the top strip, quick-start chips, and the real `generateAgentLlmResponse` send pipeline. Component test: switching agent shows its greeting + quick-starts; sending a message renders the user bubble immediately and an agent bubble once the (mocked) LLM call resolves.
6. Wire into `App.tsx`'s render branch per the Integration decision above.
7. Full pass: `tsc --noEmit`, `eslint`, targeted test files, `fix-broken-var-opacity.mjs` safety net on every new file (Companion Mode uses the same design-token system as the rest of the redesign — Draft B's colors are new *shapes*, not a return to raw hex/Tailwind literals), live Playwright verification (toggle to Simple mode, click through agents, send a real message, toggle back to Advanced), bug-log entry, commit.

## Explicit visual note

Draft B's blob background and translucent bubbles are a **new visual language**, not power-user Draft A's tokens reused verbatim — but they still route through `tokens.css`'s CSS custom properties (new companion-specific tokens added to `tokens.css` if the existing `--surface-*`/`--accent-*` set doesn't fit, rather than hardcoded hex), so the whole redesign stays on one token system even as Draft B's visual language diverges from Draft A's.
