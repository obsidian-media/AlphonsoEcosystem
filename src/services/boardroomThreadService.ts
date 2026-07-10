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
  seq: number;
  updatedAt: string;
  updatedAtMs: number;
}

export interface BoardroomThreadMessage {
  id: string;
  threadId: string;
  speaker: string;
  content: string;
  kind: 'message' | 'briefing' | 'conclusion' | 'system' | 'response' | 'escalation';
  riskLevel: 'high' | 'medium' | 'low';
  approvalRequired: boolean;
  secretRedacted: boolean;
  mentionedAgents: string[];
  createdAt: string;
  createdAtMs: number;
  seq: number;
}

const KNOWN_AGENT_IDS = ['alphonso', 'jose', 'hector', 'miya', 'maria', 'marcus', 'echo', 'sentinel', 'nova'];

function nowIso(): string {
  return new Date().toISOString();
}

function nowMs(): number {
  return Date.now();
}

// Date.now() has millisecond resolution; two records created in the same
// millisecond (common in tests, possible in real usage) would otherwise tie
// on createdAtMs and sort unpredictably. This monotonic counter is a
// tie-breaker only — it never affects the real timestamp, so it stays
// comparable against migrated legacy data's real epoch-ms values.
let sequenceCounter = 0;
function nextSeq(): number {
  sequenceCounter += 1;
  return sequenceCounter;
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
  return threads.slice().sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0) || (b.seq || 0) - (a.seq || 0));
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
    seq: nextSeq(),
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
    .sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0) || (a.seq || 0) - (b.seq || 0));
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
  const mentionedAgents = parseMentions(originalText, KNOWN_AGENT_IDS);
  const message: BoardroomThreadMessage = {
    id: makeId('boardroom_msg'),
    threadId,
    speaker,
    content: text,
    kind,
    riskLevel: risk.riskLevel,
    approvalRequired: risk.approvalRequired,
    secretRedacted: risk.secretDetected,
    mentionedAgents,
    createdAt: nowIso(),
    createdAtMs: nowMs(),
    seq: nextSeq()
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
      seq: nextSeq(),
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
      mentionedAgents: [],
      createdAt: m.timestamp,
      createdAtMs: new Date(m.timestamp).getTime() || createdAtMs + index,
      seq: nextSeq()
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
      mentionedAgents: [],
      createdAt: session.createdAt,
      createdAtMs: createdAtMs - 1,
      seq: 0
    });
    migratedMessages.sort((a, b) => a.createdAtMs - b.createdAtMs || a.seq - b.seq);

    const threads = readJson<BoardroomThread[]>(THREADS_KEY, []);
    writeJson(THREADS_KEY, [...threads, thread]);

    const allMessages = readJson<BoardroomThreadMessage[]>(MESSAGES_KEY, []);
    writeJson(MESSAGES_KEY, [...allMessages, ...migratedMessages]);
  }

  localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
}

// Matches an "@" that starts a word (preceded by start-of-string or
// whitespace) followed by word characters — this is what prevents
// "foo@hector.com" from matching: the "@" there is preceded by "o", not
// whitespace/start.
const MENTION_PATTERN = /(?:^|\s)@(\w+)/g;

export function parseMentions(text: string, knownAgentIds: string[]): string[] {
  const knownSet = new Set(knownAgentIds.map((id) => id.toLowerCase()));
  const found: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  MENTION_PATTERN.lastIndex = 0;
  while ((match = MENTION_PATTERN.exec(text)) !== null) {
    const candidate = match[1].toLowerCase();
    if (knownSet.has(candidate) && !seen.has(candidate)) {
      seen.add(candidate);
      found.push(candidate);
    }
  }
  return found;
}
