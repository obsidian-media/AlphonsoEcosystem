# Miya Local Media Generator Setup

This setup keeps Miya creative generation low-cost and local-first.

## 1) Stable Diffusion WebUI (Automatic1111) image adapter

Environment:

- `LOCAL_SDWEBUI_ENDPOINT` (default `http://127.0.0.1:7860`)
- Optional: `LOCAL_SDWEBUI_BASIC_AUTH` as `username:password`

Runtime requirement:

- Start Automatic1111 with API enabled, for example with `--api`.

Miya Studio supports:

- prompt
- negative prompt
- width / height
- steps
- cfg scale

## 2) ComfyUI video queue adapter

Environment:

- `COMFYUI_ENDPOINT` (default `http://127.0.0.1:8188`)

Runtime requirement:

- ComfyUI must be running locally.
- For video jobs, provide an API workflow JSON in Miya Studio.

Notes:

- Miya queues the workflow via `/prompt`.
- Miya can check job history via `/history/{prompt_id}`.
- Miya does not fake render completion.

## 3) Runway cloud video draft adapter

Environment:

- `RUNWAYML_API_SECRET`
- Optional: `RUNWAYML_API_BASE_URL` (default `https://api.dev.runwayml.com`)
- Optional: `RUNWAYML_API_VERSION` (default `2024-11-06`)

Runtime requirement:

- The Runway API key must be configured in the backend environment only.
- Miya sends the request through the Tauri backend so the secret is not exposed in the UI.
- The generated output is saved locally as a proof file after completion when available.

Notes:

- Miya uses text-to-video generation by default.
- Runway task outputs are treated as ephemeral until saved locally.
- Missing secret or disabled access is shown as `setup_required`.

## 4) Safety + truthfulness behavior

- No cloud generator is required.
- No fake media output is reported.
- Errors and missing runtime states are shown directly in the UI.

## 5) CapCut handoff

CapCut is treated as a manual export/import destination.

What Miya provides:

- export brief
- script package
- scene list
- captions
- source file reference
- handoff packet for Jose review

What Miya does not claim:

- no direct CapCut API automation
- no direct project-file import/export automation
- no fake live upload
