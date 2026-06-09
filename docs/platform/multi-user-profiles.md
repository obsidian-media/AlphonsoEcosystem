# Multi-User Profiles — User Switching

## Overview

Add multi-user profile support to Alphonso, allowing multiple people to use the same desktop installation with isolated conversations, agent permissions, and settings. Profiles are local-only (no cloud accounts).

---

## Architecture

```
┌────────────────────────────────────────┐
│            Profile Manager             │
│  (src/services/profileService.js)      │
├────────────────────────────────────────┤
│  Active Profile ─► current profile ID  │
│  Profile Store  ─► profiles table      │
│  Auth Gate      ─► PIN / password      │
└─────────┬──────────────────────────────┘
          │
    ┌─────┴─────┐
    │           │
    ▼           ▼
┌────────┐ ┌────────┐ ┌────────┐
│Profile │ │Profile │ │Profile │
│ Alice  │ │  Bob   │ │ Guest  │
│ PIN:123│ │PIN:456 │ │(no PIN)│
└───┬────┘ └───┬────┘ └───┬────┘
    │          │           │
    ▼          ▼           ▼
┌────────┐ ┌────────┐ ┌────────┐
│ Chat   │ │ Chat   │ │ Chat   │
│ Agent  │ │ Agent  │ │ Agent  │
│ Prefs  │ │ Prefs  │ │ Prefs  │
│ Memory │ │ Memory │ │ Memory │
│ KV     │ │ KV     │ │ KV     │
└────────┘ └────────┘ └────────┘
```

---

## File Structure

```
src/
  services/
    profileService.js          — CRUD for profiles, active profile state
    profileAuthService.js      — PIN creation/verification per profile
    permissionService.js       — Per-profile agent permission overrides
  components/
    profile/
      ProfileSwitcher.jsx      — User avatar list, add/switch/delete
      ProfileCreateDialog.jsx  — Name, avatar, optional PIN
      ProfileLockScreen.jsx    — PIN entry for locked profiles
      ProfileSettings.jsx      — Per-user preferences panel
  lib/
    profileStorage.js          — SQLite-backed profile persistence
  context/
    ProfileContext.jsx         — React context for active profile
  hooks/
    useProfile.js              — Access profile state + actions
    useProfileGuard.js         — Require auth for protected actions

src-tauri/src/
  profile_commands.rs          — Tauri commands for profile CRUD
  profile_store.rs             — SQLite schema + queries
```

---

## Data Model

### SQLite Schema (`profiles` table)
```sql
CREATE TABLE profiles (
    id          TEXT PRIMARY KEY,         -- UUID
    name        TEXT NOT NULL,
    avatar      TEXT,                     -- 'alphonso' | 'miya' | 'hector' | etc.
    pin_hash    TEXT,                     -- bcrypt hash; NULL = no PIN
    is_default  INTEGER DEFAULT 0,
    created_at  TEXT NOT NULL,
    last_used   TEXT,
    preferences TEXT DEFAULT '{}',        -- JSON: theme, font size, etc.
    permissions TEXT DEFAULT '{}'         -- JSON: per-agent allowed/blocked overrides
);

CREATE TABLE profile_sessions (
    id          TEXT PRIMARY KEY,
    profile_id  TEXT NOT NULL REFERENCES profiles(id),
    started_at  TEXT NOT NULL,
    ended_at    TEXT,
    active      INTEGER DEFAULT 1
);
```

### Isolated Data Per Profile
| Data | Isolation Strategy |
|------|--------------------|
| Chat history | `chats.profile_id` column |
| Agent memory | `agent_memory.profile_id` column |
| KV store | `kv_store.profile_id` column |
| User preferences | `profiles.preferences` JSON column |
| Agent permissions | `profiles.permissions` JSON column |
| Workflow state | `workflows.profile_id` column |

---

## Implementation Phases

### Phase 1: Storage Layer (Days 1-2)
- Create `profile_store.rs` with SQLite migrations
- Add `profile_id` columns to existing tables (nullable, backfill with 'default')
- Create `profileService.js` — CRUD operations
- Profile data is isolated by `profile_id` foreign key in all queries

### Phase 2: Auth & Switching UI (Days 3-4)
- `ProfileSwitcher` — dropdown/modal in sidebar header
- Quick-switch on click (no PIN for unlocked profiles)
- PIN prompt for locked profiles before switch
- Guest profile (no PIN, auto-login)

### Phase 3: Agent Permission Overrides (Days 5-6)
- Extend `agentContractService.js` to check per-profile overrides
- Profiles can block or allow specific agents or action types
- Example: Bob's profile blocks Miya's "post to social" actions
- Display locked agents in UI with lock icon

### Phase 4: Session Tracking (Day 7)
- `profile_sessions` table tracks login/logout events
- Display "last used" in profile switcher
- Optional: timeout auto-lock after X minutes of inactivity

---

## Security

- PIN hashed with bcrypt (cost factor 10), never stored in plaintext
- PIN lock screen appears after timeout or manual lock
- Rate-limit PIN attempts: 5 attempts then 60s lockout
- Guest profile cannot be deleted (always available as fallback)
- Deleting a profile: confirm with PIN, cascade-delete all associated data

---

## UX Flow

1. **First launch** — Default "Local" profile created automatically
2. **Add profile** — Settings → Profiles → "Add User" → name + optional PIN
3. **Switch** — Click avatar in sidebar → select profile → enter PIN if locked
4. **Lock** — Click lock icon or timeout auto-lock
5. **Guest** — Quick access without auth, read-only agent memory (ephemeral)
6. **Delete** — Settings → Profiles → Delete → confirm PIN → data removed

---

## Testing

```bash
# Unit tests
npm run test -- --grep "profile"
# Rust tests
cargo test profile
```

Test cases:
- Profile CRUD (create, read, update, delete)
- PIN create + verify + wrong PIN rejection + rate-limit
- Profile data isolation (chats, memory, KV)
- Session tracking start/end
- Guest profile restrictions
- Profile switching during active chat (should preserve both histories)
