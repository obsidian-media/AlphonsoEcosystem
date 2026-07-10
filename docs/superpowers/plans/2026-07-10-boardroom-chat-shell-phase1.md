# Boardroom Chat Shell — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Boardroom's current session-log data model and UI with a real
multi-thread chat data layer and a chat-shell UI (message list + composer,
per-agent avatar/name bubbles), migrating existing session data — the
foundation every later phase (@mentions, agent-to-agent visible messaging,
critique engine, cards, escalation, etc.) builds on top of.

**Architecture:** New `boardroomThreadService.ts` owns thread + message
persistence, reusing `missionRoomService.ts`'s `redactMissionRoomSecrets()`
and `classifyMissionRoomRisk()` directly (proven, already-tested primitives —
not duplicated). New `BoardroomChatView.tsx` replaces `BoardroomView.tsx` as
the mounted component, rendering a thread switcher + scrollable message list
+ composer. No AI generation, no @mentions, no cards yet — this phase only
gets you a real, persistent, multi-thread chat shell where you can create
threads and post messages as any of the 9 agents or yourself. That is
deliberately the entire scope: everything else is a separate plan.

**Tech Stack:** React 18 + TypeScript, existing `agentRegistry.js` roster,
existing `missionRoomService.ts` redaction/risk functions, `localStorage`
persistence (matches `BoardroomView.tsx`'s existing pattern — not
`durableStore.js`, since `missionRoomService.ts` also uses raw `localStorage`
and this phase reuses its functions directly; do not mix persistence
strategies within one data layer).

---

## Task 1: Thread + message data layer

**Files:**
- Create: `src/services/boardroomThreadService.ts`
- Test: `src/test/services/boardroomThreadService.test.ts`

- [ ] **Step 1: Write the failing test for `createThread`/`listThreads`**

```typescript
// src/test/services/boardroomThreadService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

describe('boardroomThreadService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('createThread / listThreads', () => {
    it('creates a thread and returns it in listThreads', async () => {
      const { createThread, listThreads } = await import('../../services/boardroomThreadService');
      const thread = createThread({ topic: 'Q3 Growth Plan', participants: ['jose', 'hector'] });
      expect(thread.id).toBeTruthy();
      expect(thread.topic).toBe('Q3 Growth Plan');
      expect(thread.participants).toEqual(['jose', 'hector']);
      expect(thread.status).toBe('active');

      const threads = listThreads();
      expect(threads).toHaveLength(1);
      expect(threads[0].id).toBe(thread.id);
    });

    it('lists threads newest-first', async () => {
      const { createThread, listThreads } = await import('../../services/boardroomThreadService');
      const first = createThread({ topic: 'First', participants: ['jose'] });
      const second = createThread({ topic: 'Second', participants: ['jose'] });
      const threads = listThreads();
      expect(threads[0].id).toBe(second.id);
      expect(threads[1].id).toBe(first.id);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/services/boardroomThreadService.test.ts`
Expected: FAIL — `Cannot find module '../../services/boardroomThreadService'`

- [ ] **Step 3: Write the thread CRUD implementation**

```typescript
// src/services/boardroomThreadService.ts
import { redactMissionRoomSecrets, classifyMissionRoomRisk } from './missionRoomService';

const THREADS_KEY = 'alphonso_boardroom_threads_v2';
const MESSAGES_KEY = 'alphonso_boardroom_thread_messages_v2';

export interface BoardroomThread {
  id: string;
  topic: string;
  participants: string[];
  status: 'active' | 'concluded';
  createdAt: string;
  createdAtMs: number;
  updatedAt: string;
  updatedAtMs: number;
}

export interface BoardroomThreadMessage {
  id: string;
  threadId: string;
  speaker: string;
  content: string;
  kind: 'message' | 'briefing' | 'conclusion' | 'system';
  riskLevel: 'high' | 'medium' | 'low';
  approvalRequired: boolean;
  secretRedacted: boolean;
  createdAt: string;
  createdAtMs: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function nowMs(): number {
  return Date.now();
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): T {
  localStorage.setItem(key, JSON.stringify(value));
  return value;
}

export function listThreads(): BoardroomThread[] {
  const threads = readJson<BoardroomThread[]>(THREADS_KEY, []);
  return threads.slice().sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
}

export function getThread(threadId: string): BoardroomThread | null {
  return listThreads().find((t) => t.id === threadId) || null;
}

export function createThread({ topic, participants }: { topic: string; participants: string[] }): BoardroomThread {
  const thread: BoardroomThread = {
    id: makeId('boardroom_thread'),
    topic: redactMissionRoomSecrets(topic).trim(),
    participants,
    status: 'active',
    createdAt: nowIso(),
    createdAtMs: nowMs(),
    updatedAt: nowIso(),
    updatedAtMs: nowMs()
  };
  const threads = readJson<BoardroomThread[]>(THREADS_KEY, []);
  writeJson(THREADS_KEY, [...threads, thread]);
  return thread;
}

export function updateThreadStatus(threadId: string, status: BoardroomThread['status']): BoardroomThread | null {
  const threads = readJson<BoardroomThread[]>(THREADS_KEY, []);
  let updated: BoardroomThread | null = null;
  const next = threads.map((t) => {
    if (t.id !== threadId) return t;
    updated = { ...t, status, updatedAt: nowIso(), updatedAtMs: nowMs() };
    return updated;
  });
  writeJson(THREADS_KEY, next);
  return updated;
}

export function listThreadMessages(threadId: string): BoardroomThreadMessage[] {
  const rows = readJson<BoardroomThreadMessage[]>(MESSAGES_KEY, []);
  return rows
    .filter((row) => row.threadId === threadId)
    .sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0));
}

export function addThreadMessage({
  threadId,
  speaker,
  content,
  kind = 'message'
}: {
  threadId: string;
  speaker: string;
  content: string;
  kind?: BoardroomThreadMessage['kind'];
}): BoardroomThreadMessage | null {
  const originalText = String(content || '').trim();
  if (!originalText) return null;
  const text = redactMissionRoomSecrets(originalText).trim();
  const risk = classifyMissionRoomRisk(originalText);
  const message: BoardroomThreadMessage = {
    id: makeId('boardroom_msg'),
    threadId,
    speaker,
    content: text,
    kind,
    riskLevel: risk.riskLevel,
    approvalRequired: risk.approvalRequired,
    secretRedacted: risk.secretDetected,
    createdAt: nowIso(),
    createdAtMs: nowMs()
  };
  const rows = readJson<BoardroomThreadMessage[]>(MESSAGES_KEY, []);
  writeJson(MESSAGES_KEY, [...rows, message].slice(-2000));

  const threads = readJson<BoardroomThread[]>(THREADS_KEY, []);
  writeJson(
    THREADS_KEY,
    threads.map((t) => (t.id === threadId ? { ...t, updatedAt: nowIso(), updatedAtMs: nowMs() } : t))
  );

  return message;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/services/boardroomThreadService.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the failing test for `addThreadMessage` + risk/redaction reuse**

```typescript
// append to src/test/services/boardroomThreadService.test.ts, inside the same describe block

  describe('addThreadMessage', () => {
    it('adds a message and lists it via listThreadMessages', async () => {
      const { createThread, addThreadMessage, listThreadMessages } = await import('../../services/boardroomThreadService');
      const thread = createThread({ topic: 'Test', participants: ['jose'] });
      const msg = addThreadMessage({ threadId: thread.id, speaker: 'jose', content: 'Delegating to Hector.' });
      expect(msg).not.toBeNull();
      expect(msg?.speaker).toBe('jose');

      const messages = listThreadMessages(thread.id);
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Delegating to Hector.');
    });

    it('reuses classifyMissionRoomRisk — flags high-risk content and requires approval', async () => {
      const { createThread, addThreadMessage } = await import('../../services/boardroomThreadService');
      const thread = createThread({ topic: 'Test', participants: ['marcus'] });
      const msg = addThreadMessage({ threadId: thread.id, speaker: 'marcus', content: 'Ready to publish this to production.' });
      expect(msg?.riskLevel).toBe('high');
      expect(msg?.approvalRequired).toBe(true);
    });

    it('reuses redactMissionRoomSecrets — strips API keys before persisting', async () => {
      const { createThread, addThreadMessage } = await import('../../services/boardroomThreadService');
      const thread = createThread({ topic: 'Test', participants: ['alphonso'] });
      const msg = addThreadMessage({ threadId: thread.id, speaker: 'alphonso', content: 'Key is sk-abc123def456ghi789' });
      expect(msg?.content).not.toContain('sk-abc123def456ghi789');
      expect(msg?.content).toContain('[REDACTED_SECRET]');
      expect(msg?.secretRedacted).toBe(true);
    });

    it('returns null for empty content', async () => {
      const { createThread, addThreadMessage } = await import('../../services/boardroomThreadService');
      const thread = createThread({ topic: 'Test', participants: ['jose'] });
      const msg = addThreadMessage({ threadId: thread.id, speaker: 'jose', content: '   ' });
      expect(msg).toBeNull();
    });
  });
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/test/services/boardroomThreadService.test.ts`
Expected: PASS (6 tests total)

- [ ] **Step 7: Commit**

```bash
git add src/services/boardroomThreadService.ts src/test/services/boardroomThreadService.test.ts
git commit -m "feat(boardroom): add multi-thread data layer, reusing Mission Room's redaction/risk primitives"
```

---

## Task 2: Legacy session migration

**Files:**
- Modify: `src/services/boardroomThreadService.ts`
- Test: `src/test/services/boardroomThreadService.test.ts`

- [ ] **Step 1: Write the failing test for migration**

```typescript
// append to src/test/services/boardroomThreadService.test.ts, inside the same describe block

  describe('migrateLegacySessions', () => {
    const LEGACY_KEY = 'alphonso_boardroom_sessions_v1';
    const MIGRATION_FLAG_KEY = 'alphonso_boardroom_migration_v2_done';

    it('converts each legacy session into a thread with its messages replayed', async () => {
      const legacySession = {
        sessionId: 'boardroom_123',
        topic: 'Legacy Topic',
        participants: ['jose', 'hector'],
        status: 'concluded',
        mariaScore: 42,
        conclusion: 'Concluded with 2 agents. Maria risk score: 42.',
        createdAt: '2026-06-01T00:00:00.000Z',
        messages: [
          { agentId: 'hector', agentName: 'Hector', content: 'Research briefing:\n• source', timestamp: '2026-06-01T00:01:00.000Z', type: 'briefing' },
          { agentId: 'jose', agentName: 'Jose', content: 'Task delegated.', timestamp: '2026-06-01T00:02:00.000Z', type: 'response' }
        ]
      };
      localStorage.setItem(LEGACY_KEY, JSON.stringify([legacySession]));

      const { migrateLegacySessions, listThreads, listThreadMessages } = await import('../../services/boardroomThreadService');
      migrateLegacySessions();

      const threads = listThreads();
      expect(threads).toHaveLength(1);
      expect(threads[0].topic).toBe('Legacy Topic');
      expect(threads[0].status).toBe('concluded');

      const messages = listThreadMessages(threads[0].id);
      expect(messages).toHaveLength(3); // 2 original + 1 "migrated from legacy" system note
      expect(messages.some((m) => m.content.includes('Research briefing'))).toBe(true);
      expect(messages.some((m) => m.content.includes('Task delegated'))).toBe(true);
    });

    it('is idempotent — running twice does not duplicate threads', async () => {
      localStorage.setItem(LEGACY_KEY, JSON.stringify([{
        sessionId: 'boardroom_456',
        topic: 'Once Only',
        participants: ['jose'],
        status: 'active',
        createdAt: '2026-06-01T00:00:00.000Z',
        messages: []
      }]));

      const { migrateLegacySessions, listThreads } = await import('../../services/boardroomThreadService');
      migrateLegacySessions();
      migrateLegacySessions();

      expect(listThreads()).toHaveLength(1);
    });

    it('does nothing when there are no legacy sessions', async () => {
      const { migrateLegacySessions, listThreads } = await import('../../services/boardroomThreadService');
      migrateLegacySessions();
      expect(listThreads()).toHaveLength(0);
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/services/boardroomThreadService.test.ts`
Expected: FAIL — `migrateLegacySessions is not a function`

- [ ] **Step 3: Add the migration function**

```typescript
// append to src/services/boardroomThreadService.ts

const LEGACY_SESSIONS_KEY = 'alphonso_boardroom_sessions_v1';
const MIGRATION_FLAG_KEY = 'alphonso_boardroom_migration_v2_done';

interface LegacyBoardroomMessage {
  agentId: string;
  agentName: string;
  content: string;
  timestamp: string;
  type: 'response' | 'briefing' | 'conclusion';
}

interface LegacyBoardroomSession {
  sessionId: string;
  topic: string;
  participants: string[];
  messages: LegacyBoardroomMessage[];
  status: 'idle' | 'active' | 'concluded';
  mariaScore?: number;
  conclusion?: string;
  createdAt: string;
}

export function migrateLegacySessions(): void {
  if (localStorage.getItem(MIGRATION_FLAG_KEY) === 'true') return;

  const legacySessions = readJson<LegacyBoardroomSession[]>(LEGACY_SESSIONS_KEY, []);
  if (legacySessions.length === 0) {
    localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
    return;
  }

  for (const session of legacySessions) {
    const createdAtMs = new Date(session.createdAt).getTime() || nowMs();
    const thread: BoardroomThread = {
      id: makeId('boardroom_thread'),
      topic: session.topic,
      participants: session.participants,
      status: session.status === 'concluded' ? 'concluded' : 'active',
      createdAt: session.createdAt,
      createdAtMs,
      updatedAt: session.createdAt,
      updatedAtMs: createdAtMs
    };

    const migratedMessages: BoardroomThreadMessage[] = session.messages.map((m, index) => ({
      id: makeId('boardroom_msg'),
      threadId: thread.id,
      speaker: m.agentId,
      content: m.content,
      kind: m.type,
      riskLevel: 'low',
      approvalRequired: false,
      secretRedacted: false,
      createdAt: m.timestamp,
      createdAtMs: new Date(m.timestamp).getTime() || createdAtMs + index
    }));

    migratedMessages.push({
      id: makeId('boardroom_msg'),
      threadId: thread.id,
      speaker: 'alphonso',
      content: 'This thread was migrated from a legacy Boardroom session — earlier messages may render without full metadata (risk tags, @mentions).',
      kind: 'system',
      riskLevel: 'low',
      approvalRequired: false,
      secretRedacted: false,
      createdAt: session.createdAt,
      createdAtMs: createdAtMs - 1
    });
    migratedMessages.sort((a, b) => a.createdAtMs - b.createdAtMs);

    const threads = readJson<BoardroomThread[]>(THREADS_KEY, []);
    writeJson(THREADS_KEY, [...threads, thread]);

    const allMessages = readJson<BoardroomThreadMessage[]>(MESSAGES_KEY, []);
    writeJson(MESSAGES_KEY, [...allMessages, ...migratedMessages]);
  }

  localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/services/boardroomThreadService.test.ts`
Expected: PASS (9 tests total)

- [ ] **Step 5: Commit**

```bash
git add src/services/boardroomThreadService.ts src/test/services/boardroomThreadService.test.ts
git commit -m "feat(boardroom): migrate legacy alphonso_boardroom_sessions_v1 into the new thread model"
```

---

## Task 3: Chat shell UI

**Files:**
- Create: `src/components/BoardroomChatView.tsx`
- Test: `src/test/boardroomChatView.test.jsx`

- [ ] **Step 1: Write the failing test for rendering + sending a message**

```jsx
// src/test/boardroomChatView.test.jsx
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../agents/agentRegistry', () => ({
  listAgentProfiles: () => [
    { id: 'jose', name: 'Jose', accentColor: 'amber' },
    { id: 'hector', name: 'Hector', accentColor: 'violet' }
  ]
}));

describe('BoardroomChatView', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows the empty state with no threads', async () => {
    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);
    expect(screen.getByText(/no threads yet/i)).toBeInTheDocument();
  });

  it('creates a thread and shows it in the thread list', async () => {
    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Q3 Growth Plan' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));

    expect(await screen.findByText('Q3 Growth Plan')).toBeInTheDocument();
  });

  it('sends a message as the selected speaker and shows it in the thread', async () => {
    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Test Thread' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Test Thread');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: 'Hello room' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    expect(await screen.findByText('Hello room')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/boardroomChatView.test.jsx`
Expected: FAIL — `Cannot find module '../components/BoardroomChatView'`

- [ ] **Step 3: Write the chat shell component**

```tsx
// src/components/BoardroomChatView.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Send } from 'lucide-react';
import { listAgentProfiles } from '../agents/agentRegistry';
import {
  createThread,
  listThreads,
  listThreadMessages,
  addThreadMessage,
  migrateLegacySessions,
  type BoardroomThread,
  type BoardroomThreadMessage
} from '../services/boardroomThreadService';

const AGENT_PROFILES = listAgentProfiles();

function agentLabel(speakerId: string): string {
  if (speakerId === 'user') return 'You';
  const profile = AGENT_PROFILES.find((p: { id: string }) => p.id === speakerId);
  return profile?.name || speakerId;
}

function MessageBubble({ message }: { message: BoardroomThreadMessage }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-[var(--text-1)]">{agentLabel(message.speaker)}</span>
        {message.approvalRequired && (
          <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-300">
            approval required
          </span>
        )}
      </div>
      <div className="mt-1 whitespace-pre-wrap text-[var(--text-2)]">{message.content}</div>
    </div>
  );
}

export function BoardroomChatView() {
  const [threads, setThreads] = useState<BoardroomThread[]>(() => {
    migrateLegacySessions();
    return listThreads();
  });
  const [activeThreadId, setActiveThreadId] = useState<string | null>(() => threads[0]?.id ?? null);
  const [messages, setMessages] = useState<BoardroomThreadMessage[]>(() =>
    activeThreadId ? listThreadMessages(activeThreadId) : []
  );
  const [newTopic, setNewTopic] = useState('');
  const [composerText, setComposerText] = useState('');
  const [composerSpeaker, setComposerSpeaker] = useState('user');

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId) ?? null,
    [threads, activeThreadId]
  );

  useEffect(() => {
    setMessages(activeThreadId ? listThreadMessages(activeThreadId) : []);
  }, [activeThreadId]);

  function handleCreateThread() {
    if (!newTopic.trim()) return;
    const thread = createThread({
      topic: newTopic.trim(),
      participants: AGENT_PROFILES.map((p: { id: string }) => p.id)
    });
    setThreads(listThreads());
    setActiveThreadId(thread.id);
    setNewTopic('');
  }

  function handleSend() {
    if (!activeThreadId || !composerText.trim()) return;
    addThreadMessage({ threadId: activeThreadId, speaker: composerSpeaker, content: composerText.trim() });
    setMessages(listThreadMessages(activeThreadId));
    setComposerText('');
  }

  return (
    <div className="h-full flex overflow-hidden">
      <div className="w-56 shrink-0 border-r border-[var(--border)] overflow-y-auto p-3 space-y-3">
        <div className="space-y-2">
          <input
            value={newTopic}
            onChange={(e) => setNewTopic(e.target.value)}
            placeholder="New thread topic..."
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs text-[var(--text-1)] outline-none"
          />
          <button
            onClick={handleCreateThread}
            disabled={!newTopic.trim()}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--accent)] px-2.5 py-1.5 text-xs font-semibold text-[var(--surface-0)] disabled:opacity-40"
          >
            <Plus className="h-3 w-3" /> New Thread
          </button>
        </div>
        {threads.length === 0 ? (
          <p className="text-xs text-[var(--text-3)]">No threads yet.</p>
        ) : (
          <div className="space-y-1">
            {threads.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveThreadId(t.id)}
                className={`w-full truncate rounded-lg px-2.5 py-1.5 text-left text-xs ${
                  t.id === activeThreadId ? 'bg-[var(--accent-dim)] text-[var(--accent)]' : 'text-[var(--text-2)] hover:bg-[var(--surface-2)]'
                }`}
              >
                {t.topic}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {activeThread ? (
          <>
            <div className="flex-1 overflow-y-auto space-y-2 p-4">
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
            </div>
            <div className="flex items-center gap-2 border-t border-[var(--border)] p-3">
              <select
                value={composerSpeaker}
                onChange={(e) => setComposerSpeaker(e.target.value)}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-xs text-[var(--text-1)]"
              >
                <option value="user">You</option>
                {AGENT_PROFILES.map((p: { id: string; name: string }) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <input
                value={composerText}
                onChange={(e) => setComposerText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSend();
                }}
                placeholder="Message the room..."
                className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-sm text-[var(--text-1)] outline-none"
              />
              <button
                onClick={handleSend}
                disabled={!composerText.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--surface-0)] disabled:opacity-40"
              >
                <Send className="h-3 w-3" /> Send
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-[var(--text-3)]">
            Select or create a thread to start.
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/boardroomChatView.test.jsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/BoardroomChatView.tsx src/test/boardroomChatView.test.jsx
git commit -m "feat(boardroom): add chat-shell UI — thread switcher, message list, composer"
```

---

## Task 4: Wire into App.tsx

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/test/appLazyImports.test.js` (verify it still passes — no change expected, but this is the exact regression test that caught the last lazy-import bug in this file, per `CLAUDE.md`)

- [ ] **Step 1: Find the current BoardroomView lazy import**

Run: `grep -n "BoardroomView" src/App.tsx`
Expected output includes a line like:
```
const BoardroomView = lazy(() => import('./components/BoardroomView').then((mod) => ({ default: mod.BoardroomView })));
```

- [ ] **Step 2: Replace the import to point at the new component**

In `src/App.tsx`, change:
```typescript
const BoardroomView = lazy(() => import('./components/BoardroomView').then((mod) => ({ default: mod.BoardroomView })));
```
to:
```typescript
const BoardroomView = lazy(() => import('./components/BoardroomChatView').then((mod) => ({ default: mod.BoardroomChatView })));
```

Do not rename the `BoardroomView` local identifier — every other reference to it in `App.tsx` (routing, sidebar nav) stays unchanged; only the import target and export name being unwrapped change.

- [ ] **Step 3: Run the lazy-import regression test**

Run: `npx vitest run src/test/appLazyImports.test.js`
Expected: PASS — this test statically parses every `lazy()` call in `App.tsx` and checks the target module's real export shape matches what the `.then()` mapping expects. It exists specifically because a mismatch here (missing `.then()` mapping, or mapping to a name the module doesn't export) previously crashed the entire app the instant a user opened Boardroom. Confirms `BoardroomChatView.tsx`'s named export (`BoardroomChatView`) matches the new `.then()` mapping.

- [ ] **Step 4: Manually verify Boardroom opens without crashing**

Run: `npm run dev`, open the app, navigate to Boardroom in the sidebar. Confirm:
- The empty-state ("No threads yet") or thread list renders — not a blank screen or console error.
- If old `alphonso_boardroom_sessions_v1` data exists in this browser profile, confirm migrated threads appear in the thread list.
- Create a new thread, send a message as yourself and as one agent, confirm both render.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(boardroom): mount BoardroomChatView in place of the old session-log BoardroomView"
```

---

## Task 5: Full-suite verification

- [ ] **Step 1: Run the full affected test set**

Run: `npx vitest run src/test/services/boardroomThreadService.test.ts src/test/boardroomChatView.test.jsx src/test/appLazyImports.test.js`
Expected: PASS — 13 tests total (9 + 3 + 1, exact count may vary slightly depending on `appLazyImports.test.js`'s existing test count).

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: clean, 0 errors.

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: clean (or only the pre-existing unrelated `ChatView.tsx` warning noted in prior sessions — do not fix that here, out of scope).

- [ ] **Step 4: Report back before starting Phase 2**

Per the handoff doc's own process ("run the full test suite, confirm nothing existing regressed, and report back before moving to the next step"), stop here. Do not start Task 2's spec item (@mention parser + router) until this phase has been reviewed.

---

## Explicitly NOT in this phase (deferred to later plans)

- @mention parsing/autocomplete/routing (spec 1.3, Step 2.2)
- Any AI generation — this phase's composer only lets you *manually* post as any agent, exactly like Mission Room's existing behavior; real LLM-driven replies are Phase 2+
- Agent-to-agent visible messaging (spec 1.4, Step 2.3) — requires deciding how to reconcile `agentBusService`, `a2aProtocolService`, and this new thread model first, per the Step 0 report
- Card types (spec 1.5, Step 2.5)
- Escalation, debate-loop cap, regenerate/diff, model/latency indicator, cross-thread memory, confidence scoring, ack states, failure/timeout handling, stop/cancel (spec 1.10.1–1.10.5, 1.10.7, 1.10.9–1.10.12)
- The external-action confirmation gate (spec 1.10.13) — genuinely important and should come early in Phase 2+, but there is no external action possible yet in this phase (composer only writes to local thread storage), so there is nothing to gate yet
- Resource contention handling (spec 1.10.14) — not relevant until real concurrent agent generation exists
- Voice input (1.10.6) and mobile parity (1.10.8) — deferred per explicit user instruction
