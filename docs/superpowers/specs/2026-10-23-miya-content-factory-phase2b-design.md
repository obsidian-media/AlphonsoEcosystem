# Miya content factory, phase 2b: AI video clips

Date: 2026-10-23. Builds on phase 2a (the finished video file, PR #343) and the
content factory design (`2026-10-22-miya-content-factory-design.md`, owner
decisions Q4, Q13, Q14).

## Intent

The finished video's important shots should be real moving AI video, not a
picture with a slow zoom. Alphonso is a product for many users with different
computers and accounts, not one person's tool, so every default comes from what
that user has, and the user can change it.

## Owner decisions (2026-10-23)

1. **How much AI, per project:** Main moments (default), Every scene, or None,
   in the project's brief.
2. **Which engine, per project:** Local (ComfyUI) or Runway. The default comes
   from what the user has: a local video model installed in their ComfyUI →
   Local; else a saved Runway key → Runway; else None, and the step says why
   and how to set one up.
3. **Main moments:** Miya marks them while she plans the scenes; the user
   changes them in the Scene Builder before the clips are made.
4. **Local model:** Runtime Hub suggests a video model that fits the user's
   graphics card; the user can pick another.
5. **Runway spending:** one approval per run, showing the estimated total
   ("4 clips, about $1.00"), plus a monthly limit in Settings; a clip that
   would go over the limit is refused.
6. **Length:** each AI clip is as long as its scene allows (the engine's
   longest clip at most); the rest of the scene continues on its stock clip or
   picture. No looping, no slowing down.

## Goals

- A new **AI clips** step between Stock clips and Finished video (Miya,
  `creative_video_clips`): one image-to-video clip per chosen scene, started
  from that scene's picture so the shared look (Q14) carries over, with the
  scene's description and camera movement as the prompt.
- The Finished video uses, per scene: the AI clip for its length, then the
  stock clip or the picture (with its slow zoom) for the rest; scenes without
  an AI clip are as in phase 2a.
- The Scene Builder shows a "Main moment" switch per scene, the engine and the
  amount for the project, each AI clip with a player, and the run's cost for
  Runway.
- Runtime Hub's ComfyUI card gains "Video models": the suggested one for this
  card, the others with the memory each needs, installed into the user's
  ComfyUI with checksums verified.

## Non-goals

Text-to-video without a picture, avatars and lip-sync, upscaling or frame
interpolation, other paid video services, editing a clip by hand.

## Anti-goals

- A slow or paid clip made for a scene the user didn't want: clips are made
  only after the main moments are settled (the step runs after the Scene
  Builder's choices, and Run project stops before a paid run).
- A hidden fallback: a clip that fails leaves that scene on its stock clip or
  picture, and the step names which scenes and why.
- Hardcoding one person's setup: no fixed folders, models or prices.

## Constraints

- Approvals by effect (Jose): a Runway run has the `spend` effect, which always
  asks (`LOCKED_EFFECTS`), with "(about $X.XX)" from the step's
  `costEstimateUsd` — this is the one approval per run. Local runs are
  `write_own_work`.
- Prices are the user's to enter (as for paid models): Runway is available to
  the factory only when its key is saved, Zero-Cost Mode is off, and a price per
  second is entered; otherwise the step says which is missing.
- GPU sharing: before local clips, `freeOllamaGpuMemory()`; one clip at a time;
  a clip still running when the wait ends is kept pending with its job id and
  picked up later, as images are (`checkComfyUiImage`).
- ComfyUI calls go through the backend route (`comfyui_proxy.rs`); add only the
  paths the video workflow needs.
- Model downloads: pinned files, SHA-256 and size checked, `.part` then
  renamed, into the ComfyUI install the user chose (`comfyui_find_installs`).
- The graphics card's memory comes from `nvidia-smi --query-gpu=memory.total`
  (the scan knows only the name today). No NVIDIA card → suggest Runway.
- Nothing outside Jose calls the pipeline; Rust spawns use `no_window`.

## The builder's calls (marked as such; the owner may change them)

- **Runway model:** `gen4_turbo` for the factory (the cheapest image-to-video
  model at the time of writing), changeable in the project. Clip length 5 or 10
  seconds, the shorter that covers the scene.
- **Monthly limit:** one shared limit for everything paid (the existing
  `paidModels.monthlyCapUsd` in `joseSpend.ts`), with Runway spending recorded
  in the same month total, so one number protects the user. Runway's price per
  second is a separate setting beside it.
- **Video model shortlist** (the builder verifies current files, sizes, licenses
  and memory needs before pinning): LTX-Video for cards under about 8 GB
  (fast, rougher), Wan 2.2 TI2V-5B for about 8–12 GB, a Wan 2.2 14B
  quantized build for 16 GB and up. Each with its ComfyUI image-to-video
  workflow as a template in the app. Licenses shown in Runtime Hub and in the
  README's third-party notices.
- **Main moment marking:** Miya's scene plan gains `mainMoment: true|false`;
  the hook scene, the turning points and the call to action are the guidance in
  her prompt. "Every scene" ignores the marks; "None" skips the step (done,
  with a note).
- **Order:** the AI clips step needs Scenes and Stock clips (so it knows each
  scene's length and what fills the rest) and comes before Finished video; it
  runs in parallel with Voice and Music.
- **Files:** `<project>/clips/v<n>-<scene>.mp4`, never overwritten, with the
  engine, model, prompt and cost kept in the step's output.

## Testing

Unit tests with ComfyUI, Runway and the backend mocked (engine default, marks,
"Every scene" and "None", cost estimate and the limit, clip length, a failed
clip, assembly with an AI clip followed by stock). A desktop spec in the real
app that checks the Scene Builder's switches and, when a local video model is
installed, makes one real clip and assembles it (skipped otherwise). Runway is
checked live by hand when the owner gives a key and a price.
