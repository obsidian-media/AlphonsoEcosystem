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
  target. ACM remained `PENDING_VALIDATION` after two post-propagation checks;
  no load balancer was created before certificate issuance.

## Not performed

- No ALB, ECS service/task, Secrets Manager secret, DNS record, or Railway
  setting was created, modified, or deleted.
- No secret was read, copied, or written.
- No paid AWS service was started.

## Blocking decisions

Actual provisioning requires the target region, VPC/subnet strategy, hostname
and ACM certificate, secret source, and explicit billable-resource approval.
The recommended first deployment region is `ca-central-1` for proximity to the
current Toronto environment; `us-east-1` remains a valid lower-cost alternative.
