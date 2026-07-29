# AWS Cloud Voice migration

This is the deployment how-to for moving **only** `voice/cloud-backend` from
Railway to AWS. It does not move Supabase, NVIDIA NIM, or the Farsi Piper
service in the first phase.

## Target architecture

```text
Mobile/Desktop client
        |
     HTTPS/ALB
        |
 ECS Fargate service (Cloud Voice)
        |---- Supabase (JWT + RLS device check)
        |---- NVIDIA NIM (LLM and English TTS)
        `---- Railway Piper (Farsi TTS, temporary)
```

Use an Application Load Balancer with an HTTPS listener and an ECS Fargate
service. The task is private: only the ALB security group may reach port 8080.
Its target group must use the `ip` target type and `/ready` health path.

## Scope and safety boundary

- The first AWS deployment replaces Cloud Voice compute only.
- Railway remains live until a staged AWS endpoint passes enrollment and voice
  requests against a real test device.
- Do not put any secret in Git, task-definition environment literals, build
  logs, or shell history.
- Do not use the account root identity for ongoing image pushes or deploys.
  Bootstrap a least-privilege CI/deployer role first.

## Required deployment inputs

1. A target region. `ca-central-1` is the recommended option for the current
   Toronto-based development environment; `us-east-1` is a valid alternative
   if lower service cost matters more than proximity.
2. An existing or newly approved VPC with at least two public ALB subnets and
   two private task subnets.
3. An ACM certificate for the intended Cloud Voice hostname.
4. Secrets Manager entries for all secret settings:
   `NVIDIA_API_KEY`, `SUPABASE_ANON_KEY`, and `PIPER_SERVICE_TOKEN` when Farsi
   Piper is enabled.
5. Non-secret configuration values: `SUPABASE_URL`, `NVIDIA_NIM_MODEL`,
   `NVIDIA_TTS_MAGPIE_URL`, optional Piper URL/voice settings, and timeout.
6. Explicit approval for billable resources: ALB, Fargate tasks, CloudWatch
   logs, ECR image storage, Secrets Manager, and potentially NAT egress.

## Build and publish

Run these only through a restricted deployment identity after the ECR
repository exists. Use a Git commit SHA as the immutable image tag.

```powershell
$REGION = 'ca-central-1'
$ACCOUNT = '892748149559'
$IMAGE = "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/alphonso-cloud-voice:$((git rev-parse --short HEAD))"

aws ecr get-login-password --region $REGION |
  docker login --username AWS --password-stdin "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"
docker build --tag $IMAGE voice/cloud-backend
docker push $IMAGE
```

Create the ECR repository with immutable tags, scanning, and a lifecycle policy
before the first push. Review a lifecycle preview before allowing expiry.

## ECS requirements

- Fargate task: Linux, `awsvpc`, `ip` target group, start at 0.5 vCPU / 1 GB.
- Dedicated execution role: pull ECR image, write CloudWatch logs, retrieve
  only the named Secrets Manager values.
- Empty task role unless application code begins calling AWS APIs.
- Container health check: `/health`; ALB target-group health check: `/ready`.
- Enable the ECS rolling deployment circuit breaker with rollback.
- Set at least two tasks only after load and cost validation; begin staging at
  one task, understanding that it has no high-availability guarantee.

## Cutover and rollback

1. Deploy AWS behind a staging hostname; do not change the production URL.
2. Test `/health`, `/ready`, Supabase device enrollment, English reply/audio,
   Farsi reply/audio, invalid JWT, inactive device, provider unavailable, and
   rate limit responses.
3. Configure CloudWatch alarms for unhealthy targets, 5xx responses, and task
   exits. Confirm an ECS failed deployment rolls back.
4. Change the client endpoint only after the real-device acceptance pass.
5. Retain Railway for a defined rollback window. Roll back by restoring the
   prior endpoint; do not delete Railway until the window closes.

## Evidence to record

Record the AWS region, ECR image digest, task-definition revision, ALB DNS
name, deployment/circuit-breaker status, alarm configuration, and real-device
test result in `docs/TRUTH_FIRST_EXECUTION_PLAN.md` and a dated audit before
declaring the migration complete.
