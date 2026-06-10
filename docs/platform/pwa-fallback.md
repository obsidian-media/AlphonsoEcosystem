# PWA Fallback — Progressive Web App Mode

## Overview

Enable Alphonso to run as a Progressive Web App (PWA) in browsers, providing an app-like experience for the web interface without requiring the Tauri desktop app installation. PWA mode is a **fallback** — the Tauri desktop app remains the primary target.

---

## Architecture

```
Browser → installs PWA → standalone window
                            │
                     ┌──────┴──────┐
                     │ Service     │
                     │ Worker      │ ← cache static assets
                     └──────┬──────┘
                            │
                     ┌──────┴──────┐
                     │ WebSocket   │
                     │ to Server   │ ← real-time streaming
                     └─────────────┘
```

PWA requires:
1. **`manifest.json`** — app metadata, icons, theme colors, display mode
2. **Service Worker** — offline caching, push notifications
3. **HTTPS or localhost** — Service Worker scope requirement
4. **Icons** — at minimum 192x192 and 512x512 PNG

---

## File Structure

```
public/
  manifest.json                   — PWA manifest (created by T92)
  icons/
    icon-192x192.png              — Generated from alphonso-icon.svg
    icon-512x512.png              — Generated from alphonso-icon.svg
    icon.svg                      — SVG source (reference copy)

src/
  pwa/
    sw.js                         — Service Worker script
    swRegistration.js             — Register SW, handle lifecycle
    pwaInstallPrompt.js           — Capture beforeinstallprompt event
  components/
    layout/
      PwaInstallBanner.jsx        — "Install App" banner (shown on desktop Chrome)
      PwaUpdateBanner.jsx         — "Update available" banner (SW update)
  hooks/
    usePwaInstall.js             — Install prompt state + trigger
    usePwaUpdate.js              — SW update detection + apply
```

---

## PWA Manifest (`public/manifest.json`)

See T92 implementation in this branch. Required fields:

| Field | Value | Notes |
|-------|-------|-------|
| `name` | "Alphonso" | Full app name |
| `short_name` | "Alphonso" | Truncated for home screen |
| `description` | "Local-first AI desktop companion" | Purpose |
| `start_url` | "/" | Root |
| `display` | "standalone" | Fullscreen PWA (no browser chrome) |
| `background_color` | "#05050f" | Splash background (matches app theme) |
| `theme_color` | "#05050f" | Browser UI color |
| `orientation` | "any" | No lock |
| `icons` | Array of { src, sizes, type } | 192x192 + 512x512 PNG, SVG |
| `categories` | ["productivity", "ai"] | Store categories |
| `screenshots` | Optional | For Chrome Play Store listing |

---

## Service Worker

### `src/pwa/sw.js`
```js
const CACHE = 'alphonso-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/index.js',   // Vite-built chunks (hashed)
  '/assets/index.css',
  '/src/assets/alphonso-icon.svg',
];

// Install: pre-cache static assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first, fallback to cache
self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const clone = res.clone();
        if (e.request.url.startsWith(self.location.origin)) {
          caches.open(CACHE).then((cache) => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
```

### Strategy: Network-First
- For API/WebSocket traffic: always try network (never cache dynamic content)
- For static assets: cache on first visit, serve from cache when offline
- For the SPA shell (`index.html`): serve from cache when offline (App Shell pattern)

---

## PWA Install Flow

```
1. User visits web interface in Chrome/Edge
2. Browser fires `beforeinstallprompt` event
3. App shows "Install Alphonso" banner (dismissable, max 3 prompts)
4. User clicks Install → browser native install dialog
5. App opens in standalone window with no browser chrome
6. Full app experience: chat, agents, boardroom via WebSocket to local server
7. Offline: cached shell loads, shows "Server not running" message
```

### `src/pwa/pwaInstallPrompt.js`
```js
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // Dispatch custom event for UI to pick up
  window.dispatchEvent(new CustomEvent('pwa-install-ready', { detail: e }));
});

export function getInstallPrompt() { return deferredPrompt; }
export function clearInstallPrompt() { deferredPrompt = null; }
```

---

## Limitations in PWA Mode

| Feature | PWA | Tauri Desktop |
|---------|-----|---------------|
| File system access | ❌ (download-only) | ✅ Full |
| Shell commands | ❌ | ✅ |
| System tray | ❌ | ✅ |
| Background execution | ❌ (limited SW wake) | ✅ Full |
| Ollama local LLM | ⚠️ Via server WebSocket | ✅ Native IPC |
| Native notifications | ✅ (Web Notification API) | ✅ Native |
| Offline app shell | ✅ (cached) | ✅ (bundled) |
| Install size | ~2 MB cache | ~80 MB (bundles Ollama) |

---

## Implementation Phases

### Phase 1: Manifest + Icons (T92 — This Branch) (Day 1)
- Create `public/manifest.json`
- Add `<link rel="manifest">` to `index.html`
- Generate PNG icons from `alphonso-icon.svg`
- Verify with Chrome DevTools → Application → Manifest

### Phase 2: Service Worker (Days 2-3)
- Create `src/pwa/sw.js` with network-first caching
- Create `src/pwa/swRegistration.js` — register, update, scope
- Cache static Vite build assets dynamically (via `self.__WB_MANIFEST` or manual list)
- Test offline: DevTools → Network → Offline → reload → app shell shows

### Phase 3: Install Prompt UI (Days 4-5)
- Create `PwaInstallBanner.jsx` — appears on `beforeinstallprompt`
- Frequency cap: show max 3 times, then suppress permanently
- Create `PwaUpdateBanner.jsx` — appears when new SW is waiting
- "Update" button calls `skipWaiting()` + `window.location.reload()`

### Phase 4: Offline Experience (Days 6-7)
- Cache API responses that are read-only (agent list, model list)
- Show "Server Offline" page when WebSocket cannot connect
- Show cached agent names + status from last known state
- Simple connectivity check: if no WebSocket in 5s, show offline overlay

---

## Testing PWA

```bash
# Build first
npm run build

# Serve dist folder with HTTPS (required for SW in production)
npx serve -s dist -l 4173 --ssl-cert localhost.pem --ssl-key localhost-key.pem

# Or use Vite preview
npm run preview
```

### Manual Verification Checklist
- [ ] `manifest.json` is served with `Content-Type: application/manifest+json`
- [ ] Icons display correctly in DevTools → Application → Manifest
- [ ] Service Worker registered without errors
- [ ] "Install" banner appears in Chrome
- [ ] PWA opens in standalone mode
- [ ] App loads from cache when offline (SW serves cached shell)
- [ ] Update detection works (push new SW → "Update" banner)
