# Content Catalyst Bridge

Alphonso content-catalyst is the primary creator runtime for idea-to-publish content work.
ACC remains the orchestrator, approval layer, and external sync target.

This bridge is real but honest:
- if Alphonso is not configured to sync to ACC, it reports `setup_required`
- if only the foundation exists locally, it stays `foundation_only`
- if a provider or publish adapter is not wired, it stays `not_configured`

## Bridge Configuration

The bridge settings live in Alphonso local storage and are editable from the Content Catalyst workspace:

- `enabled`
- `baseUrl`
- `pathPrefix`
- `token`
- `timeoutMs`

Runtime transport:

- The desktop frontend can still preview bridge state locally.
- Actual packet delivery is handled by Alphonso Tauri backend env config:
  - `ALPHONSO_BRIDGE_URL`
  - `ALPHONSO_BRIDGE_TOKEN`
  - `ALPHONSO_BRIDGE_PATH_PREFIX`
  - `ALPHONSO_BRIDGE_TIMEOUT_MS`
- That keeps the shared secret out of the browser bundle while still allowing local/offline inspection.

Recommended path prefix:

```text
/api/alphonso-bridge
```

## Bridge Packet Types

Alphonso can send these packets to ACC:

- `task`
- `result`
- `approval`
- `memory`
- `content_job`

Each packet is persisted locally as an artifact when a workspace root is available, so the bridge remains inspectable even when ACC is offline.

## Bridge Request

```json
{
  "idea": "A premium social post about launching a new product",
  "business_context": "Solo founder, premium SaaS, conversion-focused",
  "platform": "instagram",
  "format": "reel",
  "tone": "confident and polished",
  "needs": {
    "image": true,
    "video": true,
    "narration": false,
    "publish": false
  },
  "request_id": "acc_123"
}
```

## Bridge Response

```json
{
  "success": true,
  "job_id": "content_123",
  "status": "ready_for_review",
  "step": "preview",
  "progress": 90,
  "request_id": "acc_123",
  "bridge": {
    "configured": true,
    "enabled": true,
    "status": "configured",
    "baseUrlConfigured": true,
    "tokenConfigured": true,
    "pathPrefix": "/api/alphonso-bridge"
  },
  "draft": {
    "hook": "...",
    "caption": "...",
    "hashtags": "...",
    "visual_prompt": "...",
    "storyboard": []
  },
  "artifacts": {
    "image_url": "...",
    "video_url": null,
    "audio_url": null
  },
  "preview": {},
  "publish": null,
  "logs": [],
  "error": null,
  "updated_at": "2026-05-24T12:00:00.000Z",
  "next_step": "publish-preview"
}
```

## Job States

- `received`
- `briefing`
- `drafting`
- `image_ready`
- `video_processing`
- `video_ready`
- `narration_ready`
- `ready_for_review`
- `approved_for_publish`
- `published`
- `failed`

## Bridge Status Truth

`getAccBridgeStatus()` reports:

- `configured`
- `enabled`
- `status`
- `baseUrlConfigured`
- `tokenConfigured`
- `pathPrefix`
- `timeoutMs`
- `lastSyncAtMs`
- `lastSyncStatus`
- `lastError`
- `packetCount`

When the bridge is disabled or missing config, the status should read `setup_required`.

## Approval Rules

- Draft generation: no approval
- Image generation: no approval
- Video generation: no approval
- Narration generation: no approval
- Publish preview: no approval
- Actual publish: approval required

## Packet Flow

1. Alphonso creates or updates a content job.
2. Alphonso snapshots bridge state and syncs a `content_job` packet.
3. Alphonso sends task, memory, or approval packets when needed.
4. ACC receives and stores the packet.
5. Alphonso persists a local bridge artifact for traceability.
6. If ACC is not wired, Alphonso keeps the packet history locally and reports `setup_required`.

## Notes

- The module uses local Ollama for draft generation when available.
- Image generation uses the existing SD WebUI connector path.
- Video generation uses the existing Runway draft path.
- Narration is represented as a structured narration asset inside the content bundle.
- External publish adapters remain isolated and approval-gated.
- Meta-backed publishing is now wired through the Tauri backend for `instagram` and `facebook`.
- Instagram publishing requires a public `image_url` or `video_url` and a linked professional account.
- Facebook Page publishing can use a remote media URL when the Page token is configured.
- Local file uploads for Meta publish are still `setup_required` until a separate storage/upload bridge is added.
- Required env vars for the publish path:
  - `META_ACCESS_TOKEN`
  - `META_PAGE_ID`
  - `INSTAGRAM_BUSINESS_ACCOUNT_ID`
  - `META_APP_SECRET` for optional `appsecret_proof`
  - `META_GRAPH_API_VERSION` if you want to override the default `v20.0`
- The bridge UI in Content Catalyst can save, reset, and manually sync the active job without leaving the workspace.
- ACC should use [`src/services/agentWorkshop/contentCatalystBridgeService.js`](../src/services/agentWorkshop/contentCatalystBridgeService.js) as the thin integration wrapper.
- That wrapper forwards to Alphonso content-catalyst APIs only; it does not duplicate generation logic.
