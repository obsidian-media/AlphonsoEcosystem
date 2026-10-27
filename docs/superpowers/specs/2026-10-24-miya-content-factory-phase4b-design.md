# Miya content factory, phase 4b: ElevenLabs and Higgsfield

> **Status (2026-10-25):** built and merged in PR #353 (phase 4b); released in 2.10.0 (2026-10-27). What it leaves open is in `docs/governance/DEFERRED_WORK.md`; the current behaviour is described in `CLAUDE.md`'s Do Not Duplicate rows and `docs/USER_MANUAL.md` section 8.

Date: 2026-10-24. Builds on phases 1–4a (`2026-10-22-miya-content-factory-design.md` §8 phase 4;
`2026-10-24-miya-content-factory-phase4a-design.md` §13, where the owner's first answers for 4b were recorded).
Phase 4 is split three ways: 4a (learning from real results, done), **4b** (this document), and **4c**
(Higgsfield's motion transfer and consistent character, designed after 4b; their API needs checking first).

## 1. Why

The content factory makes everything with free, local tools today (Kokoro voices, ComfyUI pictures, local AI
clips) plus Runway for paid clips. 4b adds two paid services a creator may already pay for: ElevenLabs for
voices and sound effects, and Higgsfield for pictures and clips. Alphonso is a product for many people: both are
optional connectors with the user's own keys, always an extra choice next to the free tools, never a replacement,
and nothing about them is hardcoded (models and voices come from the user's account or are typed by the user).

## 2. Decided by the owner

| Topic | Decision |
|---|---|
| ElevenLabs uses | Voice-over voices (a brand can choose one instead of Kokoro), the user's own cloned voice from their ElevenLabs account, and sound effects per scene |
| Higgsfield uses | Every AI clip (a third engine next to local and Runway, for scenes and Shorts); pictures (scene pictures, thumbnail backgrounds, carousel slides) as an **additional option, never instead of ComfyUI**; asked by name anywhere |
| Higgsfield cost | Higgsfield's own estimate before every run (its `/estimate/{model}`), inside the one monthly cap; nothing to type |
| ElevenLabs cost | The user's own prices (per 1,000 characters; per sound effect) in Settings → Approvals → Allow paid models, inside the one monthly cap |
| Higgsfield models | The user pastes model ids (one for pictures, one for AI clips) in Settings, with example ids as hints and a Console link; Test checks each with the estimate call |
| Where the choice is made | A brand's default in the Brands tab (pictures: ComfyUI or Higgsfield; clips: local, Runway or Higgsfield; voice: Kokoro or ElevenLabs), which a project can override |
| Asked by name | "Make a Higgsfield video/picture of…" from Chat, Telegram or the board: a file in the output folder (`Higgsfield/<date>/`), shown or linked in the reply on that channel, and listed in Miya Studio's Quick package tab |
| Captions with ElevenLabs | Timed by ElevenLabs' own character timings (Whisper stays for Kokoro) |
| Sound effects | Miya picks at most one short effect per scene where it helps; they are shown with the cost, made after one approval, and mixed under the voice |
| Not available | When the chosen paid engine isn't available (no key, Zero-Cost Mode on, over the cap), the step says so and uses the free one (Kokoro, ComfyUI or local clips) |
| Split | 4b as here; motion transfer and consistent character in 4c |
| A model's fields | Alphonso sends the common fields (prompt, picture, length, shape); each pasted model id has an optional "Extra settings (JSON)" box for anything else, merged into the request; Test shows Higgsfield's own error when a field is wrong |

## 3. Goals, non-goals, anti-goals

Goals: the uses above, end to end, through the existing steps (Voice, Scenes, Thumbnail, Carousel, AI clips,
Shorts) and Jose.

Non-goals (4b): Higgsfield's motion transfer and consistent character (4c); cloning a voice inside Alphonso
(the user clones in ElevenLabs); ElevenLabs dubbing, speech-to-speech or music; a shared Obsidian Media account.

Anti-goals:
- Anything paid sent without the user approving that run.
- A paid engine silently replacing a free one, or a free one silently replacing a paid one (always a note).
- Model or voice lists written into the app.
- A key or secret in an error message, a log, a file name or a command line.
- Higgsfield results lost because they expire after 7 days on Higgsfield (always downloaded at once).

## 4. ElevenLabs

**Connector.** `elevenlabs` in the registry (paid, high risk like Runway), key `ELEVENLABS_API_KEY` (header
`xi-api-key`) in Connectors → Content & Productivity, with Test (lists voices). Calls go from the backend only.

**Voices and models.** The Brands tab's voice gains "ElevenLabs" next to Kokoro: a voice picked from the user's
account (`GET /v1/voices`, which includes their cloned voices; the builder checks the field that marks a cloned
voice) and a model picked from `GET /v1/models` (only models that can do text to speech). Saved on the brand
(`voice: { engine: 'elevenlabs', voiceId, modelId }`). A project can override the brand's voice (my call: in its
video settings, beside the AI clip engine).

**Voice step.** With ElevenLabs, each scene's lines are read with `POST /v1/text-to-speech/{voice_id}/with-timestamps`
(one request per scene, `previous_text` / `next_text` for continuity; my call) to WAV or MP3 converted to WAV, so
the rest of the pipeline is unchanged (one WAV per scene and `full.wav`). The character timings become word
timings for the captions (the script's words; the same `alignCaptions` rules), so Whisper isn't needed.

**Cost.** Characters ÷ 1,000 × the user's price. The Voice step gets `spend` when ElevenLabs is chosen; a full run
stops once at Voice with the cost ("Read the voice-over with ElevenLabs, about $X"), as the AI clips step does for
Runway. Spend is recorded with `recordSpendUsd()` when ElevenLabs answered.

**Sound effects.** A new step `sfx` between Music and B-roll (my call: before Assemble, so Assemble mixes them).
Miya writes at most one short effect per scene where it helps (a description and seconds, 0.5–30), or none. The
step waits once with the effects and their total cost ("Make 4 sound effects, about $X"); approved, each is made
with `POST /v1/sound-generation` and saved as `<project>/audio/sfx-v<n>-<scene>.wav`. Assemble mixes each under
the voice at the scene's start, quieter than the voice (my call: −12 dB, like the hook in a highlight). Sound effects are for the long video only, not Shorts (my call). Off, or
ElevenLabs not available: the step is skipped with the reason. The Scene Builder shows each effect with a player.

## 5. Higgsfield

**Connector.** `higgsfield` (paid, high risk), keys `HIGGSFIELD_KEY_ID` and `HIGGSFIELD_KEY_SECRET`
(`Authorization: Key <id>:<secret>`), and two model ids `HIGGSFIELD_PICTURE_MODEL`, `HIGGSFIELD_CLIP_MODEL`
in Connectors → Content & Productivity → Higgsfield, with the example ids as placeholders and a link to the
Console. Each model id has an optional "Extra settings (JSON)" box (`HIGGSFIELD_PICTURE_EXTRA`, `HIGGSFIELD_CLIP_EXTRA`; must be a JSON object, merged over the common fields; never a key). Test runs the estimate for each model id with its common and extra fields and says what it would cost, or Higgsfield's own error. Calls go from
the backend only.

**One way to run a model.** Every Higgsfield use goes through one backend path: upload inputs
(`POST /files/generate-upload-url`, then `PUT` with the returned headers, never the API keys), estimate
(`/estimate/{model}`), submit (`POST /{model}`), poll the status URL (or cancel), download every output into the
project folder at once, and delete the request's data on Higgsfield (`DELETE /requests/{id}`; my call, since the
file is kept locally). The estimate's US-dollar figure is what the approval shows and what the cap checks;
the cost recorded is the estimate (my call, as Higgsfield's status may not report the charge). Failed or NSFW
results aren't charged (Higgsfield) and are reported with Higgsfield's reason.

**Pictures.** Where a brand or project chooses Higgsfield for pictures, scene pictures, thumbnail backgrounds and
carousel slide pictures are made with the picture model instead of ComfyUI; Alphonso still draws the thumbnail
headline and slide text. The run asks once with the estimate for all of that step's pictures.

**AI clips.** "Higgsfield" joins local and Runway in the AI clips step and in the Shorts' clip engine. A clip starts
from the scene's (or the Short part's) picture, uploaded to Higgsfield. One approval per run with the estimate for
all clips, as Runway does. The plan's existing Runway paths (`spend`, `CLIPS_WAIT_PAID`, Shorts' one approval) are
generalised to "paid engine" rather than duplicated.

**Asked by name.** "Make a Higgsfield picture/video of …" (and the same wording on Telegram and the board) is
recognised by `creativeRoutingService` (today video says "isn't available yet") and becomes one Miya step through
Jose (`creative_higgsfield`, `spend`), which asks with the estimate. The result is saved in
`<output folder>/Higgsfield/<YYYY-MM-DD>/`, shown in Chat (picture or player), sent on Telegram as a file or
link (my call: file under Telegram's size limit, else the folder path), and listed in Miya Studio's Quick package
tab. Without Higgsfield set up, the reply says what to set up and nothing is started.

## 6. Constraints

- The existing paths: `policyEnforcementService` gates (paid connectors blocked in Zero-Cost Mode), the spend
  ledger and monthly cap (`joseSpend.ts`), `secret_or_env()` in Rust, `checked_file()` / `checked_dir()` for files,
  `no_window()` for any spawn, Jose for every agent step, effects for approvals.
- Never hardcode a model id, a voice or a price; example ids are shown as placeholders only.
- Network calls to ElevenLabs and Higgsfield from the backend only; keys never in an error, a log or a file.
- Docs in the same commits; a desktop spec with seeded results (nothing paid is sent in tests).

## 7. Left to the builder

The common Higgsfield field names (prompt, image URL, duration, aspect ratio), checked against the example models' docs;
how the voice list marks cloned voices; MP3-to-WAV conversion (the bundled ffmpeg); the sound-effect prompt; the
screens' layout; test names.
