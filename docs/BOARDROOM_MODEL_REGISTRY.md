# ALPHONSO Boardroom — Model Registry

**Purpose:** candidate runtime assignments for each agent role. Shayan selects per project.
**Source of truth:** this file
**Last updated:** 2026-06-03

## Agent → Runtime Candidates

### Jose (Orchestrator)
- **Primary:** Nous Stepfun (current)
- **Fallbacks:** EverythingLLM, Abacus
- **Composition layer:** ComposIO — **strict opt-in only; approval required by Shayan. No automatic ComposIO usage without explicit operator unlock.**

### Alphonso (Operator)
- **Primary:** OpenCode + Mimo v2.5 (free)
- **Local backup:** Ollama `llama3.2:3b`, `qwen2.5:3b`

### Kairo (Backend)
- **Primary:** OpenCode + Nemotron 3 (free)
- **API style:** OpenFang / Qwen
- **Local backup:** Ollama `qwen2.5:3b`

### Hector (Researcher)
- **Primary:** OpenFang (Qwen) + Firecrawl
- **Secondary:** Nous Stepfun + Firecrawl for longer synthesis

### Miya (Creative / Media)
- **Text:** Alibaba / DashScope models (creative variants)
- **Image / video:** ComfyUI, FAL, SocialClaw
- **Audio:** Suno, OpenAI TTS

### Nova (Design + Analysis)
- **Primary:** DashScope models (scoring + analysis variants)
- **Visual eval:** FAL image/video outputs
- **Local backup:** Ollama `mistral:latest`

### Maria (Governance)
- **Primary:** Nous Stepfun
- **Fallbacks:** Abacus, EverythingLLM

### Marcus (Publisher)
- **Primary:** SocialClaw (publishing/distribution)
- **Secondary:** Browser Use for web actions
- **Audio:** OpenAI TTS

### Echo (Memory / Archival)
- **Primary:** Local `qwen2.5:3b` + Rust KV
- **Alternative:** Nanobot for lightweight archival ops

### Sentinel (Security)
- **Primary:** Rule-based + Stepfun for anomaly interpretation
- **Secondary:** Manual review escalation

### Shayan
- Human final authority. No model assignment.

## Selection Princi[b]les
1. Prefer free/open paths when latency or cost matters most.
2. Use dedicated media models for creative export; general models for reasoning.
3. Always keep a deterministic fallback (local or rule-based).
4. Refuse to route high-risk output through unverified providers.
