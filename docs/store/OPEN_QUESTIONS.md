# App Store: open questions for the owner

Written 2026-11-02 (phone app phase 3 part C) while preparing the listing. Each is something the code
can't answer; nothing here was guessed into the privacy policy or the labels.

1. **Sign in with Apple: revoking Apple's tokens on deletion.** Apple asks apps that offer Sign in with
   Apple to revoke the user's Apple tokens when the account is deleted (the REST API's `revoke`). Delete
   my account deletes the Firebase sign-in and the relay's records, but does not call Apple's revoke
   (it needs a fresh Apple authorization code from the phone). Reviewers check that deletion exists;
   revoking is a follow-up. Decide: add it before submitting, or after.
2. **The relay must be redeployed** for Delete my account to work (`gateway/phone-relay/vm/deploy.sh`).
   Until then the button answers "Not found." Submit only after deploying.
3. **Firebase project location and Google as processor.** The sign-in and the relay's records live in
   the Firebase project the relay uses. The privacy policy names Google (Firebase, Google Cloud). If you
   want a region or a data processing statement named, tell me which.
4. **Age rating.** Apple's questionnaire: the phone app shows AI-written text from your own computer's
   agents and has no user-to-user content, web browsing or gambling. Answer it truthfully in App Store
   Connect; the checklist suggests 13+ for an app built on AI chat. Confirm.
5. **GitHub Issues as the only contact.** Apple accepts a support URL. Some regions' laws (for example
   the EU's Digital Services Act for traders) ask for a contact address for trader apps; if you register
   as a trader in App Store Connect, Apple shows the address you give there.
6. **Cloud Voice** (AWS) has no client left; see `docs/governance/DEFERRED_WORK.md`.
