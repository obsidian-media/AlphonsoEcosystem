# Offline Mode — Current Capabilities & Gaps

## Current State Audit

Alphonso is a **local-first** application. The desktop app already has significant offline capability by design. This document verifies current offline behavior and identifies gaps.

---

## What Works Offline Today

### ✅ Fully Functional (No Changes Needed)

| Feature | How It Works | Verified? |
|---------|-------------|-----------|
| Ollama LLM | Runs 100% local — no internet needed for inference | ✅ |
| Agent execution | 9 agents run locally, all logic in-process | ✅ |
| Chat with local LLM | Full chat UI + streaming, no network required | ✅ |
| Boardroom/Workflow | Workflow engine runs entirely in-memory + SQLite | ✅ |
| Agent memory | SQLite-backed, local-only, no sync dependency | ✅ |
| KV store | Local SQLite, no cloud dependency | ✅ |
| File operations | Workspace file ops are local filesystem | ✅ |
| Plugin runtime | Local plugin execution, no network calls | ✅ |

### ⚠️ Partial (Works but Has Edge Cases)

| Feature | Current Behavior | Gap |
|---------|-----------------|-----|
| Connector calls | Fail-closed via policy gate if network unavailable | Need graceful "offline" user feedback instead of error |
| Agent contract | Local validation works offline | Permissions sync needed if cloud-based (not currently) |
| UI boot | Splash screen waits for Tauri readiness, no network needed | Might show brief spinner if host resolution fails |
| Local storage | IndexedDB/localStorage in-browser not used (SQLite via Tauri) | ✅ Actually fine — no browser dependency |

### ❌ Not Available Offline

| Feature | Why | Gap Severity |
|---------|-----|-------------|
| YouTube upload | Requires OAuth + HTTP upload | Low — clearly network feature |
| WhatsApp gateway | Requires Cloud API | Low — clearly network feature |
| Telegram bridge | Requires Bot API | Low — clearly network feature |
| Web search (Hector) | Requires HTTP to search APIs | Low — clearly network feature |
| External connector calls | Claude, ChatGPT, Notion, ClickUp, etc. | Medium — should show graceful "offline" state |
| Cloud sync | New feature — not yet implemented | Medium — planned |
| Updater | Requires download server | Low — clearly network feature |

---

## Graceful Offline UX — Current Gaps

### Gap 1: Connector Failure Messages
**Current**: When a connector call fails due to network, it throws an error with no special offline handling.

**Recommended fix** in `connectorRunner.js`:
```js
try {
  return await executeConnector(connectorId, params);
} catch (err) {
  if (err.message?.includes('ENOTFOUND') || err.message?.includes('ETIMEDOUT') || err.code === 'ERR_NETWORK') {
    return { status: 'offline', message: `${connectorId} requires network — try again when connected.` };
  }
  throw err;
}
```

### Gap 2: UI Status Indicator
**Current**: No "Offline" badge or connectivity indicator in the UI.

**Recommended**: Add `useConnectivity` hook + status badge in sidebar header.

### Gap 3: Queued Commands
**Current**: Commands requiring network fail immediately if offline.

**Recommended**: Simple offline queue in `orchestrationQueueService.js`:
- When a connector command fails with network error, move to `pending_network` state
- `ConnectivityMonitor` picks up queued items when back online
- User sees "Waiting for network" status in task detail

---

## File Structure for Offline Improvements

```
src/
  hooks/
    useConnectivity.js         — navigator.onLine + periodic ping check
  services/
    connectivityMonitor.js     — Periodic "am I online?" checks, emit events
    offlineQueueService.js     — Queue commands that need network, retry on reconnect
  components/
    layout/
      ConnectivityBadge.jsx    — Small indicator in sidebar header
      OfflineBanner.jsx        — Top banner when offline
    tasks/
      OfflineTaskIndicator.jsx — Shows "Waiting for network" on queued tasks
```

### `useConnectivity.js`
```jsx
import { useState, useEffect } from 'react';
import { connectivityMonitor } from '../services/connectivityMonitor';

export function useConnectivity() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const sub = connectivityMonitor.onChange(setIsOnline);
    return () => sub.unsubscribe();
  }, []);

  return isOnline;
}
```

### `connectivityMonitor.js`
```js
// Strategy: navigator.onLine + periodic fetch to localhost/ollama
// Why fetch Ollama: it's local-only, so success means machine is "awake"
// Failure after retry = genuinely offline or Ollama stopped
export const connectivityMonitor = {
  _listeners: new Set(),
  _interval: null,
  _online: navigator.onLine,

  start() { /* check every 30s: fetch('http://localhost:11434/api/tags') */ },
  stop()  { clearInterval(this._interval); },

  onChange(cb) {
    this._listeners.add(cb);
    return { unsubscribe: () => this._listeners.delete(cb) };
  },
};
```

---

## Offline Gaps Summary

| # | Gap | Priority | Effort | Resolution |
|---|-----|----------|--------|------------|
| 1 | Connector failures show raw network errors instead of "offline" message | Medium | 1 day | Wrap connector calls in offline-aware error handling |
| 2 | No "Offline" indicator in UI | Low | 0.5 day | Add ConnectivityBadge component |
| 3 | No offline queue for network-dependent tasks | Medium | 2 days | offlineQueueService + retry logic |
| 4 | Hector search fails without graceful message | Low | 0.5 day | Add offline fallback text |
| 5 | External connectors (Claude, ChatGPT, etc.) show cryptic errors offline | Medium | 1 day | Connector gate returns `{ status: 'offline', reason: 'network' }` |

---

## Implementation Plan

### Sprint A: Connectivity Detection (Day 1)
- Create `connectivityMonitor.js`
- Create `useConnectivity.js`
- Add `ConnectivityBadge` to sidebar header

### Sprint B: Graceful Offline UX (Days 2-3)
- Add offline-aware error wrapping in `connectorRunner.js`
- Create `OfflineBanner.jsx` (shown when offline + user tries network task)
- Update Hector search with offline fallback

### Sprint C: Offline Queue (Days 4-6)
- Create `offlineQueueService.js` — SQLite-backed queue
- Wire into `orchestrationQueueService.js` — detect network errors, enqueue
- Wire into `connectivityMonitor` — on reconnect, drain queue
- UI: `OfflineTaskIndicator` showing queued items with retry status
