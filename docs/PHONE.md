# Alphonso on your phone

The Alphonso app lets you check on your computer's work from your phone: chat with Alphonso,
see the requests on the board, approve or reject a step that waits for you, and stop, carry
on or cancel a request. Your computer still does all the work and makes every decision; the
phone only asks.

This is phase 1. Anything else (editing plans, Miya Studio, settings) stays on the computer
for now; the More tab lists it as "On your computer for now".

## What you need

- Alphonso on your computer, open, with the same account signed in as on the phone.
- An iPhone with iOS 16.4 or later, or an Android phone with Android 8.0 or later.
- An internet connection on both. They don't need to be on the same Wi-Fi.

## Install

During testing the app comes as a test build: TestFlight on an iPhone, and an email invite
from Firebase App Distribution on Android. Open the invite on the phone and follow it. It
will be in the App Store and Google Play later.

## Sign in

1. **On the computer:** Settings → Runtime → Remote Access → **Phones** → **Sign in to pair a
   phone**. Your browser opens the Alphonso sign-in page; sign in with Google or an email link.
2. **On the phone:** open the app and sign in with the same account: Apple, Google, or your
   email address (the app sends a link; open it on the phone).

## Pair

1. On the computer, in Phones, choose **Pair a phone**. A QR code appears. It works once,
   for 10 minutes.
2. On the phone, tap **Scan the QR code** and point the camera at it.
   If you can't scan, choose **Copy the code** on the computer, send the code to your phone
   in a way you trust, and paste it in the app's **Pair** box.
3. The phone appears in the computer's list with when it was last used.

A code from another app is refused, and the app says where to find the right one.

## What you can do from the phone

- **Chat:** ask Alphonso anything; bigger requests are planned by Jose on the computer, as in
  the desktop Chat.
- **Requests:** the board in one column. Approve or reject a step that waits for you; Stop a
  running request; Carry on one that was cut off; Cancel one; run or cancel a plan that waits.
- **Notifications:** when a step or plan waits for you, a request finishes or fails, or a
  review needs you. The text is opened only on your phone; Apple, Google and the relay see
  only "New activity".
  - **Approve** and **Reject** work right from the notification.
  - A step that **spends money, sends or publishes, or deletes** shows only **Open**: you
    approve it inside the app, after Face ID or your fingerprint.

## Face ID and fingerprint

The app asks for Face ID or your fingerprint when it opens. You can switch that off in
More. Approving a step that spends, sends or deletes always asks, whatever that setting.

## When your computer is off

The app says "Your computer is offline since 14:02." and shows what it last knew. Buttons
that need the computer are off until it is back. Nothing is lost: requests wait on the
computer as usual.

## Privacy

Messages between your phone and your computer are encrypted on one device and opened only
on the other. Alphonso's relay passes them on without being able to read them, and keeps
no content. Your computer refuses any device it hasn't paired, and only devices signed in
to your account can reach it.

## Remove a phone or switch phone access off

On the computer, Settings → Runtime → Remote Access → Phones:

- **Remove** a phone: it can't reach the computer again.
- Untick **Phone access** to stop all phones until you tick it again.

With no phone paired and no pairing code showing, the computer doesn't connect to the relay
at all.
