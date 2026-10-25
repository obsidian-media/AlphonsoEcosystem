# Agent roles, Part B: real skills — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each agent has real skills (know-how plus the tools it needs), picks one per step with a reason shown on the board, and users can add their own.

**Architecture:** A skill is a Markdown file with front matter. Built-in skills are bundled from `src/skills/<agent>/*.md`; user skills live in `<app data>/skills/<agent>/*.md` and are read and written by a small Rust module. Before a step runs, the engine picks the skill, gathers what the skill's tools return (in a fixed order for small models, by the agent's own tool calls for larger ones) and puts the skill and the results into the step's `StepInput`, which every agent's prompt already reads through `stepInputText()`. The content factory's hand-written asks become built-in skills, so know-how lives in one place.

**Tech Stack:** TypeScript, React, Vitest, Tauri 2 (Rust), WebdriverIO desktop E2E.

**Spec:** `docs/superpowers/specs/2026-10-24-agent-roles-skills-handover-design.md` (Part B). Part A is merged (`b4f9a2c`).

## Global Constraints

- Every skill's `task_types` are owned by its `agent` (`ownerOf()` in `agentPermissionTable.ts`); every tool is in that agent's tool list; no tool needs an effect the agent lacks (`isEffectAllowed()`).
- A skill that breaks a rule is refused with the reason; never loaded silently, never "fixed" silently.
- A user skill with a built-in skill's name is shown beside it, never over it.
- At most 5 tool calls per step. The model-size line for the agent's own tool calls comes from Settings → Agents (`settings.agentToolCallMinSizeB`, default 14, read like `getPlanFirstSetting()` reads `showPlanFirst`); paid and cloud models count as large; a local model whose size can't be read counts as small.
- Content factory steps use the skill for their action type, reason "This step's format needs it."; their output shapes (`keys`) and `parseStepAnswer()` stay in code.
- Nothing hardcoded: no model names, addresses or folders. The skills folder comes from the app data directory (moved by `ALPHONSO_E2E_PROFILE` in debug builds).
- No new connectors; tools wrap functions that exist today.
- Jose has no skills (planning is not a skill step).
- Docs change in the same commits. Never `git add -A`. CRLF files (`joseExecutionEngineService.ts`) are edited with Python only.
- No subagents; executed inline.

## Calls for the owner to check (made in this plan)

1. **Only skills for the step's task are offered.** The agent chooses among its skills whose `task_types` include the step's action type. When only one fits, no model call is made and the reason is "The only skill for this task." (Saves a model call per step on small models, and keeps every skill inside the task types it declares.)
2. **Tools that change things are the step's own action, not tool calls.** During gathering, an agent may call only tools whose effects need no approval under your current Settings (`effectsNeedingApproval()` empty: reading, saving its own notes). Tools such as `run_command`, `send_message`, `publish_post`, `place_call`, `make_picture` are listed in skills (and checked against the agent's effects) but run as the step's existing action, with its existing approval. A model asking to call one is told "This tool runs as the step's own action, after its approval." Nothing is run without approval.
3. **When two skills fit and the model can't choose,** the first built-in skill by file name is used, reason "Matches this step's task."
4. **A step with no skill for its task** runs as today, and the board says "No skill for this task." A test makes sure every action type used by the templates, the content factory and the workflows has one.
5. **The tool-call format** is one JSON object per answer: `{"tool": "<name>", "args": {...}}` to call a tool, `{"done": true}` to stop. An unreadable answer ends gathering.
6. **The old packs' "last used" signal** for the Coach's "unused surface area" detector becomes "skills never used", from a small last-used record (`alphonso_skill_last_used_v1`). Part C's outcome record replaces it later.

## Review Focus

1. A user skill file that is malformed, huge, or names another agent's task type: refused with a reason on load and on save, and the other skills still load.
2. A user skill named like a built-in one: both are listed, the built-in one is used by the fallback, and the user one is still offered by name.
3. A model asking for a tool it may not use, an unknown tool, or a sixth call: refused or stopped, never run, and the step still runs with what was gathered.
4. A file name or agent id with path characters (`../`, `\`, `:`) sent to the Rust commands: refused, nothing written outside the skills folder.
5. A content factory step: its prompt carries exactly the ask it carried before Part B, and its answer is parsed as before.

---

### Task 1: Skill files, the tool list and the skill check

**Files:**
- Create: `src/services/skills/skillFile.ts`, `src/services/skills/skillTools.ts`, `src/services/skills/skillCheck.ts`
- Test: `src/test/services/skills/skillFile.test.ts`, `src/test/services/skills/skillCheck.test.ts`

**Interfaces:**
- Produces:
  - `interface Skill { name: string; agent: string; useWhen: string; taskTypes: string[]; tools: string[]; steps: string[]; output: string; instructions: string; source: 'built_in' | 'user'; file: string }`
  - `parseSkillFile(text: string, meta: { source: 'built_in' | 'user'; file: string }): { skill: Skill } | { problems: string[] }` — front matter between the first two `---` lines; `key: value` and `key: [a, b]` only (no YAML library); `use_when` → `useWhen`, `task_types` → `taskTypes`; missing `name`, `agent`, `use_when`, `task_types` or an empty body → a problem each; `steps` defaults to `[]`, `output` to `text`; text over 64 KB → `"The skill file is larger than 64 KB."`.
  - `serializeSkill(skill: Skill): string` (the inverse; `parseSkillFile(serializeSkill(s))` round-trips).
  - `SKILL_TOOLS: Record<string, { effects: JoseEffect[]; agents: string[]; label: string }>` with the spec's first set: `read_step_output`, `read_memory`, `save_note` (all nine but Jose; `save_note` = `write_own_work`); `web_search`, `fetch_source`, `stock_search` (hector, `read`); `read_sources` (maria, nova, sentinel); `make_picture`, `make_voice`, `make_music`, `assemble_video` (miya, `write_own_work`); `read_project_file` (alphonso, maria, sentinel); `run_command` (alphonso, `run`), `write_project_file` (alphonso, `write_own_work`); `send_message`, `publish_post`, `place_call` (marcus, `publish_or_send`; `place_call` also `spend`); `organise_memory` (echo, `write_own_work`).
  - `OUTPUT_SHAPES: string[]` = `text`, `review_with_verdict`, and `content:<action>` for each key of `CONTENT_ACTION_KEYS` (from `contentStepPrompts.ts`).
  - `checkSkill(skill: Skill): string[]` — plain reasons, empty when fine: agent not one of the nine or is `jose` → "Jose has no skills: he plans."; a task type not owned by the agent → `"<task> is <Owner>'s work, not <Agent>'s."` (unowned → `"No agent owns <task>."`); a tool not in `SKILL_TOOLS` → `"Unknown tool: <tool>."`; a tool not listed for the agent → `"<Agent> can't use <tool>."`; a tool effect the agent lacks (`isEffectAllowed`) → `"<tool> needs <effect>, which <Agent> may not do."`; a `steps` entry not in `tools`; an unknown `output`.

- [ ] **Step 1: Write the failing tests.** `skillFile.test.ts`: `parses the claim-check example from the spec` (all fields, `source`, `file`); `round-trips through serializeSkill`; `lists each missing field`; `refuses a file over 64 KB`; `refuses a file that does not start with ---`. `skillCheck.test.ts`: `accepts the spec's claim check for Maria`; `refuses Nova doing research` (`taskTypes: ['research_report']` → `"research_report is Hector's work, not Nova's."`); `refuses a tool Maria can't use` (`web_search`); `refuses run_command for Miya`; `refuses Jose`; `refuses a step that is not one of the tools`; `refuses an unknown output`.
- [ ] **Step 2: Run** `npx vitest run src/test/services/skills` — Expected: FAIL, modules not found.
- [ ] **Step 3: Implement** the three files.
- [ ] **Step 4: Run** the same — Expected: PASS.
- [ ] **Step 5: Commit** `feat(skills): skill files, tool list and the skill check`.

### Task 2: Built-in skills, and the content factory's asks moved into them

**Files:**
- Create: `src/skills/<agent>/*.md` for alphonso, miya, hector, nova, maria, sentinel, marcus, echo; `src/services/skills/skillLibrary.ts`
- Modify: `src/services/contentFactory/contentStepPrompts.ts` (the `ask` texts leave `ACTIONS`; `buildStepPrompt` reads them from the library)
- Test: `src/test/services/skills/builtInSkills.test.ts`; existing content prompt tests stay green

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `listSkills(agent?: string): Skill[]` (built-in, then user, each sorted by file name), `skillsForTask(agent: string, actionType: string): Skill[]`, `refusedSkills(): { file: string; source: 'built_in' | 'user'; problems: string[] }[]`, `setUserSkillFiles(files: { agent: string; file: string; text: string }[]): void` (Task 6 calls it), `contentAsk(actionType: string): string | null`.
  - Built-ins are read with `import.meta.glob('../../skills/*/*.md', { query: '?raw', import: 'default', eager: true })`; a built-in that fails `checkSkill` goes to `refusedSkills()` (and the test fails).

The skill list (the spec's first list, task types from the permission table; the builder writes each body from the existing prompt it replaces):
- alphonso: `answer-a-question` (`assistant_answer`), `everyday-writing` (`assistant_write`), `code-change` (`local_operation`, `filesystem_`-owned code task types used today), `verify-a-build` (`verification_` types used today).
- miya: one skill per content action of hers in `ACTIONS` (`creative_script`, `creative_scenes`, `creative_thumbnails`, `creative_shorts`, `creative_sfx`, `creative_lessons`, `creative_carousel`, `creative_campaign`), each with `output: content:<action>` and the old `ask` as its body word for word; plus `creative-package` (the Quick package / `creative_brief` types), `ui-design` (`design_ui`), `edit-the-video` (`creative_assemble_video`, `creative_voice`, `creative_music`, `creative_video_clips`, tools `make_voice`, `make_music`, `assemble_video`). Miya may have more than 8 because each content action is its own skill; ruling recorded in the ledger.
- hector: `research_virality` content skill, `web-research` (`research_report`, `research_trends`, `research_market`; tools `web_search`, `fetch_source`; steps `web_search, fetch_source`), `competitor-material` (`research_competitors` if used, else folded into web-research), `stock-footage` (`research_broll`, tool `stock_search`).
- nova: content skills `analysis_market`, `analysis_content_review`, `analysis_performance`, `analysis_ideas`, `strategy_timing`; `value-and-priority` (`analysis_findings`, `prioritization_` types used).
- maria: content `audit_content_quality`; `quality-review` (`audit_quality`, `output: review_with_verdict`, tool `read_step_output`), `claim-check` (the spec's example), `governance-review` (`audit_governance`, `risk_review`).
- sentinel: content `security_content_check`; `text-and-link-check` (`security_` review types used), `permission-audit` (`permission_` types).
- marcus: `send-a-message` (`distribution_slack`, `distribution_review`), `publish-a-post` (`distribution_schedule_posts`), `place-a-call` (`outreach_call`, tool `place_call`), `release-notes-delivery` (`distribution_readiness`, `distribution_github` if used).
- echo: `save-decisions` (`memory_` preservation types used), `merge-and-clean-memory` (`knowledge_`/`retention_` types, tool `organise_memory`).

"Types used" means the action types that appear in `ACTION_EFFECTS`, `JOSE_TEMPLATES`, `STEP_AGENTS`, `WORKFLOW_STEP_TASK` and the router's splitter; the builder lists them with `ownerOf()` and assigns each to one skill.

- [ ] **Step 1: Write the failing test** `builtInSkills.test.ts`: `every built-in skill passes the check` (`refusedSkills()` is `[]`); `each agent but Jose has 3 or more skills, Jose none`; `every action type the templates, the content factory and the workflows use has a skill of its owner` (iterate `JOSE_TEMPLATES`, `STEP_AGENTS`, `WORKFLOW_STEP_TASK`; `skillsForTask(owner, type).length > 0`); `names are unique within each agent`; `each content action's skill body is its ask` (`contentAsk(type)` equals the text the test copies from git `b4f9a2c`'s `ACTIONS[type].ask` — the test holds those 16 strings as its fixture).
- [ ] **Step 2: Run** `npx vitest run src/test/services/skills/builtInSkills.test.ts` — Expected: FAIL.
- [ ] **Step 3: Write the skill files and `skillLibrary.ts`; change `buildStepPrompt` to use `contentAsk(actionType)` (an action with no ask → the step fails "No skill for this step's task." through the existing refusal path).
- [ ] **Step 4: Run** `npx vitest run src/test/services/skills src/test/services/contentFactory src/test/contentFactory` — Expected: PASS, the content prompt tests unchanged.
- [ ] **Step 5: Commit** `feat(skills): built-in skills for eight agents; content asks live in skills`.

### Task 3: What the tools do

**Files:**
- Create: `src/services/skills/skillToolRun.ts`
- Test: `src/test/services/skills/skillToolRun.test.ts`

**Interfaces:**
- Consumes: `SKILL_TOOLS`, `StepInput`.
- Produces: `interface ToolContext { agent: string; stepInput: StepInput | null; commandId?: string; workspaceRoot?: string }`, `runSkillTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<{ ok: boolean; text: string }>` — `text` capped at 4,000 characters with "(cut)". Refusals (never thrown): unknown tool; tool not listed for `ctx.agent`; an effect needing approval (`effectsNeedingApproval(tool.effects)` non-empty) → `"This tool runs as the step's own action, after its approval."`. Implementations wrap: `read_step_output` (`args.stepId` → the matching `stepInput.needs` entry's text, else the list of step ids), `read_memory` (`retrieveRelevantContext(args.query, listMemoryItems())`), `save_note` (`addMemoryItem` with `createdBy: agent`, `category: 'agent_note'`), `web_search` (`runMultiSourceResearch(args.query)` → titles and links), `fetch_source` (the backend's `fetch_url_content`, which already blocks private addresses), `stock_search` (`searchStockClips`), `read_sources` (the `sources` of `stepInput.needs`), `read_project_file` (`readWorkspaceFile` with `ctx.workspaceRoot`; no root → "No project folder is set."), `organise_memory` (Echo: `listMemoryItems()` summary of duplicates by title; read only in this part). Action tools (`run_command`, `write_project_file`, `make_*`, `assemble_video`, `send_message`, `publish_post`, `place_call`) always return the approval sentence.

- [ ] **Step 1: Write the failing tests:** `refuses a tool the agent can't use`; `refuses an unknown tool`; `action tools never run` (`send_message` for Marcus with a spy on Marcus's sender: not called); `read_step_output reads a needed step by id`; `web_search returns titles and links` (mock `runMultiSourceResearch`); `save_note saves a memory item for the agent`; `cuts long text at 4,000 characters`; `a failing wrapped function gives ok: false with its message`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(skills): tools wrap what each agent already does`.

### Task 4: Picking the skill and gathering, by model size

**Files:**
- Create: `src/services/skills/skillPick.ts`, `src/services/skills/skillGather.ts`
- Modify: `src/services/jose/joseModels.ts` (add `getToolCallMinSize(): number`, `stepModel(assignment): string`, `usesOwnToolCalls(assignment): boolean`)
- Test: `src/test/services/skills/skillPick.test.ts`, `src/test/services/skills/skillGather.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3, `generateAgentLlmResponse`, `getAgentProvider`, `modelSize`.
- Produces:
  - `pickSkill(agent: string, actionType: string, stepInput: StepInput | null, opts: { contentStep: boolean }): Promise<{ skill: Skill | null; reason: string }>` — none fit → `{ null, "No skill for this task." }`; content step → first fitting, "This step's format needs it."; one fits → it, "The only skill for this task."; several → the agent's model is asked with each name and `use_when` and must answer `{"skill","reason"}`; a known name → it with the model's reason (cut to 160 characters); else the first built-in fitting, "Matches this step's task.".
  - `getToolCallMinSize()` — `settings.agentToolCallMinSizeB`, a positive number, else 14. `stepModel(assignment)` — `assignment.model`, else the agent's provider model, else `getConfiguredOllamaModel()`. `usesOwnToolCalls(assignment)` — paid (`claude:`/`chatgpt:`) or non-Ollama provider → true; else `modelSize(stepModel) >= getToolCallMinSize()` (unknown size → false).
  - `gatherForSkill(skill: Skill, ctx: ToolContext, opts: { ownCalls: boolean; maxCalls?: number }): Promise<{ results: { tool: string; text: string; ok: boolean }[]; mode: 'fixed' | 'own' }>` — fixed: each of `skill.steps` once with args from the step (`query` = the instruction or request, `stepId` = the first needed step); own: up to `maxCalls` (5) rounds, each prompt holding the skill, the step input, the tools allowed and the results so far, parsing `{"tool","args"}` / `{"done":true}`; unreadable answer → stop; a refused call counts as a call and its refusal goes back to the model.

- [ ] **Step 1: Write the failing tests.** Pick: `no model call when one skill fits`; `content steps use the skill for their task`; `the agent's choice and reason are kept`; `an unknown or unreadable choice falls back with "Matches this step's task."`; `a user skill is offered beside a built-in one with the same name` (both names in the prompt). Gather: `small model runs the steps in order` (two tools, spies called once each, in order); `larger model calls tools itself and stops on done`; `stops after 5 calls`; `a refused call goes back to the model and nothing runs`; `an unreadable answer ends gathering`. Models: `14 by default, Settings changes it`; `a 7b model is small, a 32b large, an unknown tag small, Claude large`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(skills): the agent picks its skill; tools in order or by the agent's own calls`.

### Task 5: Every step runs with its skill, and the board shows it

**Files:**
- Modify: `src/services/jose/stepInput.ts` (`StepInput.skill?: { name: string; reason: string; instructions: string; results: { tool: string; text: string }[] } | null`; `stepInputText()` puts it first as "Your skill: <name>\n<instructions>\n\nWhat your tools found:\n…"; `skillSection(input)` exported for prompts that don't use `stepInputText`)
- Modify: `src/services/joseExecutionEngineService.ts` (Python edit, CRLF): in `executeAssignment`, after the step input is built and before dispatch, `useSkill()` picks, gathers, sets `stepInput.skill`, saves `skill` and `skillReason` on the request step (`updateJoseStep`, via `findRequestByPacket`), and calls `recordSkillUse(agent, name)`; skipped for Jose steps and `boardroom_*`. Remove `loadAgentSkillGuidance` from `draftPrompt`; Miya's package, Alphonso's answer (`executeAssistantAssignment`), Alphonso's code brief (`stepInstruction` gets `skillSection`), `runReviewStep`, and `buildStepPrompt` (content) add `skillSection`.
- Modify: `src/services/jose/joseRequestStore.ts` (`JoseRequestStep.skill?`, `skillReason?`), `src/components/jose/JoseRequestsBoard.tsx` (under the selected step: "Skill: <name> — <reason>", `data-testid="jose-step-skill"`), `src/components/jose/JosePlanMap.tsx` (the skill name in the box's hover text)
- Create: `src/services/skills/skillUse.ts` (`recordSkillUse`, `skillLastUsed(agent, name): number | null`, key `alphonso_skill_last_used_v1`)
- Test: `src/test/services/skills/skillInStep.test.ts`; update `src/test/joseExecutionEngineService.test.js` (draftPrompt no longer mentions skill packs), board test

**Interfaces:**
- Consumes: Tasks 2–4. Produces: `StepInput.skill`, `JoseRequestStep.skill`/`skillReason`, `skillLastUsed()` (Task 8).

- [ ] **Step 1: Write the failing tests:** `a Maria review's prompt carries her skill and what its tools found` (run a request with a Miya step and a Maria review through the pipeline with mocked models; the review prompt contains "Your skill: Quality review"); `the request step saves the skill and its reason`; `a content step's prompt carries its skill's ask once`; `a Jose step gets no skill`; `the board shows the skill and reason` (render `JoseRequestsBoard` with a saved request).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/test/services/skills src/test/services/jose src/test/joseExecutionEngineService.test.js src/test/components/jose` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(skills): every step runs with its skill; the board shows which and why`.

### Task 6: Your own skills on disk

**Files:**
- Create: `src-tauri/src/skills_store.rs` (registered in `lib.rs`), `src/services/skills/userSkills.ts`
- Modify: `src/App.tsx` boot (load user skills once, not in the Coach window)
- Test: Rust `#[cfg(test)]` in `skills_store.rs`; `src/test/services/skills/userSkills.test.ts`

**Interfaces:**
- Produces (Rust commands, all under `<app_data_dir>/skills/`): `skills_list_user() -> Vec<{ agent, file, text }>` (each `<agent>/*.md`, files over 64 KB skipped and listed with `tooLarge: true`), `skills_save_user(agent, file, text)` (creates the folder; overwrites only a user file), `skills_delete_user(agent, file)`, `skills_import_user()` (a file dialog in the backend; returns the chosen `.md` text, ≤ 64 KB, never a path from the window), `skills_open_folder()`. `valid_agent()` allows only the eight agents with skills; `valid_file()` allows `[a-z0-9-]{1,64}\.md` only. Both refuse anything else with a plain message.
- App side: `loadUserSkills()` (calls `skills_list_user`, then `setUserSkillFiles`), `saveUserSkill(skill): Promise<{ ok: true } | { ok: false; problems: string[] }>` (`checkSkill` first; file name from `slugForFolder(name)` in lower case), `deleteUserSkill`, `importUserSkill()` (parse + check; refused → problems, nothing saved), `exportSkill(skill)` (the file text for a download), `openSkillsFolder()`.

- [ ] **Step 1: Write the failing tests.** Rust: `refuses ../ and backslashes and colons in file names`; `refuses an agent id that isn't one of the eight`; `lists only .md files and marks large ones`; `save then list returns the text`. App: `a refused skill is not saved and says why`; `a saved skill appears in listSkills`; `an imported file naming another agent's task type is refused`; `loading keeps good files when one is broken`.
- [ ] **Step 2: Run** `cargo test skills_store` (from `src-tauri/`) and `npx vitest run src/test/services/skills/userSkills.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**; apply `no_window` nowhere (no process spawned except `opener` for the folder through `tauri-plugin-opener`).
- [ ] **Step 4: Run** both, plus `cargo clippy -- -D warnings` and `cargo fmt --all -- --check` — Expected: PASS, clean.
- [ ] **Step 5: Commit** `feat(skills): your own skills, saved in the app's skills folder`.

### Task 7: The Skills page and the model-size setting

**Files:**
- Modify: `src/components/EcosystemHub.tsx` (the Skills tab: one section per agent with its skills (name, use when, tools, built-in or yours, last used), refused files with their reasons, "New skill" form (name, use when, task types to tick from the agent's own (`taskTypes` of its row that `ownerOf` gives it, as listed by the skills already there plus the table's prefixes), tools to tick from its own list, instructions), "Import a skill file", "Open skills folder", Export and Delete on your own skills)
- Create: `src/components/skills/SkillForm.tsx`
- Modify: `src/components/SettingsView.tsx` (Settings → Agents: "Agents call their own tools from model size (billions)" number field, saved as `agentToolCallMinSizeB`, with "Smaller models follow each skill's steps in order.")
- Test: rewrite the skills part of `src/test/ecosystemHub.test.jsx`; `src/test/components/skills/SkillForm.test.tsx`; a Settings test for the field

- [ ] **Step 1: Write the failing tests:** `lists each agent's skills`; `New skill saves a valid skill`; `the form shows the check's reasons and saves nothing` (Maria with `research_report`); `refused files are listed with their reasons`; `the size field saves agentToolCallMinSizeB`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/test/ecosystemHub.test.jsx src/test/components/skills src/test/SettingsView*` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(skills): the Skills page and the model-size setting`.

### Task 8: The old packs leave; docs

**Files:**
- Move to `archive/MIGHTBEUSEDLATER/skillPacks/`: `src/services/skillPack*.ts` (13 files) and their tests (the 37 listed by `grep -rln skillPack src/test`), with a note in `MIGHTBEUSEDLATER.md` (owner approved the move, 2026-10-24).
- Modify: `src/services/agentContractService.ts` (drop `validateSkillPackAgainstContract`, `AGENT_SKILL_PACK_SCOPE_OVERRIDES`, `hasSkillPackScopeOverride`; its tests move with them or are cut to the remaining contract), `src/services/coachEngineService.ts` (the "unused surface area" detector reads `listSkills()` + `skillLastUsed()`), its test.
- Docs: `CLAUDE.md` (rows: skills; replace the two skill-pack rows; counts), `docs/ALPHONSO_GROUND_TRUTH.md` (new §11.40), `docs/AGENT_GUIDE.md` (each agent's skills), `docs/USER_MANUAL.md` (Skills page, your own skills, the setting), `docs/CHANGELOG.md`, `docs/governance/DEFERRED_WORK.md` (Part B leftovers), `README.md`/`AGENTS.md`/`ARCHITECTURE.md` counts (`node scripts/verify-doc-counts.mjs`), `npm run generate:dnd-map`, the spec's status line.

- [ ] **Step 1:** `grep -rn "skillPack" src` lists only archive-bound files before the move.
- [ ] **Step 2: Move and edit;** run `npm run lint`, `npm run typecheck`, `npm run test > <workspace>/full.txt` — Expected: all green; the count drop equals the archived tests.
- [ ] **Step 3:** `node scripts/verify-doc-counts.mjs`, `npm run verify:dnd-map`, `npm run verify:dnd-coverage` — Expected: PASS.
- [ ] **Step 4: Commit** `chore(skills): archive the one-line skill packs; docs for Part B`.

### Task 9: Desktop check

**Files:**
- Create: `e2e-desktop/specs/agent-skills.e2e.mjs`; update the spec and check counts in `CLAUDE.md`

- [ ] **Step 1: Write the spec:** (a) the Skills page lists Hector's "Web research" and Maria's "Quality review"; (b) New skill for Alphonso is saved and `invoke('skills_list_user')` returns it; a Maria skill with `research_report` is refused on screen with "research_report is Hector's work, not Maria's." and is not in the list; (c) with a model reachable (skip otherwise), `/jose Research three facts about honeybees and write a short paragraph from them` runs and the board shows "Skill:" under Hector's and Alphonso's (or Miya's) steps with a reason; (d) the spec deletes the skill it saved.
- [ ] **Step 2:** build `npm run tauri build -- --debug --no-bundle` and run the spec, then `agent-roles`, `jose-planner`, `jose-board` — Expected: PASS.
- [ ] **Step 3: Commit** `test(e2e): skills on the desktop`.

### Final

Whole-branch self-review (no subagents), full suite, PR, merge when CI is green.
