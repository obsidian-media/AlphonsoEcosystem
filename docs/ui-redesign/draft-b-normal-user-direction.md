# Draft B — Normal-User Visual Direction

Status: **Locked skeleton + interaction model.** Anchored to 3 real reference apps the user confirmed resonated: **ChatGPT/Gemini mobile** (chat-first, almost nothing else on screen), **Duolingo** (playful, mascot-driven, guided), **Headspace/Calm** (warm, illustrated, low-cognitive-load). This is a completely separate design track from Draft A (power-user) — not a "simple mode" toggle on the same visual system, a genuinely different experience for a different kind of user.

## Core concept

The whole screen is a conversation with your assistant. No dashboard, no connector list, no orchestrator queue, no jargon anywhere in this mode. The agent's real portrait is present like a companion, not tucked into a settings page.

## Skeleton

- Minimal top strip: menu icon, app name, settings icon. That's it.
- **Agent shortcut row** (the key mechanic, refined over several rounds): a horizontally-scrollable row of all 9 real agent portraits, Instagram-stories-style — a pattern normal users already know instinctively, confirmed to hold up at the real count of 9, not just an illustrative 4.
  - Each agent carries a small skill-tag badge signaling their specialty at a glance: Alphonso 💬 (general), Hector 🔎 (research), Miya 🎨 (create), Maria 🛡️ (governance), Marcus 📣 (distribution/publish), Jose 🧭 (orchestration), Echo 🧠 (memory), Sentinel 🔒 (security), Nova 💡 (insights/opportunity).
  - **Tapping an avatar is not just "switch chat partner"** — it's a direct shortcut into that agent's specific capability. Tapping Miya opens a greeting from her specifically plus quick-start chips aimed at image generation ("A picture of...", "A social post graphic", "A short video"). Tapping Hector would open research-specific quick-starts. This turns 9 abstract "agents" into 9 concrete, one-tap actions a non-technical user can understand without ever learning a command syntax.
  - The other 8 avatars visually dim/recede when one is active, so focus stays on the selected agent's specialty.
- Below the shortcut row: the active agent's name (display serif, Fraunces) + a short greeting line.
- Chat area: tailed message bubbles (mine = dark solid, theirs = soft white/translucent), each incoming message carries the responding agent's mini avatar. Real animated typing indicator (3-dot bounce) while waiting.
- A quick-start chip row appears contextually under an agent's greeting (only shown right after switching agents, not permanently cluttering the screen) — concrete example prompts scoped to that agent's specialty.
- Bottom input bar: pill-shaped, icon-prefixed by context (💬 general / 🎨 when Miya is active, etc.), mic icon for voice input.

## Visual language

- Background: **layered, blurred organic color blobs** (not a flat linear gradient — an earlier round was explicitly called out as "generic template gradient" and rejected). Warm peach/pink/lavender blob palette for the default state; the exact per-agent blob palette (should Hector's research mode look different from Miya's create mode?) is not yet decided — open item below.
- A small personal-touch element in the top strip: a "days together" streak counter (Duolingo-style personal investment signal) — exact mechanic (does it count consecutive days of use? total conversations? something else?) is not yet defined, just the visual placeholder.
- Typography: Inter for body/UI, Fraunces (serif) for the agent's name/greeting — same display-font choice as Draft A's headline treatment, giving the two tracks one small shared thread despite otherwise being separate systems.
- No cards, no hard edges here either — bubbles and the quick-start panel use soft rounded shapes with translucency/blur, not bordered boxes.

## Explicitly rejected in this track

- A flat, generic pastel linear-gradient background (first attempt) — replaced with layered blurred organic blobs.
- Plain monochrome chat bubbles with no avatar/color identity (first attempt) — replaced with per-message mini avatars and richer tailed bubble shapes.
- A static "4 example agents" shortcut row — validated instead against the real full count of 9, confirmed the horizontal-scroll pattern holds up rather than needing curation/pinning.

## Explicitly open / unresolved

- Whether each agent's active state should shift the blob color palette (Hector = library-ish warm amber echoing Draft A's Research room mood? Miya = something more vivid/creative?) — not yet decided, only the default/Alphonso-active palette has been mocked.
- The "days together" streak mechanic's actual counting logic.
- What happens for agents whose "specialty quick-start" isn't as obviously single-purpose as Miya's (image gen) or Hector's (research) — e.g. what does tapping Sentinel or Echo's shortcut actually open? Not yet designed past the two clearest examples.
- Onboarding: how does a first-time normal user learn that tapping avatars does something special, versus just looking like a contact list? Not addressed yet — may need a first-run hint, ties into the existing `GuidedTour.tsx` component.
- No pages beyond this single home/chat screen have been designed for the normal-user track at all yet — Settings, connecting a channel, viewing past conversations, etc. are all unaddressed.
- Relationship to Draft A: is there a way for a normal-user-mode user to "graduate" into power-user mode (the existing `useUxMode.ts` Simple/Advanced toggle), and does switching modes swap the entire visual system, not just information density like it does today? Not yet decided.
