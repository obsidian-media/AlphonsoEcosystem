# Remaining Setup-Required Items

This file lists items that are intentionally **not** marked complete without external setup proof. Checked against the code on 2026-10-25; the full register of open work is `docs/governance/DEFERRED_WORK.md`, and the live checks are listed in `docs/qa/DESKTOP_QA_COVERAGE.md`.

## 1) Connector credentials + authorization profiles
- Telegram bot token + allowed chat IDs (checked live with the owner's bot on 2026-10-23)
- WhatsApp Cloud API credentials + allowed numbers (Twilio was removed)
- YouTube: your own Google project, then Sign in to YouTube (publish the project, or the sign-in ends after about 7 days)
- Meta: your own Meta app, then Sign in to Facebook or Sign in with Instagram
- Notion / ClickUp tokens and destination IDs
- Optional paid providers (Claude, ChatGPT, Runway, ElevenLabs, Higgsfield, CALL-E), with your prices in Settings → Approvals
- Optional: your own S3-compatible storage for Instagram carousels
- Slack / Discord / custom webhook connection URLs
- Local ComfyUI (and its video, character and motion models), Kokoro, AudioCraft and Whisper, from Runtime Hub

See `docs/EXTERNAL_CONNECTOR_SETUP.md` and `docs/CONNECTORS.md`.

## 2) Not yet checked with real accounts
- Publishing to YouTube, Instagram and Facebook, moving and cancelling posts, and reading their numbers
- Claude and ChatGPT as paid models for Jose's steps
- ElevenLabs, Higgsfield (several character and motion request fields are unconfirmed) and Runway
- CALL-E: a real placed call
- The new ComfyUI graphs (character reference, motion transfer) on a real run

## 3) WhatsApp Cloud inbound hosting
- Each owner deploys `gateway/whatsapp-cloud` (Railway or similar), with the public webhook URL, Meta's verify challenge and signature validation in the hosted environment.

## 4) Release signing
- Updater signing works (releases signed since v2.0.2; in-app update confirmed 2026-09-05).
- Apple Developer ID signing and notarization for the Mac build are not set up (`docs/MACOS_SIGNING.md`); Windows code signing likewise.

## 5) Cloud Voice (iOS)
- The AWS address did not resolve on 2026-10-20; the infrastructure owner must restore it, then a real-iPhone English and Farsi test.

## 6) OCR/screen intelligence productionization
- Foundation exists. Full supervised production pipeline (capture permissions, filtering, pattern engine, alerts) remains partial.
