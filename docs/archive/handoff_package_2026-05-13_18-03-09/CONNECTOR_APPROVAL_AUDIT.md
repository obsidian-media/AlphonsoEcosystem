# Connector Approval & Policy Audit

## Policy engine
- `src/services/policyEnforcementService.js`
- Enforces:
  - approval mode
  - zero-cost mode
  - connector risk classification
  - auth/allowlist checks
  - fail-closed behavior

## Enforcement points (this cycle)
- `src/services/connectorRegistryService.js`
  - `sendTelegramConnectorMessage`
  - `sendWhatsAppConnectorMessage`
  - `sendChatGptConnectorMessage`
  - `sendClaudeConnectorMessage`
  - `sendNotionConnectorEntry`
  - `sendClickUpConnectorTask`
  - `uploadYouTubeConnectorVideo`
  - `generateSdWebUiImage`
  - `queueComfyUiVideo`

## Receipts and audits
- Connector policy allow/block records:
  - connector audit log (`alphonso_connector_audit_v2`)
  - orchestration receipts (`alphonso_orchestration_receipts_v1`)
- Queue transitions:
  - `alphonso_orchestration_queue_transitions_v1`

## WhatsApp inbound status
- Twilio polling: implemented path (credential-dependent).
- WhatsApp Cloud API:
  - normalized payload parser and simulation route added in frontend service
  - hosted webhook verification/signature path remains setup-required

## Setup-required constraints
- Missing credentials/env -> connector remains not_configured.
- Disabled/unauthorized allowlist profile -> route/send blocked.
- Paid connector calls in zero-cost mode -> blocked without explicit approval override.

