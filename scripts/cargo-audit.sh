#!/usr/bin/env bash
# Runs cargo-audit against src-tauri/Cargo.lock with warnings denied,
# ignoring exactly the advisory IDs listed in .cargo/audit.toml.
#
# The IDs are passed explicitly instead of relying on cargo-audit finding the
# config file itself, so CI and the weekly security-audit workflow apply the
# same reviewed list no matter which directory cargo-audit resolves.
set -euo pipefail

cd "$(dirname "$0")/.."

config=".cargo/audit.toml"
if [ ! -f "$config" ]; then
  echo "cargo-audit.sh: $config not found" >&2
  exit 1
fi

args=()
while IFS= read -r id; do
  args+=(--ignore "$id")
done < <(grep -oE '^[[:space:]]*"RUSTSEC-[0-9]{4}-[0-9]{4}"' "$config" | grep -oE 'RUSTSEC-[0-9]{4}-[0-9]{4}')

echo "cargo-audit.sh: ignoring $(( ${#args[@]} / 2 )) reviewed advisories listed in $config"
cargo audit --file src-tauri/Cargo.lock --deny warnings "${args[@]}"
