# Agent Mascot Asset Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, per this session's standing "no subagents" instruction). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app's existing 6-agent mascot art (used across `agentVisualService.ts`, `CompanionWidget.tsx`, `MarketingLandingPage.tsx`, `MiyaStudio.tsx`, and all 9 agent profile files' `mascotPath` metadata) with the new 9-agent portrait set supplied this session — closing the pre-existing Echo/Sentinel/Nova gap in the same pass, since the new set covers all 9 and the old one never did.

**Architecture:** One consistent asset location for all 9 agents (`src/assets/agents/{id}/portrait.jpg`), replacing the previous inconsistent mix (`src/assets/{id}-mascot.webp` at the root for some agents, `src/assets/agents/{id}/{id}-mascot-main.webp` for others). `agentVisualService.ts` stays the single real accessor (`getAgentMascotPath`); the 3 components that previously imported mascot files directly are updated to use it instead, closing that inconsistency too.

**Tech Stack:** Vite asset imports, TypeScript/JavaScript.

**Scope note:** Source images are the 120×120 center-cropped thumbnails already used in every mockup this session (staged at `.superpowers/brainstorm/20298-1788580260/content/*.jpg`, 4-6KB each) — the original full-resolution downloads no longer exist (scratch directory cleared). These thumbnails are the right size for every current real consumer (nav-sized avatars, ~40-90px), so this is not a blocker for this task — but full-resolution versions for any future larger surface (an agent detail page, onboarding) remain a genuinely separate, deferred task, not resolved here.

---

### Task 1: Add the 9 portrait assets, update `agentVisualService.ts`, remove the old files

**Files:**
- Create: `src/assets/agents/alphonso/portrait.jpg`, `src/assets/agents/hector/portrait.jpg`, `src/assets/agents/jose/portrait.jpg`, `src/assets/agents/miya/portrait.jpg`, `src/assets/agents/maria/portrait.jpg`, `src/assets/agents/marcus/portrait.jpg`, `src/assets/agents/echo/portrait.jpg`, `src/assets/agents/sentinel/portrait.jpg`, `src/assets/agents/nova/portrait.jpg`
- Modify: `src/services/agentVisualService.ts`
- Delete: `src/assets/alphonso-mascot.png`, `src/assets/alphonso-mascot.webp`, `src/assets/hector-mascot.png`, `src/assets/hector-mascot.webp`, `src/assets/jose-mascot.png`, `src/assets/jose-mascot.webp`, `src/assets/miya-mascot-main.png`, `src/assets/miya-mascot-main.webp`, `src/assets/miya-mascot.webp`, `src/assets/agents/marcus/marcus-mascot-main.png`, `src/assets/agents/marcus/marcus-mascot-main.webp`, `src/assets/agents/maria/maria-mascot-main.png`, `src/assets/agents/maria/maria-mascot-main.webp`
- Test: existing `src/test/agents/agentProfiles.test.js` (unmodified — verifies `mascotPath` is a non-empty string, not that the file resolves, so it stays green through this change without edits)

- [ ] **Step 1: Copy the 9 real portrait files into their new, consistent location**

```bash
mkdir -p src/assets/agents/alphonso src/assets/agents/hector src/assets/agents/jose src/assets/agents/miya src/assets/agents/maria src/assets/agents/marcus src/assets/agents/echo src/assets/agents/sentinel src/assets/agents/nova
cp .superpowers/brainstorm/20298-1788580260/content/alphonso.jpg src/assets/agents/alphonso/portrait.jpg
cp .superpowers/brainstorm/20298-1788580260/content/hector.jpg src/assets/agents/hector/portrait.jpg
cp .superpowers/brainstorm/20298-1788580260/content/jose.jpg src/assets/agents/jose/portrait.jpg
cp .superpowers/brainstorm/20298-1788580260/content/miya.jpg src/assets/agents/miya/portrait.jpg
cp .superpowers/brainstorm/20298-1788580260/content/maria.jpg src/assets/agents/maria/portrait.jpg
cp .superpowers/brainstorm/20298-1788580260/content/marcus.jpg src/assets/agents/marcus/portrait.jpg
cp .superpowers/brainstorm/20298-1788580260/content/echo.jpg src/assets/agents/echo/portrait.jpg
cp .superpowers/brainstorm/20298-1788580260/content/sentinel.jpg src/assets/agents/sentinel/portrait.jpg
cp .superpowers/brainstorm/20298-1788580260/content/nova.jpg src/assets/agents/nova/portrait.jpg
```

- [ ] **Step 2: Verify all 9 files landed**

Run: `find src/assets/agents -iname "portrait.jpg"`
Expected: 9 lines, one per agent directory.

- [ ] **Step 3: Update `agentVisualService.ts` to import all 9 and remove the old 6**

Replace `src/services/agentVisualService.ts` entirely with:

```ts
import alphonsoMascot from '../assets/agents/alphonso/portrait.jpg';
import joseMascot from '../assets/agents/jose/portrait.jpg';
import miyaMascot from '../assets/agents/miya/portrait.jpg';
import hectorMascot from '../assets/agents/hector/portrait.jpg';
import mariaMascot from '../assets/agents/maria/portrait.jpg';
import marcusMascot from '../assets/agents/marcus/portrait.jpg';
import echoMascot from '../assets/agents/echo/portrait.jpg';
import sentinelMascot from '../assets/agents/sentinel/portrait.jpg';
import novaMascot from '../assets/agents/nova/portrait.jpg';
import { getCustomAvatarDataUrl } from './agentAvatarService';

const AGENT_MASCOT_MAP: Record<string, string> = {
  jose: joseMascot,
  alphonso: alphonsoMascot,
  miya: miyaMascot,
  hector: hectorMascot,
  maria: mariaMascot,
  marcus: marcusMascot,
  echo: echoMascot,
  sentinel: sentinelMascot,
  nova: novaMascot
};

export function getAgentMascotPath(agentId: string): string | null {
  const id = String(agentId || '').toLowerCase();
  const custom = getCustomAvatarDataUrl(id);
  if (custom) return custom;
  return AGENT_MASCOT_MAP[id] || null;
}

export function getAgentInitials(nameOrId: string): string {
  const safe = String(nameOrId || '').trim();
  if (!safe) return '?';
  const words = safe.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  return safe.slice(0, 2).toUpperCase();
}
```

- [ ] **Step 4: Delete the old, now-orphaned asset files**

```bash
rm src/assets/alphonso-mascot.png src/assets/alphonso-mascot.webp
rm src/assets/hector-mascot.png src/assets/hector-mascot.webp
rm src/assets/jose-mascot.png src/assets/jose-mascot.webp
rm src/assets/miya-mascot-main.png src/assets/miya-mascot-main.webp src/assets/miya-mascot.webp
rm src/assets/agents/marcus/marcus-mascot-main.png src/assets/agents/marcus/marcus-mascot-main.webp
rm src/assets/agents/maria/maria-mascot-main.png src/assets/agents/maria/maria-mascot-main.webp
```

- [ ] **Step 5: Run the existing agent profile test suite**

Run: `npx vitest run src/test/agents/agentProfiles.test.js --pool=threads`
Expected: PASS (this test checks `mascotPath` is present as a string on each profile — profile files aren't touched by this task yet, so it should already pass; confirms this step didn't regress it)

- [ ] **Step 6: Commit**

```bash
git add src/assets/agents src/services/agentVisualService.ts
git add -u src/assets
git commit -m "feat: replace agent mascot assets — all 9 agents, one consistent location, closes the Echo/Sentinel/Nova gap"
```

---

### Task 2: Update the 3 components that import mascot images directly

**Files:**
- Modify: `src/components/CompanionWidget.tsx:9`, `src/components/MarketingLandingPage.tsx:5-7`, `src/components/MiyaStudio.tsx:12`

- [ ] **Step 1: Update `CompanionWidget.tsx`**

Change line 9 from:
```tsx
import mascotImage from '../assets/alphonso-mascot.webp';
```
to:
```tsx
import mascotImage from '../assets/agents/alphonso/portrait.jpg';
```

- [ ] **Step 2: Update `MarketingLandingPage.tsx`**

Change lines 5-7 from:
```tsx
import alphonsoMascot from '../assets/alphonso-mascot.webp';
import joseMascot from '../assets/jose-mascot.webp';
import miyaMascot from '../assets/miya-mascot-main.webp';
```
to:
```tsx
import alphonsoMascot from '../assets/agents/alphonso/portrait.jpg';
import joseMascot from '../assets/agents/jose/portrait.jpg';
import miyaMascot from '../assets/agents/miya/portrait.jpg';
```

- [ ] **Step 3: Update `MiyaStudio.tsx`**

Change line 12 from:
```tsx
import miyaMascot from '../assets/miya-mascot-main.webp';
```
to:
```tsx
import miyaMascot from '../assets/agents/miya/portrait.jpg';
```

- [ ] **Step 4: Run the full typecheck**

Run: `npx tsc --noEmit`
Expected: clean, zero output — this confirms none of the 3 edited files (or anything importing them) broke, and that the deleted old asset files in Task 1 aren't referenced anywhere this plan missed.

- [ ] **Step 5: Commit**

```bash
git add src/components/CompanionWidget.tsx src/components/MarketingLandingPage.tsx src/components/MiyaStudio.tsx
git commit -m "fix: update the 3 components that imported mascot images directly to use the new portrait assets"
```

---

### Task 3: Update the 9 profile files' `mascotPath` metadata to match

**Files:**
- Modify: `src/agents/alphonso/alphonsoProfile.js`, `src/agents/hector/hectorProfile.js`, `src/agents/jose/joseProfile.js`, `src/agents/miya/miyaProfile.js`, `src/agents/maria/mariaProfile.js`, `src/agents/marcus/marcusProfile.js`, `src/agents/echo/echoProfile.js`, `src/agents/sentinel/sentinelProfile.js`, `src/agents/nova/novaProfile.js`

- [ ] **Step 1: Update each profile's `mascotPath` field**

In each file, change the `mascotPath` line to the new consistent path. For example, in `src/agents/alphonso/alphonsoProfile.js`, change:
```js
  mascotPath: 'src/assets/alphonso-mascot.webp',
```
to:
```js
  mascotPath: 'src/assets/agents/alphonso/portrait.jpg',
```

Repeat the same pattern (only the agent id and old path differ) for all 9 profile files — `hector` → `src/assets/agents/hector/portrait.jpg`, `jose` → `src/assets/agents/jose/portrait.jpg`, `miya` → `src/assets/agents/miya/portrait.jpg`, `maria` → `src/assets/agents/maria/portrait.jpg`, `marcus` → `src/assets/agents/marcus/portrait.jpg`, `echo` → `src/assets/agents/echo/portrait.jpg`, `sentinel` → `src/assets/agents/sentinel/portrait.jpg`, `nova` → `src/assets/agents/nova/portrait.jpg`. (Note: `echo`/`sentinel`/`nova`'s existing `mascotPath` values pointed at files that never existed — e.g. `echoProfile.js` had `'src/assets/agents/echo/echo-mascot-main.webp'` — this step fixes those to point at a file that now genuinely exists, not just renaming a working reference.)

- [ ] **Step 2: Run the existing agent profile test suite**

Run: `npx vitest run src/test/agents/agentProfiles.test.js --pool=threads`
Expected: PASS

- [ ] **Step 3: Run the full typecheck one more time**

Run: `npx tsc --noEmit`
Expected: clean, zero output

- [ ] **Step 4: Commit**

```bash
git add src/agents
git commit -m "docs: update all 9 agent profiles' mascotPath metadata to the new consistent asset location"
```

---

## Self-Review

**Spec coverage:** Covers all 4 real reference points found during planning: `agentVisualService.ts` (the single real accessor), the 3 components that bypass it with direct imports, and the 9 profile files' metadata field. Nothing silently left half-updated.

**Placeholder scan:** No TBD/TODO. Every file path, import statement, and line number was verified against the real repo during planning, not guessed — including the real discovery that `echo`/`sentinel`/`nova`'s pre-existing `mascotPath` values pointed at files that were never actually created.

**Type consistency:** `AGENT_MASCOT_MAP`'s keys (9 agent ids) match exactly across Task 1's `agentVisualService.ts` rewrite and Task 3's profile updates — no drift between the two.
