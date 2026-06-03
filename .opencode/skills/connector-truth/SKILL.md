---
name: connector-truth
description: Verify that each connector is a real implementation with policy gating and proof paths
license: MIT
compatibility: opencode
metadata:
  audience: maintainers
  workflow: verification
  scope: connectors
---

## What I Do

I trace the full call path for each connector: frontend → service → policy gate → Rust command → HTTP call → proof object. I verify that every connector is real, not a stub.

## When To Use Me

Use this when:
- After adding or modifying a connector
- Before release to verify no stubs are shipping
- When a connector stops working and you need to trace the issue
- When auditing connector readiness

## Verification Checklist

### For Each Connector

#### 1. Frontend Path
- [ ] Send function exists in `connectorRegistryService.js`
- [ ] Function name follows pattern: `send[Connector]Connector[Action]`
- [ ] Function accepts appropriate parameters (message, recipient, etc.)

#### 2. Policy Gate
- [ ] Function calls `policyEnforcementService.evaluateAction()` before any external call
- [ ] Policy gate checks: zero-cost mode, approval required, connector risk level
- [ ] Policy gate returns blocked result when credentials missing

#### 3. Rust Command
- [ ] Corresponding `#[tauri::command]` exists in `lib.rs` or extracted module
- [ ] Command is registered in `invoke_handler` block
- [ ] Command reads credentials from env vars (not hardcoded)

#### 4. Real HTTP Call
- [ ] Command makes actual `reqwest` call to external API
- [ ] URL matches the real API endpoint (not placeholder)
- [ ] Request includes proper auth headers
- [ ] Response is parsed into structured proof object

#### 5. Proof Object
- [ ] Returns `{ success, proof, trustRating }` or equivalent
- [ ] Proof includes: timestamp, connector ID, external reference ID
- [ ] Trust rating reflects actual outcome (not hardcoded "verified")

#### 6. Error Handling
- [ ] Missing credentials → blocked result (not crash)
- [ ] Timeout → retry or fail with clear error
- [ ] Rate limit → detected and reported
- [ ] Network error → caught and reported

### Connector-by-Connector Verification

| Connector | Frontend Path | Policy Gate | Rust Command | Real HTTP | Proof | Errors | Status |
|-----------|--------------|-------------|--------------|-----------|-------|--------|--------|
| Telegram outbound | `sendTelegramConnectorMessage` | | | | | | |
| Telegram inbound | `connector_poll_telegram` | | | | | | |
| WhatsApp outbound | `sendWhatsAppConnectorMessage` | | | | | | |
| WhatsApp inbound (Twilio) | `whatsappWebhookService` | | | | | | |
| WhatsApp Cloud | normalizer exists | | | | | | |
| YouTube | `uploadYouTubeConnectorVideo` | | | | | | |
| Claude | `sendClaudeConnectorMessage` | | | | | | |
| ChatGPT | `sendChatGptConnectorMessage` | | | | | | |
| Notion | `sendNotionConnectorEntry` | | | | | | |
| ClickUp | `sendClickUpConnectorTask` | | | | | | |
| SD WebUI | `generateSdWebUiImage` | | | | | | |
| ComfyUI | `queueComfyUiVideo` | | | | | | |

## Output Format

```markdown
# Connector Truth Report — [DATE]

## Summary
- Total connectors: X
- REAL: X | PARTIAL: X | STUB: X | NOT_DEPLOYED: X

## Per-Connector Details
### [Connector Name]
- **Status**: [REAL / PARTIAL / STUB / NOT_DEPLOYED]
- **Frontend**: [file:line]
- **Policy Gate**: [pass/fail — evidence]
- **Rust Command**: [file:line]
- **HTTP Call**: [URL called — or "none"]
- **Proof**: [proof structure — or "missing"]
- **Errors**: [error handling — or "none"]
- **Missing**: [what's needed to be fully live]

## Recommendations
1. [Highest priority connector fix]
```
