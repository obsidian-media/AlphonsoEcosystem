# Phone relay

Connects the Alphonso phone app to the user's computer from anywhere. Run by Obsidian
Media on Google Cloud (Cloud Run), with Firebase for sign-in, the pairing records and
notifications. Design: `docs/superpowers/specs/2026-10-31-alphonso-mobile-design.md`.

## What it does

- A computer and a phone each open a WebSocket to `/link` and say hello with their
  Firebase sign-in token. A device belongs to the account that first connected it.
- A phone is paired with one computer of the same account (`POST /pair`, done from the
  phone after scanning the computer's QR code). `DELETE /pair/:phoneDeviceId` unpairs it
  and drops it at once.
- Frames go only between a phone and the computer it is paired with. When the computer
  isn't connected, the phone is told it is offline and since when.
- The computer can ask for a notification on its phone; the relay hands the sealed text
  to Firebase Cloud Messaging, and the phone opens it with its own key.

## What it can't read

Every frame and notification is sealed between the two devices (libsodium `crypto_box`);
the relay never has the keys. It stores only, in Firestore:

- `devices/{deviceId}`: account id, computer or phone, last seen, the phone's
  notification token.
- `pairings/{phoneDeviceId}`: account id, the computer it is paired with, when.

No message, file name, request, cost or key is stored or logged.

## Limits (`src/limits.js`)

6 MB of sealed text per frame (a 4 MB message), 60 frames a second and 200 MB a day per
device. Over a limit, the frame is refused with a reason (`too_large`, `too_fast`,
`daily_limit`).

## One instance for now

Connections live in the relay's memory, so a phone and its computer must reach the same
instance: Cloud Run runs it with at most one instance. Running several needs a shared
message bus between instances (for example Pub/Sub or Memorystore); that comes when the
number of users needs it.

## Run it

- Tests: `node --test gateway/phone-relay/src/relay.test.mjs gateway/phone-relay/src/server.test.mjs`
  (after `npm ci --prefix gateway/phone-relay`).
- Locally against a Firebase project: `GOOGLE_APPLICATION_CREDENTIALS` set by `gcloud auth
  application-default login`, then `node src/server.js` (port `PORT`, default 8080).
- Deploy: `.github/workflows/deploy-phone-relay.yml`; setup in `cloudrun.md`.
