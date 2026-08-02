export const meta = {
  name: 'alphonso-full-bug-audit',
  description: 'Line-by-line bug audit of AlphonsoEcosystem across 12 scopes, with adversarial verification of high-severity findings',
  phases: [
    { title: 'Read', detail: '12 scope readers covering the whole repo line-by-line' },
    { title: 'Verify', detail: 'adversarial refutation of Critical/High findings' },
  ],
};

const REPO = 'D:\\AgentDevWork\\repos\\AlphonsoEcosystem';

const COMMON = `
You are a bug-audit subagent for the AlphonsoEcosystem repo at ${REPO} (Windows; PowerShell and Bash tools both available).

RULES (non-negotiable):
- Read EVERY file in your scope line-by-line, to EOF. Use Read with offset/limit to page through large files. Do not skip a file because it "looks fine". Do not stop reading a file after finding an issue.
- Report only issues backed by evidence from the CURRENT source: file path + line numbers + a quote or precise description.
- Do NOT fix, edit, refactor, or write ANY file. This is a strictly read-only audit.
- No scope drift except brief cross-file lookups needed to confirm a specific issue's impact or root cause.
- If a defect is not verified, label it UNCERTAIN and say what would confirm it.
- Do not call intentional design a bug unless the implementation clearly contradicts stated intent (comments/docs).
- Report pre-existing bugs too.
- Be honest about coverage. A truthful partial-coverage statement is far more valuable than a false claim of completeness.

KNOWN BUG CLASSES THAT HAVE SHIPPED IN THIS REPO BEFORE — check for recurrences where your scope makes it relevant:
- invoke('some_command') naming a Tauri command that is NOT in src-tauri/src/lib.rs's generate_handler! list (silently swallowed).
- Tauri-environment detection via window.__TAURI__ instead of window.__TAURI_INTERNALS__ (v2 does not set the former here).
- A value read from a different storage key/store than the one it is written to.
- A cache starting null and being poisoned to {} by a read that races async hydration.
- 'return' where 'continue' was meant inside a per-message loop (drops all but the first item).
- Dead/shadowed branches: a second identical if-condition that can never run.
- React.lazy(() => import(X)) missing the .then(mod => ({default: mod.Named})) mapping for a named-only export (crashes the whole app).
- Missing CREATE_NO_WINDOW (the no_window() helper in utils.rs) on a Windows process spawn.
- Two services defaulting to the same localhost port (silent bind collision, no UI feedback).
`;

const REPORT_FORMAT = `
OUTPUT — return exactly these three sections as plain text:
1. FINDINGS — for each: file path | line number(s) | short title | Severity Critical/High/Medium/Low | Confidence High/Medium/Low | why it is a bug | impact | how to verify or reproduce | related files.
2. PER-FILE LEDGER — one line per file in scope: "path — reviewed, no issues found" OR "path — findings: <titles>" OR "path — UNCERTAIN: <what>".
3. COVERAGE STATEMENT — state plainly whether your scope was FULLY covered. If not, list exactly which files or line ranges were not fully verified, and why.
`;

const SCOPES = [
  {
    key: 'rust-core',
    scope: `Group 1A — Rust core/runtime. Files: src-tauri/src/{lib.rs, main.rs, utils.rs, kv_store.rs, os_keychain_store.rs, policy_gate.rs, audit_log.rs, connector_commands.rs, plugin_runtime.rs, ollama.rs, memory_store.rs}. Also read src-tauri/Cargo.toml, src-tauri/tauri.conf.json and src-tauri/capabilities/*.json as supporting context.`,
    focus: `Command injection, path traversal, SSRF, missing auth, unsafe deserialization, secrets handling, reachable unwrap/expect/panic from user input, swallowed errors (unwrap_or_default masking failure), races, resource leaks, integer/bounds issues, unsafe defaults, per-program arg allowlist correctness in policy_gate.rs, audit-chain integrity in audit_log.rs, and CREATE_NO_WINDOW on every process spawn.`,
  },
  {
    key: 'rust-modules',
    scope: `Group 1B — Rust feature modules: every .rs file in src-tauri/src/ EXCEPT lib.rs, main.rs, utils.rs, kv_store.rs, os_keychain_store.rs, policy_gate.rs, audit_log.rs, connector_commands.rs, plugin_runtime.rs, ollama.rs, memory_store.rs (another agent owns those). Enumerate the directory yourself to get the full list; it includes companion_server.rs, companion_auth.rs, companion_discovery.rs, companion_router.rs, companion_types.rs, voice_sidecar.rs, runtime_manager.rs, workspace.rs, telegram.rs, youtube.rs, runway.rs, search.rs, whatsapp_webhook.rs, meta_publish.rs, native_proof.rs and possibly others.`,
    focus: `The companion WebSocket server is a network-facing trust boundary — scrutinize PIN auth, attempt lockout, constant-time comparison, and whether any JSON-RPC method in companion_router.rs is reachable without authentication. Command injection / path traversal in workspace.rs and runtime_manager.rs. SSRF in search.rs / telegram.rs / youtube.rs / runway.rs. Port defaults that collide with another local service. Bind failures with no user feedback. Reachable panics. Swallowed errors. CREATE_NO_WINDOW on every spawn. ALSO: audit the #[cfg(test)] modules — in particular any test that mutates process-global state such as std::env::set_var/remove_var, which races other tests under Rust's parallel test threads.`,
  },
  {
    key: 'gateways',
    scope: `Group 2 — network-facing Node sidecars and gateways. Every file (excluding node_modules and package-lock.json) under: gateway/** (whatsapp-cloud/src/{server,security,verify,normalize,forward}.js, generic-webhook/src/{server,security}.js, both package.json / Dockerfile / railway.json / .env.example / README.md, gateway/docker-compose.yml, gateway/Dockerfile, gateway/marketplace/catalogue.json), bridge/**, mcp-server/**, modules/** (TOML manifests), supabase/** (migrations).`,
    focus: `These are internet-exposed HTTP services; trace data flow across the trust boundary. Non-constant-time secret comparison, missing auth on a route, auth bypass via header/query precedence, HMAC verification against parsed rather than raw body, missing replay protection, unbounded queue/memory growth, missing input validation and size limits, SSRF in forwarders, error responses leaking internals, CORS misconfiguration, secrets in logs, no rate limiting, Dockerfile defects (root user, baked secrets, wrong CMD/port, no healthcheck), .env.example documenting vars the code never reads or omitting required ones, and SQL defects in supabase migrations (missing RLS, permissive policies, missing constraints).`,
  },
  {
    key: 'python-voice',
    scope: `Group 3 — Python voice backends and voice frontend. IMPORTANT: voice/backend contains a large venv/model tree — IGNORE anything under venv/, .venv/, site-packages/, node_modules/, models/, dist/, build/. In-scope: voice/backend/{main,pipeline,router,session,state,stt,tts,vad}.py and voice/backend/tests/*.py plus voice/backend root config files; voice/cloud-backend/app/{__init__,auth,config,contracts,main,nvidia,piper_tts,supabase_auth,voice_policy}.py and voice/cloud-backend/tests/*.py plus its Dockerfile/requirements/config; voice/piper-farsi/app/main.py plus config; voice/frontend/src/{App.tsx,useJarvisVoice.ts,pcm-processor.worklet.ts}; voice/configs/**; voice/shared/**. Enumerate directories yourself (minus the ignore list) so no config file is missed.`,
    focus: `Missing await on coroutines, calling non-callables, wrong argument order, FastAPI/WebSocket lifecycle and concurrency bugs, unbounded buffers, blocking calls in async paths, auth defects in cloud-backend (supabase_auth.py / auth.py token validation, service-role-key blast radius, missing authz), voice_policy bypasses, SSRF/injection, silent 'except: pass', unclosed sessions/files/subprocesses, model-download paths that can hang or write outside intended dirs, unsafe config defaults. ALSO audit the test files in scope: brittle or misleading assertions, tests asserting on mocks rather than behavior, tests that would pass even if the code were broken.`,
  },
  {
    key: 'services-a-h',
    scope: `Group 4 — frontend business logic, services A-H: every file DIRECTLY in src/services/ (top level only, NOT subdirectories) whose filename begins with a letter a through h, case-insensitive. Enumerate them first with a directory listing and state the count. The subdirectories connectors/, agentWorkshop/, approval/, audit/, memory/, projectExecution/, systemHealth/ belong to another agent — exclude them.`,
    focus: `Silent failure paths (empty catch{} swallowing real errors, .catch(() => {}) on writes that must not fail, fallbacks masking outages), invoke() calls to nonexistent Tauri commands, wrong-storage bugs, JSON.parse without a guard, localStorage quota, unbounded array/ring growth, races between boot effects and async hydration, missing await, floating promises, timers never cleared, gates that fail open, secrets logged or persisted in plaintext, retry loops with no backoff or bound, and contract mismatches with what CLAUDE.md documents.`,
  },
  {
    key: 'services-i-p',
    scope: `Group 5 — frontend business logic, services I-P: every file DIRECTLY in src/services/ (top level only, NOT subdirectories) whose filename begins with a letter i through p, case-insensitive. Enumerate first and state the count. Subdirectories belong to another agent — exclude them.`,
    focus: `This range holds the most security-critical services: joseExecutionEngineService, licenseService, policyEnforcementService, policyDslService, pluginRegistryService, pluginSigningService, pluginSandboxService, orchestrationQueueService, packetExecutionService, modelSelectionService. Give those extra scrutiny but still read every file in range. Look for: policy/approval/license gates that fail OPEN (default-allow on error, unknown action, or missing rule), signature-verification defects (algorithm confusion, unverified trusted-key list, verification result computed but ignored), sandbox escapes, queue/dead-letter state machines that lose or duplicate work, loop/budget guards that can be bypassed, silent failure on security-relevant operations, nonexistent Tauri commands, unbounded growth, hydration races, missing await, uncleaned timers, plaintext secrets, and defaults that contradict CLAUDE.md.`,
  },
  {
    key: 'services-q-z',
    scope: `Group 6 — frontend business logic, services Q-Z: every file DIRECTLY in src/services/ (top level only, NOT subdirectories) whose filename begins with a letter q through z, case-insensitive. Enumerate first and state the count. Subdirectories belong to another agent — exclude them.`,
    focus: `Trust-critical files here: sentinelSecurityService, sentinelGateService, skillPackService, verificationService, verificationChainService, workflowGovernanceService, runtimeLedgerService, telegramCompanionService, whatsappCompanionService, whatsappWebhookService, recoveryService. Look for: inbound-message trust-boundary defects in the Telegram/WhatsApp companions (owner-pairing/allowlist gates that can be bypassed, untrusted inbound text forwarded into agent prompts or command execution, per-message loop bugs, dead/shadowed command branches), skill-pack permission validation bypasses, verification chains whose result is computed but never enforced, nonexistent Tauri commands, silent catch{}, unbounded growth, missing await, uncleaned timers, plaintext secrets, contract mismatches with CLAUDE.md.`,
  },
  {
    key: 'connectors',
    scope: `Group 7 — connectors and service subdirectories. Every file under src/services/connectors/** (~15 files incl. connectorRegistry.js, connectorAuth.ts, connectorOutbound.js, connectorPolling.js, connectorImageGenerators.js, githubConnector.ts, slackConnector.ts, discordConnector.ts, tavilyConnector.ts, perplexityConnector.ts, deepseekConnector.ts, n8nConnector.ts, nvidiaNimConnector.ts, geminiConnector.ts, connectorConstants.ts — enumerate to confirm), plus src/services/{agentWorkshop,approval,audit,memory,projectExecution,systemHealth}/**. Top-level files directly in src/services/ belong to other agents — exclude them.`,
    focus: `Credential handling defects (read from a different key/store than written; logged; sent to the wrong host), a credential cache that starts null and can be poisoned to {} by a read racing async hydration, outbound calls that bypass the policy gate (gateConnectorAction / policyEnforcementService) on some code paths, fetch with no timeout or AbortController, unbounded retry, errors swallowed so a failed send looks successful, SSRF via user-controlled URLs, missing response-status checks (treating a 4xx/5xx body as success), tokens leaked in query strings or error messages, registry entries whose declared shape does not match what the UI/services expect, and nonexistent Tauri commands.`,
  },
  {
    key: 'app-wiring',
    scope: `Group 8 — app wiring. Every file under src/hooks/** (~17, incl. useJarvisVoice.ts, pcm-processor.worklet.ts, useBootEffects.js, useDataHydration.js, useAppShellState, the useAppEffects splits, useVoiceInput, useTheme), src/lib/** (~9, incl. ollama.js/ollama.ts, durableStore.js, jsonUtils.js, motion.ts), src/contexts/** (~6, incl. CoachContext.jsx), src/agents/** (~27 — 9 agent profiles, permissions, schemas, agentRegistry.js), src/types/**, src/config/**, plus src/App.tsx (and any other src/App.*), src/main.jsx, src/global.d.ts and any other loose file directly in src/. src/services, src/components and src/test are NOT yours. Enumerate the directories yourself.`,
    focus: `React correctness — stale closures, missing/incorrect dependency arrays, effects firing before required async hydration completes, intervals/timeouts/listeners/WebSockets never cleaned up, state updates after unmount, unbounded state growth. CRITICALLY: verify EVERY lazy(() => import(...)) call in App.tsx against the target module's REAL export shape (open each target file and check whether it has a default export or only a named one) — a missing .then mapping crashes the entire app. Also: window.__TAURI__ vs window.__TAURI_INTERNALS__ checks; invoke() calls to nonexistent commands; null-returning invokes used without a guard; swallowed errors; agent profile/permission declarations that contradict the contracts enforced in agentContractService.ts; WebSocket/AudioWorklet lifecycle bugs in the voice hook.`,
  },
  {
    key: 'components-a-m',
    scope: `Group 9A — UI components, first half. Enumerate ALL files under src/components/** (including subdirectories agentWorkshop/, agents/, approval/, audit/, dashboard/, hector/, projectExecution/, research/, ui/), sort the full list alphabetically by path, and audit the FIRST HALF. State the total count and exactly which files fall in your half. Also audit index.html at the repo root. src/App.tsx, src/hooks, src/services and src/test are NOT yours.`,
    focus: `Components reading a value from a DIFFERENT storage key/shape than the service that writes it (a "connected" badge and a "Test" button disagreeing has shipped here before), effects with missing cleanup (intervals, listeners, WebSockets, object URLs), missing/incorrect dependency arrays and stale closures, unguarded .map / property access on data that can be null or a failed-invoke result, invoke() calls to nonexistent Tauri commands, window.__TAURI__ instead of window.__TAURI_INTERNALS__, external links via bare <a target="_blank"> instead of invoke('open_url') (fails silently in the Tauri webview), handlers that silently do nothing on failure or report success regardless of outcome, buttons/labels claiming an action the code does not perform, unbounded list rendering, secrets rendered or logged, controlled/uncontrolled input bugs.`,
  },
  {
    key: 'components-n-z',
    scope: `Group 9B — UI components, second half. Enumerate ALL files under src/components/** (including all subdirectories), sort the full list alphabetically by path, and audit the SECOND HALF. State the total count and exactly which files fall in your half. Do NOT audit index.html (the other components agent has it). src/App.tsx, src/hooks, src/services and src/test are NOT yours.`,
    focus: `Same as the first-half components agent: storage key/shape mismatches against the writing service, missing effect cleanup, dependency-array and stale-closure bugs, unguarded access on possibly-null data, nonexistent Tauri commands, window.__TAURI__ vs window.__TAURI_INTERNALS__, bare <a target="_blank"> instead of invoke('open_url'), handlers that silently no-op or report success regardless of outcome, labels claiming actions the code does not perform, unbounded rendering, secrets rendered or logged, controlled/uncontrolled input bugs. Give extra depth to the largest behavior-heavy views in your half (e.g. SettingsView.tsx, RightPanel.tsx, RuntimeManagerView.tsx, OperatorDashboard.tsx, MissionRoom.tsx, OnboardingWizard.tsx, WorkflowBuilderView.jsx) without skipping small files.`,
  },
  {
    key: 'ios',
    scope: `Group 10 — iOS companion app: every file under ios/** and AlphonsoCompanion/** (~71 total — Swift sources, Xcode project files, Info.plist, entitlements, and the AlphonsoCompanionTests/ target). Enumerate both trees and state the counts. The .pbxproj is large and mostly generated: read it, and you may summarize its generated sections, but still report real defects such as missing test-target wiring, wrong bundle IDs, or files referenced but absent.`,
    focus: `VERIFY IN SOURCE rather than assume: the desktop companion WebSocket server's real default port (check src-tauri/src/companion_types.rs CompanionConfig::default) versus whatever the iOS app hardcodes in MDNSService.swift / PairingView.swift / SettingsView.swift — report any disagreement. A prior bug involved a %<interface> scope suffix in resolved hosts breaking URLComponents, addressed by a stripInterfaceSuffix(_:) helper; verify its current state and whether it is applied on every path. Also: URL-construction defects, mDNS/Bonjour resolution bugs, WebSocket state-machine bugs (reconnect storms, no backoff, stuck-after-error), PINs or credentials stored in UserDefaults rather than Keychain, missing or overly broad App Transport Security exceptions (NSAllowsArbitraryLoads), force-unwraps reachable from network or user input, retain cycles from missing [weak self], UI updates from background queues, silent failure with no error surfaced, Info.plist permission strings missing for used capabilities (local network, microphone), entitlements mismatches. ALSO audit the test files: brittle or misleading assertions, and whether the test target is actually wired into any CI workflow (check .github/workflows/ios-build.yml).`,
  },
  {
    key: 'tests-services',
    scope: `Group 11 — backend/service-adjacent tests: every file under src/test/services/** (~57 files). Enumerate and state the count. The rest of src/test/ and e2e/ belong to another agent — exclude them.`,
    focus: `You are auditing TEST QUALITY and TEST-VS-CODE CONTRACT DRIFT. Look for: tests asserting against FABRICATED APIs — a Tauri command name, service export, or function signature that does not exist in the source under test (a real instance already exists in this repo: companionIntegration.test.js asserts get_companion_status / start_companion_server, which are not real registered commands) — so for every mocked module and every asserted command/function name, verify the real name exists in the corresponding source. Also: tests that can never fail (assertions on the mock itself, expect(true).toBe(true), assertions inside a callback that may never run with no guard that it ran, try/catch swallowing the assertion, awaiting nothing); over-mocking that removes all real coverage; missing await on async assertions; fake timers never advanced or never restored; missing cleanup causing cross-test pollution (global/localStorage state, vi.restoreAllMocks, vi.useRealTimers, module-level caches); assertions that encode a BUG as expected behavior; snapshots so loose they'd pass on broken output; skipped tests (it.skip/describe.skip/it.todo) with no explanation; mock factories missing a function the real module exports and the code under test calls.`,
  },
  {
    key: 'tests-ui-e2e',
    scope: `Group 12 — UI/integration/E2E tests and build config. Every file under src/test/** EXCEPT src/test/services/** (another agent owns that subdirectory) — that is roughly 200 files, so enumerate and state the count. Plus every file under e2e/** (incl. smoke.spec.js, voice.spec.js, visual.spec.js, multiagent.spec.js and any snapshot baselines). Plus these config files at the repo root: vitest.config.js, playwright.config.js, vite.config.js, tsconfig.json, tsconfig.node.json, eslint.config.js, postcss.config.js, tailwind.config.js, package.json, .npmrc, .nvmrc.`,
    focus: `Same test-quality lens as the service-test agent: fabricated APIs asserted (verify every asserted Tauri command / export name against real source), tests that can never fail, over-mocking that removes real coverage, missing await, fake timers never advanced or restored, cross-test pollution from missing cleanup, assertions encoding a bug as expected behavior, loose snapshots, unexplained skips, mock factories missing real exports. ADDITIONALLY for E2E: specs asserting on UI text/selectors that no longer exist in src/components (open the component and check) — the repo documents ~22 of 28 specs as failing on stale assertions, so verify which are actually stale and name them. ADDITIONALLY for config: coverage thresholds set so low they gate nothing, test include/exclude globs that silently skip whole directories, config that contradicts what package.json scripts or CI assume.`,
  },
];

const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['scopeKey', 'findings', 'perFileLedger', 'coverageStatement', 'fullyCovered'],
  properties: {
    scopeKey: { type: 'string' },
    fullyCovered: { type: 'boolean' },
    coverageStatement: { type: 'string', description: 'Plain statement of coverage; if partial, exactly what was not verified and why.' },
    perFileLedger: {
      type: 'array',
      description: 'One entry per file in scope.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'status'],
        properties: {
          file: { type: 'string' },
          status: { type: 'string', description: '"clean", "findings: <titles>", or "UNCERTAIN: <what>"' },
        },
      },
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'lines', 'title', 'severity', 'confidence', 'why', 'impact', 'howToVerify'],
        properties: {
          file: { type: 'string' },
          lines: { type: 'string' },
          title: { type: 'string' },
          severity: { type: 'string', enum: ['Critical', 'High', 'Medium', 'Low'] },
          confidence: { type: 'string', enum: ['High', 'Medium', 'Low'] },
          why: { type: 'string' },
          impact: { type: 'string' },
          howToVerify: { type: 'string' },
          relatedFiles: { type: 'string' },
          uncertain: { type: 'boolean', description: 'true if this is a labelled suspicion rather than a verified defect' },
        },
      },
    },
  },
};

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['refuted', 'reasoning', 'correctedSeverity'],
  properties: {
    refuted: { type: 'boolean', description: 'true if the finding is NOT a real bug as described' },
    reasoning: { type: 'string' },
    correctedSeverity: { type: 'string', enum: ['Critical', 'High', 'Medium', 'Low', 'NotABug'] },
    evidence: { type: 'string', description: 'Specific lines/quotes that support the verdict' },
  },
};

phase('Read');

const results = await pipeline(
  SCOPES,
  (s) =>
    agent(
      `${COMMON}\n\nYOUR EXACT SCOPE:\n${s.scope}\n\nWHAT TO LOOK FOR (in addition to the general classes above):\n${s.focus}\n${REPORT_FORMAT}\n\nSet scopeKey to "${s.key}". Be precise: precision matters more than volume, but do not omit real issues.`,
      { label: `read:${s.key}`, phase: 'Read', schema: FINDINGS_SCHEMA }
    ),
  // As soon as a scope finishes, adversarially verify its Critical/High findings.
  (report, s) => {
    if (!report || !Array.isArray(report.findings)) return { report, verdicts: [] };
    const toVerify = report.findings.filter(
      (f) => f && (f.severity === 'Critical' || f.severity === 'High')
    );
    if (!toVerify.length) return { report, verdicts: [] };
    return parallel(
      toVerify.map((f) => () =>
        agent(
          `You are an adversarial verifier for a bug audit of ${REPO}. Your job is to REFUTE the following claimed finding by reading the actual current source. Default to refuted:true if you cannot confirm it from the real code.\n\nCLAIM\n  file: ${f.file}\n  lines: ${f.lines}\n  title: ${f.title}\n  claimed severity: ${f.severity}\n  claimed reasoning: ${f.why}\n  claimed impact: ${f.impact}\n\nOpen that file at those lines and read enough surrounding context (and any related file) to decide. Consider specifically: (a) does the code actually do what the claim says, at those lines, today? (b) is the dangerous path actually reachable, or is it guarded upstream? (c) is this intentional, documented design rather than a defect? (d) is the claimed severity justified, or inflated?\n\nDo NOT edit any file. Return a verdict: refuted true/false, your reasoning, the corrected severity (use "NotABug" if refuted), and the specific lines or quotes that support your verdict.`,
          { label: `verify:${f.title.slice(0, 40)}`, phase: 'Verify', schema: VERDICT_SCHEMA }
        ).then((v) => ({ finding: f, verdict: v, scopeKey: s.key }))
      )
    ).then((verdicts) => ({ report, verdicts: verdicts.filter(Boolean) }));
  }
);

const ok = results.filter(Boolean);

log(
  `Read phase done: ${ok.length}/${SCOPES.length} scopes returned. ` +
    `Total raw findings: ${ok.reduce((n, r) => n + (r.report?.findings?.length || 0), 0)}. ` +
    `High/Critical verified: ${ok.reduce((n, r) => n + r.verdicts.length, 0)}.`
);

const missing = SCOPES.map((s) => s.key).filter(
  (k) => !ok.some((r) => r.report?.scopeKey === k)
);
if (missing.length) log(`SCOPES THAT RETURNED NOTHING (not covered): ${missing.join(', ')}`);

return {
  scopeReports: ok.map((r) => r.report),
  highSeverityVerdicts: ok.flatMap((r) =>
    r.verdicts.map((v) => ({
      scopeKey: v.scopeKey,
      file: v.finding.file,
      lines: v.finding.lines,
      title: v.finding.title,
      claimedSeverity: v.finding.severity,
      why: v.finding.why,
      impact: v.finding.impact,
      howToVerify: v.finding.howToVerify,
      refuted: v.verdict?.refuted,
      correctedSeverity: v.verdict?.correctedSeverity,
      verifierReasoning: v.verdict?.reasoning,
      verifierEvidence: v.verdict?.evidence,
    }))
  ),
  scopesThatReturnedNothing: missing,
};
