# Miya content factory: design

> **Status (2026-10-25):** phase 1 built (PR #332); phases 2a to 4c followed (PRs #343 to #354). Released in 2.10.0 (2026-10-27).

Status: draft for the owner's approval (2026-10-22). Nothing is built yet.

## 1. Intent

Miya Studio becomes Alphonso's content engine: from an idea to a finished,
ready-to-publish piece (a video file, a published post, or a curated image),
made by the agents together the way Alphonso already works. Jose orchestrates,
and each agent does its own job:
- Hector researches what goes viral.
- Nova checks the market and competitors, and reviews the hook and script.
- Miya writes, designs and produces.
- Maria runs the quality gate.
- Marcus publishes.
- Echo remembers what worked and what the owner rejected.

**Why now.** Today the four Studio tabs (Script, Scene, Thumbnail, Campaign) show
the same view (QA, 2026-10-22). The owner has been making content by hand in
three workspaces (`D:\AgentDevWork\Podcast`, `YouTubeChannel`, `SocialMedia`),
and those workspaces taught hard lessons that this design keeps:
- Research comes before every batch.
- Work is scored against real reference posts, and only 7+/10 is shown.
- The agent's own scores ran about twice the owner's, so it scores side by side
  with references, never alone.
- Copy is honest: say it is AI-generated, no invented numbers.
- Voice licensing matters for commercial use.
- Shorts are complete thoughts, not random cuts.
- You look at thumbnail candidates before picking.

**Who it is for.**
- The owner, for his own channels.
- The owner's clients.
- Any Alphonso user making content for their own brands.
So it supports several brands, each with its own brand kit, voice, folder,
references and lessons.

**What success looks like.** Every piece that comes out of the engine is
something to be proud of: researched, on-brand, scored against references, and
approved by the user before it goes anywhere or costs anything.

## 2. Goals

1. One **project** = one idea for one brand. It produces the outputs the user
   asks for: a long video, Shorts, a carousel, an image post, a podcast episode,
   ads.
2. A fixed flow the user can follow and enter at any step. The user's usual way
   is: idea, then Hector's virality research and Nova's market check, then
   script, Nova and Maria review, scenes, audio, assembly, thumbnail, campaign,
   quality gate, publish or export.
3. Each Studio tab has its own tool (section 5).
4. All formats are selectable in the app (owner, Q9).
5. Projects are saved, listed and versioned. Changing an earlier step marks the
   later ones **out of date**, and the user decides what to redo (owner, Q6, Q8).
6. One idea can become several pieces. Shorts made from a long video are
   **written as their own complete mini-scripts**, not cut at random (owner, Q7).
7. Live progress for every step: what is running, which agent, how far, how long.
   Never 20 silent minutes (owner, Q27).
8. Learning: the user's scores and rejection reasons are saved per brand (Echo)
   and fed into the next project's prompts. This is memory of feedback, not
   model training, and the app says so.

## 3. Non-goals and anti-goals

**Non-goals (for now):**
- Merging with Mint. Mint stays separate (owner, 2026-10-22).
- Languages other than English (owner).
- Training or fine-tuning models.
- Lip-sync, which does not fit a 6 GB GPU (SocialMedia research, round 15).
- A timeline editor inside Alphonso.

**Anti-goals (failure even if it "works"):**
- Content that looks like generic AI slop, or is scored only by the agent's own
  opinion.
- Anything published, scheduled or paid for without the user's approval.
- A silent fallback presented as real output. (Repo rule: a model-backed feature
  that falls back must say so.)
- Voices or assets used commercially without a license that allows it.
- Shorts that are random cut-and-pause clips.
- Long silent waits.

## 4. How it fits Alphonso (orchestration)

- **Jose stays the orchestrator.** A project is a sequence of **steps**. Each step
  is sent to Jose as its own request (`runJoseCommandExecutionPipeline`), with the
  project's earlier step results attached. This means:
  - Jose's packets, waves, receipts, budgets, approvals (`ApprovalPanel`,
    Approval Mode), Activity log and Orchestrator view all apply unchanged.
  - Jose gives each agent one task per request, and the fixed ordering in
    `AGENT_DEPENDENCIES` runs Nova and Maria first. Reviews therefore must be
    their own step, after the step they review.
- **The engine adds only the project:** its step order, its saved state,
  versions, out-of-date marks and the folder. It does not replace Jose's routing.
- **Agent jobs per step** (each agent calls its own model through
  `generateAgentLlmResponse(agentId, …)`, so per-agent providers in Settings
  apply):

  | Step | Agents (via Jose) | Output |
  |---|---|---|
  | 1 Brief | user, Jose | brand, idea, platforms, outputs wanted, format, length |
  | 2 Research | Hector (virality: reference posts, hooks, patterns), Nova (competitors, market, opportunity) | research report with logged references |
  | 3 Script | Miya (Script Studio) | hook options + timed script |
  | 4 Review | Nova (hook/script vs research), Maria (quality vs references, honesty, brand) | scores + notes; user approves or sends back |
  | 5 Scenes | Miya (Scene Builder) | storyboard, shot list, a picture per scene, video clips |
  | 6 Audio | Miya | voice-over, music, sound effects |
  | 7 Assembly | Miya (run by Alphonso's backend) | the finished file(s) |
  | 8 Thumbnail | Miya (Thumbnail Studio) | 3 finished thumbnails |
  | 9 Campaign | Miya (Campaign Studio), Nova (timing) | captions, hashtags, ad copy, calendar, derivative pieces |
  | 10 Quality gate | Maria (+ Sentinel for anything risky in text/links) | scores vs references; only 7+ reaches the user, unless the user asks to see everything |
  | 11 Publish/export | Marcus (publish, after approval), Content Studio handoff, export, calendar (Jose scheduler) | published post / scheduled item / files |
  | always | Echo | saves decisions, scores, rejection reasons, what performed |

- **Approvals** (owner, Q26): quality, and **any money spent**, always wait for
  the user. Paid connectors (Runway, Deepgram, ElevenLabs, Higgsfield, ads) go
  through `policyEnforcementService` (Zero-Cost Mode, Approval Mode) like every
  other connector. Each paid step shows its expected cost before the user
  approves.

## 5. The Studio tabs, each with its own tool

All tabs share the project's idea fields and the brand kit. They are chained:
script, then scenes, then thumbnail, then campaign. Any tab can still be used
alone: "just thumbnails for this title" is a valid project.

**Script Studio**
- Formats:
  - talking head
  - voice-over with B-roll
  - tutorial
  - story
  - ad
  - listicle
  - podcast (solo or two hosts; owner, Q7)
  - carousel copy
  - image-post copy
- Length, platform and tone. 3 hook options grounded in Hector's references.
- The script includes timings, spoken words, on-screen text, B-roll notes and
  music cues (owner, Q10).
- Optional "write in my voice" from the brand's past scripts, chosen per project
  (owner, Q11).

**Scene Builder**
- Storyboard and shot list: camera angle, movement and duration per scene
  (owner, Q12, both).
- A picture per scene through ComfyUI, then a video clip through **Runway or
  ComfyUI, chosen per project** (owner, Q13).
- One consistent look across scenes: a style and character reference reused for
  every scene (owner, Q14).
- Long videos use **stock B-roll as the base, with generated shots added**
  (owner, Q4). The B-roll comes from Pexels, Pixabay and Coverr, keyword-searched
  per scene, as in the YouTube pipeline.

**Thumbnail Studio**
- 3 options per video (owner, Q15).
- Fully generated by default. A face or uploaded photo only when the user asks
  (owner, Q16).
- The headline is **drawn onto the image by Alphonso** in the brand's fonts and
  colours, giving a finished 1280×720 (or the platform's size) (owner, Q17).
- No styles are excluded (owner, Q18).

**Campaign Studio**
- Per-platform captions, hashtags and descriptions within each platform's
  limits.
- Ad copy for Meta Ads, Google Ads and YouTube Ads (owner, Q21).
- Derivative pieces: Shorts, a carousel or a post from the same idea, each
  written as its own complete piece.
- A calendar with suggested times (Nova, using the research) **and** the brand's
  fixed schedule (owner, Q20).
- The user decides what happens per project (owner, Q19): hand to Marcus to
  publish, send to Content Studio, export files, or put it on the calendar.

## 6. Audio, video and assembly

- **Voice:**
  - Default: **Kokoro**, local, free, Apache-2.0, cleared for commercial use
    (owner, Q2).
  - Optional paid voices (Deepgram, ElevenLabs paid) ask first.
  - Each brand keeps its own voice.
  - Every voice records its license, and AI narration is labelled as AI
    (Deepgram terms §3.5).
  - Edge TTS and free-tier ElevenLabs are never used for commercial output
    (`VOICE-LICENSING.md` research).
- **Music and sound effects:** AudioCraft through Runtime Hub. Original or
  synthesised only, no copyrighted tracks.
- **Assembly** (owner, Q23: Miya's step, run by Alphonso):
  - Scenes, voice, music and captions become one file per output, in 16:9 and
    9:16.
  - Captions use word timings from Whisper (already in the backend), aligned to
    the script's real text.
  - Audio is loudness-normalised.
  - Each output is checked with ffprobe and with frame grabs.
- **GPU (RTX 2060, 6 GB):**
  - Local clips are short and low resolution, then upscaled.
  - Ollama and ComfyUI share the GPU through `freeOllamaGpuMemory()`.
  - Long jobs show progress and can resume.

## 7. Brands, files and learning

- **Brands** (owner, Q24): several brand kits. Each kit holds:
  - name, palette, fonts and logo
  - character or style references
  - voice
  - platforms and schedule
  - honesty rules
  - reference posts
  - lessons
  The existing single brand kit (`miya-brand-kit`) becomes the first brand.
- **Folders** (owner, Q6): one folder per brand, and one per project inside it,
  under a root folder the user chooses (Settings' output folder).
  - Suggested layout:
    `<root>/<brand>/<project>/{brief, research, script, scenes, audio, output, thumbnail, campaign}`
  - Plus a project file holding the steps, versions and decisions.
  - Raw generations are kept and never edited.
- **Quality gate** (owner, Q5):
  - Maria scores each piece side by side with the brand's references.
  - The threshold is 7 by default and can be changed per brand.
  - Scores and weak points are always shown.
- **Learning** (owner, Q25, "try again, learn from mistakes"):
  - A rejected piece can be retried with the user's reason.
  - Echo saves the reason and the score.
  - Every later project for that brand includes the brand's lessons in the
    agents' prompts.
  - Later, real performance numbers (views, saves, sends) are added where a
    connector can read them.

## 8. Phases (owner agreed the order)

1. **Research to text and pictures.** Projects, brands and folders; the brief;
   Hector and Nova research; Script Studio; the review step; the Scene Builder's
   storyboard and pictures; Thumbnail Studio (3 finished thumbnails); Campaign
   Studio text. Also approvals, versions, out-of-date marks, live progress, and
   the quality gate.
2. **Video, audio and the finished file.** Scene clips (ComfyUI or Runway),
   stock B-roll, Kokoro voice, AudioCraft music, assembly and captions.
3. **Publishing.** Marcus publish, calendar, ad copy handoff, derivative pieces.
4. **Learning loop and outside tools.** Performance numbers, a CapCut export or
   bridge, new connectors (Higgsfield, ElevenLabs; owner idea, Q28).

Each phase gets its own plan and PRs.

## 9. Constraints

- Build on what exists. Do not duplicate (see CLAUDE.md's table):
  - Jose's pipeline
  - `agentBusService` packets and approvals
  - `hectorResearchService`, `novaAnalysisService`, `mariaAuditService`,
    `echoMemoryService`, `marcusExecutionService`, `joseSchedulerService`
  - the ComfyUI image generator and its backend route
  - `runwayService`
  - Content Studio (`contentCatalystService`)
  - Runtime Hub (AudioCraft)
  - Whisper in `workspace.rs`
  - `policyEnforcementService`
- No hardcoded paths, models, risk ratings or fixed lists where the user should
  choose.
- Windows first (owner). English only.
- Everything local and free by default; paid steps ask first and show their
  cost.

## 10. Calls I made (the owner can overrule)

- Each step is its own Jose request, so reviews come after what they review.
- Maria runs the quality gate, Sentinel checks text and links, and Nova suggests
  posting times.
- Shorts are written by Miya as new mini-scripts that use the long video's
  audio and footage only where a passage is complete on its own.
- The first brand is created from the existing Miya brand kit.
- Project files live in the brand folder, not in the app's database. The app
  keeps only a list of projects.

## 11. Known limit in Jose (to fix later)

The owner wants Jose's orchestration fixed after this design (2026-10-22, see
`docs/governance/DEFERRED_WORK.md`). Today:
- one request gives each agent only one task;
- the order of agents is fixed for every request, with Nova and Maria first;
- there is no review-and-revise loop.

This design works around that by making each step its own Jose request. When
Jose gains per-request step graphs, the factory's steps can become one request
with real review loops, and nothing else in this design changes.

## 12. Left to the builder

The project file format, folder names, how progress is reported (Jose's existing
`onProgress` events), the exact prompts, the B-roll keyword search, thumbnail
text layout (from the YouTube workspace's `make_thumbnail.py` lessons: crop
clashing captions, a gradient not a box, look at candidates), and the tests.
