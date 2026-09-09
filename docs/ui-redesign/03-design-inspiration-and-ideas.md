# Design Inspiration Sources & Ideas List

## A. Where to actually go look (real, verified-to-exist sources, not guessed)

| Source | What it's good for | Access |
|---|---|---|
| **Mobbin** (mobbin.com) | The deepest library of real, screen-by-screen web + mobile app UI — browse actual shipped dashboards, not concept art | Free tier + paid deep archive |
| **SaaSFrame** | Real in-app dashboard/settings screens specifically from SaaS products (closest category match to Alphonso) | Paid archive |
| **Screenlane** | Recorded app/web user flows, annotated — good for seeing *interaction sequences*, not just static screens | Free + paid |
| **Land-book / Lapa.ninja / Godly.website** | Landing-page-focused, less relevant to in-app dashboards but useful for the Marketing Landing Page component and onboarding flow polish | Free |
| **Dribbble (search "minimal editorial dashboard", "AI agent dashboard")** | Trend-forward visual concepts — useful for divergent ideas, but treat as inspiration-only, most Dribbble dashboard shots are never shipped/functional | Free |
| **UI8 marketplace — "AgentOS" AI Agent Orchestration Dashboard template** (ui8.net) | A directly on-category paid template built specifically for AI agent orchestration UIs — worth a direct look since it's the single closest genre match found this session, not a generic dashboard | Paid |
| **21st.dev** (the site you originally referenced) | Component-level React/Tailwind UI snippets, good for *implementation* patterns once a direction is locked, less useful for whole-page visual direction | Free/community |

## B. Real design-system references already pulled into this session's mockups

Already used to build Draft A (see that doc) — treat these as the actual foundation, not just names to browse:
- **Linear** — dark surface ladder + hairline dividers + typography-led hierarchy, near-zero radius, no shadows
- **Raycast** — dark "power-tool cockpit," inset/pressed tactile treatment, mono accents
- **Arc Browser** — tinted translucent washes instead of borders, editorial serif touches for personality
- Caveat already noted in Draft A: the specific hex/token values pulled for these came from third-party reconstruction sites (opendesigner.io, shadcn.io/design), not the vendors' own published specs — directionally reliable, not pixel-gospel.

## C. Real "Agent UX" design principles (found this session, directly relevant — Alphonso is exactly this category)

From live 2026 research on AI agent interface design specifically (not generic dashboard advice):
- **Transparency is the core design job** — an agent UI's primary purpose is being "the accountability layer between user intent and autonomous action," not decoration.
- **Communicate what the system is doing and why**, in real time, not just a spinner — matches the Draft A "breathing glow on active agents" instinct, but should extend further: a live agent should show *what it's currently doing*, not just *that* it's active.
- **Override/intervention points at every step** — directly maps onto Alphonso's existing approval-gate architecture (`policyEnforcementService.ts`, `ApprovalModal.tsx`) — the redesign should make these intervention points more visually prominent, not just present.
- **Unified aggregation across a multi-agent fleet** is called out industry-wide as the single hardest problem multi-agent dashboards solve in 2026 — this directly validates the real gap flagged in the pages inventory doc (no single "what needs my attention" surface exists yet across the 5 separate notification-shaped systems in this codebase).

## D. Ideas list — concrete, buildable directions surfaced this session

1. **Top pill/underline nav + Ctrl+P unified command palette**, replacing the sidebar entirely, reaching the ~20 secondary pages that don't fit in curated top tabs. (Locked in Draft A.)
2. **Real agent portraits as first-class UI elements** — not just settings-page avatars, but woven through nav, chat, approval rows, connector-attribution, everywhere an agent is referenced. (Locked in Draft A, production pipeline still open.)
3. **"Breathing glow" live-status animation** on active agents — a cheap, high-impact way to make the UI feel like a live system rather than a static report. (Locked in Draft A.)
4. **Color-graded section washes instead of cards** — approval zones get a warm wash, connector/status zones get a cool wash, hierarchy from color-coded regions not boxes. (Locked in Draft A.)
5. **"Live Ops Wall" treatment** (color-coded left accent rules, monospace stat numbers, inline sparklines, asymmetric grid) reserved specifically for a small set of genuinely dense operational pages (Orchestrator Queue, Activity Log, Connector Health, Agent Performance) — NOT the app-wide theme. (Locked in Draft A as a scoped, not universal, treatment.)
6. **A single unified "needs your attention" aggregation surface** — a real gap, not yet built anywhere, that the notification-bell-with-badge nav concept currently assumes exists. Recommend this becomes an actual Phase 1/2 deliverable, not just a visual mockup element.
7. **A canonical per-agent detail page** — reachable from anywhere (click any agent portrait → full profile: activity, skill packs, contract permissions, current LLM provider, performance stats). Currently scattered across 3+ different partial views in the Project Execution Mode subsystem only.
8. **Resolve the Boardroom naming collision** as part of the redesign, not after it — `mission_room`/`BoardroomChatView.tsx` (real chat) vs. `BoardroomPanel.tsx` (goal/batch tracker) sharing a name is a real, user-facing confusion, independent of any visual work.
9. **Fix the Orchestrator page's internal duplication** (two panels showing the same dead-letter-queue data on different refresh cadences) while touching that page anyway for the redesign.
10. Normal-user design direction — **not started yet**, tracked separately, needs its own brainstorming pass with the same rigor as Draft A.
