# Alphonso UI/UX Overhaul — Agent Handoff

**Branch:** `feat/ui-ux-overhaul`
**Assigned to:** OpenCode (or equivalent UI-capable agent)
**Maturity target:** Current state → 90 / 100 UI/UX quality
**Reviewer after handoff:** Claude Code (verify, wire, merge to `main`)

---

## Rules Before You Write a Single Line

1. **Run `npm run test` first.** All 1930+ tests must pass before and after your changes.
2. **Do not touch `src/services/`**, `src/agents/`, `src/lib/`, `src-tauri/`, or any test files — purely UI work.
3. **Do not change any props or exported function signatures.** Only internal JSX, className, and CSS.
4. **Use CSS tokens everywhere.** `var(--surface-1)`, `var(--text-2)`, `var(--accent)`, etc. Never hardcode hex colors or Tailwind named colors (`zinc-800`, `indigo-500`, `emerald-500`) unless the token system genuinely doesn't cover it.
5. **All tokens are defined in `src/styles/tokens.css`.** Read it before touching a single color.
6. **Tailwind classes exist for the token system** — check `tailwind.config.js` before inventing class names. Do not use non-existent classes like `surface-4` or `accent-hover` unless they're in the config.
7. **TypeScript:** Remove `@ts-nocheck` from any file you touch. Fix the type errors properly.
8. **Commit per issue group** (not per file) — use the commit format at the bottom of this doc.
9. When done, `npm run test` and `npm run build` must both pass clean.

---

## Audit Summary — What Is Broken (17 Issue Groups)

Read every issue fully. Each one has a **Root cause**, **Exact files**, **Exact fix**, and **Acceptance criterion**.

---

### ISSUE 1 — Navigation: Duplicate Icons (Critical)

**Root cause:** Three sidebar items all use `FolderOpen` as their icon — Connectors, Activity, and Workflows. This is a placeholder that was never replaced.

**File:** `src/components/Sidebar.tsx`, lines 86–90

```tsx
// CURRENT (broken):
{ id: 'connectors', icon: FolderOpen, label: 'Connectors', showStatusDot: true },
{ id: 'activity', icon: FolderOpen, label: 'Activity' },
{ id: 'workflows', icon: FolderOpen, label: 'Workflows' },
```

**Fix:** Replace with semantically correct icons from lucide-react:

```tsx
import { Activity, GitBranch, Plug } from 'lucide-react';

{ id: 'connectors', icon: Plug, label: 'Connectors', showStatusDot: true },
{ id: 'activity', icon: Activity, label: 'Activity' },
{ id: 'workflows', icon: GitBranch, label: 'Workflows' },
```

Also add missing views that exist but have no sidebar entry. The following views are fully implemented but unreachable from the sidebar. Add them under appropriate sections:

```tsx
// Under 'Build':
{ id: 'hector', icon: Search, label: 'Research' },
{ id: 'content', icon: FileText, label: 'Content' },

// Under 'System':
{ id: 'files', icon: Database, label: 'Knowledge' },
{ id: 'automation', icon: GitBranch, label: 'Automation' },
```

**Acceptance:** Every sidebar icon is unique and semantically meaningful. All 8+ views are reachable.

---

### ISSUE 2 — Navigation: Section Label Confusion (High)

**Root cause:** The sidebar section label `"Build"` contains `Projects` (Terminal icon) and `Creative` (Sparkles) — but Projects means "project execution mode" and Creative means "Miya Studio". These names don't communicate purpose to a new user.

**File:** `src/components/Sidebar.tsx`, lines 68–74 and `NAV_SECTIONS` const

**Fix:** Rename sections and items to be self-describing:

```tsx
const NAV_SECTIONS: NavSection[] = [
  {
    label: null,
    items: [
      { id: 'chat', icon: MessageSquare, label: 'Chat' },
      { id: 'mission', icon: LayoutDashboard, label: 'Dashboard' },
    ]
  },
  {
    label: 'Work',
    items: [
      { id: 'project_execution', icon: Terminal, label: 'Projects' },
      { id: 'hector', icon: Search, label: 'Research' },
      { id: 'miya', icon: Palette, label: 'Creative' },
      { id: 'content', icon: FileText, label: 'Content' },
    ]
  },
  {
    label: 'Agents',
    items: [
      { id: 'orchestrator', icon: Layers, label: 'Orchestrator' },
      { id: 'ecosystem', icon: Bot, label: 'Agents' },
    ]
  },
  {
    label: 'System',
    items: [
      { id: 'runtimes', icon: Cpu, label: 'Runtimes' },
      { id: 'connectors', icon: Plug, label: 'Connectors', showStatusDot: true },
      { id: 'automation', icon: GitBranch, label: 'Automation' },
      { id: 'files', icon: Database, label: 'Knowledge' },
      { id: 'activity', icon: Activity, label: 'Activity' },
    ]
  }
];
```

Import `LayoutDashboard, Layers, Palette, Search, FileText, Database, Plug, GitBranch` from lucide-react.

**Acceptance:** All sections have self-describing labels. No "Build" section naming confusion.

---

### ISSUE 3 — Chat: User Messages Have No Bubble (Critical)

**Root cause:** User messages have no background color or bubble styling. The code at `ChatView.tsx` line 1012–1013:

```tsx
// CURRENT (broken — invisible user messages):
<div className={`px-3 py-2 text-xs ${compactChat ? '' : ''}`}>{message.content}</div>
```

The `compactChat` ternary is empty string on both sides — a dead conditional. User messages are white text on a dark background with no bubble, indistinguishable from assistant text.

**File:** `src/components/ChatView.tsx`, lines 1011–1023

**Fix:** Give user messages a proper bubble:

```tsx
// User message bubble
<div className={`relative group ${message.role === 'user' ? 'flex flex-col items-end' : ''}`}>
  <div className={`
    max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed
    ${message.role === 'user'
      ? 'bg-[var(--accent)] text-[var(--surface-0)] rounded-br-sm font-medium'
      : 'bg-[var(--surface-2)] text-[var(--text-1)] border border-[var(--border)] rounded-bl-sm'
    }
  `}>
    {message.content}
  </div>
  {/* pin button stays on hover — keep existing logic */}
</div>
```

**Acceptance:** User messages render with the accent color background. Assistant messages render with surface-2 background. The two message types are visually distinct at a glance.

---

### ISSUE 4 — Chat: Header Tool Overload (High)

**Root cause:** The ChatView sub-header (lines 731–827) has 9 controls crammed into a 48px bar: session ID text, model picker, Direct toggle, 2x connector dots, Search, Focus/Full, Preview/Auto, Export, and Clear. This is a cognitive catastrophe for a user.

**File:** `src/components/ChatView.tsx`, lines 731–827

**Fix strategy:** Move rarely-used controls to a `...` overflow menu. The bar should only show what the user needs on every message:

**Keep in the primary bar (left side):**
- OllamaModelPicker
- Direct mode toggle (important, high use)

**Keep in the primary bar (right side):**
- Search (high use)
- Stop button (when generating)
- `...` more-actions button

**Move into the `...` more-actions dropdown:**
- Focus/Full compact toggle
- Preview/Auto mode toggle
- Export chat
- Clear chat
- Connector status dots (move to TopBar or RightPanel)

**Implementation:**
```tsx
// New state:
const [showMoreMenu, setShowMoreMenu] = useState(false);
const moreMenuRef = useRef<HTMLDivElement>(null);

// In header JSX:
<div className="h-12 flex items-center justify-between px-4 border-b border-[var(--border)] shrink-0 bg-[var(--surface-0)]">
  <div className="flex items-center gap-2">
    <OllamaModelPicker ... />
    <DirectModeButton ... /> {/* existing direct mode toggle, keep as-is */}
  </div>
  <div className="flex items-center gap-2">
    <button onClick={() => setSearchOpen(o => !o)} ...>
      <Search className="w-4 h-4" />
    </button>
    <div className="relative" ref={moreMenuRef}>
      <button onClick={() => setShowMoreMenu(m => !m)} className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)] transition-colors">
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {showMoreMenu && (
        <div className="absolute right-0 top-full mt-1 z-30 w-44 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl shadow-xl py-1 overflow-hidden">
          {/* compact/full, preview/auto, export, clear — each as a menu item */}
        </div>
      )}
    </div>
  </div>
</div>
```

**Remove this entirely from the header:** `<span className="text-xs text-[var(--text-3)] font-medium">CHAT SESSION: {activeChatId}</span>` — internal session IDs must never be shown to end users.

**Acceptance:** Header shows ≤ 4 controls. No session ID text. All current functionality is still accessible via the `...` menu. Cognitive load is dramatically reduced.

---

### ISSUE 5 — Chat: Floating Attach Button (High)

**Root cause:** The file attach and voice input buttons are positioned with `absolute -top-10 left-0` — they float 40px above the input box, in the message scroll area. This is an unconventional, fragile pattern. When the pinned messages section is open the buttons overlap pinned content.

**File:** `src/components/ChatView.tsx`, lines 1271–1289

**Fix:** Move the attach button and voice button inside the input box footer row, to the left of the send button. The input box already has a bottom row (lines 1321–1345). Place them there:

```tsx
{/* Input box footer — left controls, right send */}
<div className="flex items-center justify-between px-3 pb-3 pt-0">
  <div className="flex items-center gap-1.5">
    {/* File attach */}
    <button
      onClick={() => fileInputRef.current?.click()}
      className={`p-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 ${
        attachedFile?.error ? 'text-[var(--error)]' :
        attachedFile?.name ? 'text-[var(--success)]' :
        'text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)]'
      }`}
      aria-label={attachedFile?.name ?? 'Attach file'}
      title={attachedFile?.error ?? attachedFile?.name ?? 'Attach file'}
    >
      <Paperclip className="w-4 h-4" />
    </button>
    {/* Voice */}
    <Suspense fallback={null}>
      <VoiceInputButton voiceStatus={voice.voiceStatus} onToggle={voice.toggleListening} />
    </Suspense>
    {/* Status text */}
    <span className="text-[11px] text-[var(--text-4)] ml-1">
      {ollamaStatus.state === 'connected' && !selectedModelMissing
        ? settings.selectedModel || 'local model'
        : 'Ollama offline'}
    </span>
  </div>
  <div className="flex items-center gap-2">
    {isGenerating && <StopButton onClick={...} />}
    <SendButton onClick={handleSend} disabled={...} />
  </div>
</div>
```

Remove the `absolute -top-10` positioning entirely. The textarea `min-h` values should be reduced by ~40px now that there's no floating element:
- compact: `min-h-[60px]`
- full: `min-h-[88px]`

**Acceptance:** No floating button above the input. Attach and voice sit in the input footer row at all times.

---

### ISSUE 6 — Chat: Send Button Text (Medium)

**Root cause:** The send button says "Run Prompt" (lines 1341–1342). This is developer jargon. When generating it says "Computing..." — also jargon.

**File:** `src/components/ChatView.tsx`, lines 1332–1345

**Fix:**
```tsx
// Send button labels:
isGenerating ? 'Generating…' : 'Send'

// And the stop button:
'Stop'
```

The Send button's icon should be `<Send className="w-3.5 h-3.5" />` — keep that.

**Acceptance:** Send button says "Send". Generating state says "Generating…".

---

### ISSUE 7 — Chat: Empty State Is Useless (High)

**Root cause:** The chat empty state (lines 900–907) shows only a bot icon and "Start a conversation / Type a command or ask anything." — no suggestions, no shortcuts, no indication of what this app can do.

**File:** `src/components/ChatView.tsx`, lines 900–907

**Fix:** Replace with an actionable empty state that demonstrates capability:

```tsx
{messages.length === 0 && !inputValue && (
  <div className="h-full flex flex-col items-center justify-center py-16 px-6 select-none">
    <div className="w-12 h-12 rounded-2xl bg-[var(--accent-dim)] border border-[var(--accent-border)] flex items-center justify-center mb-6">
      <Bot className="w-6 h-6 text-[var(--accent)]" />
    </div>
    <h2 className="text-lg font-semibold text-[var(--text-1)] mb-2">What can I help you with?</h2>
    <p className="text-sm text-[var(--text-3)] mb-8 text-center max-w-sm">
      Ask anything, run research, create content, or delegate tasks to your agent team.
    </p>
    <div className="grid grid-cols-2 gap-2 w-full max-w-lg">
      {[
        { label: 'Research a topic', cmd: 'Search for the latest developments in ', icon: Search },
        { label: 'Create content', cmd: 'Write a LinkedIn post about ', icon: Palette },
        { label: 'Build a project', cmd: 'Create a new React project that ', icon: Terminal },
        { label: 'Analyse opportunities', cmd: 'Analyse the market opportunity for ', icon: TrendingUp },
      ].map(({ label, cmd, icon: Icon }) => (
        <button
          key={label}
          onClick={() => { setInputValue(cmd); inputRef.current?.focus(); }}
          className="flex items-center gap-3 p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] hover:border-[var(--accent-border)] hover:bg-[var(--accent-dim)] text-left transition-all group"
        >
          <div className="w-8 h-8 rounded-lg bg-[var(--surface-3)] flex items-center justify-center shrink-0 group-hover:bg-[var(--accent-dim)]">
            <Icon className="w-4 h-4 text-[var(--text-3)] group-hover:text-[var(--accent)]" />
          </div>
          <span className="text-sm text-[var(--text-2)] group-hover:text-[var(--text-1)] font-medium">{label}</span>
        </button>
      ))}
    </div>
    <p className="mt-8 text-[11px] text-[var(--text-4)]">Press <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-3)] font-mono text-[10px]">?</kbd> for keyboard shortcuts</p>
  </div>
)}
```

**Acceptance:** Empty state shows 4 suggestion cards that pre-fill the input. Shows keyboard shortcut hint.

---

### ISSUE 8 — Design Token Violations Across All Components (Critical)

**Root cause:** Multiple components use hardcoded Tailwind color classes instead of CSS token variables, breaking both the token system and the dark/light mode switch.

**Files and exact violations:**

**`src/components/AgentStatusStrip.tsx` (lines 60–78):**
```tsx
// WRONG:
className="bg-zinc-800 rounded-full"
className="text-zinc-300 font-medium"
// CORRECT:
className="bg-[var(--surface-3)] rounded-full"
className="text-[var(--text-2)] font-medium"
```

Also: `bg-emerald-400` for the ping dot is fine semantically (it's always green = running) but should become the success token:
```tsx
className="bg-[var(--success)]"
```

**`src/components/SettingsView.tsx` — `EchoTimeline` function (lines 42–91):**
```tsx
// WRONG:
className="bg-zinc-900/40 border border-white/[0.04]"
className="text-zinc-300"
className="text-zinc-500"
className="text-zinc-600"
className="text-zinc-600"
// CORRECT:
className="bg-[var(--surface-2)] border border-[var(--border)]"
className="text-[var(--text-1)]"
className="text-[var(--text-3)]"
className="text-[var(--text-4)]"
```

Also in `EchoTimeline` (line 76–80): the `indigo` color in tier badge should use `--info` token:
```tsx
// WRONG:
'bg-indigo-500/10 border-indigo-400/20 text-indigo-300'
// CORRECT:
'bg-[var(--info-dim)] border-[var(--info)]/20 text-[var(--info)]'
```

**`src/components/OnboardingWizard.tsx` — `StepIndicator` (lines 44–51):**
```tsx
// WRONG:
'bg-emerald-500 text-white'          // completed step
'bg-indigo-500 text-white ring-2 ring-indigo-500/30'  // current step
'bg-zinc-800 text-zinc-500'          // future step
'bg-emerald-500'                     // connector line
'bg-zinc-700'                        // inactive line
// CORRECT:
'bg-[var(--success)] text-[var(--surface-0)]'
'bg-[var(--accent)] text-[var(--surface-0)] ring-2 ring-[var(--accent)]/30'
'bg-[var(--surface-3)] text-[var(--text-3)]'
'bg-[var(--success)]'
'bg-[var(--border-strong)]'  // or var(--surface-4)
```

**`src/components/AutomationView.jsx` — tab bar (lines 34–53):**
```tsx
// WRONG:
'bg-zinc-900 border border-b-0 border-white/[0.08] text-zinc-100'
'text-zinc-500 hover:text-zinc-300'
// CORRECT:
'bg-[var(--surface-1)] border border-b-0 border-[var(--border)] text-[var(--text-1)]'
'text-[var(--text-3)] hover:text-[var(--text-2)]'
```

**`src/components/SettingsView.tsx` — `ModelSelector` (lines ~117–):**
When you see any remaining `zinc-*`, `indigo-*`, `emerald-*` classes in SettingsView replace them with the token equivalents above.

**`src/index.css` — Light mode token naming collision (lines 11–43):**
Light mode defines `--color-bg`, `--color-surface`, `--color-accent` etc. as a **different naming convention** from dark mode `--surface-0`, `--text-1`, `--accent`. Components that check `var(--color-bg)` in light mode will get nothing in dark mode and vice versa. 

**Fix:** Add the missing cross-references in the `.light` block at the top of `index.css` so the canonical names always work regardless of mode:

```css
.light {
  /* ... existing declarations ... */
  /* Map canonical tokens to light mode values */
  --surface-0: var(--color-bg, #f8f9fa);
  --surface-1: var(--color-surface, #ffffff);
  --surface-2: var(--color-surface-2, #f1f3f5);
  --surface-3: #e8eaed;
  --surface-4: #dee2e6;
  --text-1: var(--color-text, #212529);
  --text-2: #495057;
  --text-3: var(--color-text-muted, #6c757d);
  --text-4: #adb5bd;
  --accent: var(--color-accent, #3b82f6);
  --accent-hover: var(--color-accent-hover, #2563eb);
  --border: var(--color-border, #dee2e6);
  --border-strong: #ced4da;
}
```

**Acceptance:** `AgentStatusStrip`, `EchoTimeline`, `OnboardingWizard`, `AutomationView` use only token variables. Light mode switch works correctly for all of them. Zero hardcoded `zinc-*` or `indigo-*` colors in these files.

---

### ISSUE 9 — RuntimeManagerView: Emoji Icons (Medium)

**Root cause:** `RuntimeManagerView.jsx` defines tool metadata with emoji icons (`🦙`, `🎨`, `🖼️`, `✨`) at lines 31–60. Emoji render inconsistently across platforms and are not part of the app's design system.

**File:** `src/components/RuntimeManagerView.jsx`, lines 32–100 (TOOL_META)

**Fix:** Replace emoji with lucide-react icons. Add an `icon` field to each tool using a Lucide component:

```jsx
import { Cpu, Image, Layers, Zap, Video, Wand2, Bot, RefreshCw } from 'lucide-react';

const TOOL_META = {
  ollama: { icon: Bot, category: 'LLM', ... },
  comfyui: { icon: Wand2, category: 'Image / Video', ... },
  automatic1111: { icon: Image, category: 'Image', ... },
  fooocus: { icon: Sparkles, category: 'Image', ... },
  invokeai: { icon: Layers, category: 'Image', ... },
  // ... etc
};
```

Then wherever `TOOL_META[id].icon` is rendered (look for the emoji span), replace with:
```jsx
const ToolIcon = TOOL_META[id]?.icon ?? Cpu;
<ToolIcon className="w-5 h-5 text-[var(--text-2)]" />
```

**Acceptance:** No emoji in RuntimeManagerView. All tool icons are Lucide components.

---

### ISSUE 10 — RightPanel: "↺" Character as Button (Medium)

**Root cause:** The re-scan button in RightPanel uses a raw Unicode character `↺` as the button content (line 284), not an icon component. This is inconsistent with the design system and has no accessible label.

**File:** `src/components/RightPanel.tsx`, line 280–285

**Fix:**
```tsx
import { RefreshCw } from 'lucide-react'; // already imported

<button
  onClick={runQuickScan}
  className="p-1 rounded-lg text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50"
  aria-label="Re-scan for security threats"
  title="Re-scan"
>
  <RefreshCw className="w-3.5 h-3.5" />
</button>
```

**Acceptance:** Security re-scan uses RefreshCw icon, has aria-label.

---

### ISSUE 11 — RightPanel: Audit Tab Unreadable (Medium)

**Root cause:** The audit tab (lines 350–370) shows raw agent names and `entry.action` strings truncated at 80px — often just showing "send_" or "publish_". The outcome badge is illegible at `text-[9px]`. The overall card has no visual rhythm.

**File:** `src/components/RightPanel.tsx`, lines 350–370

**Fix:** Redesign each audit entry card:

```tsx
{auditEntries.map((entry, i) => (
  <div key={i} className="px-2 py-2.5 rounded-xl hover:bg-[var(--surface-3)] transition-colors space-y-1.5 border border-transparent hover:border-[var(--border)]">
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs font-semibold text-[var(--text-1)] shrink-0">{entry.agent}</span>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${
          entry.outcome === 'approved'
            ? 'bg-[var(--success-dim)] text-[var(--success)]'
            : 'bg-[var(--error-dim)] text-[var(--error)]'
        }`}>
          {entry.outcome}
        </span>
      </div>
      <span className="text-[10px] text-[var(--text-4)] shrink-0">{relativeTime(entry.timestamp)}</span>
    </div>
    <p className="text-[11px] text-[var(--text-3)] truncate leading-snug">{entry.action}</p>
  </div>
))}
```

**Acceptance:** Each audit entry shows agent name, outcome badge, relative time, and action text — all legible. Minimum text size is 10px (text-[10px]).

---

### ISSUE 12 — TopBar: Decorative Logo (Low)

**Root cause:** TopBar renders `<img src={alphonsoIcon} alt="" className="w-6 h-6 rounded-full opacity-80" />` at line 107 with no `onClick`, no role — it's purely decorative and wastes space in a 44px header.

**File:** `src/components/TopBar.tsx`, line 107

**Fix:** Remove the decorative logo entirely from the right side. If you want Alphonso branding in the header, the Sidebar already shows it in the logo area. The TopBar right-side should be functional controls only.

**Also fix in TopBar:** The Ollama status pill (lines 102–105) has `text-2xs` which is a custom micro-class that's too small for a status indicator. Bump to `text-xs`:

```tsx
<div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]">
  <span className={`h-2 w-2 rounded-full shrink-0 ${ollamaStatus.state === 'connected' ? 'bg-[var(--success)]' : 'bg-[var(--error)]'}`} />
  <span className="text-xs text-[var(--text-2)] font-medium">{settings.selectedModel || 'No model'}</span>
  <span className="text-xs text-[var(--text-3)]">{ollamaStatus.state === 'connected' ? 'Online' : 'Offline'}</span>
</div>
```

**Acceptance:** No decorative image in TopBar. Model status pill is readable at `text-xs`.

---

### ISSUE 13 — Sidebar Collapsed State: Information Black Hole (High)

**Root cause:** When the sidebar collapses to `w-14` (56px), the `AgentStatusStrip` disappears entirely (it's inside `{isOpen && ...}`), and the only visual information is tiny `<StatusDot>` dots with no labels or tooltips. A user can't tell which page they're on.

**File:** `src/components/Sidebar.tsx`, lines 130–166

**Fix 1:** The active nav item should show its icon with the accent color regardless of sidebar state — this is already done (line 148: `text-[var(--accent)]` when active). But there is no tooltip on the icon buttons when collapsed.

Add `title` props to all nav buttons:
```tsx
<button
  key={item.id}
  onClick={() => setActiveTab(item.id)}
  title={!isOpen ? item.label : undefined}   // ← tooltip when collapsed
  className={...}
>
```

**Fix 2:** In collapsed mode, show the `AgentStatusStrip` as stacked icon-only dots:
```tsx
{!isOpen && derivedAgents.length > 0 && (
  <div className="flex flex-col items-center gap-1 py-2 border-b border-[var(--border)]">
    {derivedAgents.slice(0, 3).map(agent => (
      <span key={agent.name} className="relative flex h-2 w-2" title={agent.name}>
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--success)] opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--success)]" />
      </span>
    ))}
  </div>
)}
```

**Fix 3:** The `AgentStatusStrip` in `{isOpen && ...}` block should be extracted so it works in both states.

**Acceptance:** Collapsed sidebar shows icon tooltips on hover. Active page icon stays accent-colored. Agent pulse dots still visible when collapsed.

---

### ISSUE 14 — `@ts-nocheck` Suppression (High for Code Quality)

**Root cause:** Two major files suppress ALL TypeScript checking:
- `src/components/ChatView.tsx` line 1: `// @ts-nocheck`
- `src/components/OnboardingWizard.tsx` line 1: `// @ts-nocheck`

This means hundreds of lines of untyped React code that may have type errors that silently cause runtime bugs.

**File:** Both files above, line 1

**Fix:**
1. Remove `// @ts-nocheck` from both files.
2. For `ChatView.tsx`: the main prop type is `any` (line 212: `}: any`). Add a proper interface:

```tsx
interface ChatViewProps {
  activeChatId: string;
  settings: {
    selectedModel?: string;
    zeroCostMode?: boolean;
    endpoint?: string;
    outputFolder?: string;
    autoScroll?: boolean;
    [key: string]: unknown;
  };
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
  ollamaStatus: { state: string; label?: string };
  installedModels: Array<{ name: string }>;
  selectedModelMissing: boolean;
  voice: {
    voiceStatus: string;
    toggleListening: () => void;
    liveTranscript?: string;
  };
  onGenerationChange: (generating: boolean) => void;
  onTaskComplete: () => void;
  onRetryOllama: () => void;
  onJoseExecutionState?: (state: string, detail: string) => void;
  onOpenSettings: () => void;
  onModelChange: (model: string) => void;
  screenObserverLogs?: unknown[];
  setActiveTab: (tab: string) => void;
  onPendingCountChange?: (count: number) => void;
}
```

3. For `OnboardingWizard.tsx`: functions using implicit `any` callbacks should add parameter types. Most are event handlers — add `React.ChangeEvent<HTMLInputElement>` etc.

Do not introduce `as unknown as X` casts to work around the issue — fix the types properly.

**Acceptance:** Both files compile with `tsc --noEmit` with no errors and no `@ts-nocheck`. `npm run test` still passes.

---

### ISSUE 15 — Chat: Execution Receipts Expose Internal Status Strings (Medium)

**Root cause:** The execution receipts section (lines 1189–1224) shows raw status strings like `"reported_to_jose"`, `"dead_letter"`, `"pending_approval"`. These are internal service state machine values — not human language.

**File:** `src/components/ChatView.tsx`, lines 1198–1222

**Fix:** Add a status label map and use it:

```tsx
const RECEIPT_STATUS_LABELS: Record<string, string> = {
  reported_to_jose: 'Completed',
  executed: 'Executed',
  approval_required: 'Awaiting Approval',
  pending_approval: 'Awaiting Approval',
  dead_letter: 'Failed',
  failed: 'Failed',
};

// In JSX, replace:
{receipt.status}
// With:
{RECEIPT_STATUS_LABELS[receipt.status] ?? receipt.status}
```

**Acceptance:** No `"reported_to_jose"` or `"dead_letter"` strings visible to users.

---

### ISSUE 16 — Button Component: Non-Existent Tailwind Class (Medium)

**Root cause:** `src/components/ui/Button.tsx` line 14 references `bg-surface-4` and `hover:bg-surface-4` for the secondary variant. `surface-4` is not a Tailwind color token configured in `tailwind.config.js` — it will render as nothing (transparent background).

**File:** `src/components/ui/Button.tsx`, line 14

**Fix:** Check `tailwind.config.js` for the configured surface classes. Replace `surface-4` with the correct class:

```tsx
// If tailwind.config.js maps surface-3 but not surface-4:
secondary: 'bg-[var(--surface-3)] text-[var(--text-1)] hover:bg-[var(--surface-4)] border-[var(--border)]',
// ↑ uses CSS vars directly, which always works regardless of Tailwind config
```

Change all `surface-*` Tailwind classes in Button.tsx to use CSS variable syntax `bg-[var(--surface-N)]`.

**Acceptance:** `Button variant="secondary"` renders with visible background in both dark and light mode.

---

### ISSUE 17 — MissionControlHome: Hidden Views After Hero (Medium)

**Root cause:** `MissionControlHome.jsx` renders a `<img src={alphonsoBanner}>` hero section with hard-coded `py-10 md:py-14` padding. On smaller windows (the Tauri default size is often 1280×800) the hero takes most of the visible height, and the "Next Actions" cards are below the fold. A dashboard where the actionable content is hidden is broken.

**File:** `src/components/MissionControlHome.jsx`, lines 71–80

**Fix:** Reduce the hero vertical padding and make it proportional to viewport:

```jsx
// Before:
<div className="relative px-8 py-10 md:px-12 md:py-14">

// After:
<div className="relative px-8 py-6 md:px-12 md:py-8">
```

Also: the banner image uses `opacity-25` — on small screens this means the background is nearly invisible yet still costs a render. Keep opacity but reduce to `opacity-20` to reduce visual noise:

```jsx
className="absolute inset-0 h-full w-full object-cover opacity-20 saturate-110"
```

**Acceptance:** On a 1280×800 window, at least 2 "Next Actions" cards are visible without scrolling.

---

## Additional Polish Tasks (Complete All Of These)

These are smaller but required for the 90/100 target.

### P1 — Sidebar: Pending Approval Badge Location

The `pendingApprovalCount` badge appears on the "Chat" nav item (Sidebar.tsx line 150). But approvals are managed in the Orchestrator view. Move the badge to the "Orchestrator" nav item instead:

```tsx
// Find the orchestrator item in NAV_SECTIONS and add:
{ id: 'orchestrator', icon: Layers, label: 'Orchestrator', showApprovalBadge: true }

// In the button render:
{isOpen && item.showApprovalBadge && pendingApprovalCount > 0 && (
  <span className="ml-auto flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--warning)] text-[10px] font-bold text-black">
    {pendingApprovalCount > 9 ? '9+' : pendingApprovalCount}
  </span>
)}
```

### P2 — Chat: Direct Mode Double Badge

When `directMode` is true, both a button with "Direct" text AND a separate `<span>` badge with "Direct" appear (lines 743–763). Remove the redundant span badge. The button already communicates the state through color.

### P3 — Chat: Hector Briefing in Wrong Location

The Hector briefing card appears in `src/components/ChatView.tsx` at **two places**: once in the message list (lines 970–988, inline under the last assistant message) AND once above the input box (lines 1230–1251). This is a duplicate. Remove the one above the input box (lines 1230–1251). The inline citation badges under the last assistant message are the correct location.

### P4 — RightPanel: Security Section Overflow

The `SentinelAllowlistPanel` is rendered at the very bottom of `RightPanel.tsx` (lines 343–347) outside the scrollable area — it pushes the panel past screen height on smaller windows. Wrap it in the overflow-y-auto scrolling div instead:

Move lines 343–347 inside the `<div className="flex-1 overflow-y-auto p-2 space-y-0.5">` container of the System tab.

### P5 — Consistent `section-label` Class Usage

The `section-label` CSS class is defined in `index.css` (check around line 165). In `EchoTimeline` (SettingsView.tsx line 64) it uses raw inline classes instead of `section-label`. Audit all `text-[10px] font-bold uppercase tracking-widest` patterns in SettingsView.tsx and replace with `section-label` where semantically appropriate.

### P6 — Missing `rounded` on Sidebar Toggle Button

The sidebar collapse/expand chevron button (Sidebar.tsx line 112) has no `rounded-lg` class and is visually uncontained compared to other icon buttons. Add `rounded-lg`:

```tsx
className="ml-auto p-1.5 rounded-lg text-zinc-500 ..."
```

### P7 — TopBar: Missing `selectedModelMissing` Visual Feedback

The TopBar receives `selectedModelMissing` prop but the Ollama status pill (line 102) doesn't visually react to it — it just shows the model name regardless. If the model is missing, show a warning state:

```tsx
<div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${
  selectedModelMissing
    ? 'bg-[var(--warning-dim)] border-[var(--warning)]/30'
    : 'bg-[var(--surface-2)] border-[var(--border)]'
}`}>
  <span className={`h-2 w-2 rounded-full shrink-0 ${
    selectedModelMissing ? 'bg-[var(--warning)]' :
    ollamaStatus.state === 'connected' ? 'bg-[var(--success)]' : 'bg-[var(--error)]'
  }`} />
  <span className={`text-xs font-medium ${selectedModelMissing ? 'text-[var(--warning)]' : 'text-[var(--text-2)]'}`}>
    {selectedModelMissing ? `${settings.selectedModel} (missing)` : settings.selectedModel || 'No model'}
  </span>
</div>
```

---

## What Is Explicitly OUT OF SCOPE

Do NOT do any of these — they belong to the reviewer (Claude Code) after handoff:

- Changing any service, hook, or state management logic
- Adding new routes or nav tabs not described here
- Changing the Tauri window config, app shell layout (flex row Sidebar + Main + RightPanel)
- Redesigning any view that isn't listed in the 17 issue groups above (e.g., OperatorDashboard, ProjectExecutionMode, MiyaStudio — leave them as-is)
- Adding animations beyond what Tailwind's `transition-*` provides
- Changing test files in `src/test/`
- Touching `voice/` or `gateway/`

---

## File Change Summary (Reference)

| File | Issues Addressed |
|---|---|
| `src/components/Sidebar.tsx` | #1, #2, #13, P1, P2-badge, P6 |
| `src/components/ChatView.tsx` | #3, #4, #5, #6, #7, #14, #15, P2, P3 |
| `src/components/TopBar.tsx` | #12, P7 |
| `src/components/RightPanel.tsx` | #10, #11, P4 |
| `src/components/AgentStatusStrip.tsx` | #8 |
| `src/components/SettingsView.tsx` | #8 (EchoTimeline), P5 |
| `src/components/OnboardingWizard.tsx` | #8, #14 |
| `src/components/AutomationView.jsx` | #8 |
| `src/components/RuntimeManagerView.jsx` | #9 |
| `src/components/ui/Button.tsx` | #16 |
| `src/components/MissionControlHome.jsx` | #17 |
| `src/index.css` | #8 (light mode tokens) |

---

## Commit Format

Use one commit per issue group:

```
fix(ui): replace duplicate FolderOpen icons in sidebar (#1, #2)
fix(ui): add user message bubble styling in ChatView (#3)
fix(ui): reduce ChatView header to ≤4 controls with overflow menu (#4)
fix(ui): move attach button inside input footer row (#5, #6)
fix(ui): replace empty state with actionable suggestion cards (#7)
fix(ui): replace all hardcoded color classes with CSS tokens (#8)
fix(ui): replace emoji tool icons with Lucide in RuntimeManagerView (#9)
fix(ui): replace ↺ character with RefreshCw icon in RightPanel (#10)
fix(ui): redesign audit tab entry cards (#11)
fix(ui): remove decorative logo and fix model pill in TopBar (#12)
fix(ui): add tooltips and agent dots to collapsed sidebar (#13)
fix(ui): remove @ts-nocheck and add proper types (#14)
fix(ui): humanise execution receipt status strings (#15)
fix(ui): fix non-existent surface-4 class in Button (#16)
fix(ui): reduce hero padding in MissionControlHome (#17)
fix(ui): polish tasks P1–P7
```

Each commit message must pass `npm run lint` before committing.

---

## Final Checklist Before Handing Back

The reviewer will run through every item below. If any fails, the handoff is incomplete.

- [ ] `npm run test` passes (1930+ tests, all green)
- [ ] `npm run build` passes (no TypeScript errors, no Vite build errors)
- [ ] `npm run lint` passes (no ESLint errors)
- [ ] Zero `@ts-nocheck` in any file you touched
- [ ] Zero `zinc-*`, `indigo-*`, `emerald-*` hardcoded color classes in changed files
- [ ] All Lucide imports are actually available from `lucide-react` (check before using any new icon)
- [ ] User message bubbles are visually distinct from assistant messages
- [ ] ChatView header shows ≤ 4 visible controls
- [ ] Attach button is inside the input footer, not floating above it
- [ ] Send button says "Send" / "Generating…"
- [ ] Empty state shows 4 suggestion cards
- [ ] All 8+ views are reachable from the sidebar
- [ ] No internal strings (`reported_to_jose`, `dead_letter`, `CHAT SESSION: anon123`) visible
- [ ] `Button variant="secondary"` has visible background
- [ ] RuntimeManagerView uses no emoji
- [ ] RightPanel security re-scan uses RefreshCw icon
- [ ] MissionControlHome shows "Next Actions" above the fold on 1280×800

---

*Handoff prepared by Claude Code — 2026-06-24. Branch: `feat/ui-ux-overhaul`.*
