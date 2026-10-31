# Miya Local Media Setup

This setup keeps Miya Studio's content factory low-cost and local-first. Everything below is installed from **Runtimes** (Runtime Hub); you choose where tools install the first time. Paid engines (Runway, ElevenLabs, Higgsfield) are optional and set up in Connectors.

## 1) ComfyUI — pictures, AI clips, characters, motion

- **Install:** Runtimes → ComfyUI → Install (it gets the PyTorch build for your NVIDIA driver and the Stable Diffusion 1.5 starter model), or let Alphonso use your own ComfyUI (Settings → Runtime → ComfyUI lists the ones it finds; **Search this computer** looks further).
- **Address:** Settings → Runtime → ComfyUI → ComfyUI address (default `http://127.0.0.1:8188`). The desktop app reaches ComfyUI through its backend.
- **Image model:** Settings → Runtime → ComfyUI → Image model (Automatic = the starter model).
- **On the ComfyUI card in Runtimes**, each pinned and checked when downloaded:
  - **Video models** for AI clips: LTX-Video 2B (6 GB of graphics memory and up) or Wan 2.2 5B (8 GB and up). Under 8 GB, clips are made smaller and at most 3 seconds unless you choose full size.
  - **Characters:** the character reference model (Stable Diffusion 2.1 unCLIP, about 6 GB, 4 GB of graphics memory) keeps a brand's character the same in every picture, free.
  - **Motion transfer:** Wan 2.1 VACE 1.3B (about 11 GB of files, 8 GB of graphics memory) moves a scene like a clip you recorded or chose, free.
- Before each job Alphonso asks Ollama to free the graphics card. A job still running after 15 minutes is kept, and **Check again** picks it up.

## 2) Kokoro — voice-overs

- Runtimes → Kokoro → Install (`kokoro-onnx`, with its model and voices downloaded and checked). Each brand picks its voice in the Brands tab.

## 3) AudioCraft — music beds

- Runtimes → AudioCraft → Install. Without it the Music step is skipped and says so.

## 4) Whisper — caption timing

- Runtimes → Whisper. With it, captions are timed word by word (the words always come from the script); without it, by sentence. ElevenLabs voice-overs bring their own word timing.

## 5) FFmpeg — the finished video

- Bundled in the Windows installer (LGPL build); on macOS and Linux, install `ffmpeg` on the PATH. It assembles the 16:9 and 9:16 videos, the Shorts, and the motion clips.

## 6) Stock footage (free keys)

- Pexels, Pixabay or Coverr keys in Connectors → Content & Productivity. With none, scene pictures are used.

## 7) Stable Diffusion WebUI (Automatic1111) — standalone

- `LOCAL_SDWEBUI_ENDPOINT` (default `http://127.0.0.1:7860`); start it with `--api`. Miya Studio's agents use ComfyUI, not SD WebUI.

## 8) Runway, ElevenLabs, Higgsfield (paid, optional)

- Keys in Connectors; prices in Settings → General → Allow paid models. Each run asks first with the cost, inside the monthly cap. Runway clips are 5 or 10 seconds from the scene's picture. See [CONNECTORS.md](CONNECTORS.md) sections 12, 31 and 32.

## 9) Safety + truthfulness behavior

- No cloud generator is required.
- No fake media output is reported: a step with no usable result fails and says why, and a paid engine that can't be used falls back to the free one with a note.

## 10) CapCut handoff

CapCut is treated as a manual export/import destination. Miya provides the script, scene list, captions and the finished files in the project folder; there is no CapCut automation.
