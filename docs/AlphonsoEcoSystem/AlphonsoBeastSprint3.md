You’re going for the whole stack—good. Let’s make this concrete enough that your devs can start wiring things today.

Below is a **single `.md` block** with **all six specs**:

- Module Manifest Spec  
- Runtime API Spec  
- Memory Schema (SQL)  
- Sandbox Architecture  
- Policy Engine Rules DSL  
- A2A Protocol Spec  

You can copy‑paste this entire thing into your repo.

---

```markdown
# Alphonso v2 – Core Specs (Modules, Runtime, Memory, Sandbox, Policy, A2A)

## 1. Module Manifest Spec (v1.0)

### 1.1. File: `module.toml`

```toml
# Basic identity
id          = "alphonso.researcher.web_monitor"
name        = "Web Monitor Researcher"
version     = "0.1.0"
description = "Monitors selected websites, summarizes changes, and notifies users."
author      = "Alphonso Team"
license     = "Proprietary"

# Capabilities requested by this module
capabilities = [
  "filesystem",   # read/write within sandboxed workspace
  "network",      # outbound HTTP(S) to allowed domains
  "llm",          # access to configured LLMs via router
  "events",       # subscribe to internal event bus
  "notifications" # send user-facing notifications
]

# Models preferred by this module
models = [
  "local:llama3",
  "cloud:gpt-4o"
]

# Scheduling (cron-style)
schedules = [
  "0 */2 * * *"   # every 2 hours
]

# Entrypoints
entrypoint = "tools/main.js"   # main tool file
ui         = "ui/panel.json"   # optional UI definition

# Dependencies (other modules or libraries)
[dependencies]
modules = [
  "alphonso.common.http_client",
  "alphonso.common.html_parser"
]

# Policy tags (for policy engine)
[policy]
tags = ["research", "monitoring", "external_web"]

# Metrics schema (optional)
[metrics]
enabled = true
schema  = "metrics.json"
```

### 1.2. File: `system_prompt.md`

- Free-form markdown describing:
  - Role
  - Goals
  - Constraints
  - Style
  - Safety rules

### 1.3. Directory layout

```text
modules/
  alphonso.researcher.web_monitor/
    module.toml
    system_prompt.md
    tools/
      main.js
      helpers.js
    ui/
      panel.json
    metrics.json
    tests/
      test_cases.json
```

---

## 2. Runtime API Spec (Local Agent OS Service)

### 2.1. Service Overview

- Local daemon (Node/Rust) running:
  - Scheduler
  - Event bus
  - Sandbox
  - Memory access
  - Module lifecycle

- Exposes HTTP/WebSocket API on `localhost` (e.g., `127.0.0.1:8787`).

### 2.2. Key Endpoints (HTTP)

#### `GET /modules`

- **Description:** List all installed modules.
- **Response:**

```json
[
  {
    "id": "alphonso.researcher.web_monitor",
    "name": "Web Monitor Researcher",
    "version": "0.1.0",
    "status": "enabled",
    "capabilities": ["filesystem", "network", "llm", "events", "notifications"],
    "schedules": ["0 */2 * * *"]
  }
]
```

#### `POST /modules/install`

- **Body:**

```json
{
  "path": "/path/to/module/folder"
}
```

- **Effect:** Validates `module.toml`, registers module, returns status.

#### `POST /modules/enable`

```json
{
  "id": "alphonso.researcher.web_monitor"
}
```

#### `POST /modules/disable`

```json
{
  "id": "alphonso.researcher.web_monitor"
}
```

#### `POST /modules/run`

- **Description:** Manually trigger a module run.
- **Body:**

```json
{
  "id": "alphonso.researcher.web_monitor",
  "context": {
    "workspace_id": "default",
    "user_id": "shayan",
    "params": {
      "urls": ["https://example.com", "https://news.ycombinator.com"]
    }
  }
}
```

#### `GET /runs/:run_id`

- **Description:** Get details of a specific run (status, logs, metrics, traces).

---

### 2.3. Scheduler & Events

#### `POST /scheduler/register`

```json
{
  "module_id": "alphonso.researcher.web_monitor",
  "cron": "0 */2 * * *"
}
```

#### `POST /events/publish`

```json
{
  "type": "file.created",
  "workspace_id": "default",
  "payload": {
    "path": "/workspace/reports/report_2026-06-25.md"
  }
}
```

#### `POST /events/subscribe`

```json
{
  "module_id": "alphonso.researcher.web_monitor",
  "event_types": ["file.created", "email.received"]
}
```

---

## 3. Unified Memory Schema (SQL)

### 3.1. Core Tables

```sql
-- Workspaces (personal, team, project)
CREATE TABLE workspaces (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL, -- 'personal' | 'team' | 'project'
  name         TEXT NOT NULL,
  created_at   DATETIME NOT NULL,
  updated_at   DATETIME NOT NULL
);

-- Sessions (conversations, tasks)
CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  user_id      TEXT,
  agent_id     TEXT,
  title        TEXT,
  metadata     TEXT, -- JSON
  created_at   DATETIME NOT NULL,
  updated_at   DATETIME NOT NULL
);

-- Messages within sessions
CREATE TABLE messages (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL REFERENCES sessions(id),
  role         TEXT NOT NULL, -- 'user' | 'agent' | 'system'
  content      TEXT NOT NULL,
  embeddings_id TEXT, -- optional reference
  created_at   DATETIME NOT NULL
);

-- Documents (files, notes, scraped content)
CREATE TABLE documents (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  path         TEXT NOT NULL,
  type         TEXT, -- 'file' | 'note' | 'web'
  metadata     TEXT, -- JSON
  embeddings_id TEXT,
  created_at   DATETIME NOT NULL,
  updated_at   DATETIME NOT NULL
);

-- Embeddings
CREATE TABLE embeddings (
  id           TEXT PRIMARY KEY,
  model        TEXT NOT NULL,
  vector       BLOB NOT NULL,
  created_at   DATETIME NOT NULL
);

-- Agent state (per agent)
CREATE TABLE agent_state (
  agent_id     TEXT NOT NULL,
  key          TEXT NOT NULL,
  value        TEXT NOT NULL, -- JSON
  updated_at   DATETIME NOT NULL,
  PRIMARY KEY (agent_id, key)
);

-- Module state (per module)
CREATE TABLE module_state (
  module_id    TEXT NOT NULL,
  key          TEXT NOT NULL,
  value        TEXT NOT NULL, -- JSON
  updated_at   DATETIME NOT NULL,
  PRIMARY KEY (module_id, key)
);

-- Audit trail (actions & decisions)
CREATE TABLE audit_log (
  id           TEXT PRIMARY KEY,
  module_id    TEXT,
  agent_id     TEXT,
  user_id      TEXT,
  action       TEXT NOT NULL,
  details      TEXT, -- JSON
  created_at   DATETIME NOT NULL
);
```

---

## 4. Sandbox Architecture (Tools Execution)

### 4.1. Goals

- Isolate module tools from host environment.  
- Enforce capabilities, FS/network policies, timeouts, memory limits.  
- Provide a clean API for tools to interact with runtime.

### 4.2. Execution Model

- Each tool run is a **sandbox session**:
  - Spawned in VM2/QuickJS (for JS) or separate process (for Rust).  
  - Given a **capability context** and **limited APIs**.  
  - Communicates with runtime via IPC (JSON messages).

### 4.3. Sandbox Context (Example)

```json
{
  "module_id": "alphonso.researcher.web_monitor",
  "run_id": "run_123",
  "capabilities": ["filesystem", "network", "llm"],
  "workspace_dir": "/sandbox/workspaces/default/modules/alphonso.researcher.web_monitor",
  "network_allowed_domains": ["example.com", "news.ycombinator.com"],
  "llm_endpoint": "http://127.0.0.1:8787/llm/invoke",
  "timeout_ms": 30000,
  "memory_limit_mb": 256
}
```

### 4.4. Tool API (Inside Sandbox)

Expose a minimal API object, e.g. in JS:

```js
const alphonso = {
  fs: {
    readFile(path) { /* ... */ },
    writeFile(path, content) { /* ... */ },
    listDir(path) { /* ... */ }
  },
  net: {
    fetch(url, options) { /* ... */ } // only allowed domains
  },
  llm: {
    invoke(model, prompt, options) { /* ... */ }
  },
  events: {
    publish(type, payload) { /* ... */ }
  },
  log: {
    info(msg, meta) { /* ... */ },
    error(msg, meta) { /* ... */ }
  }
};
```

---

## 5. Policy Engine Rules DSL

### 5.1. Purpose

- Central place to define **what modules/agents can do**.  
- Enforce org/user rules on:
  - Domains  
  - Data types  
  - Actions  
  - Capabilities  

### 5.2. DSL Example (YAML)

```yaml
# policy.yaml

version: 1
default_mode: "allow"  # 'allow' | 'deny'

rules:
  - id: "deny_external_post_requests"
    description: "Modules cannot POST to external domains."
    match:
      action: "network.request"
      method: "POST"
      domain: "*"
    effect: "deny"

  - id: "allow_get_to_whitelisted_domains"
    description: "Allow GET requests to whitelisted domains."
    match:
      action: "network.request"
      method: "GET"
      domain_in:
        - "example.com"
        - "news.ycombinator.com"
    effect: "allow"

  - id: "restrict_filesystem_to_workspace"
    description: "Modules can only access their workspace directory."
    match:
      action: "filesystem.access"
      path_not_starts_with: "/sandbox/workspaces/"
    effect: "deny"

  - id: "require_consent_for_delete"
    description: "Deleting files requires user consent."
    match:
      action: "filesystem.delete"
    effect: "require_consent"

  - id: "limit_llm_to_local_for_sensitive_tags"
    description: "Modules tagged 'sensitive' must use local models only."
    match:
      action: "llm.invoke"
      module_tag: "sensitive"
      model_starts_with: "cloud:"
    effect: "deny"
```

### 5.3. Enforcement Points

- Sandbox (FS, network, LLM).  
- Runtime (module lifecycle, scheduling).  
- UI (consent prompts).

---

## 6. A2A (Agent-to-Agent) Protocol Spec

### 6.1. Purpose

- Allow agents/modules to delegate tasks and share context locally.  
- Keep agents loosely coupled but coordinated.

### 6.2. Core Endpoint

#### `POST /a2a/delegate`

**Body:**

```json
{
  "from_agent": "alphonso.researcher.web_monitor",
  "to_agent": "alphonso.writer.report_generator",
  "task": "Generate a summary report of the latest monitored changes.",
  "context": {
    "workspace_id": "default",
    "session_id": "sess_123",
    "documents": ["doc_1", "doc_2"],
    "metadata": {
      "time_range": "last_24h"
    }
  },
  "requirements": {
    "capabilities": ["llm", "filesystem"],
    "max_tokens": 2000
  }
}
```

**Response:**

```json
{
  "delegate_id": "delegate_456",
  "status": "accepted"
}
```

### 6.3. Status & Results

#### `GET /a2a/delegate/:delegate_id`

```json
{
  "delegate_id": "delegate_456",
  "from_agent": "alphonso.researcher.web_monitor",
  "to_agent": "alphonso.writer.report_generator",
  "status": "completed",
  "result": {
    "document_id": "doc_report_789",
    "summary": "In the last 24 hours, the following changes occurred..."
  },
  "logs": [
    { "level": "info", "message": "Loaded 2 documents." },
    { "level": "info", "message": "Generated summary." }
  ]
}
```

---

## 7. Closing Note to Devs

This spec block is **implementation‑ready**:

- You can start by:
  - Implementing `module.toml` parsing.  
  - Wiring the runtime API skeleton.  
  - Creating the SQLite schema.  
  - Building the sandbox context + tool API.  
  - Loading `policy.yaml` and enforcing rules.  
  - Exposing `/a2a/delegate` and wiring it to modules.

Once these are in place, Alphonso stops being “just a desktop AI app” and becomes a **real local‑first Agent OS**.

```
```