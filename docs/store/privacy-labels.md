# App Privacy answers (App Store Connect)

Prepared 2026-11-02 (phone app phase 3 part C). Apple counts data as "collected" when it leaves the
phone in a form the developer (or its partners) can read. The app's content (chat, requests, projects,
pictures, notifications) is sealed between the phone and the user's own computer
(`src/services/phone/phoneCrypto.ts`), so neither the relay nor Google can read it: it is not collected.
What the relay and the sign-in can read is listed below, each with the code that backs it.

**Tracking: No.** No data is used to track the user across other companies' apps or websites, and the
app has no advertising or analytics libraries (`mobile/package.json`).

## Data collected

| Apple's data type | Collected | Linked to the user | Used for | Backed by |
|---|---|---|---|---|
| Contact Info → Email Address | Yes | Yes | App Functionality (sign-in) | Firebase Authentication, `mobile/src/native.ts` |
| Identifiers → User ID | Yes | Yes | App Functionality (which devices are the user's) | relay `devices` and `pairings` records, `gateway/phone-relay/src/firebase.js` |
| Identifiers → Device ID | Yes | Yes | App Functionality (the phone's own id and its notification token) | `gateway/phone-relay/src/routing.js` `hello()` |

The "last connected" time of each device is kept with its record so the phone can say "Your computer is
offline since …"; it is part of the device record above, not a separate type.

## Not collected

Name, phone number, address, location, contacts, health, financial info, browsing or search history,
purchases, photos or videos (previews stay on the phone), audio, user content (sealed), diagnostics or
crash data, usage data, sensitive info.

## Deletion

More → Delete my account deletes the sign-in and the relay's records
(`gateway/phone-relay/src/routing.js` `deleteAccount`). Open points: `OPEN_QUESTIONS.md`.
