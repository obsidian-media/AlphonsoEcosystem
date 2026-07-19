# Hector Agent — Skill Packs

**Version**: 2.6.0
**Last Updated**: 2026-07-19
**Total Skill Packs**: 23 (7 existing + 16 new)

## Overview

Hector is the **Cloud Scout / Research Agent** — responsible for source-backed research, API documentation lookup, compliance investigation, competitive analysis, and trend discovery. He is "born with" 23 specialized skill packs that cover the full research lifecycle: discovery, verification, scoring, and briefing.

## Skill Pack Inventory

### Existing Packs (7)

| Pack ID | Name | Purpose |
|---------|------|---------|
| `pack.hector-professional-marketing` | Professional Marketing | Market research, content strategy, campaign planning, workflow review |
| `pack.hector-market-research` | Market Research | Source-backed market signal research |
| `pack.hector-competitive-analysis` | Competitive Analysis | Competitor positioning scan and comparison |
| `pack.hector-source-verification` | Source Verification | Confidence scoring for source claims |
| `pack.hector-rss-monitoring` | RSS Monitoring | Curated feed monitoring as failover channel |
| `pack.workflow.executing-plans` | Executing Plans | Generic execution planning |
| `pack.github.research` | GitHub Research | GitHub repository research |

### API & Integration Research Packs (2)

| Pack ID | Name | Permissions | Example Tasks |
|---------|------|-------------|---------------|
| `pack.hector-api-documentation-research` | API Documentation Research | `research`, `source_verification`, `citation_gathering` | Research REST API documentation standards and best practices |
| `pack.hector-api-integration-research` | API Integration Research | `research`, `source_verification`, `citation_gathering` | Research OAuth2 flow options for a new third-party connector |

### Compliance & Security Packs (2)

| Pack ID | Name | Permissions | Example Tasks |
|---------|------|-------------|---------------|
| `pack.hector-compliance-research` | Compliance Research | `research`, `source_verification`, `confidence_scoring` | Research GDPR compliance requirements for data collection features |
| `pack.hector-security-research` | Security Research | `research`, `source_verification`, `confidence_scoring` | Research OWASP top 10 vulnerabilities relevant to desktop applications |

### Market & Competitive Packs (3)

| Pack ID | Name | Permissions | Example Tasks |
|---------|------|-------------|---------------|
| `pack.hector-trend-analysis` | Trend Analysis | `market_research`, `competitive_scan`, `citation_gathering` | Analyze emerging technology trends in the AI assistant space |
| `pack.hector-market-intelligence` | Market Intelligence | `market_research`, `competitive_scan`, `content_strategy` | Research competitor pricing models and feature positioning |
| `pack.hector-content-research` | Content Research | `content_strategy`, `market_research`, `source_verification` | Research content formats and topics performing well in the target niche |

### Technical Research Packs (3)

| Pack ID | Name | Permissions | Example Tasks |
|---------|------|-------------|---------------|
| `pack.hector-code-pattern-research` | Code Pattern Research | `research`, `competitive_scan`, `source_verification` | Research common architectural patterns for Tauri v2 desktop applications |
| `pack.hector-technical-architecture-research` | Technical Architecture Research | `research`, `competitive_scan`, `citation_gathering` | Research microservices vs monolith tradeoffs for AI companion architectures |
| `pack.hector-open-source-analysis` | Open Source Analysis | `competitive_scan`, `source_verification`, `confidence_scoring` | Analyze GitHub repository health metrics for potential dependencies |

### Data & Source Packs (4)

| Pack ID | Name | Permissions | Example Tasks |
|---------|------|-------------|---------------|
| `pack.hector-data-gathering` | Data Gathering | `research`, `citation_gathering`, `confidence_scoring` | Collect structured data points from public sources for a research brief |
| `pack.hector-source-curation` | Source Curation | `source_verification`, `citation_gathering`, `feed_monitoring` | Curate and rank authoritative sources for a research topic |
| `pack.hector-confidence-scoring` | Confidence Scoring | `confidence_scoring`, `source_verification`, `citation_gathering` | Score research claim confidence based on source count and quality |
| `pack.hector-survey-design` | Survey Design | `research`, `market_research`, `citation_gathering` | Design research survey questions for user needs discovery |

### Documentation & Briefing Packs (2)

| Pack ID | Name | Permissions | Example Tasks |
|---------|------|-------------|---------------|
| `pack.hector-documentation-audit` | Documentation Audit | `research`, `source_verification`, `citation_gathering` | Audit existing project documentation for accuracy and completeness |
| `pack.hector-research-briefing` | Research Briefing | `research`, `content_strategy`, `citation_gathering` | Compile a morning research briefing from curated RSS feeds |

## Permission Model

All Hector skill pack permissions use the agent's allowed prefixes:

- `research.*` — General research activities
- `market_research.*` — Market signal research
- `competitive_scan.*` — Competitive analysis
- `content_strategy.*` — Content research and strategy
- `source_verification.*` — Source reliability verification
- `citation_gathering.*` — Citation collection
- `confidence_scoring.*` — Evidence strength rating
- `feed_monitoring.*` — RSS/feed monitoring

### Per-Pack Scope Overrides

Each of the 16 new packs has a scope override in `agentContractService.ts` that restricts its permissions to the exact set defined in its manifest.

## Workflow Guidance

Each pack includes structured guidance with:
- `guidance` — 1-2 sentence description of the workflow
- `steps` — 4-5 actionable steps
- `exampleTasks` — 2-3 concrete examples

## Integration Points

### Agent Contract System

All packs are validated against Hector's execution contract:
```typescript
[AGENTS.HECTOR]: {
  role: 'research_agent',
  allowedActionPrefixes: ['market_research', 'content_strategy', 'campaign_planning', 'workflow_review', 'research', 'competitive_scan', 'source_verification', 'citation_gathering', 'confidence_scoring', 'feed_monitoring'],
  blockedActionPrefixes: ['execute_command', 'filesystem_write', 'external_publish', 'upload', 'post', 'purchase']
}
```

### Downstream Handoff

Hector's research outputs feed into:
- **Jose** — for orchestration routing and approval gating
- **Miya** — for creative content strategy
- **Maria** — for compliance and audit review
- **Marcus** — for distribution execution

## Testing

- **Unit tests**: `src/test/hectorSkillPacks.test.js`
- **Integration tests**: `src/test/hectorSkillIntegration.test.js`

## Related Files

| File | Purpose |
|------|---------|
| `src/services/skillPackService.js` | Pack definitions and workflow guidance |
| `src/services/agentContractService.ts` | Scope overrides and contract validation |
| `src/agents/hector/hectorProfile.js` | Agent profile with skillPackIds |
| `src/agents/hector/hectorPermissions.js` | Agent permissions |
| `src/test/hectorSkillPacks.test.js` | Unit tests |
| `src/test/hectorSkillIntegration.test.js` | Integration tests |
