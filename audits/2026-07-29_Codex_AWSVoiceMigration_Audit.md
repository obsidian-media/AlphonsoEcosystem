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

## Not performed

- No ECS service/task, Secrets Manager secret, DNS record, or Railway setting
  was created, modified, or deleted.

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
