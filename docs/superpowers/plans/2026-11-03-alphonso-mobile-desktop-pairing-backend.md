# Desktop phone pairing through the backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pairing a phone works in the real desktop app: the QR shows, and the computer reaches the relay.

**Why (found 2026-11-03):** The owner clicked **Pair a phone** in a CI debug build, and nothing happened. Two causes:
- **Encryption.** The desktop window's CSP (`script-src 'self'`) blocks WebAssembly, so libsodium fails ("Compiling or instantiating WebAssembly module violates … Content Security Policy", reproduced in headless Chromium). The button swallowed the error.
- **The relay.** The window's `new WebSocket('wss://relay.alphonsoecosystem.app/link')` and its `DELETE /pair` fetch aren't in `connect-src`.

No desktop E2E test covered pairing. The owner chose (2026-11-03) to do the encryption and the relay connection in the Rust backend, leaving the window's CSP as it is.

**Architecture:**
- **Encryption** (`phone_box.rs`, the `crypto_box` crate): `crypto_box_easy`-compatible sealing with a 24-byte nonce in front, base64url without padding, plus `crypto_box_seal_open`.
- **The private key** stays in the OS keychain (the same slot as today). The window gets only the public key.
- **The relay socket** (`phone_relay.rs`, `tokio-tungstenite`): the backend opens the connection to the relay address fixed at build time (`VITE_PHONE_RELAY_URL`). The window sends and receives text frames through commands and events.
- **`phoneLink.ts`** keeps all its logic: the pairing check, routing, limits and backoff. It gets the encryption and the socket injected.
- **The phone app** is unchanged and keeps libsodium.

**Tech Stack:** Rust (Tauri 2, `crypto_box` =0.9.1 with `seal`, `tokio-tungstenite` =0.30.0 with rustls), TypeScript, Vitest, desktop E2E (wdio).

**Branch:** `feat/mobile-app` (PR #377), merged into `feat/mobile-phase4`.

## Global Constraints

- **Compatibility.** Byte-compatible with the phone's libsodium. Proven by fixed vectors that libsodium makes and Rust reproduces or opens.
- **Keys.**
  - The computer's private key never reaches the window, a log or an error.
  - Keychain slot `alphonso_phone_link_private_key`: a computer that already has keys keeps them.
- **The relay address.** It comes only from the build (`option_env!("VITE_PHONE_RELAY_URL")`): wss, or ws to this computer only. The window can't choose it. A build without one: phone access says it's not available, as today.
- **Dependencies.** Pinned exactly. No `--no-verify`. LF line endings. Docs go in the same commit.
- **Errors.** No silent failure: Pair a phone shows any error in plain words.

## Review Focus

1. A computer paired before this change keeps its key and its phones. Pinned in Task 1 (`an existing private key is reused`).
2. The relay drops, and the backend socket closes: `phoneLink`'s backoff reconnects as before. Pinned in Task 3 (`a close event reconnects with backoff`).
3. A second open while one is connected replaces it, never two sockets. Pinned in Task 2.
4. A frame that doesn't open (a wrong key, or changed) is null, never an exception that kills the link. Pinned in Task 1.
5. The relay address isn't set in a build: no socket is opened, and the reason is shown. Pinned in Task 2 and Task 3.

---

### Task 1: Encryption in the backend (`phone_box.rs`)

**Files:**
- Create: `src-tauri/src/phone_box.rs`, `scripts/phone-box-vectors.mjs`, `src-tauri/tests/fixtures/phone_box_vectors.json`.
- Modify: `src-tauri/Cargo.toml` (`crypto_box = { version = "=0.9.1", features = ["seal"] }`) and `src-tauri/src/lib.rs` (module and commands).

**Interfaces:**
- `phone_link_public_key() -> Result<String, String>`: loads the private key from the keychain slot, or makes a new one and saves it, then returns the base64url public key.
- `phone_seal(message: String, their_public: String) -> Result<String, String>`.
- `phone_open(sealed: String, their_public: String) -> Option<String>` (UTF-8).
- `phone_open_anonymous(sealed: String) -> Option<String>`.
- Pure helpers for tests: `seal_with_nonce(msg, nonce, their_pk, my_sk)` and `open_with(sealed, their_pk, my_sk)`.

- [ ] Vectors from libsodium (`node scripts/phone-box-vectors.mjs` writes the fixture):
  - Two key pairs, a nonce and a message, with the `crypto_box_easy` output (nonce in front, base64url).
  - A `crypto_box_seal` frame to key pair A.
- [ ] Failing Rust tests:
  - `seal_matches_libsodium` (`seal_with_nonce` equals the vector).
  - `opens_libsodium_frame`.
  - `opens_libsodium_sealed_box`.
  - `wrong_key_is_none`.
  - `short_or_bad_base64_is_none`.
  - `an_existing_private_key_is_reused` (the public key derived from a given private key).
  - `errors_never_carry_the_key`.
- [ ] Implement, register the commands, then `cargo check` and `cargo clippy -- -D warnings`. The Rust tests run in CI: Smart App Control blocks Rust test programs on this machine.

### Task 2: The relay connection in the backend (`phone_relay.rs`)

**Files:**
- Create: `src-tauri/src/phone_relay.rs`.
- Modify: `Cargo.toml` (`tokio-tungstenite = { version = "=0.30.0", default-features = false, features = ["connect", "rustls-tls-webpki-roots"] }`) and `lib.rs`.

**Interfaces:**
- `relay_url() -> Option<String>` (the build's address, checked by `relay_url_ok()`: wss, or ws to loopback only).
- Commands:
  - `phone_relay_open()`: closes any open socket first, then connects. Emits `phone://relay` `{ kind: 'open' }`, `{ kind: 'message', text }` and `{ kind: 'close' }`.
  - `phone_relay_send(text)`: refused when not open.
  - `phone_relay_close()`.
  - `phone_relay_unpair(device_id, id_token)`: `DELETE <https base>/pair/<id>`, with the token in the header and never in an error.

- [ ] Failing tests for `relay_url_ok`:
  - Accepts `wss://relay.example/link` and `ws://127.0.0.1:8080/link`.
  - Refuses `ws://example.com`, `http://…` and an empty address.
  - `http_base("wss://r.example/link")` is `"https://r.example"`.
  - An unset address: `phone_relay_open` returns `NO_RELAY`.
- [ ] Implement: one socket at a time, held in managed state; a reader task emits the messages. `cargo check` and clippy.

### Task 3: `phoneLink.ts` on the backend; Pair a phone shows errors

**Files:**
- Modify: `src/services/phone/phoneLink.ts`, `src/components/phone/PhonesSection.tsx`, `src/App.tsx` (the link start), and `src/services/phone/phoneProtocol.ts` (encode/decode take a `LinkBox`).
- Create: `src/services/phone/backendLink.ts`.
- Test: `src/test/services/phone/backendLink.test.ts`, plus `phoneLink.test.ts` and `PhonesSection.test.tsx`.

**Interfaces:**
- `LinkBox`: `{ publicKey(): Promise<string>; seal(text: string, theirPublic: string): Promise<string>; open(frame: string, theirPublic: string): Promise<string | null>; openAnonymous(frame: string): Promise<string | null> }`.
  - `backendBox` uses `invoke`.
  - `libsodiumBox(keys)` is for tests and the phone.
- `backendSocketFactory: SocketFactory` (`phone_relay_open` / `send` / `close` plus the `phone://relay` events).
- `startPhoneLink({ …, box })`.
- `removePhone(…)` goes through `phone_relay_unpair` in the desktop app.

- [ ] Failing tests:
  - The link pairs and answers a call with an injected fake box and socket (the existing tests moved to `box`).
  - `backendSocketFactory`: open, message, then close, which reconnects with backoff.
  - Pair a phone shows "Couldn't make the pairing code: <reason>" when `pairingQr` rejects.
  - `computerKeys()` never returns a private key.
- [ ] Implement, then run `npx vitest run src/test/services/phone src/test/components/phone`, lint and typecheck.

### Task 4: A desktop E2E check, docs

- [ ] `e2e-desktop/specs/phone-link.e2e.mjs` checks, in the real app:
  - `phone_link_public_key` gives the same key twice.
  - A frame sealed by the app with `phone_seal` opens with libsodium in Node.
  - A Node-sealed `crypto_box_seal` opens with `phone_open_anonymous`.
  - Settings → Runtime → Remote Access shows the Phones section, and no error appears.
- [ ] Update the CLAUDE.md row "Phone access on the computer" and the CHANGELOG, then run `verify-doc-counts` and the DND map. Push, and let CI run the Rust tests and desktop E2E.
- [ ] Merge into `feat/mobile-phase4`. Then give the owner the new CI debug build to pair with.
