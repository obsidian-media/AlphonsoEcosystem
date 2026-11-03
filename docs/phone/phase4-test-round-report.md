# Phone phase 4: test round report

Date: 2026-11-02. Design: `docs/superpowers/specs/2026-11-02-alphonso-mobile-phase4-design.md`.
Plan: `docs/superpowers/plans/2026-11-02-alphonso-mobile-phase4-test-round.md`.
The test code lives on the throwaway branch `spike/phone-phase4` and is never merged.

## What was tested

The phone working on its own while the computer is off, in three parts:

1. Answering on the phone with Apple's on-device model.
2. Answering with a free cloud model, using a free key typed on the phone.
3. Waking the computer from the phone.

The same 20 questions went to every engine. Each used the agents' real prompts:

- **Jose:** 10 messages that his word rules leave to his model, each to be answered directly or planned.
- **Alphonso:** 6 answers and pieces of everyday writing. One of them is a project change, which should say Jose can plan it.
- **Echo:** 4 recall questions about made-up saved decisions, in the phone's real decision format.

The quality bar was the computer's starter model, llama3.2:3b.

## Results

| Part | Device | Jose | Alphonso | Echo | Typical answer time | Cost |
|---|---|---|---|---|---|---|
| Starter model (baseline) | This computer, Ollama | 6 of 10 | 6 of 6 | 4 of 4 | about 0.2 s; 79 s for the first answer while the model loads | free |
| Apple's on-device model | Owner's iPhone 15 Pro or newer, on Wi-Fi | 7 of 10 | 6 of 6 | 4 of 4 | about 1.5 s (1.2 to 1.8 s) | free, works offline |
| OpenRouter free (`openrouter/free`) | Same iPhone, on Wi-Fi | 10 of 10 | 6 of 6 | 4 of 4 | Jose 1.4 s, Alphonso 1.8 s, Echo 7.9 s; some answers 14 to 20 s | free, within OpenRouter's daily free limit |
| NVIDIA free tier | — | untested | | | | |
| Gemini free tier | — | untested | | | | |
| Mobile data | — | untested | | | | |
| Android | — | untested (no Android phone) | | | | |

Notes:

- **Apple's model got Jose wrong three times.** It answered these directly when they should have been planned:
  - "I feel a bit stuck on what to post this week"
  - "post our new opening hours on Slack"
  - "send Sam the meeting notes from today"

  The two sends are the risky ones. The starter model missed four, but not the same four.
- **Apple's model wraps Jose's answer in a code fence** (```` ```json ````), so the phone must strip the fence before reading the answer.
- **Apple's model reported itself available** (`available: true`). The phone's browser identification says iOS 18.7, but iOS 26 freezes that text, so it says nothing about the real version.
- **The first two runs on the iPhone froze** on "Run on this phone": the screen stayed busy and no answer came back. A later build ran all 20 questions in about 1.5 s each with no time-outs. The cause of the freeze was not found. The later build added a 2-minute limit per question, so a freeze now shows as a timed-out answer instead of a stuck screen.
- **Keys:** the OpenRouter key was saved in the phone's keychain. No key appeared in any result.

## Waking the computer

Untested: the owner chose to skip this test for now. What was read from this computer without changing anything:

- **Sleep:** it uses classic sleep (S3) and Hibernate, with no Modern Standby. On power it sleeps after 60 minutes.
- **Wi-Fi card** (Intel AC 3168): its driver has "Wake on Magic Packet" on, but Windows doesn't allow the card to wake the computer. Allowing it is one setting in Device Manager and needs the owner's yes. The card's hardware address is a private (random) one, kept per network.
- **Wired port** (Intel I219-V): it is already allowed to wake the computer, but no cable is plugged in.
- **The Rogers Ignite gateway** (10.0.0.1):
  - Rogers documents port forwarding but nothing about Wake-on-LAN.
  - A wake signal from outside the home needs either forwarding to a sleeping computer, which often fails because the gateway forgets its address, or something at home that stays awake and passes the signal on.
  - Forum users call Ignite's port forwarding unreliable, and bridge mode turns off the gateway's own Wi-Fi.

  Sources: rogers.com support pages on port forwarding and bridge mode, and Rogers community forum threads "Port Forwarding" and "XB7 Port Forwarding".
- **The fallback without waking:** set the computer never to sleep while plugged in, and let the phone answer on its own when the computer is off.

The owner's by-hand checklist for a later wake test is in the plan's Task 6.

## Recommendation: what to build first

1. **Answering on the phone with Apple's model**, for Jose (answer or plan), Alphonso (answers and writing) and Echo (recall from the decisions the phone already has).
   - It met the bar on every agent, works without a network and costs nothing.
   - Before Jose's model sees a message, a word check should send any message that asks to send, post or publish to the computer. That covers the two risky misses above.
2. **OpenRouter free as the fallback** when Apple's model isn't available: phones without Apple Intelligence, older iOS, and Android.
   - It scored best, but it needs a network, keeps to a daily free limit and is sometimes slow (up to 20 s).
3. **Waking: not yet.** It needs the owner's yes for the Wi-Fi setting and a by-hand test. From outside the home it probably needs help from the gateway. Until then, whatever the phone can't finish waits for the computer, as the design says.

Before building, the owner picks what goes into phase 4.
