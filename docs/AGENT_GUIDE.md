# Agent Guide

Alphonso has 9 specialized agents. Each has a defined role, permissions, and constraints enforced by `agentContractService.js`.

## Agent Roster

### Alphonso — Local Operator
**Role:** General execution, verification, packaging
**Can do:** Run commands, read/write files, build projects, verify outputs
**Cannot:** Bypass approval gates for risky actions
**When to use:** Default agent for most tasks. When you say "build me a website" or "fix this bug", Alphonso handles it.

### Jose — Orchestrator
**Role:** Intake, routing, decomposition, merge, confirm, report
**Can do:** Break complex tasks into sub-tasks, assign to other agents, merge results
**Cannot:** Bypass high-risk restrictions
**When to use:** Complex multi-step requests. Jose automatically decomposes "research X, write a report, and email it" into sub-tasks for Hector, Miya, and Marcus.

### Hector — Researcher
**Role:** Research with citations, source scanning
**Can do:** Web search, document analysis, source verification
**Cannot:** Execute terminal commands, filesystem operations, posting, or purchases
**When to use:** "Research the latest trends in AI", "Find sources for this claim", "Summarize this article".

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
**Role:** Security monitoring, automation safety
**Can do:** Monitor for threats, validate safety of automated actions
**Cannot:** Perform destructive execution
**When to use:** Automatic — Sentinel monitors all external interactions for security risks.

### Nova — Analyst
**Role:** Scoring, analysis, opportunity prioritization
**Can do:** Score opportunities, analyze data, prioritize tasks
**Cannot:** Execute actions — analysis only
**When to use:** "Which of these leads is most promising?", "Prioritize these tasks", "Analyze this data".

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

## Viewing Agent Activity

Open the **Activity** tab to see real-time agent actions, decisions, and audit logs.
