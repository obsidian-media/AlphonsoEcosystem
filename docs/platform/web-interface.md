# Web Interface — Browser-Based Access

## Overview

Provide browser-based access to Alphonso for users who cannot or prefer not to use the Tauri desktop app. The web interface runs alongside the desktop server, exposing core chat, agent, and boardroom functionality via HTTP/WebSocket.

---

## Architecture

```
┌──────────────┐      HTTP/WS       ┌─────────────────┐
│   Browser    │◄──────────────────►│  Express Server  │
│  (React SPA) │                    │  (port 4173)     │
└──────────────┘                    └────────┬─────────┘
                                            │
                                    ┌───────┴────────┐
                                    │  Tauri Backend  │
                                    │  (IPC bridge)   │
                                    └────────────────┘
```

Two modes:

### Mode A: Tauri Dev Server (Development)
- Existing Vite dev server on port 5173
- Browser accesses `http://localhost:5173`
- Tauri backend NOT available — only UI components that don't need Tauri APIs

### Mode B: Standalone Web Server (Production)
- New Express/Fastify server in `server/` directory
- Proxies /api/* requests to Tauri backend via HTTP-over-IPC
- WebSocket server for real-time streaming (same as companion protocol)
- Serves built React SPA from `dist/`

---

## File Structure

```
server/
  index.js              — Express app entry, static file serving
  routes/
    api.js              — RESTful proxy to Tauri commands
    auth.js             — Session auth (local JWT, no cloud)
    ws.js               — WebSocket handler for token streaming
  middleware/
    session.js          — Session management, CSRF protection
    ratelimit.js        — Per-IP rate limiting
  config.js             — Port, auth settings, CORS origins
  package.json          — Express, ws, uuid, cookie-parser

src/
  context/
    WebModeContext.jsx   — Detects Tauri vs browser runtime
  hooks/
    useRuntime.js        — Returns runtime type: 'tauri' | 'web' | 'pwa'
    useWebSocket.js      — WebSocket client for browser mode
```

---

## Key Design Decisions

### 1. Runtime Detection
```jsx
// useRuntime.js
export function useRuntime() {
  const [runtime, setRuntime] = useState('tauri');
  useEffect(() => {
    if (window.__TAURI__) {
      setRuntime('tauri');
    } else if (window.matchMedia('(display-mode: standalone)').matches) {
      setRuntime('pwa');
    } else {
      setRuntime('web');
    }
  }, []);
  return runtime;
}
```

### 2. API Layer Abstraction
```jsx
// Instead of calling window.__TAURI__.invoke directly,
// go through a runtime-agnostic dispatch:
import { invoke } from '../lib/runtimeBridge.js';
// invoke('command_name', { params }) works in all modes
```

### 3. WebSocket for Streaming
- Web interface connects to `ws://localhost:4173/ws`
- Same JSON-RPC protocol as iOS companion
- Falls back to SSE (Server-Sent Events) if WebSocket unavailable

---

## Dependencies

### Production (server/package.json)
```json
{
  "dependencies": {
    "express": "^4.21.0",
    "ws": "^8.18.0",
    "uuid": "^10.0.0",
    "cookie-parser": "^1.4.6",
    "helmet": "^8.0.0",
    "express-rate-limit": "^7.4.0"
  }
}
```

### Frontend (existing)
- No new frontend deps — reuse existing React components
- `WebSocket` API is native in all modern browsers

---

## Implementation Phases

### Phase 1: Runtime Detection & Bridge (Days 1-2)
- Create `runtimeBridge.js` — abstract over `__TAURI__.invoke`
- Create `useRuntime` hook + `WebModeContext`
- Audit all existing `invoke()` calls and route through bridge
- Tests: runtime detection in jsdom, mock invoke

### Phase 2: Standalone Server (Days 3-5)
- Express server serving `dist/` static files
- `POST /api/:command` proxy that spawns Tauri command via child_process or HTTP
- WebSocket endpoint at `/ws` with same protocol as companion
- Session auth with local JWT (auto-generated secret on first launch)
- Rate limiting: 100 req/min per IP

### Phase 3: Browser-Compatible UI Audit (Days 6-7)
- Identify Tauri-specific components:
  - File picker → replace with `<input type="file">`
  - Shell commands → disable with "Not available in browser"
  - Native notifications → use `Notification` API fallback
  - System tray → hide entirely
- Create `PlatformGate.jsx` component:
  ```jsx
  <PlatformGate feature="filesystem" fallback={<FileUploadFallback />}>
    <FilePicker />
  </PlatformGate>
  ```

### Phase 4: WebSocket Streaming (Days 8-9)
- `useWebSocket` hook with auto-reconnect
- Wire into existing `ChatView` streaming display
- Fallback to polling if WebSocket fails (every 2s, degrade gracefully)

---

## Security

- Server binds to `127.0.0.1:4173` only (no remote access by default)
- CSRF token on all mutating requests
- Content-Security-Policy header restricting scripts to same origin
- No persistent storage of credentials in browser (session-only JWT)
- Optional: `--allow-external` flag for LAN access with password gate

---

## Limitations

| Feature | Tauri Desktop | Web Interface |
|---------|---------------|---------------|
| Ollama integration | Native IPC | ✅ Same via API proxy |
| File system access | Full | ❌ Upload/download only |
| Shell commands | Full | ❌ Blocked |
| System tray | ✅ | ❌ N/A |
| Native notifications | ✅ | Notification API |
| Offline | Full (bundled) | ❌ Requires server running |
| Local LLM streaming | ✅ | ✅ Via WebSocket |
