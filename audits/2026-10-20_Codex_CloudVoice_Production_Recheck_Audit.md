# Cloud Voice Production Recheck Audit

Date: 2026-10-20  
Branch: `agent/Codex-priority-hardening`  
Scope: production readiness endpoint and DNS reachability

## Read-only evidence

- `Invoke-WebRequest https://voice.obsidianmedia.online/ready` failed with the
  Windows resolver error for the HTTPS endpoint.
- `Resolve-DnsName voice.obsidianmedia.online` returned the CNAME
  `alphonso-cloud-voice-1113067864.ca-central-1.elb.amazonaws.com` but no A or
  AAAA address.
- No authenticated `/v1/voice/respond` request was attempted.
- No AWS resource or DNS mutation was attempted.

## Assessment

The production endpoint is not reachable from this environment. CI Cloud Voice
tests remain useful regression evidence, but cannot establish production
readiness or device acceptance while the ALB/DNS target has no address.

## Required follow-up

Restore the AWS ALB/service/DNS state with the infrastructure owner, then repeat
`/ready`, an authenticated `/v1/voice/respond`, and physical-device acceptance.
