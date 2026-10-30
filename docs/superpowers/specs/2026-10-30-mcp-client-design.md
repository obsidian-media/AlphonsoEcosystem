# Outside tools through MCP: design

Date: 2026-10-30. Phase 3 of the four phases after QA batch 1. Decided with the owner in chat on 2026-10-30.

## Why

The owner wants Alphonso's agents to use other services' tools, for example a Shopify store's, the way they already use connectors: "Alphonso should be able to call the Shopify MCP or a different MCP". MCP (Model Context Protocol) is the standard way services offer tools to AI apps, so one MCP client in Alphonso reaches every service that runs an MCP server, without a new connector for each.

The direction is **calling out only** (owner): Alphonso connects to MCP servers; nothing connects into Alphonso. The owner judged that letting outside apps call in would add too much risk, and dropped it. The old `mcp-server/` folder (a stand-in for calling in, port 3333, not in the installer, speaks no real MCP) is moved to `archive/MIGHTBEUSEDLATER/` with a note (owner approved, R14).

The app launches to the public, so everything here is built for users who are not developers: no terminal, nothing typed that the app could find itself, and nothing built in that names a particular server (owner rule: no hardcoding).

## Goals

- A user adds an online MCP server in Settings, signs in to it, and Alphonso's agents can use its tools in ordinary requests ("raise the price of the blue mug to $18", "how many orders came in this week?").
- Reading tools are used freely by any agent; anything that changes or sends something asks first, with the exact tool and what it will be sent.
- A paid server is held back by Zero-Cost Mode and counts toward the monthly cap.
- Works with servers on the current MCP version (2026-07-28) and the previous one (2025-11-25).

## Non-goals (this phase)

- Outside apps calling into Alphonso (dropped, see Why).
- Local MCP servers (programs Alphonso would start on the computer). They come in a later phase, since they mean running someone else's code; the owner chose online servers first.
- Replacing Composio. Composio stays exactly as it is, beside MCP (owner).
- MCP prompts, resources, sampling and elicitation. Tools only. A server asking the user something (2026-07-28's input-required answers) fails the call with a plain reason in this phase.

## Anti-goals (would make it a failure even if it works)

- A server's own label deciding that a tool is safe to run without asking.
- What a server sends back steering an agent (it is untrusted, like a web page).
- A key or sign-in token in a log, an error, an export or a backup.
- A server list or a model of "known servers" written into the app.
- A change happening that the user didn't see in the approval, word for word.

## Decided with the owner

1. **Adding a server.** Settings → Connectors gets an "Outside tools (MCP)" section. The user pastes the server's address, or searches the official MCP Registry live and picks one. The Registry's API is `GET https://registry.modelcontextprotocol.io/v0/servers?search=<text>`; each result has `server.name`, `title`, `description`, `remotes[]` (`type` `streamable-http` or `sse`, `url`, `headers[]` with `isSecret`/`isRequired`) and `_meta["io.modelcontextprotocol.registry/official"].isLatest`. Only the latest version of each server is shown, and only results with a `streamable-http` (or `sse`) remote, since local packages are a later phase.
2. **Sign-in.** Through the browser when the server supports MCP's standard sign-in (OAuth), otherwise a pasted key or header (the Registry lists which headers a server needs). Both are kept in the OS keychain, like every connector.
3. **Free or paid.** When adding a server the user marks it Free or Paid. Not marked counts as Paid. A paid server is blocked while Zero-Cost Mode is on, and every call to it asks first (the `spend` effect), with the monthly cap applying.
4. **Who uses the tools.** Any agent may use a server's reading tools. Every tool that changes or sends something outside the computer is Marcus's (owner: he already owns every action outside the computer, so the one-owner rule stays as it is; Alphonso keeps changes on this computer). It asks first.
5. **Asking first.** Every tool asks first until the user marks it "reading only" in Settings. The server's own label (`readOnlyHint`, `destructiveHint`) is shown as a suggestion, never trusted on its own. A tool the server calls destructive, or one the user marks "deletes", carries the `delete` effect (always asks).
6. **What the approval shows.** The exact server, tool and arguments in plain words, for example "Shopify: update product 'Blue mug', price $18" (owner accepted).
7. **What comes back is untrusted.** A tool's result is fenced as untrusted page text (`fence.ts`), like Hector's pages: it cannot give agents orders, keys in it are hidden by `redactText()`, and Sentinel checks it before anything built from it is sent onward (owner accepted).
8. **Planning.** Jose's planner gets one line per connected server ("Shopify: products, orders, customers"), and each agent sees the tools it may use through its skills. A request that needs a server's tool is planned as a step for the right agent.
9. **Composio stays** as it is, beside MCP.
10. **Order.** This phase: online servers. Later: local servers.

## How it works (the builder's starting point)

### The connection: in the backend

Every MCP request goes through a new backend module (`src-tauri/src/mcp_client.rs`), never `fetch` from the window: the window's CSP allows only listed addresses, and a user-added address can't be listed ahead. The backend:
- accepts `https` addresses only, refuses private and local addresses (reuse `is_private_host`), and checks every redirect (`fetch_with_ssrf_guard()` in `search.rs`);
- caps a response (2 MB, like research pages) and a call's time (60 s by default);
- takes the server's saved key or token from the keychain itself, by server id, so the window never handles it, and never puts it in an error;
- speaks JSON-RPC over Streamable HTTP, with an `sse` remote handled as a stream of the same messages.

**Two versions.** First try 2026-07-28: no handshake, `MCP-Protocol-Version: 2026-07-28`, `Mcp-Method`, `Mcp-Name` headers, the client's identity and capabilities in each request's `_meta` (`io.modelcontextprotocol/clientInfo`), optional `server/discover`. If the server refuses that (an unknown method, or a 400 naming the version), fall back to 2025-11-25: `initialize`, `notifications/initialized`, then the `Mcp-Session-Id` header on later calls. Remember per server which version worked. The existing CALL-E client (`calleMcpConnector.ts`) already does the 2025-11-25 handshake and unwraps a tool result (`structuredContent`, else the first `text` content parsed as JSON, else the text); reuse its unwrapping logic, and move CALL-E onto the shared client only if it costs nothing (otherwise leave CALL-E alone).

Calls: `tools/list` (cached for its `ttlMs` when given, else 10 minutes; Refresh in Settings), `tools/call`.

### Sign-in

MCP's standard sign-in: the server answers 401 with a `WWW-Authenticate` header pointing at its protected-resource metadata; that names the authorization server; its metadata gives the endpoints. PKCE always, `state` checked, and the `iss` in the answer checked against the authorization server before the code is redeemed (RFC 9207, required by 2026-07-28). A client id is bound to the authorization server that issued it and never reused for another. The browser and callback reuse the pattern of `oauth_signin.rs` (a `127.0.0.1` callback open for 5 minutes, the pasted-address fallback, `finish pasted`) on a port free in the port map (8088 if free; check the map in CLAUDE.md). Tokens and refresh tokens go to the keychain; a refresh happens before a call when the token has run out; a refused refresh marks the server "Sign in again".

How Alphonso identifies itself (owner): a Client ID Metadata Document, a small JSON file on the owner's website (for example `https://obsidianmedia.online/alphonso/oauth-client.json`, the exact address in one setting, not scattered), used as the `client_id` where the authorization server supports it; else Dynamic Client Registration with `application_type: native` so `127.0.0.1` callbacks are accepted; else a client id the user pastes for that server. The owner hosts the file; until it is up, the first choice is skipped and the app says nothing about it.

### Saved servers

`src/services/mcp/` (new folder). A saved server: id (from the name, unique), name, address, version that worked, sign-in kind (browser / key / none), Free or Paid, on/off, and per tool: the user's mark (`ask` (default) / `reading only` / `deletes`), the server's hints shown beside it, and whether the user switched the tool off. Stored with the app's other settings (no secrets in it; secrets only in the keychain). `workspaceExportService.ts`'s filter must keep secret fields out (the store holds none, but check).

### Approvals and agents

- A tool marked reading only has the `read` effect. Any agent may use it as a skill tool during its step, through the skill gathering that already runs tools (`skillGather.ts`), like `composio_read`.
- Any other tool is an action. It never runs inside another step's gathering (like `ACTION_TOOLS` today). It runs only as its own step, owned by one agent, prepared before its approval with the exact arguments (like Marcus's `sendPreview`), and it runs once, with no retries or larger model, like every `publish_or_send` step.
- It is a Marcus step with `publish_or_send`, plus `delete` when marked deletes, plus `spend` when the server is Paid. `LOCKED_EFFECTS` then make it always ask. One new task type, for example `distribution_outside_tool`, with `payload: { serverId, tool, arguments }`; Marcus's model fills the arguments from the tool's input schema and the step's input, checked against that schema before the approval (a missing required field or a wrong type goes back once, then fails with the reason).
- New task types go in `ACTION_EFFECTS`, `TASK_TYPE_MEANINGS` and the permission table, one owner each (`agentOwnership.test.ts` must pass).
- A Paid server is checked against Zero-Cost Mode and `canSpend()` before any call. MCP gives no price, so the cost estimate is unknown; the approval says "cost not known" and the user can enter a price per call when adding the server (optional; used for the cap when given).

### Results

Tool results go to the step's output as readable text, cut to the step-input limits (`STEP_INPUT_LIMITS`), fenced as untrusted, keys hidden. `addSecurityChecks()` adds a Sentinel check before a Marcus send whose work came from an outside tool, as it does for research.

### Screens

- Settings → Connectors → "Outside tools (MCP)": Add (paste an address, or Search the MCP Registry), each server's sign-in state, Free/Paid, on/off, Refresh tools, Remove (also forgets its tokens), and its tools with their marks and the server's hints as suggestions.
- The board and Telegram show an outside-tool step's exact call in the approval line.
- Plain words throughout ("Outside tools", "Sign in", "Asks first", "Reading only"), never "MCP JSON-RPC".

### Health check

`connectorHealthCheckService.ts` gets a live check per server: `tools/list` answered (`checked: 'live'`), or the plain reason (sign in again, server not answering, refused).

## Checks

- Unit tests for every part, Rust tests for the backend (SSRF refusals, both versions, sign-in checks including a wrong `iss`, no secret in an error).
- A fake MCP server for the desktop E2E suite (a local stand-in, like `marcus.e2e.mjs`'s n8n stand-in; the backend's private-address refusal needs a test-only allowance in debug builds under `ALPHONSO_E2E_PROFILE`, the same way other test-profile allowances work): add it, mark a tool reading only, a request that reads runs without asking, a request that changes waits with the exact arguments and runs once after approval, and a Paid server is refused under Zero-Cost Mode.
- Live checks by hand (`live-accounts.e2e.mjs`, owner): a Shopify store's own MCP endpoint for reading (`https://<store>.myshopify.com/api/mcp`, official, read-only, for shoppers; a free development store works) and GitHub's official MCP server for one approved change (a test issue on the owner's test repo). Store management in Shopify has no official MCP server today; the hosted ones are other companies', and community ones run locally (a later phase).

## Left to the builder

- File and function names; how the shared client is split between Rust and the app.
- The cache and time limits, within the numbers above.
- Whether CALL-E moves onto the shared client (only if it changes nothing for CALL-E).
- The exact wording on screens, in the app's plain style.

## Answered by the owner (2026-10-30)

- Outside changes: Marcus does them all.
- Live check: Shopify's per-store endpoint for reading, GitHub's official server for one change.
- App identity at sign-in: the owner's page, with automatic registration and a pasted client id as fallbacks.

## The builder's calls (check these)

- An unknown cost: MCP gives no price, so the approval says "cost not known"; an optional price per call, entered when adding the server, counts toward the cap.
- A server that asks the user something mid-call (2026-07-28's input-required answers) fails that call with a plain reason in this phase.
- Tool list cached for the server's `ttlMs`, else 10 minutes; calls cut off after 60 s; answers capped at 2 MB.
- The callback port: 8088 if free in the port map.
- The desktop E2E stand-in server reaches the backend only through a debug-build test allowance for local addresses.
