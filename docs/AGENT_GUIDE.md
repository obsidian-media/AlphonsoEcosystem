# Agent Guide

Alphonso has 9 specialized agents. What each may do is one table, `src/services/jose/agentPermissionTable.ts`: everyone may read and create new files of its own; only **Alphonso** may run code or change project files; only **Marcus** may publish or send. Spending is allowed only on certain steps (a paid-model step, Miya's paid media steps, Marcus's paid sends) and always asks. `agentContractService.ts` and Jose's plan check enforce it.

## Agent Roster

### Alphonso — Local Operator
**Role:** General execution, verification, packaging
**Can do:** Run commands, read/write files, build projects, verify outputs
**Cannot:** Bypass approval gates (commands that run code ask according to Settings; commands that delete always ask); spend or publish
**When to use:** Building, fixing, testing; plain questions and everyday writing (emails, notes).
**Skill Packs (18):**
- Core Coding: `pack.coding.full-stack`, `pack.coding.tdd`, `pack.alphonso-typescript-mastery`, `pack.alphonso-rust-operations`, `pack.alphonso-react-patterns`, `pack.alphonso-python-voice`
- Verification: `pack.alphonso-code-review`, `pack.alphonso-build-verification`, `pack.alphonso-refactoring`, `pack.debugging.root-cause`
- Operations: `pack.alphonso-runtime-diagnostics`, `pack.alphonso-security-audit`, `pack.github.integration`, `pack.alphonso-performance-optimization`
- Extended: `pack.alphonso-api-integration`, `pack.alphonso-error-handling`
- Existing: `pack.codex-professional-coding`, `pack.alphonso-runtime-operations`

### Jose — Orchestrator
**Role:** Answers or plans every request, runs the plan, reports
**Can do:** Answer plain questions; plan a request as steps (agent, action, what each needs), from a template or fresh; show bigger plans first; change a plan while it runs (review rounds, help, a larger model, a paid model if you allow them); tell you on Telegram what waits for you
**Cannot:** Run code or publish; spend only on a paid-model step, which always asks; a plan that breaks the permission table doesn't run
**When to use:** Everything — every message reaches Jose. "Research X, write a report and post it to Slack" becomes steps for Hector, Miya and Marcus, with the Slack step waiting for your approval. Plans are on the Requests board (System → Orchestrator → Requests).
**Skill Packs (21, plus the shared executing-plans pack):**
- Orchestration: `pack.jose-professional-orchestration`, `pack.jose-task-routing`, `pack.jose-approval-gating`, `pack.jose-cross-agent-synthesis`, `pack.jose-pipeline-governance`, `pack.workflow.executing-plans`
- Planning: `pack.jose-workflow-design`, `pack.jose-strategic-planning`, `pack.jose-dependency-mapping`
- Coordination: `pack.jose-agent-coordination`, `pack.jose-parallel-orchestration`, `pack.jose-task-prioritization`
- Governance: `pack.jose-risk-assessment`, `pack.jose-quality-gates`, `pack.jose-compliance-checks`
- Monitoring: `pack.jose-progress-tracking`, `pack.jose-status-reporting`, `pack.jose-performance-metrics`
- Optimization: `pack.jose-workflow-optimization`, `pack.jose-bottleneck-detection`, `pack.jose-continuous-improvement`
- Communication: `pack.jose-stakeholder-communication`

### Hector — Researcher
**Role:** Finds facts and sources (including competitors' public material), with citations
**Runtime:** `src/services/hectorResearchService.js` — Brave Search, Tavily, Perplexity, DuckDuckGo and RSS (through the backend), synthesized with Ollama
**Can do:** Web search, document analysis, source verification, API docs research, compliance research, competitive analysis; in Miya Studio, what goes viral and a stock clip for each scene (Pexels, Pixabay, Coverr)
**Cannot:** Run commands, change project files, post, or spend
**When to use:** "Research the latest trends in AI", "Find sources for this claim", "Summarize this article"
**Skill Packs (21, plus the shared executing-plans and GitHub research packs):**
- Existing: `pack.hector-professional-marketing`, `pack.hector-market-research`, `pack.hector-competitive-analysis`, `pack.hector-source-verification`, `pack.hector-rss-monitoring`, `pack.workflow.executing-plans`, `pack.github.research`
- API Research: `pack.hector-api-documentation-research`, `pack.hector-api-integration-research`
- Compliance: `pack.hector-compliance-research`, `pack.hector-security-research`
- Market: `pack.hector-trend-analysis`, `pack.hector-market-intelligence`, `pack.hector-content-research`
- Technical: `pack.hector-code-pattern-research`, `pack.hector-technical-architecture-research`, `pack.hector-open-source-analysis`
- Data: `pack.hector-data-gathering`, `pack.hector-source-curation`, `pack.hector-confidence-scoring`, `pack.hector-survey-design`
- Documentation: `pack.hector-documentation-audit`, `pack.hector-research-briefing`

### Miya — Creative
**Role:** UI/UX and creative systems, content creation, and front-end design and code drafts
**Can do:** Miya Studio's content factory: scripts with hooks, scene plans and pictures (with the brand's character), thumbnails, voice-overs, music, sound effects, AI clips and motion, Shorts, carousels and campaigns, and lessons from results; plan UI/UX and brand direction; draft front-end designs and code for Alphonso to build
**Cannot:** Run code or commands (only Alphonso does) or publish (only Marcus does); paid engines (ElevenLabs, Higgsfield, Runway) only inside a step you approved
**When to use:** "Make a YouTube video about X" (starts a Miya Studio project), "Write a script", "Create a marketing strategy", "Design a storyboard".
**Skill Packs (21).**

### Maria — Governance & Risk Lead
**Role:** Governance, risk and quality reviews
**Runtime:** `src/services/mariaAuditService.ts` — Ollama-powered with deterministic fallback
**Can do:** Run governance audits, score risk (low/medium/high/critical), flag policy violations, emit compliance notes; review scripts and run the quality gate in Miya Studio; Boardroom's Conclude. She says when her verdict came from the rule-based check because the model's reply couldn't be read
**Cannot:** Perform destructive execution
**Schema:** `riskLevel`, `approvalRequired`, `policyFindings[]`, `complianceNotes[]`, `summary`
**When to use:** Jose plans her review steps; a review that finds problems sends the work back (at most 2 rounds).
**Skill Packs (18):**
- Governance: `pack.maria-audit-governance`, `pack.maria-trust-verification`
- Requirements: `pack.maria-requirements-analysis`, `pack.maria-risk-classification`
- Compliance: `pack.maria-compliance-auditing`, `pack.maria-approval-workflow`, `pack.maria-policy-enforcement`
- Evidence: `pack.maria-evidence-collection`, `pack.maria-claim-verification`, `pack.maria-trust-audit`
- Audit: `pack.maria-audit-trail`, `pack.maria-state-verification`
- Content: `pack.maria-brand-safety`, `pack.maria-content-moderation`, `pack.maria-quality-assurance`
- Documentation: `pack.maria-documentation-review`, `pack.maria-stakeholder-reporting`
- Incident: `pack.maria-incident-response`

### Marcus — Distribution & Release Manager
**Role:** The only agent that publishes or sends — always after your approval
**Runtime:** `src/services/marcusExecutionService.ts` — also the one scheduler for posts
**Can do:** Post a project's videos, Shorts and carousels to YouTube, Instagram and Facebook at their times (YouTube and Facebook are scheduled on the platform; Instagram is sent by his runner, also after the app was closed), remind you of posts to make by hand, create GitHub releases and issues, send Slack messages
**Cannot:** Publish or send anything you haven't approved
**Skill Packs (15):** release, distribution and communication packs (his security and risk packs moved to Sentinel and Maria on 2026-10-23)
**Schema:** `workflowId`, `connectorId`, `approvedBy: "maria-governance"`, `status`, `resultUrl`, `executedAtMs`
**When to use:** "Post this to Slack", "Create a GitHub release", or Campaign Studio's **Approve and schedule**.

### Echo — Knowledge Historian
**Role:** Memory synthesis and archival across all agent outputs
**Runtime:** `src/services/echoMemoryService.ts` — Ollama-powered with deterministic fallback
**Can do:** Synthesize memories from workflow outputs, classify retention policy (permanent/standard_180d/ephemeral_7d), categorize memories (project/timeline/preference/orchestration), normalize confidence levels
**Cannot:** Modify or delete without approval
**Schema:** `memoryId`, `category`, `retentionPolicy`, `sensitivity`, `confidenceLevel`, `archivedAtMs`
**When to use:** Automatic — Echo saves a request's decisions when it finishes, and remembers what you reject in Miya Studio.

### Sentinel — Security Monitor
**Role:** Security monitoring and automation safety
**Note:** security only (risk and quality reviews are Maria's)
**Runtime:** `src/services/sentinelSecurityService.ts` — two-layer detection: deterministic + Ollama
**Can do:** Monitor for threats, validate safety of automated actions, scan the last week of activity (the sidebar's quick scan says how much it looked at), check content before it's posted
**Cannot:** Perform destructive execution
**When to use:** Automatic — Sentinel monitors all external interactions for security risks.

### Nova — Opportunity Analyst
**Role:** Opportunity scoring, prioritization, and strategic analysis
**Runtime:** `src/services/novaAnalysisService.ts` — 4-dimension scoring + Ollama strategic analysis
**Can do:** Score opportunities across 4 dimensions (valueScore/riskScore/timingScore/effortScore), classify priority tier (watchlist/medium/high/critical), generate strategic recommendations, store scores for decomposition hints, identify favorable opportunity/risk ratios
**Cannot:** Execute actions — analysis and recommendation only
**Schema:** `opportunityId`, `valueScore`, `riskScore`, `timingScore`, `effortScore`, `priorityTier`, `recommendation`, `analyzedAtMs`
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
