# Cloud Sync — Encrypted Cross-Device Sync

## Overview

Synchronize Alphonso state (chat history, agent memory, profiles, settings) across multiple desktop instances using end-to-end encrypted cloud storage. No plaintext data ever reaches the server.

---

## Architecture

```
┌─────────────────┐       ┌────────────────────┐       ┌─────────────────┐
│  Desktop A       │       │   Sync Server       │       │  Desktop B       │
│  (source)        │       │   (stateless)       │       │  (target)        │
│                  │       │                     │       │                  │
│  ┌──────────┐   │       │  ┌───────────────┐  │       │  ┌──────────┐   │
│  │ SQLite   │   │       │  │   Encrypted    │  │       │  │ SQLite   │   │
│  │ (local)  ├───┼───────┼─►│   Blob Store   │  │       │  │ (local)  │   │
│  └──────────┘   │       │  │   (S3/R2)      │  │       │  └──────────┘   │
│                  │       │  └───────────────┘  │       │                  │
│  ┌──────────┐   │       │  ┌───────────────┐  │       │  ┌──────────┐   │
│  │ Crypto   │   │       │  │   Metadata     │  │       │  │ Crypto   │   │
│  │ Engine   ├───┼───────┼─►│   (encrypted)  │  │       │  │ Engine   │   │
│  └──────────┘   │       │  └───────────────┘  │       │  └──────────┘   │
└─────────────────┘       └────────────────────┘       └─────────────────┘
```

### Principle: Zero-Knowledge
- All payloads encrypted client-side with AES-256-GCM
- Encryption key derived from user passphrase (PBKDF2, 600k iterations)
- Server stores only: encrypted blobs + opaque metadata
- Server has zero ability to read payload contents

---

## Data Model

### Sync Units (Chunks)
| Chunk Type | Size Limit | Sync Frequency | Encryption |
|------------|-----------|----------------|------------|
| Chat messages | 100 KB per batch | Real-time (debounced 5s) | Per-chunk key |
| Agent memory | 500 KB per export | On change + periodic (15 min) | Per-export key |
| Profiles | 50 KB | On profile change | Profile-derived key |
| Settings | 10 KB | On setting change | Settings-derived key |
| KV store delta | 200 KB | Periodic (5 min) | Per-delta key |

### Key Hierarchy
```
Master Key (from passphrase: PBKDF2)
├── Chat Key        (HKDF: "alphonso-sync-chat")
├── Memory Key      (HKDF: "alphonso-sync-memory")
├── Profile Key     (HKDF: "alphonso-sync-profiles")
├── Settings Key    (HKDF: "alphonso-sync-settings")
└── KV Key          (HKDF: "alphonso-sync-kv")
```

### Synced Entity
```json
{
  "id": "uuid-v4",
  "type": "chat_batch",
  "profile_id": "uuid",
  "encrypted_key": "base64...",       // wrapped per-chunk key
  "encrypted_data": "base64...",     // AES-256-GCM payload
  "nonce": "base64...",
  "version": 1,
  "timestamp": "2026-06-09T12:00:00Z",
  "depends_on": ["prev-chunk-uuid"],  // ordering chain
  "signature": "base64..."           // HMAC-SHA256 for integrity
}
```

---

## File Structure

```
src/
  services/
    syncService.js              — Orchestrator: schedule, push, pull, conflict resolution
    cryptoService.js            — Key derivation, encryption/decryption, signing
    syncTransportService.js     — HTTP client to sync server
  lib/
    syncStorage.js              — Local sync state tracking (last_sync cursors)
    syncConflictResolver.js     — LWW (last-writer-wins) + manual conflict UI

src-tauri/src/
  sync_commands.rs              — Tauri commands: push_chunk, pull_chunk, get_sync_status
  sync_crypto.rs                — Rust crypto (ring or aes-gcm crate)
  sync_store.rs                 — Local sync metadata in SQLite

server/
  sync-server/
    package.json                — Express + @aws-sdk/client-s3 (or sharp)
    index.js                    — API: POST /sync/push, GET /sync/pull, DELETE /sync
    middleware/
      auth.js                   — Bearer token (opaque, server-generated)
      ratelimit.js              — 100 req/min per device
      storage.js                — S3/R2-compatible blob store
```

---

## Dependencies

### Rust (Cargo.toml)
```toml
aes-gcm = "0.10"
pbkdf2 = "0.12"
hmac = "0.12"
sha2 = "0.10"
hkdf = "0.12"
rand = "0.8"
```

### Server
```json
{
  "dependencies": {
    "express": "^4.21.0",
    "@aws-sdk/client-s3": "^3.600.0",
    "uuid": "^10.0.0",
    "helmet": "^8.0.0"
  }
}
```

---

## Sync Protocol

### Push Flow
1. Client collects changed entities since last cursor
2. Encrypts each chunk with derived key + fresh nonce
3. Sends `POST /sync/push { device_id, chunks: [{ type, encrypted_key, encrypted_data, nonce, version, timestamp, depends_on, signature }] }`
4. Server stores blobs in S3/R2 at path `{device_id}/{type}/{chunk_id}`
5. Server returns `{ success: true, cursors: { [type]: timestamp } }`

### Pull Flow
1. Client sends `GET /sync/pull?since={cursors_json}&device_id=X`
2. Server returns list of chunks newer than cursor, excluding own device_id
3. Client decrypts each chunk with derived key
4. Client merges into local SQLite using LWW strategy
5. Client updates local cursor

### Conflict Resolution
- **Last-Writer-Wins (LWW)** by default: compare `timestamp` fields
- **Manual resolution UI** for profile conflicts (name/avatar changes)
- **Merge strategy for chat**: both messages preserved, deduplicated by message ID
- **KV store**: per-key LWW; deleted keys tracked via tombstone entries

---

## Implementation Phases

### Phase 1: Local Crypto Engine (Days 1-3)
- Implement `sync_crypto.rs` — PBKDF2 key derivation, AES-256-GCM encrypt/decrypt, HMAC signing
- Implement `cryptoService.js` — JS wrapper exposing same operations via Tauri invoke
- Implement key storage: master key never stored; derived keys cached in memory only
- Full test suite for encrypt → decrypt roundtrip, integrity check, bad key detection

### Phase 2: Sync State Tracking (Days 4-5)
- Local SQLite tables: `sync_cursors`, `sync_changelog`, `sync_conflicts`
- Change tracking: hooks on all write operations that record entity changes
- Changelog cleanup: purge entries older than 30 days

### Phase 3: Transport Layer (Days 6-8)
- Sync server: Express API with S3/R2 blob storage
- Device registration: first sync creates device_id + server auth token
- Push/pull endpoints with HMAC signature verification
- Rate limiting, CORS, CSP headers

### Phase 4: Orchestration & UI (Days 9-11)
- `syncService.js` — schedule push every 5s (debounced), pull every 30s
- Sync status indicator in UI: "Synced" / "Syncing..." / "Conflict" / "Error"
- Manual sync trigger button
- Conflict resolution dialog for profile/settings conflicts
- Pause/resume sync toggle

### Phase 5: Testing & Hardening (Days 12-14)
- Network interruption tests (drop, throttle, reconnect)
- Large dataset sync (10k+ messages) — measure and optimize chunk sizes
- Concurrent sync from 2 devices — verify LWW correctness
- Security audit: key handling, data leakage in server logs

---

## Security Considerations

| Concern | Mitigation |
|---------|-----------|
| Master passphrase brute force | PBKDF2 with 600k iterations; rate-limit sync auth to 5 attempts/min |
| Server data breach | Zero-knowledge: server has only encrypted blobs with no keys |
| Replay attack | Chunk timestamps + HMAC signature; server rejects chunks older than 5 min |
| Device theft | Remote revoke: revoke device token from trusted device |
| Key compromise | Re-key: export all data, re-encrypt with new passphrase, push |
| Man-in-the-middle | TLS required for all sync server communication |
