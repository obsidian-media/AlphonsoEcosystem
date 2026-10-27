# Agent Guide

Alphonso has 9 specialized agents. What each may do is one table, `src/services/jose/agentPermissionTable.ts`: everyone may read and create new files of its own; only **Alphonso** may run code or change project files; only **Marcus** may publish or send. Spending is allowed only on certain steps (a paid-model step, Miya's paid media steps, Marcus's paid sends) and always asks. `agentContractService.ts` and Jose's plan check enforce it.

## Agent Roster

### Alphonso — Local Operator
**Role:** Code in your projects, commands, plain questions, everyday writing
**Can do:** Work in a project you listed in Settings → Agents → Alphonso's projects (or a new folder under your output folder for small code), plan the change from your files, show it before it happens, write it, run the checks and fix up to two rounds, report plainly; answer questions and write emails and notes; help other agents with writing
**Cannot:** Change a project or run a command that isn't read-only without your approval (one per step, with the preview); commit to git or start a dev server unless you asked; work on two requests in the same project at once; spend or publish
**When to use:** Building, fixing, testing in your projects; plain questions and everyday writing (emails, notes).
**Skills (4, `src/skills/alphonso/`):** Answer a question, Code change, Everyday writing, Verify a build.

### Jose — Orchestrator
**Role:** Answers or plans every request, runs the plan, reports
**Can do:** Answer plain questions; plan a request as steps (agent, action, what each needs), from a template or fresh; show bigger plans first; change a plan while it runs (review rounds, help, a larger model, a paid model if you allow them); tell you on Telegram what waits for you
**Cannot:** Run code or publish; spend only on a paid-model step, which always asks; a plan that breaks the permission table doesn't run
**When to use:** Everything — every message reaches Jose. "Research X, write a report and post it to Slack" becomes steps for Hector, Miya and Marcus, with the Slack step waiting for your approval. Plans are on the Requests board (System → Orchestrator → Requests).
**Skills:** none (Jose plans; planning is not a skill step).

### Hector — Researcher
**Role:** Finds facts and sources (including competitors' public material), with citations
**Runtime:** `src/services/hector/` (since 2026-10-25) — researches in rounds: the question broken into parts, short searches through one chain (Brave, Tavily, Perplexity when set up, then DuckDuckGo and news feeds), the parts of each page that match the question, a write-up with numbered citations, follow-up rounds for what's missing; the answer first. Blocked pages keep their search snippet, labelled. Found nothing → his step waits and says why; he never writes facts from memory
**Can do:** Web search, document analysis, source verification, API docs research, compliance research, competitive analysis; in Miya Studio, what goes viral and a stock clip for each scene (Pexels, Pixabay, Coverr)
**Cannot:** Run commands, change project files, post, or spend
**When to use:** "Research the latest trends in AI", "Find sources for this claim", "Summarize this article"
**Skills (4, `src/skills/hector/`):** Competitor material, Find what works, Stock footage, Web research with sources.

### Miya — Creative
**Role:** UI/UX and creative systems, content creation, and front-end design and code drafts
**Can do:** Miya Studio's content factory: scripts with hooks, scene plans and pictures (with the brand's character), thumbnails, voice-overs, music, sound effects, AI clips and motion, Shorts, carousels and campaigns, and lessons from results; plan UI/UX and brand direction; draft front-end designs and code for Alphonso to build
**Cannot:** Run code or commands (only Alphonso does) or publish (only Marcus does); paid engines (ElevenLabs, Higgsfield, Runway) only inside a step you approved
**When to use:** "Make a YouTube video about X" (starts a Miya Studio project), "Write a script", "Create a marketing strategy", "Design a storyboard".
**Skills (12, `src/skills/miya/`):** Choose sound effects, Creative lessons, Creative package, Design thumbnails, Edit the video, Make a picture, Plan the scenes, Plan the Shorts, UI design, Write a carousel, Write the campaign, Write the script.

### Maria — Governance & Risk Lead
**Role:** Governance, risk and quality reviews
**Runtime:** `src/services/mariaAuditService.ts` (dispatcher) and `src/services/maria/` — her own model only, no rule-based fallback (agent phase 3)
**Can do:** Review work (pass or fix, quoting the words to change; unbacked claims are a fix; Alphonso's files and results with file and line), review a plan (risk and why, the rules that apply, what needs your approval, an offer to have Marcus prepare it), score a video's pieces against what is known about the brand's references and run the quality gate in Miya Studio, Boardroom's Conclude, the weekly review of the week's risks. When she asks for approval, or work still needs changes after two rounds, the steps after hers wait for you. Security matters go to Sentinel
**Cannot:** Perform destructive execution
**Schema:** work review `kind: 'work'`, `verdict`, `findings[]`, `review`; plan review `kind: 'plan'`, `risk`, `why`, `rules[]`, `points[]`, `needsApproval`, `approvalReasons[]`, `offer`; both keep `riskLevel`, `approvalRequired`, `summary`
**When to use:** Jose plans her review steps; a review that finds problems sends the work back (at most 2 rounds).
**Skills (4, `src/skills/maria/`):** Claim check, Governance review, Quality against the references, Quality review.

### Marcus — Distribution & Release Manager
**Role:** The only agent that publishes or sends — always after your approval
**Runtime:** `src/services/marcusExecutionService.ts` — also the one scheduler for posts
**Can do:** Send exactly what the step before him wrote (or what you quoted) to Slack, Discord, Telegram (your team chat or you), WhatsApp, Notion, ClickUp, your listed n8n workflows and Composio apps you switched on; make GitHub draft releases and issues; check whether something is ready to send (read-only, asks nothing); post a project's videos, Shorts and carousels to YouTube, Instagram and Facebook at their times; remind you of posts to make by hand
**Cannot:** Change the words, send anywhere you didn't name or set as a default, or send anything you haven't approved. The approval shows the exact text and destination, and Sentinel checks it first
**Skills (5, `src/skills/marcus/`):** Place a call, Publish a post, Release or issue, Release readiness, Send a message.
**Schema:** `kind: "send"`, `connector`, `target`, `approvedBy: "you"`, `reviewedBy`, `reviewVerdict`, `status`, `resultUrl`
**When to use:** "Write an announcement and post it to Slack #news", "Make a draft GitHub release v1.2.0", "Is this ready to post?", or Campaign Studio's **Approve and schedule**.

### Echo — Knowledge Historian
**Role:** The ecosystem's memory of decisions: what was decided, preferred, instructed or turned down, wherever it was decided
**Runtime:** `src/services/echo/` (agent phase 7) — his own model writes and finds decisions; nothing is made up
**Skills (4, `src/skills/echo/`):** Answer from memory, Forget, Merge and clean memory, Save decisions.
**Can do:** Save the decisions of every finished request (Chat, Telegram, WhatsApp, the phone, schedules, Boardroom, Miya Studio), your approvals and rejections, and anything you ask him to remember; give every agent the decisions and preferences that apply to its step; answer "what did we decide about …?"; forget a decision (asking which when it could be several); propose a cleanup of memory
**Cannot:** Change memory in a cleanup until you apply it; invent a decision that isn't in the request or the work
**When to use:** "Remember that …", "What did we decide about …?", "Forget …", "Clean up my memory". He also saves each request's decisions on his own, shown as "Echo remembered: …" with Edit and Forget.

### Sentinel — Security Monitor
**Role:** Security monitoring and automation safety
**Note:** security only (risk and quality reviews are Maria's)
**Runtime:** `src/services/sentinel/` (agent phase 4) — his own model judges; exact checks (keys, password requests, disguised links, deleting or code commands) are handed to him as facts
**Skills (3, `src/skills/sentinel/`):** Content safety check, Permission audit, Text and link check.
**Can do:** Check work, a post, an email, code (with its files, results and dependencies) or a request: Safe, Risky or Unsafe, each finding with what, where, how serious and the fix. A serious finding makes the next steps wait for you. Reviews the last week of activity on request (the sidebar's Re-scan, Telegram `/scan`, the daily schedule). Checks a campaign before it's posted. Uses your trusted-domain list.
**Cannot:** Perform destructive execution; decide what commands may run (the backend gate does)
**When to use:** Ask him ("check this post for security problems"). He also checks without being asked: before anything Marcus sends, after Alphonso changes or runs code, the research a step acts on, and a request that contains a key or a link (keys are hidden from every agent's model).

### Nova — Opportunity Analyst
**Role:** Judging value, priority and timing from what Hector found
**Runtime:** `src/services/novaAnalysisService.ts` and `src/services/nova/` (since 2026-10-25) — her model judges what she was given and answers with a ranked verdict; no keyword scores
**Skills (6, `src/skills/nova/`):** Best time to post, Follow-up ideas, Judge the market, Read the results, Review the script, Value and priority.
**Can do:** Rank the options a request names or Hector found: each with why, value / effort / risk (high, medium, low) and the sources that support it; say what to do first and what would change her mind. A single option also gets a 0–100 score. With nothing to judge she asks Hector to research first. Her last verdicts are in Settings and on Telegram (`/nova`)
**Cannot:** Execute actions — analysis and recommendation only
**Schema:** `doFirst`, `options` (`name`, `rank`, `why`, `value`, `effort`, `risk`, `sources`, `notJudged`), `wouldChange`, `score` (one option only), `fromRequestOnly`
**When to use:** "Which of these is most promising?", "Prioritize these tasks", "Analyze this opportunity". In Miya Studio, Nova checks the market, reviews the script's value, suggests post times, and turns each post's results into lessons and follow-up ideas.

## Hermes agent backend (opt-in, per agent)

Every agent's "thinking" comes from local Ollama by default (with NVIDIA/Gemini
as alternate providers — see `modelSelectionService.ts`, `ModelSwitcher.tsx`).
A 4th option now exists, **per agent**: routing a specific agent's turn to a
live, standalone "Hermes Agent" (Nous Research, MIT-licensed) instance the
owner runs separately on their own machine — 5 of the 9 in-app agents
(Jose/Hector/Miya/Marcus/Alphonso) have a real, running "standalone twin"
profile today, each self-described as such in its own persona doc, with the
remaining 4 (Maria/Echo/Sentinel/Nova) expected to follow. Ollama stays the
unconditional default for every agent; this is purely additive and opt-in per
agent — untouched for anyone who never opens Settings → Connectors → Agent
Providers.

**PR 1a scope (shipped):** `src/services/connectors/hermesAgentConnector.ts`,
the per-agent provider map in `modelSelectionService.ts`
(`getAgentProvider`/`setAgentProvider`), the `HermesAgentsSection` credential
UI and `AgentProvidersSection` picker, and the shared `generateAgentLlmResponse`
dispatcher in `src/lib/ollama.ts` wired into every confirmed per-agent LLM
call site (see the "Shared per-agent LLM dispatcher" row in `CLAUDE.md`'s
Do Not Duplicate table for the exact list). **PR 1b (done 2026-08-21):** health-check registration, circuit breaker, rate
limiter, audit log and approval gating for Hermes-backed turns (a Hermes
profile can run real tools, not just generate text). **Session continuity
(done 2026-10-06):** each per-agent call passes a natural session id through
`X-Hermes-Session-Id`. A Hermes endpoint that isn't on this computer counts as
paid, so Zero-Cost Mode blocks it. **Phase 2 (deferred, opt-in decided):**
bundling Hermes into the installer for new users.

Full design lives in `docs/HERMES_AGENT_DELEGATION_PLAN.md`. **That file is
gitignored** (it references this machine's own local Hermes install
paths/ports) — if you're a future session and it's missing, check
`docs/TRUTH_FIRST_EXECUTION_PLAN.md` §I and `docs/governance/DEFERRED_WORK.md`
for the summary, and re-derive or request the full file from the owner before
starting Phase 1b or Phase 2.

## How Agents Collaborate

```
You: "Research AI trends, write a blog post and post it to Slack"
  → Jose plans (from the Research report template, adapted):
    → hector: research AI trends, with citations
    → miya: write the post             (needs hector)
    → maria: review accuracy and tone  (needs miya; may send it back, 2 rounds)
    → marcus: post to Slack            (needs maria; publish_or_send: waits for you)
  → You: approve on the board, in Chat or on Telegram
  → Marcus posts; Echo saves what was decided
```

## Who Owns What

Each kind of work has exactly one owner (`AGENT_PERMISSION_TABLE`, `owns` and `never` per agent; `ownerOf()` finds it, and a test fails if two agents could take the same task type). Jose plans, routes, approves and writes the closing summary, and does none of the work. Alphonso owns code, commands, plain questions and everyday writing; Miya content and design (and editing the finished video), never code; Hector finding facts; Nova judging what Hector found; Maria quality, governance and risk; Sentinel security; Marcus sending, publishing and calls; Echo memory. Help goes only to the owner of the work asked for, and a step whose owner can't work waits for setup instead of moving to another agent.

Every step gets the full output of the steps it depends on (by step, cut at 6,000 characters for local models, 20,000 for paid or cloud ones), one line for each other finished step, and memory. A review gets the work it reviews and gives its verdict in the same answer.

## Skills

Each agent (Jose aside: he plans) has its own skills: know-how for one kind of job plus the tools it needs, one Markdown file each (`src/skills/<agent>/`). A skill can give its agent only work it owns and tools it may use; one that breaks this is refused with the reason. For every step the agent picks one of its skills for that kind of work (with one, it is used straight away), and the board shows the skill and why. A small model runs the skill's tools in the skill's order; a larger one (14B and up by default, set in Settings → Agents) or a paid or cloud model calls them itself, at most 5 times. Tools that send, publish, call, run code, change files or make media are never called this way: they are the step's own action and keep its approval.

| Agent | Built-in skills |
|-------|-----------------|
| Alphonso | Answer a question, Everyday writing, Code change, Verify a build, Fix a bug from an error, Write tests, Explain code, Summarise a document, API and tool integration, Plan and build a feature |
| Miya | Write the script, Plan the scenes, Design thumbnails, Plan the Shorts, Choose sound effects, Write a carousel, Write the campaign, Creative lessons, Creative package, UI design, Edit the video, Make a picture |
| Hector | Web research with sources, Competitor material, Find what works, Stock footage, Compare products and prices, Find companies or people |
| Nova | Value and priority, Judge the market, Review the script, Best time to post, Read the results, Follow-up ideas, Pros and cons, Pricing |
| Maria | Quality review, Claim check, Governance review, Quality against the references, Review code, Brand voice check |
| Sentinel | Text and link check, Permission audit, Content safety check, Dependency check, Personal-data check |
| Marcus | Send a message, Publish a post, Place a call, Release readiness, Release or issue, Email newsletter, Follow-up reminder |
| Echo | Save decisions, Answer from memory, Merge and clean memory, Weekly decisions digest, Project memory summary |

You can add your own on All Agents → Skills (a form, or a skill file), and they sit beside the built-in ones.

What else changed in agent roles Part C2: Marcus sends at a time you name ("send it tomorrow at 9"), approved once; a request that names two of your projects gets one Alphonso step in each; you can edit Alphonso's change on the board before approving it; Hector reads a PDF's text and follows his skill when he writes up; Nova finds the options in an ordinary sentence; Sentinel checks people research for personal data; Echo finds a decision worded differently, with a small model on your computer.

The Skills page shows how each skill has done: how often it was used, how many of its reviewed steps passed, and when it was last used.

### Teams

A team is a saved set of steps, one agent each, for a kind of job you do often (System → Teams). Each agent in a team gets only work it owns; a team that breaks that is refused with the reason. "use team <name> to …" runs it as a request.

## Agent Permissions Matrix

From `agentPermissionTable.ts` and the plan check. Settings → General → What asks first decides which allowed effects ask; spend and publish always do.

| Agent | Read | Write its own work | Change project files | Run code | Spend | Publish or send |
|-------|------|------|------|------|------|------|
| Alphonso | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Jose | ✅ | ✅ | ❌ | ❌ | ⚠️ paid-model steps | ❌ |
| Hector | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Miya | ✅ | ✅ | ❌ | ❌ | ⚠️ paid media steps only | ❌ |
| Maria | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Marcus | ✅ | ✅ | ❌ | ❌ | ⚠️ | ⚠️ |
| Echo | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Sentinel | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Nova | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

✅ = Allowed | ⚠️ = Allowed, always asks | ❌ = Not allowed. Any step Jose gives a paid model (Claude, ChatGPT) may spend, and always asks.

## Agents in Voice OS

When using the Voice OS pipeline, the same 9 agents handle voice requests. The `voice/backend/router.py` uses keyword regex patterns to route audio transcriptions:

| Voice intent | Agent | Example phrase |
|-------------|-------|----------------|
| Search / research | **Hector** | "Find the latest news on..." |
| Write / draft | **Miya** | "Write a blog post about..." |
| Task / plan | **Jose** | "Schedule a task for tomorrow..." |
| Memory / recall | **Echo** | "What did I say about...?" |
| Security / scan | **Sentinel** | "Scan for vulnerabilities in..." |
| Opportunity / market | **Nova** | "What are the growth opportunities for...?" |
| Publish / distribute | **Marcus** | "Post this to Telegram..." |
| Governance / compliance | **Maria** | "Review this for compliance..." |
| Everything else | **Alphonso** | Default fallback |

The Voice OS agent routing is stateless per utterance — each transcription is independently classified.

## Viewing Agent Activity

Open **Runtimes → Activity** to see real-time agent actions, decisions, and audit logs; each Jose request's steps and outputs are on the Requests board. Voice OS activity (server start/stop) is also logged here via `agentActivityService`.
