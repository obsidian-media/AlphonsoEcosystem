# Alphonso vs. Competitors

A feature-by-feature comparison of Alphonso against other local-first AI desktop tools, agent frameworks, and coding assistants.

> Alphonso's column was updated on 2026-10-25 to match the app on `main` (2.10.0, not released yet). The other tools' columns are from when this page was first written and have not been re-checked.

---

## At a Glance

| Dimension | Alphonso | OpenAgentd | Skales | Athen | Vibn | Kairox | Thoth | Noxio |
|-----------|----------|-----------|--------|-------|------|--------|-------|-------|
| **Architecture** | Tauri+Rust+React | Electron | Unknown | Tauri+Rust | Rust | Tauri+Rust+Vue | Electron | Tauri+Rust |
| **Multi-Agent** | 9 role-based | Lead+workers | Multi-team | Sub-agents | Single | Profiles | Single | Chain |
| **Connectors** | 33 | 0 | 15+ providers | 3 | MCP only | MCP | 4 | 5 |
| **Policy Gate** | Fail-closed | None | None | None | None | None | None | None |
| **License Enforce** | Built in, inactive (free at launch) | None | None | None | None | None | None | None |
| **Platform** | Windows, macOS (Apple Silicon), Linux | Cross-platform | Desktop+Android | Cross-platform | Cross-platform | Cross-platform | Cross-platform | Cross-platform |
| **Image Gen** | ComfyUI (installed from Runtime Hub) + optional Higgsfield | None | Built-in | None | None | None | None | Built-in |
| **Cloud Hybrid** | BYOK connectors | No | No | No | No | No | Opt-in | Auto fallback |
| **Mobile** | iOS companion | None | Android APK | Web UI | None | None | None | None |
| **Durable Queue** | Yes (dead-letter) | No | No | No | No | No | No | No |
| **Voice** | Local Voice OS + iOS Cloud Voice; CALL-E phone calls | No | No | Phone calls | No | No | STT/TTS | No |
| **License** | SHALAUDE v1.0 (source-visible, all rights reserved) | MIT | Proprietary | MIT | AGPL | AGPL | MIT | BSL |
| **Pricing** | Free at launch | Free, BYOK | Free | Free | Free | Free | Free | Free |

---

## Feature Deep-Dive

### Agent Architecture

**Alphonso's 9 specialized agents** (Alphonso, Jose, Hector, Miya, Maria, Marcus, Echo, Sentinel, Nova) each have defined roles, action contracts, and enforced boundaries. Every request goes to Jose (orchestrator), who answers it or plans it as a graph of steps, checks the plan against one permission table, runs independent steps at the same time and changes the plan while it runs (review rounds, help between agents). Approval is by what a step does: spending, publishing and deleting always ask. Maria reviews governance, risk and quality. Echo (memory) archives decisions. Miya's content factory runs a whole video project, from research to posted videos and their results, as one such request.

- **OpenAgentd** uses a lead-agent + worker-agent model — flexible but no role specialization.
- **Skales** has multi-agent teams but no governance/policy layer.
- **Athen** uses sub-agents for task decomposition but lacks role contracts.
- **Noxio** chains agents per task — sequential, no concurrent orchestration.

**Alphonso wins on**: role depth, enforced boundaries, governance-aware routing.

### Connectors & Integrations

| Connector | Alphonso | OpenAgentd | Skales | Athen |
|-----------|----------|-----------|--------|-------|
| Ollama (local) | Built-in | Built-in | Built-in | Built-in |
| Telegram | Yes | No | Yes | Yes |
| WhatsApp Cloud | Yes | No | Yes | No |
| GitHub | Yes | No | No | No |
| Slack | Yes | No | No | No |
| Claude API | Yes | Provider | Provider | No |
| ChatGPT | Yes | Provider | Provider | No |
| YouTube | Yes | No | No | No |
| Notion | Yes | No | No | No |
| ClickUp | Yes | No | No | No |
| SD WebUI | Yes | No | No | No |
| ComfyUI | Yes | No | No | No |
| Brave Search | Yes | No | No | No |
| YouTube, Facebook, Instagram publishing | Yes | No | No | No |
| ElevenLabs, Higgsfield, Runway (paid, opt-in) | Yes | No | No | No |
| CALL-E phone calls | Yes | No | No | — |

**Alphonso wins on**: breadth (33 connectors, all policy-gated).

### Security & Governance

Alphonso is the only tool with a **fail-closed policy gate** (`policyEnforcementService.ts`) — every outbound call is checked before execution. If credentials are missing or the action is ambiguous, it is blocked. Every plan is checked against one permission table before anything runs, and each step's effects decide whether it asks first. Connector keys are kept in the system keychain. The licensing code (`licenseService.ts`) is inactive while Alphonso is free.

No competitor has equivalent enforcement.

### Desktop Native

Alphonso (Tauri v2, Rust) produces a small app; the Windows installer is larger since it bundles the Ollama runtime and FFmpeg so it works out of the box. Athen and Kairox also use Tauri. Most others use Electron (heavier: 100-300 MB RAM).

---

## When to Choose Alphonso

| You need... | Choose Alphonso | Choose a competitor |
|-------------|----------------|---------------------|
| 9 specialized AI agents with governance | ✓ | |
| Fail-closed security on every action | ✓ | |
| 33 connectors (not just providers) | ✓ | |
| From an idea to posted videos, Shorts and carousels | ✓ | |
| Free, local-first, with paid services only if you choose them | ✓ | |
| Durable task queue with dead-letter replay | ✓ | |
| Mac or Linux desktop app | ✓ (Mac build not yet signed by Apple) | OpenAgentd, Athen, Kairox |
| Mobile app | iOS companion | Skales (Android) |
| Built-in image generation (no separate server) | | Noxio, Locally Uncensored |
| Phone call integration | ✓ (CALL-E) | Athen |
| HIPAA compliance documentation | | Vibn |
| Pure provider flexibility | | OpenAgentd (15 providers) |
| Minimum binary size | | Athen (30 MB) or Kairox |

---

## Summary

Alphonso is a local-first AI companion with **role-specialized agents that Jose plans and runs as checked step graphs, approval by effect, and 33 policy-gated connectors**, free at launch. It is strongest for users who need structured agent collaboration, approval workflows, and content production and distribution from a single desktop app. It runs on Windows, macOS (Apple Silicon, not yet signed by Apple) and Linux, with an iOS companion.
