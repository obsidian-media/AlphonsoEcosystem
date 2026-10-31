# Deploying the phone relay

Not deployed yet: this waits for the Obsidian Media Google Cloud project.

## One-time setup (the owner)

1. A Google Cloud project with billing, and Firebase added to it: Authentication (Apple,
   Google, email link), Firestore (native mode), Cloud Messaging. Upload the Apple push
   key (APNs) in Firebase → Project settings → Cloud Messaging.
2. Two service accounts:
   - the relay's own (`PHONE_RELAY_RUN_AS`): Firebase Authentication Admin, Cloud
     Datastore User, Firebase Cloud Messaging API Admin. Nothing else.
   - the deployer (`GCP_DEPLOY_SERVICE_ACCOUNT`): Cloud Run Admin, Cloud Build Editor,
     Artifact Registry Writer, Service Account User on the relay's account.
3. Workload Identity Federation for this GitHub repository, allowed to act as the
   deployer only (`GCP_WIF_PROVIDER`).
4. Repository variables: `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_WIF_PROVIDER`,
   `GCP_DEPLOY_SERVICE_ACCOUNT`, `PHONE_RELAY_SERVICE`, `PHONE_RELAY_RUN_AS`.

## Deploy

Actions → "Deploy phone relay to Cloud Run" → Run workflow. It tests, deploys with one
instance, session affinity and a one-hour request limit (clients reconnect after it), then
checks `/healthz` answers 200.

## Record after the first deploy

- Service name, region and address (the address is the app's `PHONE_RELAY_URL` build
  setting):
- Monthly cost estimate:
