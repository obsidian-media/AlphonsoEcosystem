#!/bin/bash
# Sets up the phone relay on Google Cloud's free e2-micro VM (owner, 2026-11-01: the free
# VM instead of Cloud Run, which bills a whole CPU while any computer stays connected).
# Safe to run again: each step skips what already exists.
#
# Usage (every value from the environment, nothing about the project written here):
#   GCP_ACCOUNT=you@example.com GCP_PROJECT_ID=my-project GCP_REGION=us-east1 \
#   GCP_ZONE=us-east1-b RELAY_DOMAIN=relay.example.app BILLING_ACCOUNT=XXXXXX-XXXXXX-XXXXXX \
#   BUDGET=14CAD bash gateway/phone-relay/vm/provision.sh
#
# What it makes:
# - the relay's service account (Firebase sign-in checks, Firestore, Cloud Messaging,
#   reading its own image; nothing else) and a builder account for Cloud Build;
# - an image store that keeps only the last 2 relay images;
# - a fixed IP address, a firewall rule for ports 80 and 443 only (no SSH);
# - the e2-micro VM on a standard disk (the free kind), running startup.sh;
# - a monthly budget that emails the billing admins at 50%, 90% and 100%. BUDGET carries
#   the billing account's own currency (a USD budget on a CAD account is refused).
# The free tier: one e2-micro in us-west1, us-central1 or us-east1, 30 GB standard disk,
# 1 GB outbound a month from North America. The fixed IP address is billed.
set -euo pipefail

for name in GCP_ACCOUNT GCP_PROJECT_ID GCP_REGION GCP_ZONE RELAY_DOMAIN BILLING_ACCOUNT BUDGET; do
  if [ -z "${!name:-}" ]; then echo "Set $name first." >&2; exit 1; fi
done
case "$GCP_REGION" in us-west1|us-central1|us-east1) ;; *)
  echo "The free e2-micro is offered only in us-west1, us-central1 and us-east1." >&2; exit 1;;
esac

HERE="$(cd "$(dirname "$0")" && pwd)"
G=(--account="$GCP_ACCOUNT" --project="$GCP_PROJECT_ID")
RUN_AS="phone-relay@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
BUILDER="phone-relay-builder@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
REPO="phone-relay"
VM="phone-relay"
IP_NAME="phone-relay-ip"
CADDY_IMAGE="caddy:2.11.7-alpine"

echo "== Services"
gcloud services enable compute.googleapis.com artifactregistry.googleapis.com \
  cloudbuild.googleapis.com billingbudgets.googleapis.com "${G[@]}"

echo "== Service accounts"
gcloud iam service-accounts describe "$RUN_AS" "${G[@]}" >/dev/null 2>&1 ||
  gcloud iam service-accounts create phone-relay --display-name "Phone relay (runs the relay)" "${G[@]}"
gcloud iam service-accounts describe "$BUILDER" "${G[@]}" >/dev/null 2>&1 ||
  gcloud iam service-accounts create phone-relay-builder --display-name "Phone relay builder (Cloud Build)" "${G[@]}"
for role in roles/firebaseauth.admin roles/datastore.user roles/firebasecloudmessaging.admin roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" --account="$GCP_ACCOUNT" \
    --member "serviceAccount:$RUN_AS" --role "$role" --condition=None --quiet >/dev/null
done
# objectViewer: Cloud Build reads the uploaded source from the project's build bucket.
for role in roles/logging.logWriter roles/storage.objectViewer; do
  gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" --account="$GCP_ACCOUNT" \
    --member "serviceAccount:$BUILDER" --role "$role" --condition=None --quiet >/dev/null
done

echo "== Image store (keeps the last 2 images)"
gcloud artifacts repositories describe "$REPO" --location "$GCP_REGION" "${G[@]}" >/dev/null 2>&1 ||
  gcloud artifacts repositories create "$REPO" --repository-format docker \
    --location "$GCP_REGION" --description "Phone relay images" "${G[@]}"
gcloud artifacts repositories set-cleanup-policies "$REPO" --location "$GCP_REGION" \
  --policy "$HERE/cleanup-policy.json" --no-dry-run "${G[@]}" >/dev/null
gcloud artifacts repositories add-iam-policy-binding "$REPO" --location "$GCP_REGION" "${G[@]}" \
  --member "serviceAccount:$BUILDER" --role roles/artifactregistry.writer >/dev/null
gcloud artifacts repositories add-iam-policy-binding "$REPO" --location "$GCP_REGION" "${G[@]}" \
  --member "serviceAccount:$RUN_AS" --role roles/artifactregistry.reader >/dev/null

echo "== Fixed IP address and firewall"
gcloud compute addresses describe "$IP_NAME" --region "$GCP_REGION" "${G[@]}" >/dev/null 2>&1 ||
  gcloud compute addresses create "$IP_NAME" --region "$GCP_REGION" "${G[@]}"
IP="$(gcloud compute addresses describe "$IP_NAME" --region "$GCP_REGION" "${G[@]}" --format 'value(address)')"
gcloud compute firewall-rules describe phone-relay-web "${G[@]}" >/dev/null 2>&1 ||
  gcloud compute firewall-rules create phone-relay-web --network default --direction INGRESS \
    --allow tcp:80,tcp:443 --target-tags phone-relay --source-ranges 0.0.0.0/0 "${G[@]}"

echo "== The VM"
if ! gcloud compute instances describe "$VM" --zone "$GCP_ZONE" "${G[@]}" >/dev/null 2>&1; then
  gcloud compute instances create "$VM" --zone "$GCP_ZONE" "${G[@]}" \
    --machine-type e2-micro \
    --image-family debian-12 --image-project debian-cloud \
    --boot-disk-type pd-standard --boot-disk-size 20GB \
    --address "$IP" --tags phone-relay \
    --service-account "$RUN_AS" --scopes cloud-platform \
    --shielded-secure-boot --shielded-vtpm --shielded-integrity-monitoring \
    --metadata "relay-domain=$RELAY_DOMAIN,caddy-image=$CADDY_IMAGE,block-project-ssh-keys=TRUE" \
    --metadata-from-file "startup-script=$HERE/startup.sh"
else
  gcloud compute instances add-metadata "$VM" --zone "$GCP_ZONE" "${G[@]}" \
    --metadata "relay-domain=$RELAY_DOMAIN,caddy-image=$CADDY_IMAGE" \
    --metadata-from-file "startup-script=$HERE/startup.sh"
fi

echo "== Budget"
if ! gcloud billing budgets list --billing-account "$BILLING_ACCOUNT" --account="$GCP_ACCOUNT" --billing-project="$GCP_PROJECT_ID" \
     --format 'value(displayName)' | grep -qx "Alphonso phone relay"; then
  gcloud billing budgets create --billing-account "$BILLING_ACCOUNT" --account="$GCP_ACCOUNT" --billing-project="$GCP_PROJECT_ID" \
    --display-name "Alphonso phone relay" --budget-amount "$BUDGET" \
    --filter-projects "projects/$(gcloud projects describe "$GCP_PROJECT_ID" --account="$GCP_ACCOUNT" --format 'value(projectNumber)')" \
    --threshold-rule percent=0.5 --threshold-rule percent=0.9 --threshold-rule percent=1.0
fi

echo
echo "Done. Point $RELAY_DOMAIN (an A record) at $IP, then deploy with deploy.sh."
