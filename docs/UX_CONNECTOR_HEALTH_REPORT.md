# UX Connector Health Report

Generated: 2026-05-31

---

## 1. Files Created / Changed

### Created
- `src/components/ConnectorHealthPanel.jsx` — main panel + helper exports

### Changed
- `src/components/Sidebar.jsx` — added `RadioTower` import, `ConnectorStatusStrip` import, `settings` prop, "Connectors" nav item, connector status strip inline in that nav row
- `src/components/ApprovalModal.jsx` — enhanced with action / connector / riskLevel / destructive-warning fields while keeping full backward compatibility with the `label` prop
- `src/App.jsx` — imports `ConnectorHealthPanel`, passes `settings` to `Sidebar`, mounts the `connectors` tab

---

## 2. ConnectorHealthPanel Layout

The panel renders inside a padded `<div class="p-6">` full-height scroll area when the "Connectors" sidebar tab is active.

**Layout top-to-bottom:**

1. **Panel header** — a row with a `Wifi`/`WifiOff` icon (animated while probing), "Connector Health" title in uppercase, a subtitle explaining the env probe, and a "Refresh" button on the right.

2. **Status summary bar** — a single horizontal strip with four grouped counts:
   - green dot "N live"
   - amber dot "N missing config"
   - slate dot "N local only"
   - gray dot "N disabled"
   - Optional "zero-cost mode active" warning on the far right when `zeroCostMode=true`

3. **Card grid** — responsive: 1 column on narrow, 2 columns (`sm:`), 3 columns (`xl:`).
   Each card has:
   - Header row: connector icon + name on the left, status badge pill on the right
   - Transport string in small mono text
   - Zero-cost blocking banner (amber, with ZapOff icon) if applicable
   - Required env keys list — each row shows key name and "present" (green) or "missing" (gray) derived from `connector.envPresence`
   - "No credentials required" italic note for local-only connectors
   - Health check row (CheckCircle green if live, ShieldOff otherwise) + last test timestamp
   - Disabled reason (if not live), clamped to 2 lines
   - Disabled "Test Connection" button placeholder at card bottom

4. **Footer note** — small zinc-700 text explaining truth rule.

Color coding by status:
- `live` — emerald border/background
- `missing_config` — amber border/background
- `foundation_only` — slate border/background
- `disabled` — zinc border/background

---

## 3. Where ConnectorHealthPanel Is Mounted

`src/App.jsx` renders it when `activeTab === 'connectors'`:

```jsx
{activeTab === 'connectors' && (
  <div className="p-6">
    <ConnectorHealthPanel zeroCostMode={settings.zeroCostMode} />
  </div>
)}
```

Access it via the "Connectors" entry at the bottom of the sidebar nav list (RadioTower icon). The sidebar item shows a compact `ConnectorStatusStrip` inline (e.g. "2 live · 3 missing config") when the sidebar is expanded.

---

## 4. How Connector Status Is Derived

Status derivation is purely client-side from the connector registry object:

1. `listConnectors()` from `connectorRegistryService.js` is called on mount, merging localStorage rows with `DEFAULT_CONNECTORS`.
2. `verifyConnectorEnvironment(id)` is called for every connector on mount (async, one at a time) — this invokes the Tauri `check_env_vars_presence` command to probe each `requiredEnv` key. The updated registry object is written back to localStorage and `listConnectors()` is called again.
3. The `deriveStatus(connector)` helper maps the result:

| Condition | Status |
|---|---|
| `status === 'foundation_only'` | `foundation_only` |
| `status === 'configured'` + all env present + `lastTestStatus === 'verified'` | `live` |
| `status === 'configured'` but env missing or test not verified | `missing_config` |
| `requiredEnv.length > 0` and at least one key present | `missing_config` |
| Everything else | `disabled` |

The "Test Connection" buttons are disabled placeholders. Active testing uses the existing `ConnectorSetupPanel` in the Operator tab.

---

## 5. What the Approval Modal Now Shows

The `ApprovalModal` was enhanced while keeping full backward compatibility (`label` prop still works).

New fields displayed:

- **Action name** — The `action` prop (or `label` fallback), shown as the main body text.
- **Connector badge** — Auto-inferred from keywords in the action text (e.g. "telegram", "youtube", "plugin") or passed explicitly via the `connector` prop. Displayed as a pill.
- **Risk level badge** — Auto-inferred from action text keywords or passed via `riskLevel` prop. Values: `high` (red), `medium` (amber), `low` (emerald). The header icon switches to `ShieldAlert` for high risk and the Approve button turns red.
- **Irreversible warning** — An amber/red banner reading "This action is irreversible. Proceed only if you are certain." is shown when the action text contains words like delete, destroy, drop, wipe, reset, restore snapshot, or irreversible.
- **Deny / Approve buttons** — Clearly labeled. Approve turns red for high-risk actions.

---

## 6. What Was Not Done and Why

| Item | Status | Reason |
|---|---|---|
| Real "Test Connection" API calls from the ConnectorHealthPanel | Not implemented | Would require duplicating the connector send/poll logic from `ConnectorSetupPanel`. The existing Operator tab already provides full connector testing UI. Placeholder buttons direct users there. |
| Per-connector status dots on every sidebar nav item | Not implemented | Only the Connectors nav item has the strip. Individual dots per connector on Chat Hub / Jose / Hector etc. would require mapping connectors to agent tabs, which is not clearly defined in the current registry. |
| Live polling / websocket push for connector status changes | Not implemented | Would require a pub-sub or interval-based refresh loop. The "Refresh" button gives the user on-demand control; a polling interval was not added to avoid background noise. |
| Notification toasts for "Telegram message received" etc. | Already exists | `App.jsx` already wires `pollWhatsAppConnector` and calls `toast.info(...)` on inbound WhatsApp messages. `ToastProvider` is mounted in `main.jsx`. `sendNativeNotification` dispatches OS-level notifications via Tauri. No new toast component was needed. |
| `ToastNotification.jsx` creation | Skipped | `ToastProvider.jsx` already implements a full toast stack with success/error/info/warning types, auto-dismiss, and dismiss button. Creating a duplicate would be redundant. |

---

## 7. How to Test

### ConnectorHealthPanel
1. Run the app (`npm run dev` or the Tauri dev build).
2. Click "Connectors" in the sidebar (RadioTower icon, last nav item before Settings).
3. The panel loads, shows a "Probing connector environments…" message briefly, then displays cards for all 11 connectors.
4. Cards with no env vars set should show `disabled` or `foundation_only` status.
5. Set a real env var (e.g. `TELEGRAM_BOT_TOKEN`) in `.env` and restart — the card should show `missing_config` (amber) once all required keys for that connector are present and `live` once `verifyConnectorEnvironment` returns verified status.
6. Click "Refresh" to re-read the registry without remounting.

### Sidebar status strip
1. Expand the sidebar (chevron button).
2. On the "Connectors" row, a compact strip should appear on the right: e.g. "0 live · 8 missing config · 3 disabled".
3. If `zeroCostMode` is enabled in Settings, a "zero-cost" label appears.

### ApprovalModal
1. Trigger any approval-gated action (e.g. verify Ollama, run workspace proof, create snapshot).
2. The modal appears with:
   - Action text
   - Connector badge (auto-inferred, or empty if no connector matches)
   - Risk badge: low/medium/high
   - For high-risk actions (verify command, restore snapshot, send telegram), the Approve button is red and risk badge is red
   - For destructive actions (restore snapshot), an "irreversible" warning banner appears
3. Click Deny to dismiss; click Approve to proceed.
