# Composio Connector Evaluation

Status: candidate connector layer, not approved for production integration yet.

## Why it is interesting

Composio could give ALPHONSO a managed connector/action layer for tools like Gmail, GitHub, Notion, Slack, calendars, CRMs, and other SaaS APIs. This could reduce custom connector work and give Jose/Alphonso a cleaner approval-gated action surface.

## Fit for ALPHONSO

Best fit:

- Connector catalog / tool directory
- OAuth/action abstraction
- Approval-gated external actions
- Agent action receipts
- Jose routing external work through one policy layer

Risk areas:

- External SaaS dependency
- Secrets/tokens custody
- Cost/rate limits
- Browser/Railway public-surface exposure
- Risk of agents gaining too broad an action surface

## Recommended architecture

Do not put Composio directly in browser UI.

Use it only through a local/server broker:

1. ALPHONSO UI requests action proposal.
2. Jose/Sentinel classify risk.
3. Human approves.
4. Local/server connector broker calls Composio.
5. Broker returns receipt.
6. Echo/Marcus/Maria log audit trail.

## Minimum V1 proof

- Add Composio as a connector candidate in Connector Health.
- Create read-only/local mock adapter first.
- Prove action schema:
  - tool
  - account
  - action
  - input summary
  - risk level
  - approval id
  - execution receipt
- Only after that, wire one low-risk real integration.

## Recommendation

Yes, evaluate Composio — but as a gated connector broker, not as a wide-open agent tool layer.
