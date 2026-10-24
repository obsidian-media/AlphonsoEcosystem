# Miya content factory, phase 4c: consistent characters and motion transfer

> **Status (2026-10-25):** built and merged in PR #354 (phase 4c); on `main`, not released yet (2.10.0 isn't tagged). What it leaves open is in `docs/governance/DEFERRED_WORK.md`; the current behaviour is described in `CLAUDE.md`'s Do Not Duplicate rows and `docs/USER_MANUAL.md` section 8.

Date: 2026-10-24. Builds on phases 1–4b (`2026-10-24-miya-content-factory-phase4b-design.md`). Phase 4 is split
three ways: 4a (learning from real results), 4b (ElevenLabs and Higgsfield as paid extras), and **4c** (this
document). After 4c, before Jose phase 7, the owner has a topic to discuss (ask them).

## 1. Why

A creator's videos read as one channel when the same character (a mascot, a presenter, or the creator
themselves) appears in every scene, thumbnail and Short, and when that character can do a real move: a wave, a
gesture, a dance. Today every picture is made fresh from a prompt, so the "same" person changes from scene to
scene. 4c lets each brand keep characters and lets a scene borrow a movement from a clip. As in 4b, Alphonso is a
product for many people: everything is chosen by the user, works for free on this computer where it can, and
offers Higgsfield as a paid, more exact option that always asks first.

## 2. Decided by the owner

| Topic | Decision |
|---|---|
| Who the character is | Any, per brand: a made-up mascot or presenter, or a real person from their own photos; a brand can have more than one |
| Setting one up | The user adds 5–20 pictures, or Miya generates them for a made-up character; it is trained once on Higgsfield (asks first with the cost), then every picture and clip reuses it |
| Real person | A tick, "This is me, or I have this person's permission", saved with the character and its date; without it the character can't be trained or used. Photos stay on this computer except when sent to train |
| Free and paid | Both: ComfyUI keeps the character from its reference pictures (free, local, less exact); Higgsfield uses the trained character (paid, more exact). The brand's engine choice from 4b decides; the free one is used with a note when Higgsfield can't be |
| Where it appears | Scene pictures and AI clips, Shorts, thumbnails and carousel pictures (Alphonso still draws all text) |
| Which character | The brand marks one as its main character; a project can choose another; a scene can have none or a different one |
| Motion comes from | A Higgsfield motion preset, a clip the user films, or a clip from the user's files |
| Filming | A Record button (webcam, a few seconds, with a countdown) or choose a video file (filmed on a phone) |
| Where motion is used | Per scene in the Scene Builder and per mini-script Short part. Miya suggests scenes where a motion fits; the user adds or removes any |
| Free and paid motion | Both: Higgsfield, or locally through ComfyUI on a card that can run it |
| A Higgsfield picture that fails | ComfyUI remakes it, and the note says Higgsfield failed and why (4b deferred minor) |
| Also from 4b | Higgsfield result downloads get the private-address check research fetches use; Chat shows a by-name result wherever it was approved (board, Telegram), not only in Chat |

## 3. Goals, non-goals, anti-goals

Goals: characters and motion, end to end, through the existing steps (Scenes, Thumbnail, Carousel, AI clips,
Shorts) and the existing approvals; the three 4b leftovers.

Non-goals: voices for a character (the brand's voice from 4b stays); lip-sync to the voice-over; 3D characters
or scenes; selling or sharing characters between users; a shared Obsidian Media Higgsfield account.

Anti-goals (a failure even if it works):
- A real person's likeness used without the saved permission tick, or their photos sent anywhere except the one
  training request.
- Anything paid started without asking (training, pictures, motion clips), or a charge recorded twice.
- A character "kept" by name only: if the engine couldn't keep the character, the step says so.
- A filmed clip or photo left on Higgsfield after use, or written over a file in the project.
- A hardcoded model, preset list or character id.

## 4. Characters

**Stored per brand** (`ContentBrand.characters`): id, name, kind (`made_up` / `real_person`), description (for
prompts), reference pictures (files under `<output folder>/<brand>/characters/<id>/`, never overwritten), the
permission tick with its date (real person only), and per engine: Higgsfield's trained character id and status
(not trained / training / ready / failed), and for ComfyUI the reference pictures chosen to use. The brand marks
one `mainCharacterId`. The Brands tab gets a Characters section: add, name, describe, pictures (add files, or
"Make pictures with Miya" for a made-up character: a few ComfyUI pictures from the description, which the user
keeps or removes), the tick, Train on Higgsfield (with Higgsfield's estimate, asks first), status, delete
(removes local files; asks Higgsfield to delete its copy where the API allows).

**Using it.** A project's video settings can choose another character (`characterId`, or none); a scene in the
chosen scene plan can carry its own `characterId` (or `none`). Miya's scene plan marks which scenes show the
character, from the script (a scene without a person shows none). The pictures steps (Scenes, Thumbnail,
Carousel) and the Shorts' pictures pass the character:
- Higgsfield: the trained character id with the picture model (the field name is the builder's to confirm; it
  may need its own model id pasted in Settings, as in 4b).
- ComfyUI: the reference pictures through an image-reference method that runs on ComfyUI (my call: the
  smallest well-known one, its model files pinned with size and SHA-256 and installed from Runtime Hub like the
  video models; without it installed the step says what to install and makes the picture without the character).
- Not ready (not trained, no tick, missing files): the free engine or no character, with the reason.

AI clips start from the scene picture, so the character carries into the clip; Higgsfield clips may also take
the trained character where the model allows (builder confirms).

## 5. Motion transfer

**Per scene, per Short part.** In the Scene Builder each scene can get a motion instead of a normal AI clip: a
Higgsfield preset (chosen from Higgsfield's own list when its API provides one; otherwise its id pasted, never a
built-in list), a recorded clip, or a clip from the user's files. Miya's scene plan suggests scenes where a move
helps (`motionSuggested`, like main moments); the user turns any on or off. A mini-script Short's part can do
the same.

**Making it.** In the AI clips step (and the Shorts step), a scene with a motion makes its clip from the scene
picture (with the character) and the motion:
- Higgsfield: its motion-control request (upload the picture and the clip through Higgsfield's own upload, as in
  4b), estimate first, one approval per step together with the other clips, downloaded into
  `<project>/clips/`, then Higgsfield's copy deleted.
- ComfyUI: a local motion-transfer workflow on ComfyUI's own nodes (my call: the builder picks the smallest
  pinned model that does it, offered only when the graphics card can run it, like the video models; otherwise
  it says why and that Higgsfield can).
- A motion that can't be made: the scene gets its normal AI clip or picture, with the reason.

**Recording.** Record uses the webcam through the window's camera permission: 3-2-1, up to 10 seconds, a preview,
Keep or Again; saved as `<project>/motion/<scene>-v<n>.webm` (or converted to MP4 with the bundled ffmpeg).
Choosing a file copies it into the project folder (the original is untouched). Nothing is uploaded until the
approved step runs.

## 6. The 4b leftovers

- Higgsfield downloads (`fetch_result()` in `higgsfield.rs`): the result address goes through the same
  private-address and redirect checks as `fetch_with_ssrf_guard()` in `search.rs`.
- A Higgsfield picture that fails: `makePicture()` in `contentImages.ts` makes it with ComfyUI instead, nothing
  recorded for the failed one, and the version's `pictureNote` says "Higgsfield couldn't make picture N (reason);
  made with ComfyUI."
- By-name results in Chat: when a by-name request approved on the board or Telegram finishes, Chat shows the
  result under that request's reply (or a short new message "Higgsfield made …" with the picture or player).

## 7. Costs and approvals

All inside the one monthly cap and the existing approvals:
- Training a character: its own approval with Higgsfield's estimate (from the Brands tab, or Telegram's usual
  approval when asked elsewhere).
- Pictures and clips with a character or motion: the same one-approval-per-step as 4b, with the estimate covering
  them; the plan's wait text says how many motion clips are included.
- The cost recorded is Higgsfield's estimate, once, when the result is made (as in 4b).

## 8. Constraints

- The existing paths: `policyEnforcementService` gates, `joseSpend.ts` cap and records, `higgsfield.rs` for every
  Higgsfield call (keys never in errors), `checked_file()` / `checked_dir()` for files, `download_verified()` for
  pinned local models, Runtime Hub for installs, the Do-Not-Duplicate table.
- Plain language on every screen; every fallback says why.
- Real-person photos: only on this computer and in the one training request; deleting the character deletes them.
- Windows first; camera recording must work in the Tauri window (WebView2), with a clear message when the camera
  is refused.

## 9. Left to the builder

- Higgsfield's character (Soul ID) and motion endpoints, fields, preset list and deletion: not in its public docs
  (third-party sources mention trained characters with a training status, and "Generate a Motion" /
  "List all Motions"); confirm against a live account and record what was found. Where the API needs a model id,
  it is pasted in Settings with its extra settings, as in 4b.
- The ComfyUI image-reference method and the local motion-transfer model: which ones, pinned, and the graphics
  memory each needs.
- Field names, file names, screen layout, the number of Miya-made pictures for a made-up character (my call:
  8), and the desktop spec (nothing paid sent).

## 10. My calls (not the owner's)

- The ComfyUI character path and local motion need models installed from Runtime Hub; without them the step says
  what to install.
- A recording is at most 10 seconds.
- Miya makes 8 pictures for a made-up character.
- A scene marked for motion still has a normal picture made first; the motion clip starts from it.
