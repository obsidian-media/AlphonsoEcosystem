# Alphonso — Premium Design System Handoff

**Branch:** `feat/ui-ux-overhaul`
**Scope:** Visual identity, motion system, premium component redesigns
**Depends on:** `UI_UX_HANDOFF.md` (complete all 17 bug fixes first, then apply this)
**Reviewer after handoff:** Claude Code

---

## Philosophy: Bespoke AI Command Center — Not a Template

Alphonso is not a SaaS dashboard, not a chat wrapper, not a template.
It is a **9-agent AI command center for a power user who runs their business through it.**
The UI should feel like the cockpit of a private jet — purposeful, precise, slightly intimidating in the best way.
Every pixel earns its place.

**Reference aesthetic:** Arc browser × Linear × Vercel Dashboard × a Bloomberg terminal that had a glow-up.
NOT: shadcn/ui defaults, Notion, or any template that ships with a "how to use this" README.

Three words that must describe the finished result: **Precise. Alive. Yours.**

---

## Part 1 — The Color System (OKLCH-Based)

### Why OKLCH

The current token system uses hex values. Hex is perceptually non-uniform — `#22d3ee` and `#22c55e` appear to have wildly different brightness even though their numeric distance is similar. OKLCH fixes this: equal numeric distance = equal perceived distance.

### Alphonso's Complete OKLCH Palette

Replace `src/styles/tokens.css` with this. Keep all the same variable names — just upgrade the values to OKLCH and extend the palette with agent colors and the new depth system.

```css
/* src/styles/tokens.css — FULL REPLACEMENT */

@property --surface-glow {
  syntax: '<color>';
  inherits: false;
  initial-value: transparent;
}

:root {
  /* ── Surfaces (Deep Navy, not pure black — has blue-tinted depth) ── */
  --surface-0: oklch(10% 0.012 260);    /* #0a0c12 deepest bg */
  --surface-1: oklch(13% 0.015 260);    /* #111520 sidebar/panel */
  --surface-2: oklch(16% 0.016 260);    /* #161b27 card bg */
  --surface-3: oklch(20% 0.018 260);    /* #1e2333 hover/active */
  --surface-4: oklch(24% 0.018 260);    /* #252b3d input/elevated */
  --surface-glass: oklch(16% 0.016 260 / 0.7);  /* glassmorphism */

  /* ── Accent — Alphonso's signature electric cyan ── */
  --accent:        oklch(80% 0.18 196);   /* #22d3ee — primary */
  --accent-hover:  oklch(85% 0.18 196);   /* brighter on hover */
  --accent-muted:  oklch(80% 0.18 196 / 0.15);  /* dim fill */
  --accent-border: oklch(80% 0.18 196 / 0.28);  /* border tint */
  --accent-glow:   oklch(80% 0.18 196 / 0.12);  /* ambient glow */
  /* Legacy aliases — keep for compat */
  --accent-dim: var(--accent-muted);

  /* ── Agent Identity Colors (OKLCH, consistent lightness = 72%) ── */
  /* Each agent is visually distinct while staying in the same perceptual brightness band */
  --agent-alphonso: oklch(80% 0.18 196);   /* cyan    — core */
  --agent-jose:     oklch(72% 0.20 40);    /* amber   — orchestration */
  --agent-hector:   oklch(72% 0.17 256);   /* indigo  — research */
  --agent-miya:     oklch(72% 0.18 320);   /* violet  — creative */
  --agent-maria:    oklch(72% 0.16 160);   /* teal    — governance */
  --agent-marcus:   oklch(72% 0.20 25);    /* orange  — distribution */
  --agent-echo:     oklch(72% 0.14 280);   /* blue-violet — memory */
  --agent-sentinel: oklch(72% 0.22 15);    /* red     — security */
  --agent-nova:     oklch(72% 0.20 90);    /* lime    — opportunity */

  /* Agent glow variants (same hue, ~12% opacity) */
  --agent-jose-glow:     oklch(72% 0.20 40 / 0.12);
  --agent-hector-glow:   oklch(72% 0.17 256 / 0.12);
  --agent-miya-glow:     oklch(72% 0.18 320 / 0.12);
  --agent-maria-glow:    oklch(72% 0.16 160 / 0.12);
  --agent-marcus-glow:   oklch(72% 0.20 25 / 0.12);
  --agent-echo-glow:     oklch(72% 0.14 280 / 0.12);
  --agent-sentinel-glow: oklch(72% 0.22 15 / 0.12);
  --agent-nova-glow:     oklch(72% 0.20 90 / 0.12);

  /* ── Semantic ── */
  --success:      oklch(68% 0.20 142);   /* green */
  --success-dim:  oklch(68% 0.20 142 / 0.12);
  --warning:      oklch(78% 0.18 75);    /* amber */
  --warning-dim:  oklch(78% 0.18 75 / 0.12);
  --error:        oklch(65% 0.22 25);    /* red */
  --error-dim:    oklch(65% 0.22 25 / 0.12);
  --info:         oklch(72% 0.17 240);   /* sky blue */
  --info-dim:     oklch(72% 0.17 240 / 0.12);

  /* ── Text ── */
  --text-1: oklch(95% 0.005 260);   /* #f0f2f8 — primary text */
  --text-2: oklch(68% 0.015 260);   /* #9ba3bc — secondary */
  --text-3: oklch(45% 0.012 260);   /* #4f566b — muted */
  --text-4: oklch(32% 0.010 260);   /* #363d52 — ghost */

  /* ── Borders ── */
  --border:        oklch(100% 0 0 / 0.06);
  --border-strong: oklch(100% 0 0 / 0.12);
  --border-accent: var(--accent-border);

  /* ── Shadows — layered for depth ── */
  --shadow-sm:  0 1px 3px oklch(0% 0 0 / 0.5), 0 1px 2px oklch(0% 0 0 / 0.3);
  --shadow-md:  0 4px 12px oklch(0% 0 0 / 0.5), 0 2px 4px oklch(0% 0 0 / 0.3);
  --shadow-lg:  0 8px 32px oklch(0% 0 0 / 0.6), 0 4px 12px oklch(0% 0 0 / 0.4);
  --shadow-xl:  0 16px 48px oklch(0% 0 0 / 0.7), 0 8px 20px oklch(0% 0 0 / 0.4);
  --shadow-glow-sm:  0 0 12px var(--accent-glow), 0 0 4px var(--accent-glow);
  --shadow-glow-md:  0 0 24px var(--accent-glow), 0 0 8px var(--accent-glow);

  /* ── Spacing (4px base grid) ── */
  --space-px: 1px;
  --space-0: 0px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;

  /* ── Border radius ── */
  --radius-xs: 4px;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-xl: 18px;
  --radius-2xl: 24px;
  --radius-full: 9999px;

  /* ── Motion easing ── */
  --ease-snappy: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-out: cubic-bezier(0, 0, 0.2, 1);

  /* ── Durations ── */
  --duration-micro: 100ms;
  --duration-fast: 150ms;
  --duration-normal: 220ms;
  --duration-slow: 350ms;
  --duration-xslow: 550ms;

  /* ── Typography scale (Major Third — 1.25) ── */
  --text-2xs: clamp(9px, 0.6rem + 0.1vw, 10px);
  --text-xs:  clamp(11px, 0.7rem + 0.1vw, 12px);
  --text-sm:  clamp(12px, 0.8rem + 0.15vw, 14px);
  --text-base: clamp(14px, 0.9rem + 0.15vw, 16px);
  --text-lg:  clamp(16px, 1rem + 0.2vw, 18px);
  --text-xl:  clamp(18px, 1.1rem + 0.3vw, 22px);
  --text-2xl: clamp(22px, 1.4rem + 0.4vw, 28px);
  --text-3xl: clamp(28px, 1.8rem + 0.5vw, 36px);
}

/* ── Light mode override ── */
.light {
  --surface-0: oklch(98% 0.003 260);
  --surface-1: oklch(96% 0.004 260);
  --surface-2: oklch(93% 0.005 260);
  --surface-3: oklch(89% 0.006 260);
  --surface-4: oklch(85% 0.007 260);
  --surface-glass: oklch(97% 0.003 260 / 0.8);
  --text-1: oklch(18% 0.012 260);
  --text-2: oklch(35% 0.012 260);
  --text-3: oklch(55% 0.010 260);
  --text-4: oklch(72% 0.008 260);
  --border: oklch(0% 0 0 / 0.08);
  --border-strong: oklch(0% 0 0 / 0.14);
  --accent: oklch(55% 0.22 230);
  --accent-hover: oklch(50% 0.22 230);
  --accent-muted: oklch(55% 0.22 230 / 0.10);
  --accent-border: oklch(55% 0.22 230 / 0.25);
  --accent-glow: oklch(55% 0.22 230 / 0.08);
}
```

### Tailwind Config Update

Open `tailwind.config.js` and extend the theme to expose the agent colors and new token names:

```js
// In theme.extend.colors, add:
'agent-alphonso': 'var(--agent-alphonso)',
'agent-jose':     'var(--agent-jose)',
'agent-hector':   'var(--agent-hector)',
'agent-miya':     'var(--agent-miya)',
'agent-maria':    'var(--agent-maria)',
'agent-marcus':   'var(--agent-marcus)',
'agent-echo':     'var(--agent-echo)',
'agent-sentinel': 'var(--agent-sentinel)',
'agent-nova':     'var(--agent-nova)',
'surface-glass':  'var(--surface-glass)',

// Also add to boxShadow:
'glow-sm': 'var(--shadow-glow-sm)',
'glow-md': 'var(--shadow-glow-md)',
```

---

## Part 2 — Typography System

### Font Hierarchy

Alphonso already imports `Inter Variable` and `Plus Jakarta Sans Variable`. This is the right call. Now define a proper typographic hierarchy.

Add to `src/index.css` inside `@layer base`:

```css
@layer base {
  /* Heading font — Plus Jakarta Sans for character */
  h1, h2, h3, .font-heading {
    font-family: 'Plus Jakarta Sans Variable', system-ui, sans-serif;
    font-feature-settings: 'cv02', 'cv03', 'cv11';
    letter-spacing: -0.02em;
    line-height: 1.15;
  }

  /* Body + UI — Inter Variable */
  body, input, textarea, button, select {
    font-family: 'Inter Variable', system-ui, sans-serif;
    font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
    -webkit-font-smoothing: antialiased;
    font-size: var(--text-sm);
  }

  /* Monospace — for code, session IDs, kbd shortcuts */
  code, kbd, pre, .font-mono {
    font-family: 'Geist Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace;
    font-feature-settings: 'liga' 1, 'calt' 1;
  }

  /* Section labels — consistent throughout the app */
  .section-label {
    font-size: var(--text-2xs);
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-3);
    font-family: 'Inter Variable', system-ui, sans-serif;
  }

  /* Numeric/metric displays */
  .tabular-nums {
    font-variant-numeric: tabular-nums;
  }
}
```

---

## Part 3 — Motion System

### Install Framer Motion

```bash
npm install framer-motion
```

### Create Motion Constants File

Create `src/lib/motion.ts` — this becomes the single source of truth for all animation in the app:

```typescript
// src/lib/motion.ts
import type { Variants, Transition } from 'framer-motion';

// ── Spring configs ──────────────────────────────────────────────────────────
export const spring = {
  snappy:  { type: 'spring', stiffness: 500, damping: 35, mass: 0.8 } as Transition,
  smooth:  { type: 'spring', stiffness: 300, damping: 30, mass: 1.0 } as Transition,
  bouncy:  { type: 'spring', stiffness: 400, damping: 20, mass: 0.9 } as Transition,
  slow:    { type: 'spring', stiffness: 200, damping: 40, mass: 1.2 } as Transition,
} as const;

// ── Tween configs ───────────────────────────────────────────────────────────
export const tween = {
  fast:    { type: 'tween', duration: 0.15, ease: [0.16, 1, 0.3, 1] } as Transition,
  normal:  { type: 'tween', duration: 0.22, ease: [0.16, 1, 0.3, 1] } as Transition,
  slow:    { type: 'tween', duration: 0.35, ease: [0.4, 0, 0.2, 1] }  as Transition,
} as const;

// ── Shared entry/exit variants ──────────────────────────────────────────────
export const fadeUp: Variants = {
  hidden:  { opacity: 0, y: 8, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: spring.smooth },
  exit:    { opacity: 0, y: -4, scale: 0.99, transition: tween.fast },
};

export const fadeIn: Variants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: tween.normal },
  exit:    { opacity: 0, transition: tween.fast },
};

export const slideInRight: Variants = {
  hidden:  { opacity: 0, x: 16 },
  visible: { opacity: 1, x: 0, transition: spring.snappy },
  exit:    { opacity: 0, x: 16, transition: tween.fast },
};

export const scaleIn: Variants = {
  hidden:  { opacity: 0, scale: 0.92 },
  visible: { opacity: 1, scale: 1, transition: spring.bouncy },
  exit:    { opacity: 0, scale: 0.95, transition: tween.fast },
};

// ── Stagger containers ──────────────────────────────────────────────────────
export const staggerContainer: Variants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

export const staggerItem: Variants = {
  hidden:  { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: spring.smooth },
};

// ── Chat message variants ───────────────────────────────────────────────────
export const messageIn: Variants = {
  hidden:  { opacity: 0, y: 12, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: spring.snappy },
};

// ── Panel/modal variants ────────────────────────────────────────────────────
export const panelIn: Variants = {
  hidden:  { opacity: 0, scale: 0.96, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: spring.smooth },
  exit:    { opacity: 0, scale: 0.97, y: 4, transition: tween.fast },
};

// ── Sidebar variants ────────────────────────────────────────────────────────
export const sidebarExpand: Variants = {
  collapsed: { width: 56 },
  expanded:  { width: 208, transition: spring.snappy },
};

// ── Agent pulse ring — used in AgentStatusStrip ─────────────────────────────
export const agentPulse: Variants = {
  idle:    { scale: 1, opacity: 0.7 },
  active:  { scale: [1, 1.8, 1], opacity: [0.7, 0, 0.7], transition: { duration: 1.4, repeat: Infinity, ease: 'easeInOut' } },
};
```

### Apply Motion to Key Components

#### 1. Chat Messages — `src/components/ChatView.tsx`

Wrap the message list in `AnimatePresence` and each message bubble in `motion.div`:

```tsx
import { motion, AnimatePresence } from 'framer-motion';
import { messageIn } from '../lib/motion';

// Replace the message map:
<AnimatePresence initial={false} mode="popLayout">
  {visibleMessages.map((message) => (
    <motion.div
      key={message.id}
      variants={messageIn}
      initial="hidden"
      animate="visible"
      exit="exit"
      layout
      className={`flex ${compactChat ? 'gap-2' : 'gap-4'} max-w-3xl mx-auto w-full
        ${message.role === 'user' ? 'justify-end' : ''}`}
    >
      {/* message content — unchanged */}
    </motion.div>
  ))}
</AnimatePresence>
```

#### 2. Live Progress Bar — `src/components/ChatView.tsx`

Replace the static dot progress indicator with an animated bar:

```tsx
import { motion } from 'framer-motion';

{isGenerating && liveProgress && (
  <motion.div
    initial={{ opacity: 0, y: 4 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -4 }}
    className="flex items-center gap-3 max-w-3xl mx-auto w-full px-1"
  >
    <div className="w-7 h-7 rounded-lg bg-[var(--accent-muted)] border border-[var(--accent-border)] flex items-center justify-center shrink-0">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
        className="w-3.5 h-3.5 border-2 border-[var(--accent)] border-t-transparent rounded-full"
      />
    </div>
    <div className="flex-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-[var(--text-2)] font-medium">{/* stage label */}</span>
        <span className="text-[10px] text-[var(--text-4)] tabular-nums">{streamingElapsed}s</span>
      </div>
      <div className="h-0.5 rounded-full bg-[var(--surface-3)] overflow-hidden">
        <motion.div
          className="h-full bg-[var(--accent)] rounded-full"
          animate={{ x: ['-100%', '200%'] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
    </div>
  </motion.div>
)}
```

#### 3. Sidebar Nav Items

Replace the plain `<button>` nav items with `motion.button` for micro-interaction:

```tsx
import { motion } from 'framer-motion';

<motion.button
  key={item.id}
  onClick={() => setActiveTab(item.id)}
  whileHover={{ x: 2 }}
  whileTap={{ scale: 0.97 }}
  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
  className={`... existing classes ...`}
>
  <item.icon className={`...`} />
  {isOpen && <span>{item.label}</span>}
</motion.button>
```

#### 4. Notification/Toast Entry

Wrap `NotificationCenter.tsx` entries in motion:

```tsx
import { motion, AnimatePresence } from 'framer-motion';
import { slideInRight, fadeIn } from '../lib/motion';

// Each notification entry:
<motion.div
  key={notification.id}
  variants={slideInRight}
  initial="hidden"
  animate="visible"
  exit="exit"
  layout
>
  {/* notification content */}
</motion.div>
```

#### 5. Modals and Panels — `ApprovalModal.tsx`, `SentinelFindingModal.jsx`, memory search

```tsx
import { motion, AnimatePresence } from 'framer-motion';
import { panelIn, fadeIn } from '../lib/motion';

// Backdrop:
<motion.div variants={fadeIn} initial="hidden" animate="visible" exit="exit"
  className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
  onClick={onClose}
/>
// Panel:
<motion.div variants={panelIn} initial="hidden" animate="visible" exit="exit"
  className="..."
  onClick={e => e.stopPropagation()}
/>
```

---

## Part 4 — Premium Component Redesigns

### 4A — Sidebar Redesign (`src/components/Sidebar.tsx`)

The sidebar needs to feel like a premium native app sidebar — not a generic web nav.

**Key changes:**

1. **Active item indicator** — instead of a 2px left border, use a pill-shaped background that spans the full item width with a subtle glow:

```tsx
// Active state className:
activeTab === item.id
  ? 'bg-[var(--accent-muted)] text-[var(--text-1)] shadow-[inset_0_0_12px_var(--accent-glow)]'
  : 'text-[var(--text-3)] hover:bg-[var(--surface-3)] hover:text-[var(--text-2)]'

// Active icon — always accent color with glow:
activeTab === item.id
  ? 'text-[var(--accent)] drop-shadow-[0_0_6px_var(--accent)]'
  : ''
```

Remove the `border-l-2` pattern entirely. The pill background is the indicator.

2. **Sidebar texture** — add a very subtle noise texture to the sidebar background using a CSS pseudo-element:

```css
/* In index.css, inside @layer components: */
.sidebar-surface {
  position: relative;
}
.sidebar-surface::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E");
  pointer-events: none;
  border-radius: inherit;
  z-index: 0;
}
```

Add `sidebar-surface` class to the `<aside>` in Sidebar.tsx.

3. **Logo area refinement** — the logo area should have a separator that glows faintly:

```tsx
<div className="h-14 flex items-center px-4 border-b border-[var(--border)] shrink-0 relative">
  {/* subtle accent line at bottom of logo area */}
  <div className="absolute bottom-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-[var(--accent-border)] to-transparent" />
  {/* ... logo content ... */}
</div>
```

4. **Section labels** — make them feel intentional, not like an afterthought:

```tsx
{isOpen && section.label && (
  <div className="px-3 pt-5 pb-1.5 flex items-center gap-2">
    <span className="section-label">{section.label}</span>
    <div className="flex-1 h-px bg-[var(--border)]" />
  </div>
)}
```

### 4B — Chat Input Redesign (`src/components/ChatView.tsx`)

The input box is the most-used surface in the entire app. It needs to feel premium.

**Target aesthetic:** A glass card that lifts off the surface slightly, with a living accent border on focus.

```tsx
{/* Input container — replace existing div */}
<div
  className={`
    relative rounded-2xl transition-all duration-300
    bg-[var(--surface-glass)] backdrop-blur-xl
    border
    shadow-[var(--shadow-lg)]
    ${isDragging
      ? 'border-[var(--warning)] shadow-[0_0_24px_oklch(78%_0.18_75_/_0.15)]'
      : 'border-[var(--border-strong)] focus-within:border-[var(--accent-border)] focus-within:shadow-[0_0_24px_var(--accent-glow),var(--shadow-lg)]'
    }
    group
  `}
  onDragEnter={() => setIsDragging(true)}
  onDragLeave={() => setIsDragging(false)}
  onDragOver={e => e.preventDefault()}
  onDrop={handleDrop}
>
  {/* Shimmer progress line — only when generating */}
  {isGenerating && (
    <div className="absolute top-0 left-0 right-0 h-[1.5px] rounded-t-2xl overflow-hidden">
      <motion.div
        className="h-full w-1/3 bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent"
        animate={{ x: ['-100%', '400%'] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  )}

  {/* Textarea */}
  <textarea
    ref={inputRef}
    value={inputValue}
    onChange={e => setInputValue(e.target.value)}
    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
    placeholder="Ask anything, delegate a task, or build something…"
    className={`
      w-full bg-transparent text-[var(--text-1)] placeholder:text-[var(--text-4)]
      px-4 pt-4 pb-2 focus:outline-none resize-none scroll-m-0
      text-sm leading-relaxed
      ${compactChat ? 'min-h-[60px]' : 'min-h-[88px]'}
    `}
  />

  {/* Attached file pills */}
  {attachedFiles.length > 0 && (
    <div className="flex flex-wrap gap-1.5 px-4 pb-2">
      {attachedFiles.map((f, i) => (
        <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--surface-3)] border border-[var(--border-strong)] text-[11px] text-[var(--text-1)] font-medium">
          <Paperclip className="w-3 h-3 text-[var(--text-3)]" />
          {f.name}
          <button onClick={() => setAttachedFiles(p => p.filter((_, idx) => idx !== i))} className="text-[var(--text-3)] hover:text-[var(--error)] transition-colors ml-0.5" aria-label={`Remove ${f.name}`}>×</button>
        </span>
      ))}
    </div>
  )}

  {/* Footer row */}
  <div className="flex items-center justify-between px-3 pb-3">
    <div className="flex items-center gap-1">
      {/* Attach */}
      <button onClick={() => fileInputRef.current?.click()} className="p-2 rounded-xl text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)] transition-all" aria-label="Attach file">
        <Paperclip className="w-4 h-4" />
      </button>
      {/* Voice */}
      <Suspense fallback={null}>
        <VoiceInputButton voiceStatus={voice.voiceStatus} onToggle={voice.toggleListening} />
      </Suspense>
      {/* Status — subtle, inside footer */}
      <span className="ml-1 text-[11px] text-[var(--text-4)] hidden sm:block">
        {ollamaStatus.state === 'connected' ? settings.selectedModel : 'Ollama offline'}
      </span>
    </div>
    <div className="flex items-center gap-2">
      {isGenerating && (
        <motion.button
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
          onClick={() => abortRef.current?.abort()}
          className="h-8 px-3 rounded-xl flex items-center gap-1.5 text-xs font-semibold text-[var(--error)] bg-[var(--error-dim)] border border-[var(--error)]/20 hover:bg-[var(--error)]/20 transition-all"
        >
          <Square className="w-3 h-3" /> Stop
        </motion.button>
      )}
      <motion.button
        onClick={handleSend}
        disabled={isGenerating || !inputValue.trim()}
        whileHover={(!isGenerating && inputValue.trim()) ? { scale: 1.03, boxShadow: '0 0 16px var(--accent-glow)' } : {}}
        whileTap={(!isGenerating && inputValue.trim()) ? { scale: 0.97 } : {}}
        className={`
          h-8 px-4 rounded-xl flex items-center gap-2 text-xs font-bold tracking-wide transition-all
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50
          ${isGenerating || !inputValue.trim()
            ? 'bg-[var(--surface-3)] text-[var(--text-4)] cursor-not-allowed opacity-50'
            : 'bg-[var(--accent)] text-[var(--surface-0)] hover:bg-[var(--accent-hover)] shadow-[var(--shadow-md)]'
          }
        `}
        aria-label="Send message"
      >
        {isGenerating ? 'Generating…' : 'Send'}
        <Send className="w-3.5 h-3.5" />
      </motion.button>
    </div>
  </div>
</div>
```

### 4C — Chat Message Bubbles (`src/components/ChatView.tsx`)

User and assistant messages need to feel like a premium conversation interface — not a raw text dump.

**User message (right-aligned, accent bubble):**
```tsx
{message.role === 'user' && (
  <div className="flex justify-end w-full max-w-3xl mx-auto">
    <div className="
      max-w-[75%] px-4 py-2.5 rounded-2xl rounded-br-sm
      bg-[var(--accent)] text-[var(--surface-0)]
      text-sm leading-relaxed font-medium
      shadow-[var(--shadow-md),0_0_12px_var(--accent-glow)]
    ">
      {message.content}
    </div>
  </div>
)}
```

**Assistant message (left-aligned, surface card):**
```tsx
{message.role === 'assistant' && !message.isError && (
  <div className="flex gap-3 w-full max-w-3xl mx-auto">
    {/* Agent avatar — small, distinctive */}
    {!compactChat && (
      <div className="w-7 h-7 rounded-lg bg-[var(--accent-muted)] border border-[var(--accent-border)] flex items-center justify-center shrink-0 mt-0.5 shadow-[var(--shadow-glow-sm)]">
        <Bot className="w-3.5 h-3.5 text-[var(--accent)]" />
      </div>
    )}
    <div className="
      flex-1 px-4 py-3 rounded-2xl rounded-tl-sm
      bg-[var(--surface-2)] border border-[var(--border)]
      text-[var(--text-1)] text-sm leading-relaxed
      shadow-[var(--shadow-sm)]
      relative group
    ">
      <MarkdownMessage content={message.content} />
      {/* hover actions */}
      <div className="absolute top-2 right-2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* pin, copy */}
      </div>
    </div>
  </div>
)}
```

### 4D — Agent Status Strip (`src/components/AgentStatusStrip.tsx`)

Each active agent badge should use that agent's identity color, not a generic green.

```tsx
// Agent color map
const AGENT_COLORS: Record<string, string> = {
  alphonso:  'var(--agent-alphonso)',
  jose:      'var(--agent-jose)',
  hector:    'var(--agent-hector)',
  miya:      'var(--agent-miya)',
  maria:     'var(--agent-maria)',
  marcus:    'var(--agent-marcus)',
  echo:      'var(--agent-echo)',
  sentinel:  'var(--agent-sentinel)',
  nova:      'var(--agent-nova)',
};

const AGENT_GLOW: Record<string, string> = {
  alphonso:  'var(--accent-glow)',
  jose:      'var(--agent-jose-glow)',
  // ... etc
};

// Badge:
<motion.div
  key={agent.name}
  initial={{ opacity: 0, scale: 0.8 }}
  animate={{ opacity: 1, scale: 1 }}
  exit={{ opacity: 0, scale: 0.8 }}
  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
  className={`flex items-center gap-1.5 bg-[var(--surface-3)] rounded-full border border-[var(--border)] ${compact ? 'px-2 py-0.5' : 'px-2.5 py-1'}`}
  style={{
    boxShadow: `0 0 8px ${AGENT_GLOW[agent.name.toLowerCase()] ?? 'transparent'}`,
    borderColor: `color-mix(in oklch, ${AGENT_COLORS[agent.name.toLowerCase()] ?? 'var(--accent)'} 30%, var(--border))`
  }}
>
  <span className="relative flex h-2 w-2">
    <motion.span
      className="absolute inset-0 rounded-full"
      style={{ backgroundColor: AGENT_COLORS[agent.name.toLowerCase()] ?? 'var(--accent)' }}
      animate={{ scale: [1, 1.8, 1], opacity: [0.7, 0, 0.7] }}
      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
    />
    <span className="relative inline-flex rounded-full h-2 w-2"
      style={{ backgroundColor: AGENT_COLORS[agent.name.toLowerCase()] ?? 'var(--accent)' }}
    />
  </span>
  <span className={`font-semibold ${compact ? 'text-[10px]' : 'text-xs'} text-[var(--text-2)]`}>
    {agent.name}
  </span>
</motion.div>
```

### 4E — TopBar Redesign (`src/components/TopBar.tsx`)

The TopBar needs to feel like it belongs to a premium desktop product.

```tsx
<header className="
  h-11 flex items-center justify-between px-4
  border-b border-[var(--border)]
  bg-[var(--surface-glass)] backdrop-blur-xl
  sticky top-0 z-20
  relative
">
  {/* Subtle gradient accent at bottom edge */}
  <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--accent-border)] to-transparent opacity-60" />

  <div className="flex items-center gap-3">
    <h1 className="text-sm font-semibold text-[var(--text-1)] tracking-tight">
      {PAGE_TITLES[activeTab] ?? 'Alphonso'}
    </h1>
    {!isOnline && (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--warning-dim)] border border-[var(--warning)]/20 text-[11px] font-semibold text-[var(--warning)]">
        <WifiOff className="w-3 h-3" /> Offline
      </span>
    )}
  </div>

  <div className="flex items-center gap-2">
    {operatorMode && (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-widest uppercase bg-[var(--warning-dim)] text-[var(--warning)] border border-[var(--warning)]/20">
        Operator
      </span>
    )}
    {settings.zeroCostMode && (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-widest uppercase bg-[var(--success-dim)] text-[var(--success)] border border-[var(--success)]/20">
        Free Mode
      </span>
    )}
    {onToggleNotifications && (
      <button onClick={onToggleNotifications} className="relative p-1.5 rounded-lg text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)] transition-all" aria-label="Notifications">
        <Bell className="w-4 h-4" />
        {notificationCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-[var(--accent)] text-[9px] font-bold text-[var(--surface-0)] flex items-center justify-center leading-none shadow-[var(--shadow-glow-sm)]">
            {notificationCount > 9 ? '9+' : notificationCount}
          </span>
        )}
      </button>
    )}
    {/* Model status pill */}
    <div className={`
      flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors
      ${selectedModelMissing
        ? 'bg-[var(--warning-dim)] border-[var(--warning)]/25 text-[var(--warning)]'
        : ollamaStatus.state === 'connected'
          ? 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-2)]'
          : 'bg-[var(--error-dim)] border-[var(--error)]/25 text-[var(--error)]'
      }
    `}>
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
        selectedModelMissing ? 'bg-[var(--warning)]' :
        ollamaStatus.state === 'connected' ? 'bg-[var(--success)]' : 'bg-[var(--error)]'
      }`} />
      <span className="truncate max-w-[120px]">
        {selectedModelMissing ? `${settings.selectedModel} (missing)` : settings.selectedModel ?? 'No model'}
      </span>
    </div>
  </div>
</header>
```

### 4F — Dashboard Hero (`src/components/MissionControlHome.jsx`)

The hero needs depth and life — not just a banner image with opacity.

Add an animated ambient gradient layer behind the hero content:

```jsx
{/* Hero section */}
<div className="relative overflow-hidden rounded-3xl">
  {/* Banner image */}
  <img src={alphonsoBanner} alt="" className="absolute inset-0 h-full w-full object-cover opacity-15 saturate-110" />
  {/* Gradient overlay */}
  <div className="absolute inset-0 bg-gradient-to-r from-[var(--surface-0)] via-[var(--surface-0)]/85 to-transparent" />
  {/* Animated ambient orb — top right */}
  <div className="absolute -top-12 -right-12 w-64 h-64 rounded-full bg-[var(--accent-glow)] blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
  {/* Content */}
  <div className="relative px-8 py-8 md:px-12 md:py-10">
    {/* ... hero content ... */}
  </div>
</div>
```

### 4G — RightPanel (`src/components/RightPanel.tsx`)

Give the diagnostic rows a premium treatment with per-state subtle glow:

```tsx
function DiagnosticRow({ label, value, state }: DiagnosticRowProps) {
  const isHealthy = state === 'connected';
  const isWarning = state === 'warning' || state === 'model_missing' || state === 'no_models';
  const isError = state === 'disconnected';

  return (
    <div className={`
      flex items-center gap-3 py-2 px-3 rounded-xl transition-colors
      ${isError ? 'bg-[var(--error-dim)]' : 'hover:bg-[var(--surface-3)]'}
    `}>
      <span className={`
        h-2 w-2 rounded-full shrink-0
        ${isHealthy ? 'bg-[var(--success)] shadow-[0_0_6px_var(--success)]' :
          isWarning ? 'bg-[var(--warning)]' :
          isError   ? 'bg-[var(--error)]'   : 'bg-[var(--text-4)]'}
      `} />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-[var(--text-3)] font-medium uppercase tracking-wide">{label}</p>
        <p className="text-xs font-semibold text-[var(--text-1)] truncate mt-0.5">{value}</p>
      </div>
    </div>
  );
}
```

---

## Part 5 — Global CSS Polish

Add to `src/index.css` inside `@layer components`:

```css
@layer components {
  /* ── Premium card system ── */
  .card-premium {
    background: var(--surface-glass);
    backdrop-filter: blur(16px);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-md);
  }

  /* ── Glass panel ── */
  .glass {
    background: var(--surface-glass);
    backdrop-filter: blur(20px) saturate(140%);
    -webkit-backdrop-filter: blur(20px) saturate(140%);
  }

  /* ── Glow text — for accent headings ── */
  .text-glow {
    text-shadow: 0 0 20px var(--accent-glow), 0 0 8px var(--accent-glow);
  }

  /* ── Gradient border trick — for premium card borders ── */
  .border-gradient {
    position: relative;
    border: 1px solid transparent;
    background-clip: padding-box;
  }
  .border-gradient::before {
    content: '';
    position: absolute;
    inset: -1px;
    border-radius: inherit;
    background: linear-gradient(135deg, var(--accent-border), transparent 50%, var(--border));
    z-index: -1;
  }

  /* ── Shimmer animation ── */
  @keyframes shimmer {
    0%   { transform: translateX(-100%); }
    100% { transform: translateX(300%); }
  }
  .animate-shimmer { animation: shimmer 1.8s ease-in-out infinite; }

  /* ── Section label ── */
  .section-label {
    font-size: var(--text-2xs);
    font-weight: 600;
    letter-spacing: 0.10em;
    text-transform: uppercase;
    color: var(--text-3);
  }

  /* ── Focus ring ── */
  .focus-ring {
    @apply focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--surface-0)];
  }

  /* ── Scrollbar (refined) ── */
  * {
    scrollbar-width: thin;
    scrollbar-color: color-mix(in oklch, var(--accent) 20%, var(--surface-3)) transparent;
  }
  *::-webkit-scrollbar { width: 4px; height: 4px; }
  *::-webkit-scrollbar-thumb {
    background: color-mix(in oklch, var(--accent) 25%, var(--surface-4));
    border-radius: 9999px;
  }
  *::-webkit-scrollbar-thumb:hover {
    background: color-mix(in oklch, var(--accent) 40%, var(--surface-4));
  }
  *::-webkit-scrollbar-track { background: transparent; }
}
```

---

## Part 6 — Micro-Interaction System

### Hover States — Buttons

All interactive elements should respond to hover with a consistent lift:

```css
@layer components {
  .btn-lift {
    transition: transform var(--duration-fast) var(--ease-snappy),
                box-shadow var(--duration-fast) var(--ease-snappy);
  }
  .btn-lift:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: var(--shadow-md);
  }
  .btn-lift:active:not(:disabled) {
    transform: translateY(0px) scale(0.98);
    box-shadow: var(--shadow-sm);
  }
}
```

Add `btn-lift` to all primary action buttons.

### Keyboard Shortcuts — `<kbd>` Element

```css
@layer components {
  kbd {
    display: inline-flex;
    align-items: center;
    padding: 1px 6px;
    font-size: var(--text-2xs);
    font-family: var(--font-mono);
    background: var(--surface-3);
    border: 1px solid var(--border-strong);
    border-bottom-width: 2px;
    border-radius: var(--radius-sm);
    color: var(--text-2);
    line-height: 1.6;
  }
}
```

### Copy Feedback — Chat Messages

When a message is copied (ChatView `copiedMsgId` state), show a fleeting success tick:

```tsx
// In the copy button:
<AnimatePresence mode="wait">
  {copiedMsgId === message.id ? (
    <motion.span key="check" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
      <Check className="w-3 h-3 text-[var(--success)]" />
    </motion.span>
  ) : (
    <motion.span key="copy" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
      <Copy className="w-3 h-3" />
    </motion.span>
  )}
</AnimatePresence>
```

---

## Part 7 — Nova, Sentinel & Approval — Premium Card Treatments

These three components appear inline in the chat — they need to feel like premium "interrupt" cards, not alert boxes.

### Nova Insight Card (ChatView.tsx ~line 1064)

```tsx
<motion.div
  variants={fadeUp}
  initial="hidden" animate="visible" exit="exit"
  className="mx-auto w-full max-w-3xl"
>
  <div className="
    rounded-2xl border border-[var(--accent-border)]
    bg-gradient-to-br from-[var(--accent-muted)] to-[var(--surface-2)]
    p-4 relative overflow-hidden
  ">
    {/* Background glow orb */}
    <div className="absolute -top-6 -right-6 w-32 h-32 bg-[var(--accent-glow)] rounded-full blur-2xl" />
    <div className="relative">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-[var(--accent-muted)] border border-[var(--accent-border)] flex items-center justify-center">
            <Lightbulb className="w-3.5 h-3.5 text-[var(--accent)]" />
          </div>
          <span className="text-xs font-bold text-[var(--accent)] uppercase tracking-widest">Nova Insight</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
            novaInsight.score >= 80 ? 'bg-[var(--success-dim)] border-[var(--success)]/20 text-[var(--success)]' :
            novaInsight.score >= 60 ? 'bg-[var(--warning-dim)] border-[var(--warning)]/20 text-[var(--warning)]' :
            'bg-[var(--surface-3)] border-[var(--border)] text-[var(--text-2)]'
          }`}>
            {novaInsight.score} / 100
          </span>
        </div>
        <button onClick={() => setNovaInsight(null)} className="p-1 rounded-lg text-[var(--text-4)] hover:text-[var(--text-2)] hover:bg-[var(--surface-3)] transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {novaInsight.recommendation && (
        <p className="text-sm text-[var(--text-1)] leading-relaxed">{novaInsight.recommendation}</p>
      )}
    </div>
  </div>
</motion.div>
```

### Sentinel Finding Badge (RightPanel.tsx)

Each finding row should show severity as a colored left border:

```tsx
{sentinelScan.findings.slice(0, 3).map((f, i) => (
  <motion.button
    key={i}
    initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
    onClick={() => setSelectedFinding(f)}
    className={`
      w-full text-left px-3 py-2 rounded-lg text-[11px] text-[var(--text-2)]
      hover:bg-[var(--surface-3)] transition-colors
      border-l-2
      ${f.severity === 'critical' ? 'border-[var(--error)]' :
        f.severity === 'high'     ? 'border-[var(--warning)]' :
        f.severity === 'medium'   ? 'border-[var(--info)]' :
                                    'border-[var(--border-strong)]'}
    `}
  >
    <span className="truncate block">{f.type ?? f.pattern ?? 'Threat'}</span>
  </motion.button>
))}
```

---

## Part 8 — Performance Rules (Non-Negotiable)

1. **Only animate `transform` and `opacity`** — no `width`, `height`, `top`, `left`, `background-color` in keyframe animations. Use `scaleX` not `width`.
2. **All `motion.*` components must have `layout={false}`** unless you explicitly need layout animation — unnecessary layout recalculation is expensive.
3. **`backdrop-filter: blur()`** is expensive. Only use on the TopBar, input box, and modals — not on every card in a list.
4. **`AnimatePresence` with `mode="popLayout"`** for message lists (already in Part 3). This prevents the exit animation from blocking new content.
5. **`will-change: transform`** — add to any element that animates on every frame (the shimmer bar, spinning loader). Remove it after the animation ends.
6. **No layout-triggering hover effects** — `transform: translateY(-1px)` not `margin-top: -1px`.

---

## Acceptance Checklist

The reviewer (Claude Code) will check every item:

- [ ] `npm run test` passes (1930+ tests, all green)
- [ ] `npm run build` passes with zero TypeScript errors
- [ ] `src/styles/tokens.css` uses OKLCH throughout, no hex in color tokens
- [ ] All 9 agents have distinct identity colors applied in `AgentStatusStrip`
- [ ] Chat user messages have the accent-colored bubble with glow shadow
- [ ] Chat input has glassmorphism treatment with living accent border on focus
- [ ] Generating state shows animated shimmer progress bar (not static dots only)
- [ ] `src/lib/motion.ts` exists and exports all variants
- [ ] Framer Motion applied to: chat messages, sidebar nav, notifications, modals
- [ ] No `backdrop-filter: blur()` on list items or repeated cards
- [ ] All interactive elements have `transition-all` and respond to hover/active
- [ ] TopBar has the gradient separator line at the bottom
- [ ] Sidebar active item uses pill glow, not left border
- [ ] `section-label` class used consistently (no raw `text-[10px] uppercase tracking-widest` inline)
- [ ] Premium `<kbd>` element styling applied
- [ ] Copy feedback shows Check icon when copied (AnimatePresence)
- [ ] Agent colors applied in Nova insight card border/glow
- [ ] Sentinel finding rows have severity-colored left border
- [ ] Dashboard hero has ambient animated orb
- [ ] Scrollbar uses accent-tinted thumb color
- [ ] Zero hardcoded hex or `zinc-*`/`indigo-*` color classes in changed files
- [ ] Light mode works correctly with new OKLCH tokens

---

## Commit Format

```
design: replace hex tokens with OKLCH palette + agent identity colors
design: add Framer Motion system (src/lib/motion.ts + all entry variants)
design: premium chat input with glassmorphism and animated shimmer
design: accent bubble user messages + premium assistant card
design: agent-colored status badges with identity glow
design: topbar glassmorphism, gradient separator, premium model pill
design: sidebar pill-glow active state, noise texture, animated nav
design: premium Nova insight card with ambient glow orb
design: sentinel finding rows with severity border + motion entry
design: dashboard hero ambient orb, reduced padding
design: global CSS polish — glass system, btn-lift, kbd styling, scrollbar
```

---

*Design system handoff prepared by Claude Code — 2026-06-24. Branch: `feat/ui-ux-overhaul`.*
*Read `UI_UX_HANDOFF.md` first (bug fixes). This document is the premium layer on top.*
