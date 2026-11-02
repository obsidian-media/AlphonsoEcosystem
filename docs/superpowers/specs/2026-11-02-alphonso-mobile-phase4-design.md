# Alphonso phone app, phase 4: the phone on its own

**Status:** written 2026-11-02 from the owner's answers; waiting for the owner's approval.
Builds on `2026-10-31-alphonso-mobile-design.md` (section "Phase 4", approved 2026-10-31).
Branch `feat/mobile-phase4`, its own PR on top of #377 (owner), merged after #377.

## Why

In phases 1 to 3 the phone shows the computer's work and lets the owner decide; when the computer is
off or asleep, the phone only says "offline since". The owner (2026-10-31): "Waking the computer,
or answering in the cloud while it is off would be very good, but we got to see the infrastructure
for it", and phase 4 is also about agents working on the phone itself (owner, 2026-11-02).

Success: with the computer off, the owner can still ask Alphonso something on the phone and get a
useful answer, start work that finishes on the computer later, or bring the computer back.

## What phase 4 is

When the computer is off, the offline screen offers what this phone and account can do:

- **Answer on this phone**: the phone's own model (Apple's on-device model on iPhones that have it).
- **Answer with <free cloud model>**: a free cloud model, with a free key the user adds on the phone.
- **Try to wake my computer.**

Nothing happens until the user picks one. Every answer says where it came from ("Answered on this
phone", "Answered with OpenRouter (free)").

### Agents on the phone (owner, 2026-11-02)

Three agents run on the phone, using the phone's model or the free cloud model:

- **Jose** reads the message and decides: answer now, or plan.
- **Alphonso** answers questions and does everyday writing (`assistant_answer`, `assistant_write`).
- **Echo** recalls from the decisions the phone already holds (the newest 50 active ones, phase 3A).
  A decision he saves on the phone goes to the computer when it reconnects.

Their logic is the same TypeScript the desktop runs; the phone gives it a different model and a
different store. No second copy of an agent's prompts or rules.

### What the phone may know (owner)

Only what the phone already has: Echo's 50 decisions, recent requests, and the content it mirrors.
Nothing new is copied to the phone for phase 4.

### Hand-over when the computer is back (owner)

The phone finishes what it can; the rest goes to the computer:

- Steps Jose, Alphonso or Echo did on the phone stay done.
- Steps for anyone else (Hector, Miya, Marcus, Maria, Nova, Sentinel), anything needing the
  computer's tools (ComfyUI, ffmpeg, Kokoro, voice, project folders) or a key the phone doesn't
  have, wait as a request and run on the computer when it reconnects, with the phone's finished
  steps as their input.
- Approvals work as they do today: a waiting step asks on the computer and on the phone.

### Cloud on the phone: free models only (owner)

- Only free models: OpenRouter's free models, NVIDIA NIM and Gemini's free tiers. No paid model is
  ever used from the phone, so there is no spending cap to share with the computer.
- The key is a free key the user adds on the phone, kept in the phone's keychain. Keys never cross
  the relay, in either direction.
- Zero-Cost Mode stays as it is: free models pass it.

## Not in phase 4

- Any other agent on the phone, and any of the computer's tools on the phone.
- Paid models from the phone.
- Copying more of the user's work to the phone (project notes, past chats, the whole decision store).
- Android's on-device model on a real phone (see the test round).

## Anti-goals

- An answer that hides where it came from, or a phone answer passed off as the computer's.
- The phone doing anything on its own: every phase 4 action starts with the user's choice.
- A key, or a decision's hidden key, leaving the phone or crossing the relay.
- Phone work lost or done twice when the computer comes back.

## First: the test round

As agreed on 2026-10-31, nothing is built until a test round on real devices shows what works. The
test code is throwaway on a spike branch, never merged; what comes back is a written report to the
owner. The owner then chooses what to build.

Devices (owner): the owner's iPhone 15 Pro or newer, and this Windows computer with the home
router (a Rogers Ignite gateway, built by Comcast, at 10.0.0.1, read from the network 2026-11-02).
No Android phone: Gemini Nano is reported from Google's documentation only and marked "untested on
a real Android phone".

1. **The iPhone's own model.**
   - Reach Apple's Foundation Models framework from the Capacitor app through a small native plugin;
     the app's iOS minimum stays 16.4, with a check at run time (iOS 26 or later, Apple Intelligence
     on).
   - Quality bar (owner): as good as the desktop's starter model. The same set of everyday questions
     and writing tasks, with Alphonso's real prompts, goes to the iPhone model and to `llama3.2:3b` on
     the computer. It passes if its answers are about as good and it follows Alphonso's instructions,
     including Jose's answer-or-plan decision and Echo's recall format.
   - If it fails the bar (my call): Jose, Alphonso and Echo use free cloud models only, and the phone
     doesn't offer "Answer on this phone". The report says what failed.
2. **Free cloud answering from the phone.** Each free provider called from the phone's app with a free
   key in the phone's keychain: does it answer, how fast on mobile data, and the free limits (OpenRouter
   free: 20 a minute, 50 a day, checked 2026-10-30). NVIDIA sends no CORS headers, so the check also
   decides whether calls go through Capacitor's native HTTP instead of the web view.
3. **Waking the computer.**
   - Does this computer wake from sleep on a magic packet (Modern Standby or S3), and how long until
     Alphonso answers the phone again.
   - Can the Rogers gateway send a wake signal from outside the house (its app or settings), or keep
     one device awake.
   - The fallback: a "keep this computer awake while plugged in" setting in Alphonso.
   - If none is reliable, the button says plainly: "Your computer didn't answer. It may be off, or it
     can't be woken from sleep."

The report gives, for each of the three: works or not, on which devices, how fast, rough cost (free
or not), and what building it would take.

## After the test round

The owner picks which of the three to build; the earlier suggestion was cloud answering first, then
the phone's model, then waking. That build gets its own plan (and, if the test round changes the
picture, an update to this design first).

## Constraints

- The project's rules: no hardcoded model names, addresses or lists (free models are read from each
  provider's live list, as on the desktop); plain words on screen; secrets stay in a keychain.
- Phone answers show where they came from on every screen they appear: Chat, Requests, notifications.
- The relay stays as it is: it never sees a key or a model's answer unsealed.
- TDD for the build; the test round is throwaway.

## Left to the builder

- The question set for the quality bar and how answers are scored (kept in the report so it can be
  rerun).
- How the native plugin is shaped and how the iPhone test build reaches the owner (TestFlight from CI).
- How phone-done steps are recorded so the computer resumes the request without redoing them.
