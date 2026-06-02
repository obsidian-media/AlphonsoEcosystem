# ComfyUI → Miya Local Runtime Proof — 2026-06-01

## Install Location

- ComfyUI: `C:\dev\ComfyUI`
- Launcher: `C:\dev\ComfyUI\START_COMFYUI_LOCAL.bat`
- Endpoint: `http://127.0.0.1:8188`

## Runtime Proof

`/system_stats` responded successfully after launch.

- ComfyUI version: `0.23.0`
- Python: `3.12.1`
- PyTorch: `2.5.1+cu121`
- CUDA available: yes
- GPU: `NVIDIA GeForce RTX 2060`
- VRAM total: ~6GB
- VRAM free at check: ~5.35GB

## ALPHONSO Connector Status

Existing connector lane found and updated:

- Connector id: `comfyui_video`
- Display name changed to: `Local ComfyUI Image + Video`
- Transport: `comfyui_local_api`
- Permissions: `local_image_generation`, `local_video_generation`
- Default endpoint: `http://127.0.0.1:8188`

Frontend service now exposes:

- `queueComfyUiWorkflow({ prompt, workflowJson, mediaType })`
- `queueComfyUiVideo({ prompt, workflowJson })` compatibility wrapper
- `getComfyUiVideoHistory(promptId)`

## Important Constraints

- No image/video model checkpoint has been installed yet.
- Disk is tight after CUDA PyTorch install; choose small 6GB-VRAM-friendly models deliberately.
- ComfyUI is local/free at runtime, but some bundled workflow templates point at cloud/API providers. Do not enable cloud/API templates by default for Miya local mode.
- Keep external publishing and paid/cloud generation approval-gated.

## Recommended First Model Lane

For RTX 2060 6GB, prefer a compact SD 1.5/SDXL-lightning/turbo-compatible workflow before heavier video models.

Suggested first phase:

1. Install one small image checkpoint.
2. Prove text-to-image locally.
3. Add Miya preset: ALPHONSO brand poster / thumbnail / product hero.
4. Later add image-to-video/video workflow after disk + VRAM planning.

## Operational Position

ComfyUI is installed and API-live. Miya should treat it as the local generation backend once a compatible model + workflow JSON is available.
