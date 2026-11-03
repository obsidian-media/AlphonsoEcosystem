#!/bin/bash
# Runs as root on every boot of the phone relay's VM (its startup-script metadata).
# Starts the relay container and Caddy in front of it. Caddy gets and renews the HTTPS
# certificate for the relay's address by itself and keeps it in a Docker volume.
# Everything it needs comes from the VM's metadata:
#   relay-domain  the relay's address, for example relay.example.app
#   relay-image   the relay image to run (set by each deploy)
#   caddy-image   the Caddy image, pinned
set -euo pipefail

meta() {
  curl -sf -H 'Metadata-Flavor: Google' \
    "http://metadata.google.internal/computeMetadata/v1/instance/attributes/$1" || true
}

DOMAIN="$(meta relay-domain)"
IMAGE="$(meta relay-image)"
CADDY="$(meta caddy-image)"
if [ -z "$DOMAIN" ] || [ -z "$CADDY" ]; then
  echo "phone-relay: relay-domain or caddy-image metadata missing; nothing started." >&2
  exit 1
fi

# The free e2-micro has 1 GB of memory: a swap file keeps an update from running it out.
if [ ! -f /swapfile ]; then
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
swapon /swapfile 2>/dev/null || true

if ! command -v docker >/dev/null 2>&1; then
  apt-get update -q && DEBIAN_FRONTEND=noninteractive apt-get install -yq docker.io
fi
systemctl enable --now docker

docker network inspect relay >/dev/null 2>&1 || docker network create relay

if [ -n "$IMAGE" ]; then
  # Sign in to the image store with the VM's own service account (no key files).
  TOKEN="$(curl -sf -H 'Metadata-Flavor: Google' \
    http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token \
    | python3 -c 'import sys, json; print(json.load(sys.stdin)["access_token"])')"
  echo "$TOKEN" | docker login -u oauth2accesstoken --password-stdin "https://${IMAGE%%/*}"
  docker pull "$IMAGE"
  docker rm -f relay >/dev/null 2>&1 || true
  docker run -d --name relay --network relay --restart unless-stopped \
    --memory 400m -e PORT=8080 "$IMAGE"
else
  echo "phone-relay: no relay-image yet; Caddy starts alone." >&2
fi

mkdir -p /opt/phone-relay
printf '%s {\n\treverse_proxy relay:8080\n}\n' "$DOMAIN" > /opt/phone-relay/Caddyfile
docker rm -f caddy >/dev/null 2>&1 || true
docker run -d --name caddy --network relay --restart unless-stopped \
  -p 80:80 -p 443:443 \
  -v /opt/phone-relay/Caddyfile:/etc/caddy/Caddyfile:ro \
  -v caddy_data:/data -v caddy_config:/config \
  "$CADDY"

# Old relay images left on the disk by earlier deploys.
docker image prune -af --filter "until=24h" >/dev/null 2>&1 || true
echo "phone-relay: started for $DOMAIN"
