# Alphonso Pricing

**Alphonso is free at launch.** Every agent, connector and local feature is available to every user, with no license key and no trial clock.

_Last updated: 2026-09-30. This replaces an earlier draft that described a Pro/Enterprise price list, a 14-day trial, a Lemon Squeezy checkout and a "BSL 1.1" license. None of those were ever implemented, and the license is not BSL (see [License](#license) below)._

---

## What "free" covers today

- All 9 agents (Alphonso, Jose, Hector, Miya, Maria, Marcus, Echo, Sentinel, Nova)
- All 26 connectors, including the ones the code classifies as "premium" (Claude, ChatGPT, YouTube, Notion, ClickUp, WhatsApp, SD WebUI, ComfyUI)
- Local Ollama inference, memory, workflows, Boardroom, voice, and the auto-updater

Connecting to a third-party service still means you bring your own account and API key. Any usage that provider bills is between you and them. Alphonso's Zero-Cost Mode and Approval Mode (both on by default) block paid or metered calls until you approve them.

## How paid tiers would come back later

The licensing code is still in the app, in `src/services/licenseService.ts`. It is inert while no vendor signing key is configured. `LICENSE_TRUST_KEY` in `src/config/licenseTrustKey.ts` is `null`, so `isPremiumGatingEnabled()` returns `false`.

Turning paid tiers on later needs three things:

1. A vendor key pair (`node scripts/issue-license.mjs --generate-keys`), with the public JWK pasted into `licenseTrustKey.ts`.
2. A purchase and license-issuance flow. None exists yet.
3. An updated version of this page with real prices.

Once gating is on, approving an action does **not** bypass it. The license check is independent of Approval Mode.

## Cloud Voice (iOS)

The optional Cloud Voice service is **invite-only** during launch. Each account has a request rate limit and a daily quota. There is no paid plan for it yet.

## License

The source code in this repository is published under the **SHALAUDE License v1.0** (all rights reserved, source-visible; see [LICENSE](../LICENSE)). The installable app is used under the end-user license shown in the installer ([legal/EULA.txt](../legal/EULA.txt)). Both are drafts pending legal review.
