# Miya content factory, phase 2a: the finished video file

> **Status (2026-10-25):** built and merged in PR #343 (phase 2a); released in 2.10.0 (2026-10-27). What it leaves open is in `docs/governance/DEFERRED_WORK.md`; the current behaviour is described in `CLAUDE.md`'s Do Not Duplicate rows and `docs/USER_MANUAL.md` section 8.

Builds on the content factory design (`2026-10-22-miya-content-factory-design.md`,
§6 "Audio, video and assembly", §8 phase 2) and the Jose redesign phase 6b
(a project runs as one Jose request).

## Intent

A project ends with real video files, not only text and pictures: a voice-over
in the brand's voice, music, stock footage and the scene pictures cut together
with captions, as one 16:9 and one 9:16 MP4 in the project folder. Phase 2b
later adds AI video clips per scene (ComfyUI or Runway) in place of pictures.

## Decided by the owner (2026-10-23)

1. Phase 2 is split: **2a** the finished file (this design); **2b** AI video
   clips per scene through ComfyUI or Runway, chosen per project.
2. **ffmpeg is bundled in the installer** (an LGPL build, with its license
   notice in the app). **Kokoro is installed by Runtime Hub**; its model is
   downloaded on first use and checked against a pinned checksum.
3. **Stock B-roll** from Pexels, Pixabay and Coverr uses whichever keys are set
   in Settings → Connectors (each is a free sign-up). With none, the video uses
   the scene pictures only, and says so.
4. **A new Assemble step in the project**: the project gains Voice, Music and
   Assemble steps; Run project goes through to the finished files; the Scene
   Builder tab shows the voice, the music and the two MP4s with a player.

## What changes

**New project steps** (after Scenes and Thumbnails, before Campaign), in the
Content video template, each a Jose step with `contentStep`:

| Step | Agent, task type | Effect | What it does |
|---|---|---|---|
| `voice` | Miya, `creative_voice` | write own work | The script's spoken lines, read by Kokoro in the brand's voice, one WAV per scene and one full track, with each line's start and end time. |
| `music` | Miya, `creative_music` | write own work | One music bed from MusicGen (AudioCraft) at the video's length, from a short mood prompt Miya writes from the brief. Skipped, with a note, when AudioCraft is not installed. |
| `broll` | Hector, `research_broll` | read | Per scene, the best stock clip from the sources that have keys (search words from the scene plan), downloaded into the project folder with its source, author and license link. |
| `assemble` | Alphonso, `runtime_assemble_video` | write own work | Builds the two MP4s (below), checks them, writes the caption file. |

The Campaign and Quality steps then also see the finished files (paths and
duration), and Maria's quality gate lists them as pieces.

**Assembly** (one backend command, `content_assemble_video`, fixed arguments,
no shell; the backend picks the bundled ffmpeg):
- Each scene shows its stock clip when there is one, else its picture with a
  slow zoom; it lasts as long as its voice line.
- Voice on top, music under it at about −18 dB, ducked while the voice speaks;
  the mix is loudness-normalised to −14 LUFS.
- Captions are burned in from the voice's word timings. The timings come from
  Whisper (`--word_timestamps`) run on the voice track, matched to the script's
  real words, so a misheard word never reaches the screen.
- Two outputs: 1920×1080 (16:9) and 1080×1920 (9:16, the picture cropped to the
  centre), H.264/AAC.
- Checks after writing: ffprobe (duration within 1 s of the voice, both streams
  present), and a frame grab at 10 %, 50 % and 90 %, shown in the Scene Builder.
  A failed check fails the step with what was wrong.

**Where things live:** `<root>/<brand>/<project>/{audio,broll,output}/`,
versioned like the other steps (`output/v<n>-16x9.mp4`, `output/v<n>-9x16.mp4`,
`output/v<n>.srt`). Raw generations are kept and never edited.

**Runtime Hub:** a new `kokoro` tool (its own Python environment, `kokoro-onnx`
or the reference package, whichever runs on CPU on Windows without a compiler),
with a one-shot speak script the backend runs (`content_tts_kokoro`). AudioCraft
(already a tool) gets a one-shot generate script (`content_music_generate`)
beside its web app. Both scripts ship in the installer like Voice OS's backend.
ffmpeg is fetched in CI (`scripts/fetch-ffmpeg.mjs`, pinned version and
checksum) into the installer's resources.

**Connectors:** Pexels, Pixabay and Coverr, each with a key field in
Connectors, registered in `connectorRegistry.js`, free, low risk, read only;
downloads go through the backend (https only, those hosts only, size cap),
since the app window cannot fetch them.

**GPU:** before MusicGen, `freeOllamaGpuMemory()`; MusicGen small runs on the
GPU when there is one, else on the CPU with a "slow" note. Kokoro runs on the
CPU.

## Non-goals

- AI video clips (phase 2b), avatars or lip-sync.
- Paid voices (Deepgram, ElevenLabs): later, and they will ask first.
- Publishing (phase 3).
- macOS and Linux bundling of ffmpeg: Windows first; elsewhere ffmpeg is found
  on the PATH or installed by Runtime Hub as a prerequisite.

## Anti-goals

- A step that says "done" when a tool was missing: it fails or is skipped with
  a plain note naming what to install.
- Captions with words the script does not have.
- Copyrighted music or footage without its license recorded.
- A command that can run arbitrary ffmpeg arguments from the window.

## Left to the builder

- The exact Kokoro package and voice ids (pick one that installs cleanly on
  Windows; brands keep `voice.voiceId`).
- The MusicGen size (small by default).
- Caption look (brand's lightest colour with an outline, like the thumbnail
  headline).
- How the 9:16 crop picks its centre (centre by default).
