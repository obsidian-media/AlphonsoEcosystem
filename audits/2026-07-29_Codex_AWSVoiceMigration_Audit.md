# AWS Cloud Voice migration audit

**Date:** 2026-07-29  
**Scope:** Migration preparation for `voice/cloud-backend` from Railway to AWS.

## Confirmed facts

- AWS account `892748149559` was authenticated successfully in the host AWS
  CLI context. The current identity is the account root user; it must be
  replaced with a least-privilege deployment identity before normal operation.
- Read-only inventory initially found no ECR repositories or ECS clusters in
  either `ca-central-1` or `us-east-1`.
- Cloud Voice is a stateless FastAPI service. It already exposes `/health` and
  configuration-sensitive `/ready`; Railway currently launches it with Uvicorn.
- The service depends on Supabase, NVIDIA NIM, and optional external Piper
  endpoints. None are being migrated in phase one.

## Delivered preparation

- Added a non-root Python 3.11 container image with health checking.
- Added a Docker ignore list that excludes test files and environment files.
- Added the operator runbook at `docs/deployment/AWS_VOICE_MIGRATION.md`.

## Provisioned (2026-07-30)

- Created ECR repository `alphonso-cloud-voice` in `ca-central-1` with immutable
  tags, scan-on-push, and lifecycle rules retaining 20 `sha-*` images and
  deleting untagged images after seven days.
- Requested ACM DNS-validated certificate
  `arn:aws:acm:ca-central-1:892748149559:certificate/fee4e977-1228-46f0-9947-c5a234937dbb`
  for `voice.obsidianmedia.online`; validation is pending the Alibaba Cloud
  CNAME record.
- Created ECS cluster `alphonso-cloud-voice`, task execution and application
  roles, and CloudWatch log group `/ecs/alphonso-cloud-voice` with 30-day
  retention.
- Created ALB security group `sg-0d0f9566366534d0a` with public TCP 80/443
  ingress and task security group `sg-05b41fad4708f7305` with TCP 8080 ingress
  only from the ALB group.
- Created IP target group
  `arn:aws:elasticloadbalancing:ca-central-1:892748149559:targetgroup/alphonso-cloud-voice/bb4d20c36fce8ec4`
  on port 8080, with `/ready` health checks. It has no registered targets.
- Confirmed the ACM validation CNAME resolves publicly to the requested AWS
  target. ACM subsequently issued the certificate, valid through 2027-02-12.
- Created internet-facing Application Load Balancer
  `alphonso-cloud-voice-1113067864.ca-central-1.elb.amazonaws.com` with HTTPS
  forwarding on 443 and HTTP-to-HTTPS redirect on 80. Alibaba Cloud DNS still
  needs a `voice` CNAME to that load-balancer hostname.

## Not performed (as of 2026-07-30)

- No ECS service/task, Secrets Manager secret, DNS record, or Railway setting
  was created, modified, or deleted.
- **Superseded:** by 2026-07-31 an ECS task/service and Secrets Manager
  entries were created — see "Railway migration evidence (2026-07-31)" and
  "Remaining deployment blockers" below, which record secret writes and a
  running ECS task. This section is a point-in-time snapshot, not a standing
  claim.

## Credit-constrained operation

- Owner specified that the migration must use free-trial credit only. The first
  service will therefore use one smallest valid Fargate task, public-subnet
  egress secured by security group (no NAT Gateway), 30-day log retention, and
  no additional managed services unless essential.
- A read-only Cost Explorer query was denied because Cost Explorer is not
  enabled on the account. It was not enabled by this work. The ALB is the only
  currently active recurring-cost resource; no Fargate task has started.
- No secret was read, copied, or written.
- The HTTPS ALB is a live recurring-cost resource. No ECS Fargate compute,
  NAT Gateway, or other workload resource has started.

## Railway migration evidence (2026-07-31)

- Railway Cloud Voice was identified as production service `precious-enjoyment`
  in project `Alphonso`; its `/health` and `/ready` endpoints both returned
  HTTP 200. The Railway Farsi Piper `/health` endpoint also returned HTTP 200.
  Railway is therefore retained as the working rollback target.
- Copied `NVIDIA_API_KEY` and `PIPER_SERVICE_TOKEN` directly from that Railway
  service to two AWS Secrets Manager entries. Values were never displayed.
  The ECS execution role has an inline policy allowing `GetSecretValue` for
  those two entries only.
- The Railway service contains a deprecated Supabase service-role key, but no
  `SUPABASE_ANON_KEY`. The AWS-targeted hardened Cloud Voice code requires the
  anonymous key plus the caller's JWT/RLS path and must not regress to the
  service-role design.

## Progress update (2026-07-31)

- Docker Desktop 29.6.2 is installed and its Linux engine was verified with
  `docker version`. The actual binary location is `C:\Program Files\Docker`,
  rather than the requested D: path. Docker's helper directory must be on
  `PATH` for the current shell because `docker-credential-desktop.exe` is not
  otherwise discovered.
- The owner-provided Supabase publishable key was saved directly as
  `alphonso/cloud-voice/supabase-anon-key`. The ECS execution role's existing
  inline policy now allows `GetSecretValue` for that secret plus the NVIDIA
  and Piper secrets only. Values were not printed, committed, or copied from
  Railway's service-role configuration.
- The first real Docker build exposed an image portability defect: the current
  `python:3.11-slim` base already includes a `voice` group, causing an
  unconditional `groupadd` to fail. `voice/cloud-backend/Dockerfile` now
  creates the group and account only if absent. A local build passed; the
  container ran as UID 999 and `/health` returned `{"status":"ok"}`.

## Remaining deployment blockers

- **Staging deployment verified (2026-07-31):** committed Dockerfile source
  `db692db7ef55` was pushed to ECR as immutable
  `sha-db692db7ef55` (digest
  `sha256:01726919ae85acb82e20da2a6b11b52ea389e6ac621248a8fbb0eb582bd75ebd`).
  ECS task definition `alphonso-cloud-voice:1` and service
  `cloud-voice-staging` use one 0.5 vCPU / 1 GB Fargate task, public-subnet
  egress without NAT, circuit-breaker rollback, and ALB-only inbound traffic.
  The task reached `RUNNING`, its target reached `healthy`, and public HTTPS
  `/health` and `/ready` returned success with NIM, Supabase enrollment,
  Magpie, and Farsi Piper readiness all true.
- Live `/ready`, real iPhone enrollment, English/Farsi synthesis, rollback,
  and least-privilege CI deployment identity remain required before H3 can be
  marked complete. `AlphonsoCloudVoiceDeployRole` was created with repository,
  ECS, pass-role, and deployment-health permissions scoped to Cloud Voice, but
  its validation showed that AWS root cannot assume roles. A non-root
  IAM/Identity Center principal must be established and permitted to assume it;
  no new long-lived credential was created or exposed. Railway remains
  unchanged as rollback.

## Blocking decisions

The region, default-VPC subnets, hostname, certificate, and billable-resource
approval are resolved: `ca-central-1`, `voice.obsidianmedia.online`, and the
issued ACM certificate. The image, Secrets Manager values, task definition,
and staging service are now provisioned. Real-device acceptance, rollback
exercise, observability alarms, and a least-privilege deployment identity are
still required before endpoint cutover.

## iOS AWS test-build preparation (2026-08-01)

- Changed the bundled iOS `CloudVoiceEndpoint` to the live AWS HTTPS endpoint
  `https://voice.obsidianmedia.online/v1/voice/respond`.
- Corrected endpoint precedence in `VoiceCloudService`: a valid endpoint
  selected in Settings and persisted in `UserDefaults` now wins over the bundle
  value. Previously, the bundle value always won, making a Railway rollback
  setting ineffective after relaunch.
- This remains an acceptance-build change until the GitHub-hosted signed iOS
  workflow uploads a build and the paired iPhone proves enrollment plus English
  and Farsi voice turns. Railway is not modified by this change.

## CI dependency remediation (2026-08-01)

- The manually dispatched Windows installer CI run initially did not package
  because Cargo audit found new `RUSTSEC-2026-0221` against transitive
  `event-listener` 5.4.1. Rust tests, formatting, and Clippy had passed.
- Dependency tracing found the event-listener path through `zbus` to Tauri's
  notification and opener plugins. `cargo update -p event-listener --dry-run`
  found compatible patched version 5.4.2; `Cargo.lock` was updated to it rather
  than suppressing the advisory. The exact CI audit command subsequently
  passed locally. A fresh GitHub workflow run is required for the Windows
  installer artifact.
- The rerun cleared Cargo audit, then failed in an unrelated existing test:
  `meta_appsecret_proof_returns_none_without_secret`. The cause was a
  process-global `META_APP_SECRET` mutation racing the parallel HMAC test.
  All Meta environment tests now share a mutex and restore the caller's
  original variable value with RAII. A final CI run must pass the complete Rust
  suite before the Windows installer artifact can be considered built.

## Final build evidence (2026-08-01)

- GitHub Actions run `30718886085` passed from commit `2c89cbb6ea20a1c39aaef86d1f360083f5064529`.
  It successfully archived, exported, and uploaded the signed iOS companion to
  TestFlight, with retained artifact `AlphonsoCompanion-111` (17,516,040 bytes).
- GitHub Actions run `30718886862` passed from the same commit. Its complete
  CI matrix passed, including Rust tests, Clippy, Cargo audit, the iOS simulator
  build, and the Windows Tauri packaging job. The retained Windows NSIS
  installer artifact is
  `Alphonso-2c89cbb6ea20a1c39aaef86d1f360083f5064529-x64-setup` (6,980,922
  bytes).
- The source/build delivery is complete. Cloud Voice remains **PARTIAL** until
  the paired iPhone completes real-device enrollment and English plus Farsi
  voice acceptance against the AWS endpoint.

## Real-device acceptance session (2026-09-08/09, Claude Code)

Real-device testing finally happened this session and found the endpoint had
never actually completed a real voice round trip end-to-end — five
independent, real bugs, each confirmed with direct evidence (CloudWatch logs,
`pg_policy`, `aws ecs describe-services`, live curl) before being fixed, not
assumed. Boardroom `ledger/tasks/068-alphonsocompanion-cloud-voice-fixes.md`
has the fuller narrative for the first four; this log is the technical
record for all five plus what's still open.

1. **Stale deployment.** ECS had been running a task definition from
   2026-08-01 unchanged for 5+ weeks. Fixed by adding a permanent OIDC-based
   GitHub Actions deploy pipeline (`.github/workflows/deploy-cloud-voice.yml`,
   PR #240) so this can't recur silently.
2. **Cloud Voice hidden in the iOS UI.** Hardcoded `cloudVoicePaused = true`
   in `VoiceView.swift` since a July 22 unrelated fix. Fixed, PR #239.
3. **Device enrollment silently broken.** Supabase's `voice_devices` table
   had RLS enabled with read/revoke policies but no insert policy at all.
   Fixed via migration `add_voice_devices_insert_policy`.
4. **Email delivery rate-limited.** Supabase's default shared email service
   hit its hourly quota. Fixed via custom SMTP (Resend) + added `{{ .Token }}`
   to the confirm-signup template for the app's typed-code fallback.
5. **`voice_policy.json` never actually shipped in the container image**
   (found *after* fixing 1-4, when a real request still 500'd). The
   Dockerfile's build context was `voice/cloud-backend/`, which never
   included `voice/shared/` — so every real `/v1/voice/respond` call has
   crashed with `FileNotFoundError: /shared/voice_policy.json` since the
   original AWS migration. All prior "confirmed working" evidence for this
   endpoint (including the 5 pytest files referenced elsewhere) was against
   mocked responses; nothing had ever proven a real image could serve this
   endpoint at all. Fixed by moving the Docker build context to `voice/` so
   `shared/` can be copied alongside `app/`, with `voice_policy.py` resolving
   the policy path against both the container layout and the local/CI
   checkout layout (PR #243, merged + redeployed).

### A sixth issue found immediately after: opaque 503s with no diagnosable cause

Once bug 5 was fixed, real requests started reaching `NvidiaClient`, but
started failing with a bare `503 Service Unavailable` and nothing in
CloudWatch to explain why — `main.py`'s `settings.is_ready` config-check
branch and every HTTP-error/timeout/network-error path inside
`nvidia.py`'s `NvidiaClient.complete()`/`synthesize()`/`_raise_for_status()`
all silently discarded the real cause and raised an identical generic
`NvidiaError` (503). Fixed by adding `logging.error()` at each of those
points, logging the real upstream status code + response body (or the
exception), no secrets touched (PR #244, merged + redeployed).

### What that logging immediately revealed: the configured chat model is retired

With real error detail now visible, the actual cause was:

```
NVIDIA chat/completions returned 410: {"type":"about:blank","title":"Gone",
"status":410,"detail":"The model 'meta/llama-3.1-8b-instruct' has reached its
end of life on 2026-08-26T09:00:00Z and is no longer available."}
```

`NVIDIA_NIM_MODEL` was still set to `meta/llama-3.1-8b-instruct`, retired by
NVIDIA on 2026-08-26 - **over two weeks before this session**, and entirely
independent of bugs 1-5 above (it would have failed identically even on a
freshly-fixed image). This had been masked the whole time by bug 5 (the
container never even got far enough to make the NVIDIA call before tonight).

**Attempted fix, not yet confirmed working:** registered ECS task definition
revision 7 with `NVIDIA_NIM_MODEL` changed to `meta/llama-3.3-70b-instruct`
(run manually via `aws ecs register-task-definition` +
`aws ecs update-service --force-new-deployment` - the auto-mode classifier
blocked Claude Code from running these directly, consistent with earlier
IAM-policy edits this session, so Shayan ran them). **The very next real
request against revision 7 got the exact same 410, with the exact same
`2026-08-26T09:00:00Z` end-of-life timestamp, just substituting the new
model's name into the identical message.** That specific timestamp match
across two different model IDs strongly suggests NVIDIA sunset an entire
tier/generation of models on that one date (or the `integrate.api.nvidia.com`
API surface itself changed) rather than retiring these two models
individually - a live web check of NVIDIA's own docs (`docs.api.nvidia.com`)
still lists `integrate.api.nvidia.com` as current with no deprecation notice,
which doesn't fully square with what's actually happening live. This needs
either a real model list pulled directly from NVIDIA (e.g. `GET
{NVIDIA_NIM_BASE_URL}/models` with the real API key, which nobody has done
yet this session) or a support ticket with NVIDIA, not more guessing at model
names one at a time.

### Deferred / open work (real, unresolved, next session should start here)

- **Blocking:** find and confirm a real, currently-live NVIDIA NIM chat model
  ID against this account's actual API key (ideally via `GET /v1/models` on
  `NVIDIA_NIM_BASE_URL`, not guessing) and update `NVIDIA_NIM_MODEL` again.
  Until this is done, `/v1/voice/respond` will 410 on every single call
  regardless of any other fix.
- Once a working model is confirmed: the original acceptance goal (English +
  Farsi voice turns from the paired iPhone against the AWS endpoint) is still
  unmet, and the real end-to-end latency (`timings_ms` in the response) has
  still never been measured on a genuine successful call.
- Tonight's two ECS infra edits (Secrets Manager-referencing task definition
  revisions 6 and 7) were done ad hoc via direct AWS CLI, not through the
  GitHub Actions deploy pipeline (which only touches the container image, not
  task-definition environment variables) and not through IaC. `NVIDIA_NIM_MODEL`
  living only in a manually-registered task definition, invisible to the repo,
  is itself worth fixing once a stable model is found - e.g. move it into the
  deploy workflow's render-task-definition step, or into CDK/CloudFormation
  per this repo's general AWS guidance.
- A separate, unrelated, pre-existing issue was flagged the same night:
  Voice OS (the local desktop pipeline in `voice/backend/`, port 8766 - a
  completely different subsystem from this AWS Cloud Voice backend) has been
  seen repeatedly failing to bind port 8766 in a retry loop, something else
  already holding the port. Tracked separately in Boardroom
  `ledger/tasks/069-voiceos-port-8766-bind-conflict.md` - not investigated
  as part of this session, do not conflate the two.
