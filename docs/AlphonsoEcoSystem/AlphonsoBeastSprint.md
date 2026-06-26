Here’s a **single, self-contained `.md` handoff document** you can copy‑paste to your repo and drop in front of your agent dev team.

---

# Alphonso v2 – Agent OS Architecture & Implementation Handoff

> **Scope:** This document defines the architecture and feature set for turning Alphonso into a **local‑first Agent OS**, inspired by OpenFang/LibreFang but tailored to Alphonso’s UX‑first, desktop‑first identity.  
> **Status:** Design baseline. All 50 features are in scope; implementation will be phased.

---

## 1. High-level architecture

### 1.1. Layered architecture overview

Alphonso v2 is composed of **five main layers**:

1. **Core Agent OS & Modules**  
2. **Models, Routing & Policies**  
3. **Security, Secrets & Isolation**  
4. **Events, Observability & Dev Experience**  
5. **Channels, UX & Workflows**

Each layer is independently evolvable but shares a **unified memory substrate**, **runtime**, and **policy engine**.

---

### 1.2. Architecture diagram (ASCII, ready for `.md`)

```text
                          +--------------------------------------+
                          |           USER & TEAM UX             |
                          |  - Desktop UI                        |
                          |  - Workflow Builder                  |
                          |  - Task Inbox                        |
                          |  - Dashboards                        |
                          +-----------------+--------------------+
                                            |
                                            v
+-------------------------+   +-------------------------------+   +---------------------------+
|   Channels & Adapters   |   |     Events & Observability    |   |   Dev Experience Layer    |
| - Slack / Discord       |   | - Internal Event Bus          |   | - Dev Console             |
| - Email / Webhooks      |   | - Logs / Traces / Metrics     |   | - Simulation / Test       |
| - Notifications         |   | - Audit Trail                 |   | - Live Reload / Docs      |
+------------+------------+   +----------------+--------------+   +-------------+-------------+
             |                                 |                                |
             +----------------------+----------+--------------------------------+
                                    |
                                    v
                         +-------------------------------+
                         |        Core Agent OS          |
                         |                               |
                         |  1) Modules (Hand-style)      |
                         |  2) Background Runtime        |
                         |  3) Scheduler                 |
                         |  4) A2A Protocol              |
                         |  5) Capability System         |
                         |  6) Module Lifecycle          |
                         |  7) Module Dashboard          |
                         |  8) Marketplace               |
                         +----------------+--------------+
                                          |
                                          v
                         +-------------------------------+
                         |   Models, Routing & Policies  |
                         |                               |
                         | - Multi-LLM Router            |
                         | - Task-type Model Selection   |
                         | - Cost & Token Metering       |
                         | - Policy Engine               |
                         | - Safety Filters              |
                         | - Offline-first Mode          |
                         +----------------+--------------+
                                          |
                                          v
                         +-------------------------------+
                         | Security, Secrets & Isolation |
                         |                               |
                         | - Secrets Vault               |
                         | - Tool Sandbox                |
                         | - FS & Network Policies       |
                         | - RBAC                        |
                         | - Threat Detection            |
                         | - Secure Backup               |
                         +----------------+--------------+
                                          |
                                          v
                         +-------------------------------+
                         |     Unified Memory Substrate  |
                         |                               |
                         | - SQLite                      |
                         | - Embeddings                  |
                         | - Sessions / Documents        |
                         | - Agent & Module State        |
                         | - Workspace Profiles          |
                         +-------------------------------+
```

---

## 2. Core Agent OS & Modules (Features 1–10)

### 2.1. Alphonso Modules (Feature 1)

**What it is**  
Alphonso Modules are the fundamental unit of capability in Alphonso v2—similar to OpenFang Hands, but tailored for local‑first, UX‑first use.

Each module consists of:

- **`module.toml`** – manifest (name, version, capabilities, dependencies, models, schedules)  
- **`system_prompt.md`** – core instructions for the agent  
- **`tools/`** – tool implementations (JS/TS/Rust, sandboxed)  
- **`metrics.json`** – optional metrics schema  
- **`ui/`** – optional UI components (panels, forms, dashboards)  
- **`tests/`** – optional test cases for simulation mode

**Why we use it**  
- Standardizes how we define agents/workflows.  
- Enables a **module marketplace** and internal sharing.  
- Makes modules installable, auditable, and upgradable.

**Implementation notes**

- Define a **Module Manifest Spec**:

```toml
# module.toml
id = "alphonso.researcher.web_monitor"
name = "Web Monitor Researcher"
version = "0.1.0"
description = "Monitors selected websites, summarizes changes, and notifies users."
author = "Alphonso Team"

capabilities = ["filesystem", "network", "llm", "events", "notifications"]
models = ["local:llama3", "cloud:gpt-4o"]
schedules = ["0 */2 * * *"]  # every 2 hours

entrypoint = "tools/main.js"
ui = "ui/panel.json"
```

- Modules are loaded by the **Background Runtime** and registered with:
  - **Capability system**
  - **Policy engine**
  - **Event bus**
  - **Dashboard**

---

### 2.2. Background Runtime + Scheduler (Feature 2)

**What it does**  
- Runs modules in the background, even when the UI is closed.  
- Executes scheduled tasks (cron-like) and event-driven tasks.  
- Persists state and recovers from crashes.

**Key responsibilities**

- Maintain a **runtime registry** of active modules.  
- Execute module entrypoints in the **sandbox**.  
- Respect **schedules** and **events**.  
- Write **logs, traces, metrics** to observability layer.  
- Store **state** in the unified memory substrate.

**Implementation outline**

- A local daemon (e.g., Node/Rust service) with:
  - Scheduler (cron library)  
  - Event loop (internal event bus)  
  - Sandbox integration  
  - Memory DB connection (SQLite)  
- UI communicates with runtime via local API (HTTP/WebSocket).

---

### 2.3. Unified Memory Substrate (Feature 3)

**What it does**  
Provides a shared, persistent memory layer for:

- Sessions (conversations, tasks)  
- Documents (files, notes, scraped content)  
- Embeddings (vector representations)  
- Agent state (per agent)  
- Module state (per module)  
- Workspace profiles (personal, team, project)

**Schema sketch**

- `sessions` – id, user_id, agent_id, metadata, timestamps  
- `messages` – session_id, role, content, embeddings_ref  
- `documents` – id, workspace_id, path, metadata, embeddings_ref  
- `embeddings` – id, vector, model, created_at  
- `agent_state` – agent_id, key, value (JSON)  
- `module_state` – module_id, key, value (JSON)  
- `workspaces` – id, type (personal/team/project), policies

**Why it matters**

- Enables **long-term memory** and cross-module context sharing.  
- Makes Alphonso feel like a **real teammate** that remembers.

---

### 2.4. Lightweight Tool Sandbox (Feature 4)

**What it does**

- Executes module tools in an isolated environment:
  - Timeouts  
  - Memory caps  
  - FS allowlists  
  - Network allowlists

**Implementation options**

- Use a JS sandbox (e.g., VM2, QuickJS) for JS tools.  
- For Rust/native tools, use process isolation with strict config.  
- Integrate with:
  - **Capability system** (what is allowed)  
  - **Policy engine** (org rules)  
  - **Network/FS policies** (domains, paths)

---

### 2.5. Capability & Permission System (Feature 5)

**What it does**

- Each module declares capabilities:

```toml
capabilities = ["filesystem", "network", "browser", "llm", "events", "notifications"]
```

- UI shows a **permission dialog** on install/enable:
  - “This module wants: filesystem (read/write), network (https), notifications.”

**Why it matters**

- Makes behavior transparent.  
- Reduces blast radius.  
- Enables safe community modules.

---

### 2.6. Local Agent-to-Agent (A2A) Protocol (Feature 6)

**What it does**

- Standard API for agents/modules to delegate tasks and share context.

**Example API**

```http
POST /a2a/delegate
Content-Type: application/json

{
  "from_agent": "alphonso.researcher",
  "to_agent": "alphonso.writer",
  "task": "Draft a summary of the latest findings.",
  "context": {
    "session_id": "abc123",
    "documents": ["doc_1", "doc_2"]
  },
  "capabilities_required": ["llm", "filesystem"]
}
```

**Why it matters**

- Enables multi-agent workflows:
  - Researcher → Writer → Publisher → Notifier.  
- Keeps agents loosely coupled but coordinated.

---

### 2.7. Module/Agent Dashboard (Feature 7)

**What it shows**

- List of modules/agents with:
  - Status (active, paused, error)  
  - Last run / next run  
  - Error count  
  - Metrics (latency, success rate, token usage)  
  - Memory usage  
  - Capabilities & permissions

**Why it matters**

- Gives devs and users visibility.  
- Makes Alphonso feel like a **real OS**, not a black box.

---

### 2.8–2.10. Lifecycle, Versioning, Marketplace (Features 8–10)

- **Lifecycle:** install, enable, disable, uninstall, migrate.  
- **Versioning:** module versions, compatibility with core.  
- **Marketplace:** local catalog + optional remote registry.

These three features turn modules into a **manageable ecosystem** rather than ad‑hoc scripts.

---

## 3. Models, Routing & Policies (Features 11–20)

Key components:

- **Multi‑LLM Router (11)** – routes tasks between local and cloud models.  
- **Task‑Type Model Selection (12)** – picks models based on task type.  
- **Cost & Token Metering (13)** – tracks usage and cost.  
- **Policy Engine (14)** – central guardrails.  
- **Prompt Registry (15)** – reusable prompts.  
- **Safety Filters (16)** – content safety.  
- **Model Health Monitor (17)** – latency, errors.  
- **Per‑Module Model Preferences (18)** – fine-grained control.  
- **Offline‑First Mode (19)** – local-only operation.  
- **Model Capability Discovery (20)** – catalog of model features.

These features collectively make Alphonso **smart, safe, and cost-aware** about model usage.

---

## 4. Security, Secrets & Isolation (Features 21–30)

Highlights:

- **Secrets Vault (21)** – secure, scoped storage for API keys.  
- **Per‑Module Sandboxed FS (22)** – workspace directories per module.  
- **Network Policy Layer (23)** – domain-level control.  
- **Audit Trail (24)** – logs actions and decisions.  
- **User Consent Flows (25)** – approvals for risky actions.  
- **RBAC (26)** – roles for admin/dev/user.  
- **Secure Logs (27)** – redaction + encryption.  
- **Sandbox Profiles (28)** – strict/normal/experimental.  
- **Threat Detection Hooks (29)** – detect suspicious behavior.  
- **Secure Backup & Restore (30)** – protect state.

This layer is what lets Alphonso be **trusted** in serious environments.

---

## 5. Events, Observability & Dev Experience (Features 31–40)

Highlights:

- **Internal Event Bus (31)** – pub/sub for events (file added, email received, etc.).  
- **Structured Logging (32)** – standard logging API.  
- **Tracing of Agent Runs (33)** – step-by-step execution traces.  
- **Metrics Collection (34)** – per module/agent metrics.  
- **Simulation Mode (35)** – dry-run with fake FS/network.  
- **Test Harness (36)** – module test cases.  
- **Dev Console (37)** – interactive agent debugging.  
- **Error Taxonomy & Recovery (38)** – classify errors, define recovery.  
- **Module Docs Generator (39)** – auto docs from manifests.  
- **Live Reload (40)** – reload modules on change.

This layer is for **developer happiness** and **operational reliability**.

---

## 6. Channels, UX & Workflows (Features 41–50)

Highlights:

- **Channel Adapter Layer (41)** – Slack, Discord, email, webhooks.  
- **Notification System (42)** – desktop + external notifications.  
- **Workflow Builder (43)** – visual chaining of modules.  
- **Task Inbox & Queue (44)** – human review of agent tasks.  
- **Role‑Based Agent Personas (45)** – standard roles.  
- **Cross‑Module Context Sharing (46)** – via memory substrate.  
- **User Feedback Loop (47)** – ratings/corrections feed back into memory/prompts.  
- **Workspace Profiles (48)** – personal/team/project isolation.  
- **Onboarding Wizard for Modules (49)** – guided module creation.  
- **Template Library (50)** – starter modules/workflows.

This layer is where Alphonso’s **UX advantage** becomes obvious.

---

## 7. Implementation roadmap (for the dev team)

### Phase 1 – Core OS & Safety (Foundations)

**Focus features:**  
1, 2, 3, 4, 5, 6, 7, 11, 14, 21, 22, 23, 24, 31, 32, 33, 34

**Goals:**

- Establish **Modules**, **Runtime**, **Scheduler**, **Memory**, **Sandbox**, **Capabilities**, **A2A**, **Policy Engine**, **Secrets Vault**, **FS/Network policies**, **Audit Trail**, **Event Bus**, **Logging/Tracing/Metrics**.  
- Make Alphonso capable of running **safe, persistent agents** locally.

### Phase 2 – Ecosystem & Dev Experience

**Focus features:**  
8, 9, 10, 13, 15, 16, 17, 18, 19, 20, 35, 36, 37, 38, 39, 40

**Goals:**

- Add lifecycle, versioning, marketplace, cost metering, prompt registry, safety filters, model health, offline mode, simulation, test harness, dev console, error taxonomy, docs, live reload.

### Phase 3 – Channels, UX & Workflows

**Focus features:**  
41, 42, 43, 44, 45, 46, 47, 48, 49, 50

**Goals:**

- Turn Alphonso into a **true orchestrator** across channels, with visual workflows, task inbox, personas, context sharing, feedback loops, workspace profiles, onboarding wizard, and templates.

---

## 8. Direct message to the agent dev team

> **Team,**
>
> The goal of Alphonso is to evolve from a powerful local assistant into a **local‑first Agent OS**—a system where agents and modules can run autonomously, safely, and observably, while still feeling like a polished desktop product.
>
> This document defines:
> - The **layered architecture** we’re aiming for.  
> - The **50 features** that make up that architecture.  
> - A **phased roadmap** so we don’t try to ship everything at once.
>
> The most critical foundations are:
> - **Modules (Feature 1)**  
> - **Background Runtime + Scheduler (Feature 2)**  
> - **Unified Memory Substrate (Feature 3)**  
> - **Sandbox + Capabilities + Policy Engine (Features 4, 5, 14)**  
> - **Secrets Vault + FS/Network Policies + Audit Trail (Features 21–24)**  
> - **Event Bus + Logging/Tracing/Metrics (Features 31–34)**
>
> Once these are in place, Alphonso stops being “just an app” and becomes an **environment** where agents can live, collaborate, and be trusted.
>
> Let’s start by:
> 1. Finalizing the **Module Manifest Spec**.  
> 2. Designing the **Runtime + Scheduler** service.  
> 3. Defining the **Memory DB schema**.  
> 4. Implementing a **minimal sandbox** with capabilities and policies.  
> 5. Wiring up **logging, tracing, and metrics** for all module runs.
>
> After that, we can iterate on the rest of the features with confidence.
