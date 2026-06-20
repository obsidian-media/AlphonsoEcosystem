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

### Maria — Governance
**Role:** Audit, risk assessment, approval review
**Can do:** Review actions for compliance, flag risks, approve/deny requests
**Cannot:** Perform destructive execution
**When to use:** Automatic — Maria reviews high-risk actions before they execute.

### Marcus — Distribution
**Role:** Approved distribution execution
**Can do:** Publish content, send messages, upload files — but only on approved paths
**Cannot:** Execute anything not explicitly approved
**When to use:** "Post this to Telegram", "Upload to YouTube", "Send via WhatsApp" (after approval).

### Echo — Memory Historian
**Role:** Knowledge preservation and archival
**Can do:** Store memories, retrieve past context, maintain knowledge base
**Cannot:** Modify or delete without approval
**When to use:** Automatic — Echo stores important conversations and retrieves relevant context.

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
