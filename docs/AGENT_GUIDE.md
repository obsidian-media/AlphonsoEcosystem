# Agent Guide

Alphonso has 9 specialized agents. Each has a defined role, permissions, and constraints enforced by `agentContractService.js`.

## Agent Roster

### Alphonso — Local Operator
**Role:** General execution, verification, packaging
**Can do:** Run commands, read/write files, build projects, verify outputs
**Cannot:** Bypass approval gates for risky actions
**When to use:** Default agent for most tasks. When you say "build me a website" or "fix this bug", Alphonso handles it.
**Skill Packs (18):**
- Core Coding: `pack.coding.full-stack`, `pack.coding.tdd`, `pack.alphonso-typescript-mastery`, `pack.alphonso-rust-operations`, `pack.alphonso-react-patterns`, `pack.alphonso-python-voice`
- Verification: `pack.alphonso-code-review`, `pack.alphonso-build-verification`, `pack.alphonso-refactoring`, `pack.debugging.root-cause`
- Operations: `pack.alphonso-runtime-diagnostics`, `pack.alphonso-security-audit`, `pack.github.integration`, `pack.alphonso-performance-optimization`
- Extended: `pack.alphonso-api-integration`, `pack.alphonso-error-handling`
- Existing: `pack.codex-professional-coding`, `pack.alphonso-runtime-operations`

### Jose — Orchestrator
**Role:** Intake, routing, decomposition, merge, confirm, report
**Can do:** Break complex tasks into sub-tasks, assign to other agents, merge results
**Cannot:** Bypass high-risk restrictions
**When to use:** Complex multi-step requests. Jose automatically decomposes "research X, write a report, and email it" into sub-tasks for Hector, Miya, and Marcus.
**Skill Packs (22):**
- Orchestration: `pack.jose-professional-orchestration`, `pack.jose-task-routing`, `pack.jose-approval-gating`, `pack.jose-cross-agent-synthesis`, `pack.jose-pipeline-governance`, `pack.workflow.executing-plans`
- Planning: `pack.jose-workflow-design`, `pack.jose-strategic-planning`, `pack.jose-dependency-mapping`
- Coordination: `pack.jose-agent-coordination`, `pack.jose-parallel-orchestration`, `pack.jose-task-prioritization`
- Governance: `pack.jose-risk-assessment`, `pack.jose-quality-gates`, `pack.jose-compliance-checks`
- Monitoring: `pack.jose-progress-tracking`, `pack.jose-status-reporting`, `pack.jose-performance-metrics`
- Optimization: `pack.jose-workflow-optimization`, `pack.jose-bottleneck-detection`, `pack.jose-continuous-improvement`
- Communication: `pack.jose-stakeholder-communication`

### Hector — Researcher
**Role:** Research with citations, source scanning
**Runtime:** `src/services/hectorResearchService.js` — Brave Search + RSS + Ollama-powered
**Can do:** Web search, document analysis, source verification, API docs research, compliance research, competitive analysis
**Cannot:** Execute terminal commands, filesystem operations, posting, or purchases
**When to use:** "Research the latest trends in AI", "Find sources for this claim", "Summarize this article"
**Skill Packs (23):**
- Existing: `pack.hector-professional-marketing`, `pack.hector-market-research`, `pack.hector-competitive-analysis`, `pack.hector-source-verification`, `pack.hector-rss-monitoring`, `pack.workflow.executing-plans`, `pack.github.research`
- API Research: `pack.hector-api-documentation-research`, `pack.hector-api-integration-research`
- Compliance: `pack.hector-compliance-research`, `pack.hector-security-research`
- Market: `pack.hector-trend-analysis`, `pack.hector-market-intelligence`, `pack.hector-content-research`
- Technical: `pack.hector-code-pattern-research`, `pack.hector-technical-architecture-research`, `pack.hector-open-source-analysis`
- Data: `pack.hector-data-gathering`, `pack.hector-source-curation`, `pack.hector-confidence-scoring`, `pack.hector-survey-design`
- Documentation: `pack.hector-documentation-audit`, `pack.hector-research-briefing`

### Miya — Creative
**Role:** Strategy, scripting, storyboarding, export
**Can do:** Generate creative content, scripts, storyboards, video concepts
**Cannot:** Execute system commands or unapproved publishing
**When to use:** "Write a YouTube script about X", "Create a marketing strategy", "Design a storyboard".

### Maria — Governance Auditor
**Role:** Risk assessment, compliance review, approval gating
**Runtime:** `src/services/mariaAuditService.js` — Ollama-powered with deterministic fallback
**Can do:** Run governance audits on any assignment, score risk (low/medium/high/critical), flag policy violations, emit compliance notes, gate Marcus execution
**Cannot:** Perform destructive execution
**Schema:** `riskLevel`, `approvalRequired`, `policyFindings[]`, `complianceNotes[]`, `summary`
**When to use:** Automatic — Jose routes governance-flagged actions through Maria before Marcus executes. High/critical risk with `approvalRequired=true` blocks Marcus.
**Skill Packs (18):**
- Governance: `pack.maria-audit-governance`, `pack.maria-trust-verification`
- Requirements: `pack.maria-requirements-analysis`, `pack.maria-risk-classification`
- Compliance: `pack.maria-compliance-auditing`, `pack.maria-approval-workflow`, `pack.maria-policy-enforcement`
- Evidence: `pack.maria-evidence-collection`, `pack.maria-claim-verification`, `pack.maria-trust-audit`
- Audit: `pack.maria-audit-trail`, `pack.maria-state-verification`
- Content: `pack.maria-brand-safety`, `pack.maria-content-moderation`, `pack.maria-quality-assurance`
- Documentation: `pack.maria-documentation-review`, `pack.maria-stakeholder-reporting`
- Incident: `pack.maria-incident-response`

### Marcus — Distribution Executor
**Role:** Approved distribution execution across GitHub, Slack, and publish platforms
**Runtime:** `src/services/marcusExecutionService.js` — requires Maria governance clearance
**Can do:** Create GitHub releases and issues, send Slack messages, dispatch multi-platform publish (Instagram, YouTube, Telegram, WhatsApp, Notion, ClickUp) — but only after Maria clears the risk level
**Cannot:** Execute anything not explicitly approved or where Maria flagged critical/high with `approvalRequired`
**Schema:** `workflowId`, `connectorId`, `approvedBy: "maria-governance"`, `status`, `resultUrl`, `executedAtMs`
**When to use:** "Post this to Telegram", "Create a GitHub release", "Send Slack notification" (after Maria audit).

### Echo — Knowledge Historian
**Role:** Memory synthesis and archival across all agent outputs
**Runtime:** `src/services/echoMemoryService.js` — Ollama-powered with deterministic fallback
**Can do:** Synthesize memories from workflow outputs, classify retention policy (permanent/standard_180d/ephemeral_7d), categorize memories (project/timeline/preference/orchestration), normalize confidence levels
**Cannot:** Modify or delete without approval
**Schema:** `memoryId`, `category`, `retentionPolicy`, `sensitivity`, `confidenceLevel`, `archivedAtMs`
**When to use:** Automatic — Echo runs after workflow completion to preserve important context and knowledge.

### Sentinel — Security Monitor
**Role:** Security monitoring and automation safety
**Runtime:** `src/services/sentinelSecurityService.js` — two-layer detection: deterministic + Ollama
**Can do:** Monitor for threats, validate safety of automated actions
**Cannot:** Perform destructive execution
**When to use:** Automatic — Sentinel monitors all external interactions for security risks.

### Nova — Opportunity Analyst
**Role:** Opportunity scoring, prioritization, and strategic analysis
**Runtime:** `src/services/novaAnalysisService.js` — 4-dimension scoring + Ollama strategic analysis
**Can do:** Score opportunities across 4 dimensions (valueScore/riskScore/timingScore/effortScore), classify priority tier (watchlist/medium/high/critical), generate strategic recommendations, store scores for decomposition hints, identify favorable opportunity/risk ratios
**Cannot:** Execute actions — analysis and recommendation only
**Schema:** `opportunityId`, `valueScore`, `riskScore`, `timingScore`, `effortScore`, `priorityTier`, `recommendation`, `analyzedAtMs`
**When to use:** "Which of these is most promising?", "Prioritize these tasks", "Analyze this opportunity". Nova also runs automatically to score incoming commands for Jose's routing decisions.

## How Agents Collaborate

```
You: "Research AI trends and write a blog post"
  → Jose decomposes:
    → Hector: Research AI trends (with citations)
    → Miya: Write blog post based on research
    → Maria: Review for accuracy and tone
    → Jose: Merge and confirm
  → You: Review and approve
  → Marcus: Publish (if requested)
```

## Agent Permissions Matrix

| Agent | Terminal | Files | External | Approval | Memory |
|-------|----------|-------|----------|----------|--------|
| Alphonso | ✅ | ✅ | ⚠️ | ⚠️ | ✅ |
| Jose | ❌ | ❌ | ❌ | ❌ | ✅ |
| Hector | ❌ | ❌ | ❌ | ❌ | ✅ |
| Miya | ❌ | ❌ | ❌ | ❌ | ✅ |
| Maria | ❌ | ❌ | ❌ | ✅ | ✅ |
| Marcus | ❌ | ❌ | ✅ | ✅ | ❌ |
| Echo | ❌ | ❌ | ❌ | ❌ | ✅ |
| Sentinel | ❌ | ❌ | ❌ | ❌ | ✅ |
| Nova | ❌ | ❌ | ❌ | ❌ | ✅ |

✅ = Allowed | ⚠️ = Approval required | ❌ = Blocked

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

Open the **Activity** tab to see real-time agent actions, decisions, and audit logs. Voice OS activity (server start/stop) is also logged here via `agentActivityService`.
