#!/bin/bash
# Builds the phone relay with Cloud Build, points the VM at the new image and restarts it
# (about a minute without the relay; phones and computers reconnect by themselves).
# Then waits until https://$RELAY_DOMAIN/healthz answers 200.
#   GCP_ACCOUNT=… GCP_PROJECT_ID=… GCP_REGION=us-east1 GCP_ZONE=us-east1-b \
#   RELAY_DOMAIN=relay.example.app bash gateway/phone-relay/vm/deploy.sh
set -euo pipefail

for name in GCP_ACCOUNT GCP_PROJECT_ID GCP_REGION GCP_ZONE RELAY_DOMAIN; do
  if [ -z "${!name:-}" ]; then echo "Set $name first." >&2; exit 1; fi
done

HERE="$(cd "$(dirname "$0")" && pwd)"
G=(--account="$GCP_ACCOUNT" --project="$GCP_PROJECT_ID")
BUILDER="projects/${GCP_PROJECT_ID}/serviceAccounts/phone-relay-builder@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
VERSION="$(git -C "$HERE" rev-parse --short=12 HEAD)$(git -C "$HERE" diff --quiet -- "$HERE/.." || echo -dirty)"
IMAGE="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/phone-relay/relay:${VERSION}"

echo "== Testing"
npm ci --prefix "$HERE/.." --no-audit --no-fund
node --test "$HERE/../src/relay.test.mjs" "$HERE/../src/server.test.mjs" "$HERE/../src/pushMessage.test.mjs"

echo "== Building $IMAGE"
gcloud builds submit "$HERE/.." --config "$HERE/cloudbuild.yaml" --substitutions "_IMAGE=$IMAGE" \
  --region "$GCP_REGION" --service-account "$BUILDER" \
  --default-buckets-behavior regional-user-owned-bucket "${G[@]}"

echo "== Restarting the VM on the new image"
gcloud compute instances add-metadata phone-relay --zone "$GCP_ZONE" "${G[@]}" --metadata "relay-image=$IMAGE"
gcloud compute instances reset phone-relay --zone "$GCP_ZONE" "${G[@]}"

echo "== Waiting for https://$RELAY_DOMAIN/healthz"
for _ in $(seq 1 60); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "https://$RELAY_DOMAIN/healthz" || true)"
  if [ "$code" = "200" ]; then echo "The relay answers at https://$RELAY_DOMAIN"; exit 0; fi
  sleep 5
done
echo "The relay didn't answer in 5 minutes. Its boot log:" >&2
gcloud compute instances get-serial-port-output phone-relay --zone "$GCP_ZONE" "${G[@]}" | grep -i "phone-relay\|startup-script" | tail -20 >&2
exit 1
