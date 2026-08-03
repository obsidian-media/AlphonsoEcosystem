# Alphonso QA Audit

Date: 2026-08-03  
Agent: Codex  
Scope: Live browser QA of the Alphonso shell, pages, tabs, and action controls

## Summary

I ran the Alphonso app locally in Chrome and exercised the visible shell, major page routes, nested tabs, and key action controls.

Overall result:
- Core shell navigation is live.
- Most major routes render and expose working tab controls.
- Chat submit is wired but fails at model execution on the chosen local model.
- Voice is broken on boot.
- Connectors and some Settings actions are wired, but external end-to-end completion was not verified.

## Environment

- Repository: `D:\AgentDevWork\repos\AlphonsoEcosystem`
- Browser: Google Chrome at `C:\Program Files\Google\Chrome\Application\chrome.exe`
- Dev server: Vite preview session on `http://127.0.0.1:5181`
- Test method: Playwright-driven browser inspection plus direct DOM interaction

## Pass

- Top-level page routes are live and reachable from the shell:
  - `Chat`
  - `Dashboard`
  - `Projects`
  - `Research`
  - `Content`
  - `Automation`
  - `Orchestrator`
  - `Creative`
  - `Boardroom`
  - `All Agents`
  - `Runtimes`
  - `Connectors`
  - `Settings`
- The main page routes expose live tab sets or section buttons:
  - `Projects`: `Setup`, `Agents`, `Execution`, `Results`
  - `Research`: `New Research`, `Reports`, `Live Run`
  - `Content`: `Create`, `Drafts`, `Calendar`, `Analytics`, `Brand`, `Image`, `Video`
  - `Automation`: `Overview`, `Builder`, `Schedules`, `Dead Letter`
  - `Orchestrator`: `Command`, `Approvals`, `Packets`, `Monitor`
  - `Creative`: `Script Studio`, `Scene Builder`, `Prompt Builder`, `Thumbnail Studio`, `Campaign Studio`, `Brand Kit Memory`
  - `Boardroom`: `Mission Room`, `Boardroom Sessions`
  - `All Agents`: `Overview`, `Queue`, `Skills`, `Workflows`, `Pairings`, `Workshop`, `Advanced`
  - `Runtimes`: `Activity`, `Modules`
  - `Connectors`: `Setup & Credentials`, `Health Monitor`
  - `Settings`: `General`, `Connectors`, `Agents`, `Runtime`, `Memory`, `Knowledge`, `Appearance`, `Coach`, `Plugins`, `Logs`, `Backup`
- `All Agents` exposes the mode buttons:
  - `Mission Control`
  - `Developer Mode`
  - `Creative Mode`
  - `Research Mode`
  - `Silent Mode`
  - `Presentation Mode`
- Each All Agents mode loads the same mode dashboard and the mode selection is live.
- `Runtimes` exposes:
  - `Activity`
  - `Modules`
  - `AI Runtime Manager`
  - `Refresh`
  - `Install all`
  - category chips for `All`, `LLM`, `Image / Video`, `Image`, `Audio`, `Voice`, `Automation`, `Integration`, `Memory`, `Agent`
- `Install all` is visible and clickable, but it did not install anything during this pass because the page still reported `0 running`, `0 installed`, and `0 total tools`.
- `Connectors` exposes:
  - `Setup & Credentials`
  - `Health Monitor`
  - `Refresh`
  - repeated row actions `Test` and `Validate`
- `Settings` exposes:
  - `General`
  - `Connectors`
  - `Agents`
  - `Runtime`
  - `Memory`
  - `Knowledge`
  - `Appearance`
  - `Coach`
  - `Plugins`
  - `Logs`
  - `Backup`
  - action buttons including `Check Installed Models`, `Retry Ollama Connection`, `Copy Command`, `Refresh Models`, `Check Updates Now`, and `Run diagnostics`
- `Copy Command` in Settings changed to `COPIED`, confirming the clipboard action wiring.
- Settings shows a reachable Ollama runtime state with installed-model information and a connected status.
- `Chat` exposes:
  - model selectors `Ollama`, `NVIDIA NIM`, `Gemini`
  - `Direct`
  - `Focus`
  - `Export`
  - `Clear`
  - quick prompts
  - file attach
  - `VOICE`
  - `Send`
- Chat submit accepted the prompt, updated the recent chat list, and surfaced the model failure state rather than silently dropping the request.
- `Mission Room` and nested `Boardroom Sessions` are live.
  - New threads can be created.
  - Thread content renders after creation.
  - `Send` is present and clickable inside the thread flow.

## Fail

- `Voice` crashes on boot with `Cannot read properties of null (reading 'find')` from `VoiceView`.
- The voice boot error overlay can intercept pointer events and persist while switching views.
- Chat model execution failed with `Model too large for available memory`.
- `Connectors` row actions mostly behaved as state checks rather than complete external validations.
- `Start Ollama` on Connectors surfaced `Cannot read properties of null (reading 'ok')` rather than a clean start path.

## Deferred

- Full native installer verification remains incomplete.
- Deeper hidden-screen QA remains incomplete because several surfaces expose thin or state-only controls rather than full workflows.
- I did not attempt any destructive or production-affecting actions.
- I did not verify external connector actions, outbound publishing, or any paid/cloud-dependent behavior.
- Distinct deep subpages inside `Settings` were not exposed beyond the shared settings pane during this pass.
- Several connector `Test` and `Validate` actions are visible, but external end-to-end connector execution was not verified.
- `Install all` on `Runtimes` did not yield installed tools during the pass.

## Formal Matrix

### Pass

- `Chat`
- `Dashboard`
- `Projects`
- `Research`
- `Content`
- `Automation`
- `Orchestrator`
- `Creative`
- `Boardroom`
- `All Agents`
- `Runtimes`
- `Connectors`
- `Settings`
- `Projects` tab set
- `Research` tab set
- `Content` tab set
- `Automation` tab set
- `Orchestrator` tab set
- `Creative` tab set
- `Boardroom` tab set
- `All Agents` tab set
- `Runtimes` tab set
- `Connectors` tab set
- `Settings` tab set

### Fail

- `Voice` boot surface crashes with `Cannot read properties of null (reading 'find')`
- Chat model execution failed with `Model too large for available memory`
- `Start Ollama` on Connectors surfaced `Cannot read properties of null (reading 'ok')`

### Deferred

- Distinct deep subpages inside `Settings` were not exposed beyond the shared settings pane during this pass
- Several connector `Test` and `Validate` actions are visible, but external end-to-end connector execution was not verified
- `Install all` on `Runtimes` did not yield installed tools during the pass
- Full native installer verification remains incomplete

## Notes

- Source inspection and live QA agree that the shell routes are real, but many are status-heavy surfaces rather than complete task flows.
- The All Agents mode view is live and interactive, but the mode buttons primarily swap informational dashboards.
- The chat composer is real and accepts input; the remaining gap is a successful model response.

## Additional Findings

- The `Connectors` page can switch between online and offline presentation states depending on runtime availability.
- `Start Ollama` does not currently provide a clean recovery path; it surfaces an inline runtime error instead.
- `Retry Ollama Connection` and `Copy Command` are both wired and clickable in the Settings screen.
- `Copy Command` produced a visible `COPIED` state in the UI.
- The `Runtimes` page presents an install path, but the current live state still shows zero installed tools.
- The `Boardroom Sessions` flow is live enough to create and render a thread, but it remains more limited than a full task workspace.
