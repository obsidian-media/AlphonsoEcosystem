You are acting as a Senior Production Auditor for a multi-agent AI operating system called Alphonso.

Your task is to generate two reports based ONLY on the current codebase and provided documentation:

1. ALPHONSO_FULL_TRUTH_REPORT
2. ALPHONSO_PRODUCTION_COMPLETION_REPORT

==================================================
CONTEXT
==================================================

Alphonso is a local-first AI operating system with:
- Jose (orchestrator)
- Alphonso (execution engine)
- Miya (creative agent)
- Hector (research agent)
- multiple workflow and connector systems

It uses:
- workflow engine
- connector system (Telegram, WhatsApp, YouTube, etc.)
- durable memory (SQLite)
- approval + policy enforcement layer
- Tauri desktop runtime

==================================================
YOUR OBJECTIVE
==================================================

You must audit the system and produce:

### 1. ALPHONSO_FULL_TRUTH_REPORT
A brutally honest technical reality report that classifies everything into:

- DONE (production-ready and working)
- PARTIAL (works but incomplete or unstable)
- SETUP_REQUIRED (needs external credentials / deployment)
- SCALFFOLD / MOCK (fake or placeholder logic)
- BLOCKED (cannot work currently)
- UNKNOWN (insufficient evidence)

You MUST cover:
- workflow engine
- agent orchestration (Jose routing)
- memory system
- connectors (Telegram, WhatsApp, YouTube, etc.)
- updater/release system
- UI dashboards
- security/policy enforcement
- observability/receipts
- external integrations

You must be extremely strict and avoid assuming anything works unless it is proven in code.

---

### 2. ALPHONSO_PRODUCTION_COMPLETION_REPORT
Based on the truth report above, define:

- what is required to reach production readiness
- what is already complete
- what is blocking deployment
- what must be fixed in order of priority

Structure it as:

1. Executive Summary
2. Verified Working Systems
3. Partially Working Systems
4. Missing/Blocked Systems
5. External Setup Requirements
6. Production Blockers (P0)
7. Recommended Execution Plan (phased)
8. Risk Assessment

==================================================
IMPORTANT RULES
==================================================

- Do NOT be optimistic.
- Do NOT assume features work unless proven.
- Do NOT include design ideas or new features.
- Focus only on current system reality.
- Treat missing credentials as NOT WORKING.
- Treat scaffold/mock code as NOT PRODUCTION.

==================================================
OUTPUT FORMAT
==================================================

Return both reports in markdown format clearly separated:

# ALPHONSO_FULL_TRUTH_REPORT
...

# ALPHONSO_PRODUCTION_COMPLETION_REPORT
...
