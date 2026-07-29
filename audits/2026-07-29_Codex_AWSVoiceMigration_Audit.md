# AWS Cloud Voice migration audit

**Date:** 2026-07-29  
**Scope:** Migration preparation for `voice/cloud-backend` from Railway to AWS.

## Confirmed facts

- AWS account `892748149559` was authenticated successfully in the host AWS
  CLI context. The current identity is the account root user; it must be
  replaced with a least-privilege deployment identity before normal operation.
- Read-only inventory found no ECR repositories or ECS clusters in either
  `ca-central-1` or `us-east-1`.
- Cloud Voice is a stateless FastAPI service. It already exposes `/health` and
  configuration-sensitive `/ready`; Railway currently launches it with Uvicorn.
- The service depends on Supabase, NVIDIA NIM, and optional external Piper
  endpoints. None are being migrated in phase one.

## Delivered preparation

- Added a non-root Python 3.11 container image with health checking.
- Added a Docker ignore list that excludes test files and environment files.
- Added the operator runbook at `docs/deployment/AWS_VOICE_MIGRATION.md`.

## Not performed

- No ECR, VPC, ALB, ECS, IAM, CloudWatch, Secrets Manager, DNS, or Railway
  resource was created, modified, or deleted.
- No secret was read, copied, or written.
- No paid AWS service was started.

## Blocking decisions

Actual provisioning requires the target region, VPC/subnet strategy, hostname
and ACM certificate, secret source, and explicit billable-resource approval.
The recommended first deployment region is `ca-central-1` for proximity to the
current Toronto environment; `us-east-1` remains a valid lower-cost alternative.
