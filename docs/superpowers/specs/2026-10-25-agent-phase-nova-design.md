# Agent phase 2: Nova judges what was found

> **Status (2026-10-25):** built (plan `docs/superpowers/plans/2026-10-25-agent-phase-nova.md`). Design written with the owner after the Nova inspection of 2026-10-25 (code reading plus live runs in the real app).

## Why

Nova is meant to own "judging value, priority and timing from what Hector found" (the permission table). The inspection showed she does not:

- **Her scores come from a keyword count.** `computeOpportunityScores()` adds points for words ("build", "app", "email", "real", "production") and the numbers go into her prompt as "deterministic scores". When her model fails, those numbers are the answer, without saying so.
- **Her answer is a score block, whatever her skill says.** The "Value and priority" skill asks what is worth doing, in what order and why; her prompt forces `valueScore / riskScore / timingScore / effortScore / priorityTier` and a 1–2 sentence recommendation.
- **She ignores the model Jose picks for her step.** She passes the Settings model explicitly, which wins over a step's model, the larger model tried after failures, and a paid model.
- **The simple plan runs her before Hector.** `AGENT_DEPENDENCIES.nova` is empty, so in "research … and tell me which opportunity is worth going after first" she ran beside Hector, in 3 seconds, and judged the request text.
- **Live answers were meaningless.** Coffee subscriptions in Canada: "value 58/100 (critical priority)", "Effort: 100/100", no opportunity named. A bakery choosing between a newsletter, a loyalty card and a podcast: every score 100/100, the podcast dropped, no reasons, and beside it "Opportunity Score: 0 … Low opportunity score — consider minimal agent delegation" from the keyword count; "Risk Signals: external_action" because the question contains "email". Both stamped "verified".
- **Chat shows her internals.** The result card prints the raw schema twice ("Analyzed At Ms: 1792967578165", "Score Id", "Opportunity Id").
- **The Chat Nova card scores your message, not the work.** After every Jose request, `computeOpportunityScores(your text)` decides whether to call `runNovaAnalysis()` again (a hidden model call, a memory note, a session event and a receipt) and show a card. `skipOllama: true` is passed and ignored. Chat reads threshold `alphonso_nova_threshold` (65), the service `alphonso_nova_threshold_v1` (75).
- **History is meaningless.** Only the daily scan records a score (one number for a summary of the week). Telegram's `/nova` shows a "trend" of those and tells you to "send a command to Jose" to get one, which records nothing.
- **Workflows put her before Hector** (`workflowRegistryService.ts`: `JOSE, NOVA, HECTOR, …`), and the batch planner gives her "Performance profiling and optimization", which is Alphonso's code work.
- **A routing slip sent a question meant for her to Miya Studio.** "Which should a bakery do first: a newsletter, a YouTube channel or a podcast?" matched both of the Content video template's word groups ("youtube", "channel"), so Chat started a video project and answered "Choose an output folder in Settings first, then ask again.", which hides what Jose understood.

Found in the same runs, Hector's (merged in agent phase 1): a broken string from his model (`notFound": [{`) shown under "Sources disagree", and a page that answered but was too short labelled "blocked (HTTP 200)".

## Owner decisions (2026-10-25, multiple choice)

| Question | Decision |
|---|---|
| What replaces the keyword scores | **Model judgment only.** No keyword scores. No readable verdict → her step fails and says why. |
| What her answer looks like | **A ranked verdict with reasons**: every option in order, each with why, value / effort / risk in plain words, what would change her mind, then what to do first; Hector's findings cited by number when there are any; one overall 0–100 only when there is a single thing to judge. |
| Nothing to judge (no research, no options) | **Ask Hector first** through the existing HELP line. |
| The Chat Nova card | **Her real verdict only**: shown when a request had a Nova step, from that step's output. No extra model call or memory note; the internals dump goes. |
| `/nova` and the Settings chart | **Her last verdicts**: the last 5, each with what it was about, what to do first, when, and the request. No trend line. |
| The daily scan preset | **A "what next" verdict** over the week's work and what is still waiting, in the same shape. |
| The content factory's market step | **Nova after Hector**: she judges his analysis and his sources. (Already so: see below.) |
| The video shortcut | **Needs a making word** (make, create, film, script, produce, edit…); the message says what Jose understood; the bakery question goes in the routing test set. |

## The verdict

Nova's answer (every non-content Nova step: `analysis_findings`, `opportunity_analysis`, `analysis_workflow_step`, `prioritization_*`, `strategy_*` outside the content factory) is one JSON answer from her model, parsed and checked:

```
{ "doFirst": "the option to start with, in a few words",
  "options": [ { "name": "...", "rank": 1, "why": "...", "value": "high|medium|low",
                 "effort": "high|medium|low", "risk": "high|medium|low", "sources": [2, 4] } ],
  "wouldChange": "what would change this order",
  "score": 0-100 (only when there is one option) }
```

- **Options**: at least one. When the request or the earlier steps name options, every named option must be ranked; one left out is a reason to ask her once more ("You left out: the podcast."), then it is listed last as "not judged".
- **Sources**: numbers into the numbered sources of the steps she needs (Hector's report numbering). A number that does not exist is dropped, as in Hector's write-up. With no sources, the verdict says "Judged from your request only." on its first line.
- **Value / effort / risk** are words, never numbers. `score` only for a single option, else dropped.
- **Unreadable twice** → the step fails: "Nova's model didn't give a readable verdict." No fallback numbers.
- **The hand-over text** (`summary`, what the next step and Chat see) is the verdict written out: "What to do first: …", the ranked list with reasons and `[n]`, "Would change this: …". The step's `schema` is the parsed verdict; no ids, timestamps or internal fields.
- **Confidence** is `inferred` (a judgment), never `verified`.
- **Skills**: the skill picked for the step (`prepareSkill`) stays first in her prompt; the prompt asks for the verdict shape and the skill's own instructions say what to weigh.
- **The model** is the one Jose picked for the step (no explicit Settings model).

### Nothing to judge

When the steps she needs gave her nothing (no needed step, or only failed ones) and the request names no options, her prompt tells her to answer with `HELP: research <what she needs>` instead of a verdict. The existing help loop (`joseHelp.ts`) adds a Hector step and runs her again with his findings; it runs once per step, so a second empty attempt is judged "from your request only". A Nova step that already has options from the request (the bakery question) judges them directly.

### Where she runs

- **The simple plan**: `AGENT_DEPENDENCIES.nova = ['hector']`, so she waits for Hector whenever both are in the plan.
- **Workflows**: Nova moves right after Hector in every chain that has him; a chain without Hector keeps her where she is (with nothing to judge she asks for research).
- **Batch planner**: "Performance profiling and optimization" goes to Alphonso.

## The surfaces

- **Chat**: the Nova card shows only after a request with a Nova step, from that step's output (what to do first and the top three). No `computeOpportunityScores()`, no second `runNovaAnalysis()`, no threshold. Settings' "Nova Insight Threshold" box goes.
- **The result card** shows the verdict text, not the schema dump (no `opportunity_score` artifact, no schema artifact).
- **Saved verdicts**: every Nova verdict is kept (`alphonso_nova_verdicts_v1`, the last 30: what it was about, what to do first, the request id, when). `NovaHistoryChart.tsx` becomes the list of the last 5 in Settings; Telegram `/nova` sends the same list. "No verdicts yet: ask Jose something like 'which of these should I do first?'" when empty.
- **The daily scan** (`nova_daily_scan` preset) runs as a one-step Nova request through `submitStepsToJose()` with the week's work and what is still waiting as the step's payload, so it is on the board, saved as a verdict, and Telegram's "finished" message goes out when that is on. Nothing done in the week → skipped, as today.
- **Memory**: one memory note per verdict ("Nova: <topic> — do first: <option>"), not a note, a session event and a receipt per call; the engine's receipt for the step stays.
- **Removed**: the keyword scorer and its signals, decomposition hints from keyword scores, `saveOpportunityScore()` and its threshold alert. `novaFeedbackService.ts` stays (R14) but receives nothing from Nova.

## The content factory

No change. The inspection first reported that her market step sees only Hector's raw search results; that was wrong. Her step needs his (`research_market` needs `research_trends`), and `livePayload()` in `contentAgentExecutor.ts` adds his saved answer for the same step (`pendingAgents.hector`, "Hector's research: …", agent roles Part A, 2026-10-24). The owner's choice (Nova after Hector) is what already happens. Her content-factory answers keep their own shapes; a unit test pins that she gets his answer.

## The video shortcut

`submitToJose()` takes Chat's content-video shortcut only when the Content video template fits **and** the request has a making word (make, create, produce, film, shoot, record, edit, script, write, turn … into). Otherwise Jose plans it normally. When the shortcut does run and there is no output folder, the reply says: "I took this as a content video for Miya Studio. Choose an output folder in Settings → Runtime → Local Services first, then ask again, or say 'plan this fresh' to have it planned normally." The routing test set gains the bakery question and two like it.

## Hector's two leftovers

- `parseWriteUp()` drops disagreement and not-found entries that look like broken JSON (contain `":`, start with `{` or `[`).
- A page that answered but was too short is labelled "too short to read", not "blocked (HTTP 200)".

## Testing

- Unit: the verdict parser (ranking, a left-out option asked once then listed "not judged", source numbers checked, words not numbers, single-option score), the hand-over text, `inferred`, no keyword scorer, Jose's step model used, the HELP answer, `AGENT_DEPENDENCIES`, workflows order, the batch owner, the Chat card from the step output, saved verdicts and `/nova`, the daily scan as a request, the market step getting Hector's answer (a test of what exists), the video shortcut's making word and its message, Hector's two fixes.
- Routing set: the bakery question (both wordings) → Nova; "make a YouTube video about bread" → the content video.
- Desktop (`e2e-desktop/specs/nova.e2e.mjs`): a research-then-judge request where Nova runs after Hector and her verdict ranks named options with reasons and valid source numbers; the bakery question ranks all three options; Chat shows her verdict and no internals.

## Calls made (not asked)

- Value / effort / risk as high / medium / low words; the only number is `score` for a single option.
- 30 saved verdicts, 5 shown.
- One more ask when an option is left out, then "not judged".
- Sentinel passes the Settings model explicitly too; that is fixed in Sentinel's phase.
