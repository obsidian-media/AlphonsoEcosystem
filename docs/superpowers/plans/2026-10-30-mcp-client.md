# Outside tools through MCP: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alphonso's agents use tools from online MCP servers the user adds, with reading tools free to use and every outside change a Marcus step that asks first with the exact call.

**Architecture:** A backend MCP client (`mcp_client.rs`, `mcp_auth.rs`) does every network call, sign-in and secret; the app keeps the list of servers and each tool's mark (`src/services/mcp/`), exposes reading tools as one skill tool, and runs outside changes as a Marcus task type prepared before its approval, like his sends.

**Tech Stack:** Rust (reqwest, tokio, keyring, sha2/base64 already used by `oauth_signin.rs`), TypeScript services, React (Settings), Vitest, WebdriverIO desktop E2E.

**Spec:** `docs/superpowers/specs/2026-10-30-mcp-client-design.md`

## Global Constraints

- Calling out only; nothing listens for MCP requests. `mcp-server/` is archived, not deleted.
- Online servers only (Streamable HTTP, and `sse` remotes); no local packages or programs started.
- No server, tool or model list written in the code. The only fixed addresses: the MCP Registry API (`https://registry.modelcontextprotocol.io/v0/servers`) and Alphonso's own client metadata document (one constant, `CLIENT_METADATA_URL`).
- Every MCP request from the backend: `https` only, private and local addresses refused, every redirect checked, answers capped at 2 MB, calls cut off after 60 s.
- Secrets (keys, tokens, refresh tokens) only in the OS keychain, read by the backend by server id; never in the window's storage, an error, a log, an export or a backup.
- Protocol: try 2026-07-28 first (`MCP-Protocol-Version: 2026-07-28`, `Mcp-Method`, `Mcp-Name` headers, `_meta["io.modelcontextprotocol/clientInfo"]`); fall back to 2025-11-25 (`initialize`, `notifications/initialized`, `Mcp-Session-Id`). Remember the version per server.
- Sign-in: PKCE always, `state` checked, `iss` checked against the authorization server before the code is redeemed (RFC 9207); a client id never reused across authorization servers. Callback on `127.0.0.1:8088` (add to CLAUDE.md's port map), open 5 minutes.
- Client identity order: Client ID Metadata Document → Dynamic Client Registration (`application_type: "native"`) → a pasted client id.
- A tool asks first until the user marks it "Reading only"; the server's `readOnlyHint`/`destructiveHint` are shown as suggestions only. A tool marked (or hinted) destructive carries `delete`.
- Every outside change is Marcus's step (`distribution_outside_tool`, `publish_or_send`, plus `delete` / `spend` as marked); it runs once, no retries, no larger model.
- A server not marked Free counts as Paid: blocked under Zero-Cost Mode, `spend` on every call, `canSpend()` checked; cost "not known" unless the user gave a price per call.
- Tool results are fenced (`fenced()` in `sentinel/fence.ts`) with keys hidden (`redactText()`), cut to `STEP_INPUT_LIMITS`.
- Plain words on screens: "Outside tools", "Sign in", "Asks first", "Reading only", "Deletes". Never "JSON-RPC" or "MCP client" in the UI (the section title may say "(MCP)").
- Composio and CALL-E behave exactly as before.

## Review Focus

1. A server that answers through a redirect to a private or local address mid-call: refused with "The server sent Alphonso to a private address; nothing was read." (Task 2 test `refuses_redirect_to_private_address`).
2. A sign-in token that ran out between planning and running: refreshed once and the call retried; a refused refresh makes the step `setup_required` with "Sign in to <server> again in Settings → Connectors." (Task 3 test `refused_refresh_asks_to_sign_in_again`, Task 6 test `expired sign-in waits with Carry on`).
3. Two servers offering a tool with the same name: tools are addressed as `<serverId>/<tool>` everywhere (marks, skill args, plan payloads) (Task 5 test `same tool name on two servers stays apart`).
4. A server with hundreds of tools: at most 200 tools kept per server (with a note in Settings), and the planner line per server lists at most 8 tool names then "and N more" (Task 5 tests).
5. A Streamable HTTP answer that streams notifications before the result: the result is the message whose `id` matches the request; other messages are ignored (Task 2 test `picks_the_answer_matching_the_request_id`).

---

### Task 1: Archive the old call-in server

**Files:**
- Move: `mcp-server/` → `archive/MIGHTBEUSEDLATER/mcp-server/` (without `node_modules`)
- Modify: `archive/MIGHTBEUSEDLATER/MIGHTBEUSEDLATER.md`, `CLAUDE.md` (the "MCP server" row, the port map's "MCP server 3333", the project structure line), any reference found by `grep -rn "mcp-server" --include=*.{json,yml,mjs,md,ts,js} . --exclude-dir=node_modules --exclude-dir=archive`

**Interfaces:** Produces nothing used later.

- [ ] **Step 1:** `git mv mcp-server archive/MIGHTBEUSEDLATER/mcp-server` (delete its untracked `node_modules` first).
- [ ] **Step 2:** Add a MIGHTBEUSEDLATER.md entry: what it was (a stand-in letting outside apps call in on port 3333, no real MCP), why retired (owner, 2026-10-30: calling in is a security risk; Alphonso calls out instead), what to check before reviving it (R14).
- [ ] **Step 3:** Fix every reference the grep finds (CI, scripts, docs). CLAUDE.md's "MCP server" row becomes a pointer to the archive; remove 3333 from the port map.
- [ ] **Step 4:** Run `node scripts/verify-doc-counts.mjs`, `npm run -s verify:dnd-coverage`, `npm run lint`. Expected: all pass.
- [ ] **Step 5:** Commit `chore(mcp): archive the old call-in server`.

### Task 2: The backend MCP connection

**Files:**
- Create: `src-tauri/src/mcp_client.rs`
- Modify: `src-tauri/src/lib.rs` (module + commands), `src-tauri/src/search.rs` (none: reuse `is_private_host`, `fetch_with_ssrf_guard` pattern)
- Test: unit tests inside `mcp_client.rs`

**Interfaces:**
- Consumes: `crate::search::is_private_host(host) -> bool`; keychain via `keyring::Entry` with the same service name as `os_keychain_store.rs` (make its `service_name()` / `open_entry()` `pub(crate)`).
- Produces (Tauri commands, camelCase args):
  - `mcp_list_tools(serverId: String, url: String) -> McpToolsResult { ok, tools: Vec<McpTool>, version: String, reason: Option<String>, needsSignIn: bool }` where `McpTool { name, title, description, inputSchema: serde_json::Value, readOnlyHint: Option<bool>, destructiveHint: Option<bool> }` (at most 200; `truncated: bool`).
  - `mcp_call_tool(serverId, url, tool, arguments: serde_json::Value) -> McpCallResult { ok, text: String, isError: bool, reason: Option<String>, needsSignIn: bool }` (`text` = `structuredContent` as JSON, else the text contents joined, cut to 200,000 characters).
  - `mcp_save_header(serverId, name, value) -> Result<(), String>` (a key or header the server needs; stored as keychain account `mcp:<serverId>:header:<name>`), `mcp_forget_server(serverId)` (deletes every `mcp:<serverId>:*` entry it knows: headers listed in `mcp:<serverId>:headers`, tokens).
  - `mcp_registry_search(text: String) -> Vec<RegistryServer { name, title, description, websiteUrl, remotes: Vec<{ type, url, headers: Vec<{ name, description, isSecret, isRequired }> }> }>` (only `isLatest`, only remotes of type `streamable-http` or `sse`, at most 30).
- Keychain accounts used by Task 3: `mcp:<serverId>:token`, `mcp:<serverId>:refresh`, `mcp:<serverId>:client` (JSON: issuer, client id, how obtained).

- [ ] **Step 1: Write the failing tests** (a hand-rolled `TcpListener` server, as `search.rs`'s SSRF tests do; tests call an inner function that takes an `allow_local: bool`):
  - `refuses_http_and_private_addresses` — `http://example.com` and `https://127.0.0.1/mcp` → `Err` containing "private" / "https".
  - `refuses_redirect_to_private_address` — 302 to `http://169.254.169.254/` → reason "The server sent Alphonso to a private address; nothing was read."
  - `speaks_2026_first` — server sees `MCP-Protocol-Version: 2026-07-28`, `Mcp-Method: tools/list`, no `initialize`; result parsed.
  - `falls_back_to_2025_handshake` — server answers 400 to the 2026 request; client sends `initialize` then `notifications/initialized`, then `tools/list` with the `Mcp-Session-Id` it got; version reported `2025-11-25`.
  - `picks_the_answer_matching_the_request_id` — an SSE answer with a notification then the result.
  - `caps_answers_at_2mb` — a 3 MB answer → reason "The server's answer was too large (over 2 MB)."
  - `secret_never_in_errors` — a 500 echoing the bearer token → reason does not contain the token.
  - `keeps_at_most_200_tools` — 250 tools → 200, `truncated: true`.
  - `registry_keeps_latest_online_servers_only` — parse a saved Registry answer: package-only and not-latest entries dropped.
- [ ] **Step 2:** `cargo test mcp_client` — fails (module missing).
- [ ] **Step 3:** Implement. Answers parsed from `application/json` or `text/event-stream`. A 401 with `WWW-Authenticate` → `needsSignIn: true` (Task 3 handles it). The version tried first is the remembered one (pass it in from the app; default 2026-07-28). `allow_local` is true only in tests and when `crate::utils::e2e_profile().is_some()` and `ALPHONSO_E2E_MCP_LOCAL=1` in a debug build. Apply `no_window` rules: no spawns here.
- [ ] **Step 4:** `cargo test mcp_client` (CI runs it; locally `cargo check`, `cargo clippy --all-targets -- -D warnings`, `cargo fmt --all -- --check`). Expected: pass/clean.
- [ ] **Step 5:** Commit `feat(mcp): backend connection to online MCP servers`.

### Task 3: Signing in to a server

**Files:**
- Create: `src-tauri/src/mcp_auth.rs`
- Modify: `src-tauri/src/oauth_signin.rs` (make `pkce_pair`, `wait_for_callback`, `page` reusable; add an `iss`-aware `parse_callback_with_issuer`), `src-tauri/src/lib.rs`, `src-tauri/src/mcp_client.rs` (attach the token; refresh once on 401)

**Interfaces:**
- Consumes: Task 2's keychain account names; `oauth_signin.rs` helpers.
- Produces:
  - `mcp_sign_in(serverId, url, pastedClientId: Option<String>) -> McpSignInResult { ok, reason: Option<String>, clientKind: Option<"metadata"|"registered"|"pasted"> }` — discovery: the 401's `WWW-Authenticate` `resource_metadata`, else `<origin>/.well-known/oauth-protected-resource<path>`; its `authorization_servers[0]`'s metadata at `/.well-known/oauth-authorization-server` then `/.well-known/openid-configuration`.
  - `mcp_finish_pasted(address: String) -> McpSignInResult` (10 minutes, like `oauth_finish_pasted`).
  - `const CLIENT_METADATA_URL: &str` (the hosted document, Task 9) and `const CALLBACK_PORT: u16 = 8088`.

- [ ] **Step 1: Write the failing tests:**
  - `discovers_auth_server_from_www_authenticate` and `...from_well_known` (parse functions over saved answers).
  - `prefers_client_metadata_when_supported` — metadata with `client_id_metadata_document_supported: true` → client id = `CLIENT_METADATA_URL`; without it but with `registration_endpoint` → registration body has `application_type: "native"` and `redirect_uris: ["http://127.0.0.1:8088/callback"]`; with neither and no pasted id → reason "This server needs a client ID. Paste the one the service gave you."
  - `rejects_wrong_issuer` — callback `iss` differs from the authorization server's issuer → reason "The sign-in answer came from a different server; nothing was saved."
  - `missing_issuer_when_required` — server metadata says `authorization_response_iss_parameter_supported: true`, callback has no `iss` → refused.
  - `client_bound_to_issuer` — a saved client for issuer A is not used for issuer B.
  - `refused_refresh_asks_to_sign_in_again` — refresh 400 → `needsSignIn: true`, reason "Sign in to <server> again in Settings → Connectors."
  - `metadata_document_is_used_only_when_reachable` — if `CLIENT_METADATA_URL` doesn't answer with a document whose `client_id` equals the URL, the next way is used (checked once a day, result cached).
- [ ] **Step 2:** `cargo test mcp_auth` — fails.
- [ ] **Step 3:** Implement. Scopes: the protected resource's `scopes_supported` when given, else none. The `resource` parameter (RFC 8707) = the server address. Tokens to the keychain only.
- [ ] **Step 4:** Tests, clippy, fmt. Add 8088 to CLAUDE.md's port map ("MCP sign-in callback").
- [ ] **Step 5:** Commit `feat(mcp): sign in to MCP servers through the browser`.

### Task 4: Saved servers in the app

**Files:**
- Create: `src/services/mcp/mcpServers.ts`, `src/services/mcp/mcpConnection.ts`
- Test: `src/test/services/mcp/mcpServers.test.ts`, `src/test/services/mcp/mcpConnection.test.ts`

**Interfaces:**
- Produces:
  - `type ToolMark = 'ask' | 'reading_only' | 'deletes'`
  - `interface McpServer { id: string; name: string; url: string; version?: '2026-07-28' | '2025-11-25'; signIn: 'browser' | 'key' | 'none'; cost: 'free' | 'paid'; pricePerCallUsd?: number; enabled: boolean; tools: McpToolEntry[]; toolsAtMs?: number; truncated?: boolean; needsSignIn?: boolean }`
  - `interface McpToolEntry { name: string; title?: string; description?: string; inputSchema: Record<string, unknown>; hintReadOnly?: boolean; hintDestructive?: boolean; mark: ToolMark; off?: boolean }`
  - `listServers()`, `getServer(id)`, `addServer({ name, url, cost, pricePerCallUsd? }) -> McpServer` (id = slug of name, `-2`… when taken; `cost` defaults to `'paid'`), `updateServer(id, patch)`, `removeServer(id)` (also `mcp_forget_server`), `setToolMark(serverId, tool, mark)`, `setToolOff(serverId, tool, off)`. Storage key `alphonso_mcp_servers_v1` (`durableSet`), no secret fields.
  - `refreshTools(serverId) -> { ok, reason? }` (keeps existing marks for tools still listed; new tools start `ask`; caches for the server's `ttlMs`, else 10 minutes), `callTool(serverId, tool, args) -> { ok, text, reason?, needsSignIn? }`, `searchRegistry(text)`, `signIn(serverId, pastedClientId?)`, `saveServerHeader(serverId, name, value)` — thin wrappers over Task 2/3 commands; outside the desktop app they return `{ ok: false, reason: 'Outside tools work in the desktop app.' }`.

- [ ] **Step 1: Failing tests:** `addServer` defaults cost to paid and makes unique ids; `refreshTools` keeps a tool's mark across a refresh and starts new tools as `ask`; `removeServer` forgets keychain entries; nothing secret is stored (`isSecretStorageKey` / `stripSecretFields` from `workspaceExportService.ts` leave the stored value unchanged); `searchRegistry` passes text to `mcp_registry_search`.
- [ ] **Step 2:** `npx vitest run src/test/services/mcp` — fails.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests pass; `npx tsc --noEmit`.
- [ ] **Step 5:** Commit `feat(mcp): saved servers and tool marks`.

### Task 5: Reading tools, effects, planning

**Files:**
- Create: `src/services/mcp/mcpTools.ts`
- Modify: `src/services/skills/skillTools.ts` (`outside_read`), `src/services/skills/skillToolRun.ts` (its case), `src/services/jose/joseEffects.ts` (`ACTION_EFFECTS.distribution_outside_tool = ['publish_or_send']`), `src/services/jose/taskTypeMeanings.ts`, `src/services/jose/agentPermissionTable.ts` (Marcus effects gain `'delete'`), `src/services/jose/josePlanner.ts` (planning menu gets `outsideToolsLines()`)
- Test: `src/test/services/mcp/mcpTools.test.ts`, existing `agentOwnership.test.ts`, `taskTypeMeanings` test

**Interfaces:**
- Consumes: Task 4's `listServers`, `callTool`.
- Produces:
  - `toolRef(serverId, tool) = \`${serverId}/${tool}\``, `parseToolRef(ref) -> { serverId, tool } | null`
  - `isReadingTool(server, entry) -> boolean` (true only for `mark === 'reading_only'` and not `off`)
  - `effectsForCall(server, entry) -> JoseEffect[]` (reading: `['read']`, plus `'spend'` when Paid; action: `['publish_or_send']` + `'delete'` when `mark === 'deletes'` or `hintDestructive` + `'spend'` when Paid)
  - `serverAllowed(server) -> { ok: true } | { ok: false, reason }` (`enabled`; Paid under Zero-Cost Mode → "<name> is a paid server and Zero-Cost Mode is on."; Paid and `canSpend()` false → the cap's reason; `needsSignIn` → the sign-in line)
  - `outsideToolsLines() -> string[]` — one line per enabled server: "<name>: reads <tool, …>; changes (Marcus, asks first) <tool, …>", at most 8 names per part then "and N more"
  - Skill tool `outside_read` (`effects: ['read']`, agents: all workers): args `{ tool: '<serverId>/<name>', args }`; refuses a tool that isn't reading-only with "<tool> changes something, so it is Marcus's step."; a Paid server's reading tool is refused inside gathering with "Paid servers are used only as their own step." (it needs `spend`, which needs an approval); result fenced (`fenced('<server> <tool>', text)`) and `redactText()`ed.

- [ ] **Step 1: Failing tests:** `same tool name on two servers stays apart` (refs and marks); `a tool asks first until marked reading only` (a hint `readOnlyHint: true` alone → not reading); `destructive hint adds delete`; `paid server adds spend and is blocked under Zero-Cost Mode`; `outside_read refuses an action tool`; `outside_read fences the result and hides keys`; `planner lists at most 8 tools per part`; `agentOwnership` and task-type-meaning tests pass with the new type.
- [ ] **Step 2:** Run them — fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npx vitest run src/test/services/mcp src/test/services/jose src/test/services/skills`; `npx tsc --noEmit`.
- [ ] **Step 5:** Commit `feat(mcp): reading tools for agents, outside changes for Marcus`.

### Task 6: Marcus's outside-tool step

**Files:**
- Create: `src/services/marcus/outsideCall.ts`
- Modify: `src/services/marcus/prepareSend.ts` (`isMarcusSendStep` returns false for `distribution_outside_tool`), `src/services/joseExecutionEngineService.ts` (prepare before the approval, beside the `sendPreview` block), `src/services/marcusExecutionService.ts` (dispatch), `src/services/jose/joseRequestStore.ts` (`JoseRequestStep.outsideCall?`), `src/services/jose/joseTelegram.ts` (the waiting line uses the call line)
- Test: `src/test/services/marcus/outsideCall.test.ts`, an engine test beside the existing send-preview tests

**Interfaces:**
- Consumes: Task 4 `getServer`, `callTool`; Task 5 `parseToolRef`, `effectsForCall`, `serverAllowed`; `buildStepInput()`, `generateAgentLlmResponse('marcus', …)`.
- Produces:
  - `interface OutsideCallPreview { serverId: string; serverName: string; tool: string; arguments: Record<string, unknown>; effects: JoseEffect[]; costUsd?: number }`
  - `prepareOutsideCall(commandId, assignment, request) -> { ok: true, preview } | { ok: false, outcome: 'setup' | 'failed', reason }` — tool from `assignment.payload.tool` (a ref) or Marcus's model picking among the enabled servers' non-reading tools; arguments from `payload.arguments`, else Marcus's model filling them from the tool's `inputSchema` and the step input; checked against the schema's `required` and `type`s (one retry with the problems listed, then `failed` with them); not allowed (`serverAllowed`) → `setup` with its reason.
  - `describeOutsideCall(preview) -> string` — "<Server>: <tool title or name> (<key: value, …>)", values shortened to 60 characters, "(cost not known)" for a Paid server without a price, "(about $X.XX)" with one.
  - `runOutsideCall(commandId, stepId, preview) -> { ok, text, reason? }` — runs once (`ranAtMs` saved on the request step before the call; a second run → "Already done."); `needsSignIn` → `setup_required` with the sign-in line; a tool `isError` result → failed with the server's text (fenced, keys hidden).
- The step's assignment `effects` are set from `preview.effects` before the approval gate, so the approval asks for exactly those.

- [ ] **Step 1: Failing tests:** `fills arguments from the schema and checks required fields`; `a missing required field goes back once then fails with the field named`; `the approval line shows the exact call`; `paid server without a price says cost not known`; `runs once` (second call → "Already done."); `expired sign-in waits with Carry on` (`setup_required`); `a send built from an outside read gets Sentinel's check first` (a plan with an `outside_read` step feeding a Marcus send has `sentinel-send-<step>` after `addSecurityChecks()`); engine: `an outside-tool step waits for approval with outsideCall saved and never retries`.
- [ ] **Step 2:** Run — fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npx vitest run src/test/services/marcus src/test/joseExecutionEngineService.test.js src/test/services/jose`; `npx tsc --noEmit`.
- [ ] **Step 5:** Commit `feat(mcp): Marcus runs outside changes after one approval`.

### Task 7: Settings → Outside tools (MCP)

**Files:**
- Create: `src/components/OutsideToolsSection.tsx`
- Modify: `src/components/ConnectorSetupPanel.tsx` (a `CollapsibleCategory id="outside_tools" label="Outside tools (MCP)"`), `src/services/connectors/connectorRegistry.js` (`outside_tools` entry, not in `PAID_OR_METERED_CONNECTORS`: cost is per server), `src/services/connectorHealthCheckService.ts` (live check per enabled server: `refreshTools`)
- Test: `src/test/components/OutsideToolsSection.test.tsx`

**Interfaces:** Consumes Task 4 and Task 5.

- [ ] **Step 1: Failing tests:** Add by address (name + address + Free/Paid, Paid preselected) saves a server; Search lists Registry results and Add fills the address and asks for any required header (secret ones as password fields, saved through `saveServerHeader`); a server needing sign-in shows "Sign in" and, when the server needs one, a "Client ID" box; each tool shows its mark select (Asks first / Reading only / Deletes) with "The server says: reads only" / "may delete" beside it; Remove asks first and forgets the server; Refresh shows "200 tools kept of N" when truncated.
- [ ] **Step 2:** Run — fail.
- [ ] **Step 3:** Implement with the `ui/` primitives; `data-testid`s: `mcp-add`, `mcp-search`, `mcp-server-<id>`, `mcp-signin-<id>`, `mcp-tool-<id>-<tool>`, `mcp-remove-<id>`.
- [ ] **Step 4:** Tests; `npx tsc --noEmit`; `npx eslint` on the touched files.
- [ ] **Step 5:** Commit `feat(mcp): Settings section for outside tools`.

### Task 8: Desktop end-to-end check with a stand-in server

**Files:**
- Create: `e2e-desktop/specs/mcp.e2e.mjs`, `e2e-desktop/fixtures/mcpStandIn.mjs` (a tiny MCP server on a free local port answering the 2026-07-28 protocol, two tools: `list_products` (readOnlyHint) and `update_price`, recording calls)
- Modify: `e2e-desktop/wdio.conf.mjs` (set `ALPHONSO_E2E_MCP_LOCAL=1` for this spec only)

- [ ] **Step 1:** Write the spec: add the stand-in in Settings as Free; mark `list_products` Reading only; a request "how many products are there?" reads without asking (the stand-in recorded one `list_products` call); "set the price of the blue mug to 18" waits on the board with the line naming `update_price` and `price: 18`, runs once after approval (one `update_price` call recorded); switching the server to Paid with Zero-Cost Mode on makes a new change step say it is blocked.
- [ ] **Step 2:** Build the debug app (`npm run tauri build -- --debug --no-bundle`) or use CI's `alphonso-debug-app-<sha>` artifact; run `npm run test:e2e:desktop -- --spec e2e-desktop/specs/mcp.e2e.mjs`. Expected: pass (model steps skip without a model, saying why).
- [ ] **Step 3:** Commit `test(mcp): desktop check with a stand-in server`.

### Task 9: Alphonso's client metadata document (hosted by the owner, with help)

**Files:**
- Create: `docs/hosting/alphonso-oauth-client.json`, `docs/hosting/HOSTING_CLIENT_METADATA.md`
- Modify: `src-tauri/src/mcp_auth.rs` (`CLIENT_METADATA_URL` = the address agreed with the owner)

- [ ] **Step 1:** Write the document: `client_id` (exactly its own address), `client_name: "Alphonso"`, `client_uri` (the owner's site), `redirect_uris: ["http://127.0.0.1:8088/callback"]`, `grant_types: ["authorization_code", "refresh_token"]`, `response_types: ["code"]`, `token_endpoint_auth_method: "none"`, `application_type: "native"`. Check the field list against the current CIMD draft before writing it (link it in the guide).
- [ ] **Step 2:** Ask the owner where obsidianmedia.online is hosted (the provider and how files are published), then write HOSTING_CLIENT_METADATA.md: where to put the file, that it must be served over HTTPS as `application/json` at exactly the `client_id` address with no redirects, and how to check it (`curl -sI` shows 200 and `content-type: application/json`; the body's `client_id` equals the address).
- [ ] **Step 3:** With the owner, publish it and run the check; then set `CLIENT_METADATA_URL` and the Task 3 test that reads a saved copy of it.
- [ ] **Step 4:** Commit `docs(mcp): Alphonso's client metadata document and how it is hosted`.

### Task 10: Live checks and documentation

**Files:**
- Modify: `e2e-desktop/specs/live-accounts.e2e.mjs`, `docs/ALPHONSO_GROUND_TRUTH.md` (new §11.58), `docs/CHANGELOG.md`, `docs/governance/DEFERRED_WORK.md` (phase 3 status; local servers as the next MCP step; Shopify store management needs a local or third-party server), `CLAUDE.md` (Do Not Duplicate rows for `src/services/mcp/`, `mcp_client.rs`, `mcp_auth.rs`, `OutsideToolsSection.tsx`, `marcus/outsideCall.ts`; connector count 36), `docs/DO_NOT_DUPLICATE.generated.md` (`npm run generate:dnd-map`), counts (`node scripts/verify-doc-counts.mjs`, the scratchpad `fix_counts.py`)

- [ ] **Step 1:** Live check (by hand, skipped without its settings): `ALPHONSO_LIVE_SHOPIFY_STORE` (the store's address; its `/api/mcp` is added as a Free server with no sign-in, a reading tool marked Reading only, a product question answered from it) and `ALPHONSO_LIVE_GITHUB_MCP_URL` + `ALPHONSO_LIVE_GITHUB_TOKEN_FILE` + `ALPHONSO_LIVE_GITHUB_REPO` (GitHub's official MCP server with the token as its header; one approved test issue created on the test repo). Count key traces in the log afterwards; report only the count.
- [ ] **Step 2:** Run it with the owner's store and token; record what passed.
- [ ] **Step 3:** Update the docs listed above; run `npm run -s generate:dnd-map`, `npm run -s verify:dnd-map`, `npm run -s verify:dnd-coverage`, `node scripts/verify-doc-counts.mjs`, `npm run lint`, `npx tsc --noEmit`, the related Vitest files.
- [ ] **Step 4:** Commit `docs(mcp): outside tools through MCP` and open the PR.
