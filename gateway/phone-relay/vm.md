# Running the phone relay

The relay runs on Google Cloud's free e2-micro VM (owner, 2026-11-01). Cloud Run was the
first plan, but a computer keeps its relay connection open, and Cloud Run counts an
instance with any open WebSocket as busy: about US$45 a month with one computer on all day,
against about US$3.65 (the fixed IP address) on the free VM.

## What is deployed

- Project `alphonsoecosystem`, VM `phone-relay` (e2-micro, us-east1-b, 20 GB standard disk,
  Debian 12), fixed IP `phone-relay-ip`.
- Address `https://relay.alphonsoecosystem.app`: an A record in Netlify DNS, where the
  domain's DNS is hosted (the domain is registered at Porkbun). The apps' `PHONE_RELAY_URL`
  build setting is `wss://relay.alphonsoecosystem.app/link`.
- Caddy (`caddy:2.11.7-alpine`) in front of the relay gets and renews the HTTPS certificate.
- Only ports 80 and 443 are open; there is no SSH port. The boot log:
  `gcloud compute instances get-serial-port-output phone-relay --zone us-east1-b`.
- Images in Artifact Registry `phone-relay` (us-east1); only the last 2 are kept.
- A budget of 14 CAD a month (the billing account is in CAD), emailing at 50%, 90% and
  100%. It warns; it doesn't stop anything.

## Cost guards

- One VM, inside the free tier; the IP address is the only fixed charge.
- The desktop connects only while a phone is paired and phone access is on, or while a
  pairing code is showing (`startPhoneLink` in `src/services/phone/phoneLink.ts`).
- Per-device limits in `src/limits.js` (200 MB a day) cap traffic; outbound traffic past
  1 GB a month is billed.
- Previews (phone app phase 2) are the large traffic: a one-minute phone-sized video is about
  6 MB, about 11 MB through the relay (base64 inside a sealed base64 message), so the free
  1 GB a month is roughly 90 such previews. The relay tells each device its limits when it
  connects, and the computer stops sending previews with a tenth of the day left.

## Set up or change (the owner's account)

    GCP_ACCOUNT=… GCP_PROJECT_ID=alphonsoecosystem GCP_REGION=us-east1 GCP_ZONE=us-east1-b \
    RELAY_DOMAIN=relay.alphonsoecosystem.app BILLING_ACCOUNT=… BUDGET=14CAD \
    bash gateway/phone-relay/vm/provision.sh

Safe to run again. Then point the domain's A record at the IP it prints.

## Deploy

    GCP_ACCOUNT=… GCP_PROJECT_ID=alphonsoecosystem GCP_REGION=us-east1 GCP_ZONE=us-east1-b \
    RELAY_DOMAIN=relay.alphonsoecosystem.app bash gateway/phone-relay/vm/deploy.sh

It tests, builds with Cloud Build (`vm/cloudbuild.yaml`, logs to Cloud Logging only),
points the VM at the new image, restarts it (about a minute) and waits for `/healthz`.
First deployed 2026-11-01: `/healthz` answered 200, and a WebSocket hello with a bad token
was closed with 4401.

The GitHub workflow `deploy-phone-relay.yml` runs the same script once Workload Identity
Federation is set up for this repository (not yet).
