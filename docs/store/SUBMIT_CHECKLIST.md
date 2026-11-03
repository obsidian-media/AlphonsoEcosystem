# Submitting Alphonso to the App Store: the owner's checklist

Prepared 2026-11-02 (phone app phase 3 part C). You submit; everything to paste is in this folder.
Read `OPEN_QUESTIONS.md` first.

## Before App Store Connect

1. **Deploy the relay** so Delete my account works: `gateway/phone-relay/vm/deploy.sh` (see
   `gateway/phone-relay/vm.md`). Check: More → Delete my account on a test account deletes it.
2. **Switch GitHub Pages on**: the repository's Settings → Pages → Source: **GitHub Actions**. Then run
   the "Store pages (GitHub Pages)" workflow (it runs by itself when `site/` changes on main). Check that
   https://obsidian-media.github.io/AlphonsoEcosystem/privacy.html and `/support.html` open.
3. **Build for TestFlight** with the "Phone app to TestFlight" workflow (`phone-app-testflight.yml`) and
   try it on a real iPhone: sign in, pair, approve a step, Try a demo, Leave demo, Delete my account
   (on a spare account).

## In App Store Connect (app `com.alphonso.companion`)

4. **App Information**: name, subtitle, category (Productivity, then Business), from `app-store.md`.
   Content rights: the app shows no third-party content you don't have rights to.
5. **Age rating**: answer the questionnaire truthfully; see `OPEN_QUESTIONS.md` item 4.
6. **Pricing**: Free, all regions you choose.
7. **App Privacy**: privacy policy URL, then the answers in `privacy-labels.md`. Tracking: No.
8. **Version page**: promotional text, description, keywords, support URL, what's new, from
   `app-store.md`. Screenshots: upload `screenshots/iphone-6.9/*.png` (1320 × 2868, Apple's 6.9-inch
   iPhone size; App Store Connect scales them for smaller iPhones). The app is iPhone only, so no iPad
   screenshots (`mobile/ios/App/project.yml`: `TARGETED_DEVICE_FAMILY` 1, iOS 16.4 and later).
9. **Build**: pick the TestFlight build. Export compliance: the app uses standard encryption (HTTPS
   and libsodium) only; answer as exempt under the standard-encryption rule if that matches your build
   (Apple asks per build).
10. **App Review Information**: paste the review notes from `app-store.md`. No sign-in account is needed
    for the demo; contact details are your App Store Connect account's.
11. **Submit for review.**

## Screenshot sizes: where they come from

Apple's 6.9-inch iPhone size is 1320 × 2868 portrait (third-party guides, February to September 2026;
check Apple's "Screenshot specifications" page in App Store Connect Help before uploading). To make them
again: `cd mobile && npm run build && node scripts/store-screenshots.mjs`.
