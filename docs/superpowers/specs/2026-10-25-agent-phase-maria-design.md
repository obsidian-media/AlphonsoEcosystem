# Agent phase 3: Maria reviews the real work

> **Status (2026-10-25):** design, written with the owner after the Maria inspection of 2026-10-25 (code reading plus two live runs in the real app). Built on `feat/agent-phase-maria` (plan `docs/superpowers/plans/2026-10-25-agent-phase-maria.md`); not live-checked, because Windows Code Integrity blocks building the app on the dev machine. Merged and released in 2.10.0 (2026-10-27).

## Why

Maria owns "quality, governance and risk reviews" (the permission table): fact checks against sources, pass or fix on work, the risk of a plan or action, Boardroom's Conclude, the content factory's quality gate. The inspection showed:

- **Jose's fallback plan throws away every step's links.** When his model's plan fails its checks (both live runs: "My plan didn't pass the checks … so I used the simple plan"), `rulesPlan()` in `josePlanner.ts` rebuilds the steps from `decomposeJoseCommand()` but drops their `stepId`, `needs` and `reviewOf` and uses the old fixed order. The writing step then doesn't read Hector's research, and Maria's check isn't a review of the writing.
- **Live, "research three facts, write a post, check it for accuracy":** the post ignored Hector's facts; Maria ran her governance audit instead of reviewing it, gave no pass/fix, saw no sources, and called the post accurate about "hive worker numbers" it doesn't contain.
- **Live, "audit this plan: email all 500 customers a 30% discount code and post it on Instagram":** "code" gave Alphonso a code step (it ran a runtime check); "post it on Instagram" added a Marcus step that waited for approval; Maria said risk "low" and "approval required", with generic findings ("data privacy policies need review"), missing the plan's own risks (permission to email those customers; a public post hands the code to everyone). Chat printed "GOVERNANCE AUDIT RISK_ASSESSMENT COMPLIANCE_NOTES MARIA_AUDIT_SCHEMA".
- **A keyword fallback is used silently** when her model fails or when drafting is off (`buildMariaFallbackAudit()`: "send"/"post" = "supervisor review required"), labelled only in Boardroom; the Agent Guide promises she says so.
- **She ignores Jose's step model** (`model: options.model || getConfiguredOllamaModel()`).
- **"Approval required" changes nothing**: her step ends `pending_review`, nothing waits on it.
- **Her fact check can't see the sources**: `read_sources` reads only the steps her own step needs; a check of a post needs the post, not Hector's research.
- **Two weekly "Maria" items**: `mariaWeeklyReportService` counts receipts every week for everyone, sends "Maria weekly report ready", and no screen shows the report; the "Maria Weekly Governance Audit" schedule runs her risk check on a summary of the week, outside Jose.
- **The content factory's quality check is told to score "side by side with the brand's reference posts"** but gets only their links and notes.
- Her fallback borrows `generateRiskScore()` from the simulated Project Execution workshop (`audit/marcusAuditService.js`).

How she works with the others (owner: "are you sure that doesn't need anything? … Sentinel … Marcus … Jose, Miya, Hector and all the other agents"):

- **Alphonso**: in "Build an app" she reviews his build from his summary and a list of file names, never the code or the build and test output. His writing also judges itself ("This post is accurate"), and nothing tells her to ignore that.
- **Marcus** reads her verdict before sending but stops only for "high risk + approval required" (a post she marked "fix" can go out after the rounds run out), reads "Maria's latest output in the request" (maybe a review of something else), and uses `generateRiskScore()` keywords when she didn't run. He reads `schema.riskLevel`/`approvalRequired` and the `governance_audit`/`risk_assessment` artifacts.
- **Sentinel**: her role says she never checks security, but her plan-review prompt doesn't say so (her fallback flagged secrets and passwords), and she has no way to hand him a security matter (the rules' helper picks only Maria, Nova or Hector).
- **Jose's review loop** (`joseReviewLoop.ts`) expects `schema.findings` as strings and sends them back with the work; it treats an unreadable verdict as a pass with a note.
- **Miya**: content-factory reviews save scores per piece, no verdict, so `judgeReview()` asks Maria's model a second question ("did your review ask for changes?"), and passes the work when that answer can't be read.
- **Hector and Nova**: the Research report template has her review Nova's judgment "against the sources", but she needs only Nova's step, so she never sees Hector's sources.

Checking Hector's and Nova's hand-overs to every agent (owner: "have you checked the relation between Hector and all the other agents … same goes for Nova"):

- **Alphonso's writing** (`executeAssistantAssignment()`) puts only the chat prompt, his skill and the request in his prompt: Hector's research reaches him only through his skill's `read_step_output` tool, which reads the *first* linked step, and which a larger or paid model may not call.
- **Nova's verdict reaches neither the write-up nor Miya**: the rule plan's writing step needs only Hector, and the fixed order has Miya wait for Hector, never for Nova. Miya also reads Hector's work by agent (`priorOutputs.hector`, his latest step), not the step she is linked to.
- Marcus, Echo and Jose's closing summary already use what they're handed.

## Owner decisions (2026-10-25, multiple choice)

| Question | Decision |
|---|---|
| When her model fails | **Model judgment only.** Unreadable twice → her step fails and says why. No keyword verdicts. |
| What her answer looks like | **Two kinds, both specific.** Reviewing work: pass or fix, each finding quoting the exact sentence and saying what to change, unbacked claims listed. Reviewing a plan or action: risk level with a reason, each rule that applies and why, what needs your approval, concrete points for that plan. No contradictions. |
| When she says something needs your approval | **The request waits for you**, with her reasons, on the board, in Chat and on Telegram. |
| "Audit this plan … and post it on Instagram" | **Review, then offer to do it**: Maria reviews; her answer ends with an offer to have Marcus prepare it; nothing is planned until you say so. |
| What her fact check reads | **Everything the work was built from**: the sources of every earlier step the reviewed work came from. |
| The weekly items | **One weekly review, as a request**: "Maria: the week's risks". The count-only report and its notification go. |
| The content factory's references | **What is known about them**: what Hector's research found about each reference plus your notes; her scores say what she compared with; the prompt stops claiming she saw posts she didn't. |
| Reviewing Alphonso's work | **His files and results**: the files he changed (contents, size-capped) and the build and test output he recorded; each finding names the file and line; she judges the work, never what the work says about itself. |
| What Marcus does with her verdict | **Respect it on the exact work**: he reads her review of the very work he sends; a "fix" or an approval she asked for means he doesn't send until you approve; with no review he just asks you, and his keyword score goes. |
| Hand-overs that don't arrive | **Fix now, in this phase**: every agent's prompt includes all the work it's linked to, and a write-up or Miya's step waits for Nova when Nova is in the plan. |
| A security matter she notices | **Hand it to Sentinel**: she notes it and asks for his check through the help line; the work waits for his answer; her prompt says security is his. |

## Reviewing work

A Maria step with `reviewOf` (the rule plan's check, Jose's planned reviews, workflow review steps) reviews the reviewed step's work. Her answer (one JSON from her model, parsed and checked):

```
{ "verdict": "pass" | "fix",
  "summary": "two sentences",
  "findings": [ { "quote": "the exact words from the work", "problem": "...", "change": "..." } ],
  "unbacked": [ { "claim": "the exact claim", "why": "no source says it / source [n] says otherwise" } ],
  "good": ["what works, one sentence each"] }
```

- **A finding's quote must appear in the work** (case and spacing aside); a finding whose quote doesn't is dropped. A `fix` with no finding left becomes `pass` with a note? No: it is asked once more ("Quote the words you mean."), then dropped findings are kept as plain text under "Also noted".
- **Claims**: for a fact check (`audit_claims`, or `audit_quality` with the Claim check skill) every unbacked claim is a finding; the verdict is `fix` while any is listed.
- **The hand-over** (`summary`): "Pass." or "Fix:" first, then each finding as `"<quote>": <problem> → <change>`, then "Not backed by a source:" with the claims. The step's `schema` is the parsed review plus `verdict`, which `judgeReview()` already reads (so a `fix` sends the work back, at most 2 rounds, as today).
- **Nothing to review** stays as today: "Nothing to review: …".

### What she reads

`read_sources` and `read_source_page` (her skill tools) look at the reviewed step and every step it needed, up to three steps back, and use the first research step's numbered sources (Hector's report numbering, excerpts, page text). When none has sources: "No earlier step used sources." and the claims are listed as unbacked with that reason.

## Reviewing a plan or an action

A Maria step without `reviewOf` (`governance_audit`, `risk_review`, `audit_governance` from Boardroom, `policy_*`, `approval_*`, a weekly review) reviews the request and the steps she needs:

```
{ "risk": "low" | "medium" | "high", "why": "one sentence",
  "rules": [ { "rule": "e.g. permission to email customers", "applies": "why it applies to this plan" } ],
  "points": ["a concrete risk or gap in this plan, one sentence each"],
  "needsApproval": true | false, "approvalReasons": ["..."],
  "offer": "what Marcus could prepare, when the plan sends or posts something; else empty" }
```

- **No contradictions**: `needsApproval` with `risk: "low"` is asked once more ("You asked for approval but said low risk: say which."), then risk becomes `medium`. Each approval reason must be one of her points or rules.
- **The hand-over**: "Risk: <level>. <why>" first, then the rules with why, the points, "Needs your approval: …" when it does, and, when `offer` is set, the closing line "Want me to have Marcus prepare this? (<offer>)".
- **Field names** `riskLevel`, `approvalRequired` and `summary` stay in the schema too, so Boardroom's Conclude and the approval card keep working.

### When she asks for your approval

When `needsApproval` is true, every step that needs hers (directly) gets `waitFor`: "Maria asks for your approval: <reasons>". They wait like any approval: the board's Approve and carry on, Telegram's Approve / Reject, Chat's notice. With no step after hers, her answer says it needs your approval and nothing else waits.

### The offer

When a plan review has `offer`, Chat shows a button under her answer: **Have Marcus prepare this**, which sends a new request with one Marcus `distribution_readiness` step (reading, preparing, not sending). Elsewhere (Telegram, the board) her closing line is the offer; you ask for it in your own words.

### Alphonso's work

When the reviewed step is Alphonso's and wrote files, her input adds each file he wrote (from the step's artifacts, `relativePath`), its text up to 6,000 characters each and 20,000 in all (cut with "(cut: N more characters)"), and the build and test output his step recorded (its command results). A finding then has `file` and `line` beside `quote`; the quote must appear in that file. Her prompt says: "Judge the work itself. Ignore anything the work says about its own quality."

## Hand-overs

- **Every agent's prompt includes all the work it's linked to**: Alphonso's writing and answering steps (`executeAssistantAssignment()`) add `stepInputText(stepInput)` (every needed step, the review, the other steps' lines), as Maria's, Nova's, Sentinel's and Echo's prompts already do; Miya's package (`executeMiyaAssignment()`) reads the steps she is linked to from the step input instead of `priorOutputs.hector`. The skill's tool results stay as they are.
- **A write-up or Miya waits for Nova when Nova is in the plan**: the rule plan's writing step needs `hector` and `nova` when they are there; `AGENT_DEPENDENCIES.miya` is `['hector', 'nova']` (only the ones in the plan count, as now).
- Alphonso's steps also stop passing an explicit model, so Jose's step model is used.

## Working with the others

- **Jose's review loop** keeps working: the schema keeps `findings` as strings (each finding written as `"<quote>": <problem> → <change>`, an unbacked claim as `Not backed: <claim> (<why>)`), so the revision gets her exact changes. `judgeReview()` reads her saved verdict and never counts an unreadable answer as a pass.
- **Miya's content reviews** get their verdict without a second model call: `fix` when any piece she scored is under the brand's threshold (`ContentBrand.threshold`), or she listed an honesty problem; else `pass`. The second-question path stays only for reviews by other agents.
- **Hector and Nova**: reading three steps back (above) gives her Hector's sources when she reviews Nova's judgment, and Nova's `[n]` citations are checked against them.
- **Marcus** finds her review of the work he is sending: the step whose `reviewOf` is the step he sends from (his `needs`), else a plan review he needs. A `fix` verdict, or `needsApproval`, makes his send wait for your approval with her reasons ("Maria asked for changes: …"), even after the review rounds ran out. With no review he asks you as every send does; `generateRiskScore()` is no longer used by him.
- **Sentinel**: her prompts say "Security (secrets, unsafe links or commands, permissions) is Sentinel's: when you see one, end with HELP: security check of <what>." `chooseHelper()`'s rules send a help request that mentions security, a secret, a password, a link or a permission to Sentinel (`security_review`); the work waits for his answer, then she finishes.
- **Echo** saves the request's decisions as today; her one memory note per review stays.

## Both kinds

- **Model judgment only.** No `buildMariaFallbackAudit()`, no `generateRiskScore()`; drafting switched off (`draftDisabled`) fails her step with "Maria's model is switched off." Unreadable twice → "Maria's model didn't give a readable review."
- **Jose's step model**: no explicit `model` or `endpoint`.
- **Her skill first** in the prompt (as `reviewStep.ts` already does).
- **Confidence** `inferred`; never `verified`.
- **Memory**: one note per review ("Maria: <about> — <pass/fix or risk>"), the memory-graph `audits` edge kept; no session event of her own.
- **Chat and the result card** show her hand-over text, not artifact names (`governance_audit`, `risk_assessment`, `compliance_notes`, `maria_audit_schema` artifacts go).
- **Boardroom**: Conclude uses the plan-review kind; "(rule-based)" can no longer happen and the label goes.

## Routing

- **The fallback keeps the links**: `rulesPlan()` keeps `decomposeJoseCommand()`'s `stepId`, `needs` and `reviewOf` (and its `instruction`), and uses the fixed order only for steps without `needs`.
- **An audit of a plan is a review**: a request asking to audit, review, assess or check a plan, an idea, a campaign or a proposal gets Maria's plan review (and Hector's research only when it also asks for research); no Marcus step and no Alphonso step from words inside the plan.
- **"Code" in "discount code", "promo code", "coupon code", "voucher code", "referral code"** is not code work (`isCodeRequest()`).
- The routing set gains the two live requests and three like them.

## The weekly review

The `maria_weekly_audit` preset becomes **"Maria: the week's risks"**: a one-step Maria plan review through `submitStepsToJose()` (`MARIA_WEEKLY_LABEL`), with the week's actions, failures and approvals as the request; on the board and Telegram like Nova's daily verdict. `scheduleWeeklyGeneration()` is no longer started from `App.tsx` and its notification goes; `mariaWeeklyReportService.ts` stays (R14).

## The content factory

`audit_content_quality` gets, for each of the brand's references, what Hector's research step found about it (its title, opening line and why it works, matched by link) and your note. The prompt says "compared with what is known about the brand's reference posts", and each piece's `comparedTo` must name one of them or say "no reference known". Its answer shape and the quality gate stay.

## Testing

- Unit: every linked step in Alphonso's writing prompt and Miya's package, the write-up and Miya waiting for Nova; Alphonso's files in her input and file/line findings; Marcus waiting on her `fix` and `needsApproval` for the exact work, and no keyword score; the help line to Sentinel; the review loop's string findings; content verdicts from scores; both answer kinds (quotes checked, unbacked claims make `fix`, no-contradiction ask, offer line), model only, step model, sources read through the reviewed step's needs, `waitFor` on the steps after her when she asks for approval, the weekly request, the content references, the planner fallback's links, the audit route, "discount code".
- Routing set: the two live requests and three more.
- Desktop (`e2e-desktop/specs/maria.e2e.mjs`): the fact-check request (her review quotes the post, reads Hector's sources, gives a verdict), the plan audit (one Maria step, specific points, approval wait when she asks, the offer button). Runs when this machine can build the app again.

## Calls made (not asked)

- The offer is a Chat button plus a closing line elsewhere; nothing is planned until you press it or ask.
- Her approval reuses the existing `waitFor` wait, so Approve works everywhere it already does.
- Three steps back is how far she follows the work's sources.
- The planner fallback fix is in this phase because it is what breaks her reviews; it also gives the writing step Hector's research.
- Alphonso's "Dear [Recipient]" post and his self-assessment ("This post is accurate") are his phase's; here she only learns to ignore such self-assessments.
- Content-factory verdicts come from her own scores and the brand's threshold (no second model call); an unreadable review is never a pass.
- 6,000 characters per file and 20,000 in all for Alphonso's files (the step-input limits).
