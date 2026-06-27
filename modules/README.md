# Alphonso Module System

Modules are self-contained capability packages that extend Alphonso agents.

## Structure

Each module lives in its own directory under `modules/` named `<author>.<category>.<name>/`:

```
modules/
  alphonso.researcher.web_monitor/
    module.toml          — manifest (required)
    system_prompt.md     — agent system prompt override (optional)
    tools/main.js        — tool entrypoint (required)
    metrics.json         — runtime metrics snapshot
    tests/test_cases.json — test cases array
```

## module.toml Fields

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique module ID (e.g. `alphonso.researcher.web_monitor`) |
| name | string | Human-readable name |
| version | string | Semver |
| description | string | One-line description |
| author | string | Author identifier |
| capabilities | array | Agent capabilities this module provides |
| models | array | Compatible model IDs |
| schedules | array | Cron expressions for scheduled runs |
| entrypoint | string | Relative path to main tool file |
| ui | string | (optional) Relative path to UI component |
| [policy] | table | Policy tags |

## Installing a Module

Use the Module Registry service or the Modules tab in Runtime Hub:

```js
import { installModule } from '../services/moduleRegistryService';
await installModule('/path/to/module');
```
