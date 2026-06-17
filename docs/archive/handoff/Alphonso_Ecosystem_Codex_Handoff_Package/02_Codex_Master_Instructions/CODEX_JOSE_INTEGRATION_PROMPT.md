# Codex Prompt — Add Jose as Third Core Agent

You are working inside my existing Alphonso repo.

Before starting new work:
1. Finish the current implementation cleanly.
2. Do not leave broken partial files.
3. Run build verification.
4. Then add Jose as the third core agent if it can be done safely in the same pass.

If this is too much for one pass, finish current UI work first, then implement Jose in a second pass, and report clearly what was done and what was deferred.

## Jose
Jose is the Master Orchestrator.

He is not “The Father” in a dramatic or religious way. He should feel like a calm systems architect, conductor, coordinator, governor, workflow supervisor, and senior intelligence layer.

## Agent roles
Alphonso: Operator, runtime, execution, verification, system safety, local operations. Cyan/blue/deep-space identity.

Miya: Creator, media, marketing, design, storytelling, creative direction. Magenta/pink/purple cinematic identity.

Jose: Master Orchestrator, task distribution, workload routing, approval governance, inter-agent coordination, memory governance, workflow supervision. Gold/white/warm silver identity.

## Jose UI implementation
1. Add Jose to Command Rib / Agent Dock.
2. Add Jose to Agent Switching System.
3. Create Jose Orchestrator Workspace, preferably src/components/dashboard/OrchestratorView.jsx.
4. Workspace panels: Agent Workload, Task Routing, Pending Approvals, Active Workflows, Memory Governance, System Decisions, Handoff Queue, Runtime Balance.
5. If backend is not wired, label placeholders as Not wired yet or Awaiting backend wiring.
6. Add Jose node to Ecosystem Map.
7. Add Orchestrator Focus.
8. Add Jose support to Coach Mode: idle, thinking, analyzing, approving, directing, calm, warning.
9. Use Jose mascot asset if available at src/assets/jose-mascot.png, otherwise fallback gold circular J avatar.
10. Add Orchestrator Gold / Command Halo theme support.
11. Add Jose filters/placeholders to Memory, Timeline, Time Machine.

## Build verification
Run:
```bash
npm run build
npx tauri build
```
Report actual verified results: files changed, new files, UI completion, Jose completion/partial scaffold, mascot asset/fallback, build output summaries, installer path, TODOs, bugs.
