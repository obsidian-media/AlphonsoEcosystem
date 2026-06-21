# Alphonso vs. Competitors

A feature-by-feature comparison of Alphonso against other local-first AI desktop tools, agent frameworks, and coding assistants.

---

## At a Glance

| Dimension | Alphonso | OpenAgentd | Skales | Athen | Vibn | Kairox | Thoth | Noxio |
|-----------|----------|-----------|--------|-------|------|--------|-------|-------|
| **Architecture** | Tauri+Rust+React | Electron | Unknown | Tauri+Rust | Rust | Tauri+Rust+Vue | Electron | Tauri+Rust |
| **Multi-Agent** | 9 role-based | Lead+workers | Multi-team | Sub-agents | Single | Profiles | Single | Chain |
| **Connectors** | 13 | 0 | 15+ providers | 3 | MCP only | MCP | 4 | 5 |
| **Policy Gate** | Fail-closed | None | None | None | None | None | None | None |
| **License Enforce** | Free/Pro/Enterprise | None | None | None | None | None | None | None |
| **Platform** | Windows | Cross-platform | Desktop+Android | Cross-platform | Cross-platform | Cross-platform | Cross-platform | Cross-platform |
| **Image Gen** | SD WebUI/ComfyUI (connectors) | None | Built-in | None | None | None | None | Built-in |
| **Cloud Hybrid** | BYOK connectors | No | No | No | No | No | Opt-in | Auto fallback |
| **Mobile** | None | None | Android APK | Web UI | None | None | None | None |
| **Durable Queue** | Yes (dead-letter) | No | No | No | No | No | No | No |
| **Voice** | Basic (service) | No | No | Phone calls | No | No | STT/TTS | No |
| **License** | BSL 1.1 | MIT | Proprietary | MIT | AGPL | AGPL | MIT | BSL |
| **Pricing** | Free / $12 / $49 / $199 | Free, BYOK | Free | Free | Free | Free | Free | Free |

---

## Feature Deep-Dive

### Agent Architecture

**Alphonso's 9 specialized agents** (Alphonso, Jose, Hector, Miya, Maria, Marcus, Echo, Sentinel, Nova) each have defined roles, action contracts, and enforced boundaries. Tasks flow through Jose (orchestrator) who decomposes, routes, and monitors parallel execution. Maria (governance) gates high-risk actions. Echo (memory) archives everything.

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

**Alphonso wins on**: breadth (13 connectors, all policy-gated).

### Security & Governance

Alphonso is the only tool with a **fail-closed policy gate** (`policyEnforcementService.ts`) — every outbound call is checked before execution. If credentials are missing or the action is ambiguous, it is blocked. All agents have per-action contracts enforced by `agentContractService.ts`. License tiers gate premium connectors via `licenseService.ts`.

No competitor has equivalent enforcement.

### Desktop Native

Alphonso (Tauri v2, Rust) produces a ~6.8 MB NSIS installer with <30 MB RAM idle. Athen and Kairox also use Tauri. Most others use Electron (heavier: 100-300 MB RAM).

---

## When to Choose Alphonso

| You need... | Choose Alphonso | Choose a competitor |
|-------------|----------------|---------------------|
| 9 specialized AI agents with governance | ✓ | |
| Fail-closed security on every action | ✓ | |
| 13+ connectors (not just providers) | ✓ | |
| License-enforced tiering (Free/Pro/Enterprise) | ✓ | |
| Durable task queue with dead-letter replay | ✓ | |
| Mac or Linux desktop app | | OpenAgentd, Athen, Kairox |
| Mobile app (Android/iOS) | | Skales (Android) |
| Built-in image generation (no separate server) | | Noxio, Locally Uncensored |
| Phone call integration | | Athen |
| HIPAA compliance documentation | | Vibn |
| Pure provider flexibility | | OpenAgentd (15 providers) |
| Minimum binary size | | Athen (30 MB) or Kairox |

---

## Summary

Alphonso is uniquely positioned as the only local-first AI companion with **role-specialized agents, policy-gated security, and 13 outbound connectors** — combined with a **tiered licensing model** that keeps the core free. It is strongest for users who need structured agent collaboration, approval workflows, and multi-channel distribution from a single desktop app. It is not yet available on macOS, Linux, or mobile — those platforms are on the roadmap.
