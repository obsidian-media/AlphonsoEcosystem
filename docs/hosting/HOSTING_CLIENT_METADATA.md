# Hosting Alphonso's client metadata document

When Alphonso signs in to an outside MCP server (Settings → Connectors → Outside tools), it has to
say which app is asking. It does that with one small public file: its **client metadata
document**. The file's address *is* Alphonso's identity (its `client_id`), so it must stay at the
same address for as long as Alphonso is released. Moving it later makes every user sign in to
their servers again.

- The file: [`alphonso-oauth-client.json`](alphonso-oauth-client.json) (this folder).
- Its address: **`https://alphonsoecosystem.app/alphonso/oauth-client.json`**, chosen by the owner
  on 2026-10-30. The same address is `CLIENT_METADATA_URL` in `src-tauri/src/mcp_auth.rs`; a Rust
  test (`saved_document_matches_the_address`) fails if the two drift apart.
- The rules come from the IETF draft *OAuth Client ID Metadata Document*, revision 02 (6 July 2026):
  <https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document>.

The file holds no secret. Everything in it is meant to be public.

## What the rules require

1. **Served over https, with status 200**, at exactly that address. Any other status counts as an
   error.
2. **No redirect.** Servers do not follow redirects when they fetch it. `http://` to `https://`,
   adding or dropping `www.`, or a trailing slash would all break it.
3. **JSON.** `content-type: application/json`.
4. **`client_id` inside the file equals the address, character for character.** For example,
   `https://alphonsoecosystem.app:443/...` does not equal `https://alphonsoecosystem.app/...`.
5. **No secret.** No `client_secret`, and `token_endpoint_auth_method` is `none`. Alphonso is a
   desktop app and can't keep a secret, so it signs in with PKCE.
6. **Small.** Servers read about 5 KB at most. The file is well under that.

## Publishing it on the marketing site (Netlify)

The marketing site is the `AlphonsoWebiste` repo (Vite), published on Netlify. Vite copies
everything in `public/` into the build unchanged, and Netlify serves a file that exists before it
applies the site's `/* /index.html 200` fallback in `public/_redirects`.

1. Copy the file to `public/alphonso/oauth-client.json` in the site's repo, unchanged.
2. Leave `public/_redirects` alone. Its fallback does not apply to a file that exists.
3. Deploy the site the usual way (a push to the branch Netlify builds, or a deploy from the Netlify
   dashboard).

**Before the file exists, that address returns the home page with status 200** (the fallback).
A server would read HTML and refuse it, so the check below matters.

## Checking it

```bash
curl -sSI https://alphonsoecosystem.app/alphonso/oauth-client.json
```

Expect `HTTP/2 200`, `content-type: application/json`, and no `location:` header. Then:

```bash
curl -sS https://alphonsoecosystem.app/alphonso/oauth-client.json
```

Expect the JSON from this folder, with
`"client_id": "https://alphonsoecosystem.app/alphonso/oauth-client.json"`.

## If a server doesn't use it

Not every authorization server accepts a metadata document yet. Alphonso tries three things in
order:

1. this document, where the server says it supports one;
2. registering itself (Dynamic Client Registration) as a native app;
3. a client ID the user pastes in Settings.

Some servers may also refuse a `127.0.0.1` sign-in address listed in a document. Such a server
falls through to step 2 or 3.

## Changing the file

Change `alphonso-oauth-client.json` here first. Then copy it to the site and deploy, and run the
check again. Never change `client_id` without a plan for moving users to the new address.
