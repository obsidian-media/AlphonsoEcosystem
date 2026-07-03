import { timestampMs } from './trustModel';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentInfo {
  key: string;
  name: string;
  role: string;
  lane: string;
  accent: string;
}

type MissionTaskStatus = 'todo' | 'doing' | 'review' | 'approved' | 'blocked';

type AgentKey = 'shayan' | 'alphonso' | 'jose' | 'hector' | 'miya' | 'maria' | 'marcus' | 'echo' | 'sentinel' | 'nova' | 'kairo';

interface MissionRoom {
  id: string;
  name: string;
  description: string;
  context: string;
  selectedAgents: string[];
  openParticipantSlots: string[];
  mode: string;
  createdAt: string;
  createdAtMs: number;
  updatedAt: string;
  updatedAtMs: number;
  [key: string]: unknown;
}

interface MissionMessage {
  id: string;
  roomId: string;
  speaker: string;
  role: string;
  content: string;
  originalHash: string;
  kind: string;
  status: string;
  riskLevel: string;
  approvalRequired: boolean;
  securityFlags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  createdAtMs: number;
}

interface MissionTask {
  id: string;
  roomId: string;
  title: string;
  owner: string;
  status: MissionTaskStatus;
  priority: string;
  acceptance: string;
  proof: string;
  riskLevel: string;
  approvalRequired: boolean;
  securityFlags: string[];
  sourceMessageId: string | null;
  createdAt: string;
  createdAtMs: number;
  updatedAt: string;
  updatedAtMs: number;
  [key: string]: unknown;
}

interface SecurityEvent {
  id: string;
  roomId: string;
  type: string;
  actor: string;
  riskLevel: string;
  summary: string;
  summaryHash: string;
  metadata: Record<string, unknown>;
  previousHash: string | null;
  eventHash?: string;
  createdAt: string;
  createdAtMs: number;
}

interface RiskClassification {
  riskLevel: 'high' | 'medium' | 'low';
  approvalRequired: boolean;
  secretDetected: boolean;
  flags: string[];
}

interface AddMessageParams {
  roomId?: string;
  speaker?: string;
  content?: string;
  status?: string;
  kind?: string;
  metadata?: Record<string, unknown>;
}

interface AddTaskParams {
  roomId?: string;
  title?: string;
  owner?: string;
  status?: MissionTaskStatus;
  priority?: string;
  acceptance?: string;
  proof?: string;
  sourceMessageId?: string | null;
}

interface TaskPatch {
  owner?: string;
  status?: MissionTaskStatus;
  [key: string]: unknown;
}

interface SecurityEventParams {
  roomId?: string;
  type?: string;
  actor?: string;
  riskLevel?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
}

interface HermesHandoffParams {
  objective?: string;
  project?: string;
  constraints?: string;
  acceptance?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ROOMS_KEY = 'alphonso_mission_room_rooms_v1';
const MESSAGES_KEY = 'alphonso_mission_room_messages_v1';
const TASKS_KEY = 'alphonso_mission_room_tasks_v1';
const SECURITY_EVENTS_KEY = 'alphonso_mission_room_security_events_v1';

function nowIso(): string {
  return new Date().toISOString();
}

function safeStorage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function readJson<T>(key: string, fallback: T): T {
  const storage = safeStorage();
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): T {
  const storage = safeStorage();
  if (!storage) return value;
  storage.setItem(key, JSON.stringify(value));
  return value;
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function hashText(text: string = ''): string {
  let hash = 2166136261;
  const input = String(text || '');
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{12,}\b/g,
  /\bntn_[A-Za-z0-9_-]{12,}\b/g,
  /\b[A-Za-z0-9_]*(?:API|TOKEN|SECRET|PASSWORD|KEY)[A-Za-z0-9_]*\s*[:=]\s*[^\s,;]+/gi,
  /Bearer\s+[A-Za-z0-9._-]{12,}/gi
];

const HIGH_RISK_PATTERNS: RegExp[] = [
  /\bpublish\b/i,
  /\bpush\b/i,
  /\bdeploy\b/i,
  /\bdelete\b/i,
  /\brm\s+-rf\b/i,
  /\bspend\b/i,
  /\bstripe\b/i,
  /\bproduction\b/i,
  /\bemail\b/i,
  /\bsend\s+(?:message|dm|text|email)\b/i,
  /\bsecret\b/i,
  /\bapi\s*key\b/i,
  /\btoken\b/i,
  /\bpassword\b/i
];

const MEDIUM_RISK_PATTERNS: RegExp[] = [
  /\bmodify\b/i,
  /\bedit\b/i,
  /\bwrite\b/i,
  /\binstall\b/i,
  /\bcredential\b/i,
  /\bintegration\b/i,
  /\bwebhook\b/i
];

// ── Agents ────────────────────────────────────────────────────────────────────

export const MISSION_ROOM_AGENTS: Record<string, AgentInfo> = {
  shayan: {
    key: 'shayan',
    name: 'Shayan',
    role: 'Founder / final approval',
    lane: 'human',
    accent: 'emerald'
  },
  alphonso: {
    key: 'alphonso',
    name: 'Alphonso',
    role: 'Local operator — execution, verification, packaging, backend/infra, deployments, CI/CD',
    lane: 'operator',
    accent: 'cyan'
  },
  jose: {
    key: 'jose',
    name: 'Jose',
    role: 'Orchestrator — intake, routing, merge, confirm, report',
    lane: 'orchestrator',
    accent: 'amber'
  },
  hector: {
    key: 'hector',
    name: 'Hector',
    role: 'Research + citations, source scan',
    lane: 'research',
    accent: 'violet'
  },
  miya: {
    key: 'miya',
    name: 'Miya',
    role: 'Creative — strategy, script, storyboard, export',
    lane: 'creative',
    accent: 'pink'
  },
  maria: {
    key: 'maria',
    name: 'Maria',
    role: 'Governance, audit, risk, approval review',
    lane: 'governance',
    accent: 'emerald'
  },
  marcus: {
    key: 'marcus',
    name: 'Marcus',
    role: 'Approved distribution execution',
    lane: 'distribution',
    accent: 'orange'
  },
  echo: {
    key: 'echo',
    name: 'Echo',
    role: 'Memory historian and archival',
    lane: 'memory',
    accent: 'blue'
  },
  sentinel: {
    key: 'sentinel',
    name: 'Sentinel',
    role: 'Security monitoring, automation safety',
    lane: 'security',
    accent: 'red'
  },
  nova: {
    key: 'nova',
    name: 'Nova',
    role: 'Frontend design, UI/UX, visual systems, layout, scoring, analysis, opportunity prioritization',
    lane: 'design',
    accent: 'fuchsia'
  },
  kairo: {
    key: 'kairo',
    name: 'Kairo',
    role: 'Backend engineering — systems, APIs, data, reliability, scaling',
    lane: 'backend',
    accent: 'sky'
  }
};

export const MISSION_TASK_STATUSES: MissionTaskStatus[] = ['todo', 'doing', 'review', 'approved', 'blocked'];

export const MISSION_ROOM_SECURITY_MODEL = {
  scope: 'local_browser_guardrail',
  guarantees: [
    'Messages, tasks, and handoffs are redacted for obvious secret patterns before local storage.',
    'High-risk language is flagged and marked approvalRequired.',
    'Security events keep a local hash chain for review.'
  ],
  nonGuarantees: [
    'localStorage is not tamper-proof.',
    'Browser UI checks are not a substitute for server-side ACLs or signed external-agent execution.',
    'External agents must still be sandboxed and manually approved before publishing, deleting, spending, or using secrets.'
  ]
};

function sanitizeAgentKey(key: string, fallback: string = 'alphonso'): string {
  return Object.prototype.hasOwnProperty.call(MISSION_ROOM_AGENTS, key) ? key : fallback;
}

function sanitizeTaskStatus(status: string): MissionTaskStatus {
  return (MISSION_TASK_STATUSES as string[]).includes(status) ? (status as MissionTaskStatus) : 'todo';
}

export function redactMissionRoomSecrets(content: string = ''): string {
  let redacted = String(content || '');
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED_SECRET]');
  }
  return redacted;
}

export function classifyMissionRoomRisk(content: string = ''): RiskClassification {
  const text = String(content || '');
  const secretDetected = SECRET_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
  const highMatches = HIGH_RISK_PATTERNS.filter((pattern) => pattern.test(text));
  const mediumMatches = MEDIUM_RISK_PATTERNS.filter((pattern) => pattern.test(text));
  const riskLevel: RiskClassification['riskLevel'] = secretDetected || highMatches.length ? 'high' : mediumMatches.length ? 'medium' : 'low';
  return {
    riskLevel,
    approvalRequired: riskLevel === 'high',
    secretDetected,
    flags: [
      ...(secretDetected ? ['secret_detected'] : []),
      ...highMatches.map((_, index) => `high_risk_${index + 1}`),
      ...mediumMatches.map((_, index) => `medium_risk_${index + 1}`)
    ]
  };
}

export function appendMissionSecurityEvent({ roomId = 'mission_room_main', type = 'event', actor = 'alphonso', riskLevel = 'low', summary = '', metadata = {} }: SecurityEventParams = {}): SecurityEvent {
  const rows = readJson<SecurityEvent[]>(SECURITY_EVENTS_KEY, []);
  const event: SecurityEvent = {
    id: makeId('mission_security'),
    roomId,
    type,
    actor: sanitizeAgentKey(actor, 'alphonso'),
    riskLevel,
    summary: redactMissionRoomSecrets(summary),
    summaryHash: hashText(summary),
    metadata,
    previousHash: rows[rows.length - 1]?.eventHash || null,
    createdAt: nowIso(),
    createdAtMs: timestampMs()
  };
  event.eventHash = hashText(JSON.stringify({ ...event, eventHash: undefined }));
  writeJson(SECURITY_EVENTS_KEY, [...rows, event].slice(-500));
  return event;
}

export function listMissionSecurityEvents(roomId: string = 'mission_room_main'): SecurityEvent[] {
  const rows = readJson<SecurityEvent[]>(SECURITY_EVENTS_KEY, []);
  return rows
    .filter((row) => row.roomId === roomId)
    .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
}

export function createDefaultMissionRoom(): MissionRoom {
  return {
    id: 'mission_room_main',
    name: 'ALPHONSO Mission Room',
    description: 'Shared command table for Shayan and the ALPHONSO agent board.',
    context: 'Coordinate projects, assign execution lanes, review evidence, and keep publish/external actions behind Shayan approval.',
    selectedAgents: Object.keys(MISSION_ROOM_AGENTS),
    openParticipantSlots: [],
    mode: 'mission-control',
    createdAt: nowIso(),
    createdAtMs: timestampMs(),
    updatedAt: nowIso(),
    updatedAtMs: timestampMs()
  };
}

export function listMissionRooms(): MissionRoom[] {
  const rooms = readJson<MissionRoom[]>(ROOMS_KEY, []);
  if (Array.isArray(rooms) && rooms.length) return rooms;
  const room = createDefaultMissionRoom();
  writeJson(ROOMS_KEY, [room]);
  return [room];
}

export function getMissionRoom(roomId: string = 'mission_room_main'): MissionRoom {
  const room = listMissionRooms().find((row) => row.id === roomId) || createDefaultMissionRoom();
  const validAgents = Object.keys(MISSION_ROOM_AGENTS);
  const selectedAgents = Array.isArray(room.selectedAgents)
    ? room.selectedAgents.filter((key) => validAgents.includes(key))
    : validAgents;
  if (selectedAgents.length !== room.selectedAgents?.length) {
    const next = { ...room, selectedAgents, updatedAt: nowIso(), updatedAtMs: timestampMs() };
    const rooms = listMissionRooms();
    writeJson(ROOMS_KEY, [{ ...next, id: room.id }, ...rooms.filter((row) => row.id !== room.id && row.id !== next.id)].slice(0, 20));
    return { ...next };
  }
  return { ...room, selectedAgents };
}

export function saveMissionRoom(room: MissionRoom): MissionRoom {
  const allowedAgents = Array.isArray(room.selectedAgents)
    ? room.selectedAgents.filter((agentKey) => Object.prototype.hasOwnProperty.call(MISSION_ROOM_AGENTS, agentKey))
    : ['shayan', 'alphonso', 'jose'];
  const next = {
    ...room,
    selectedAgents: allowedAgents.length ? allowedAgents : ['shayan', 'alphonso', 'jose'],
    updatedAt: nowIso(),
    updatedAtMs: timestampMs()
  };
  const rooms = listMissionRooms();
  writeJson(ROOMS_KEY, [next, ...rooms.filter((row) => row.id !== next.id)].slice(0, 20));
  return next;
}

export function listMissionMessages(roomId: string = 'mission_room_main'): MissionMessage[] {
  const rows = readJson<MissionMessage[]>(MESSAGES_KEY, []);
  return rows
    .filter((row) => row.roomId === roomId)
    .sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0));
}

export function addMissionMessage({ roomId = 'mission_room_main', speaker = 'shayan', content = '', status = 'success', kind = 'message', metadata = {} }: AddMessageParams = {}): MissionMessage | null {
  const originalText = String(content || '').trim();
  const text = redactMissionRoomSecrets(originalText).trim();
  if (!text) return null;
  const safeSpeaker = sanitizeAgentKey(speaker, 'shayan');
  const risk = classifyMissionRoomRisk(originalText);
  const message: MissionMessage = {
    id: makeId('mission_msg'),
    roomId,
    speaker: safeSpeaker,
    role: safeSpeaker === 'shayan' ? 'human' : 'agent',
    content: text,
    originalHash: hashText(originalText),
    kind,
    status,
    riskLevel: risk.riskLevel,
    approvalRequired: risk.approvalRequired,
    securityFlags: risk.flags,
    metadata: { ...metadata, secretRedacted: risk.secretDetected },
    createdAt: nowIso(),
    createdAtMs: timestampMs()
  };
  const rows = readJson<MissionMessage[]>(MESSAGES_KEY, []);
  writeJson(MESSAGES_KEY, [...rows, message].slice(-500));
  appendMissionSecurityEvent({
    roomId,
    type: risk.approvalRequired ? 'message_requires_approval' : 'message_recorded',
    actor: safeSpeaker,
    riskLevel: risk.riskLevel,
    summary: text,
    metadata: { messageId: message.id, flags: risk.flags }
  });
  return message;
}

export function clearMissionMessages(roomId: string = 'mission_room_main'): void {
  const rows = readJson<MissionMessage[]>(MESSAGES_KEY, []);
  writeJson(MESSAGES_KEY, rows.filter((row) => row.roomId !== roomId));
  appendMissionSecurityEvent({
    roomId,
    type: 'messages_cleared',
    actor: 'shayan',
    riskLevel: 'medium',
    summary: 'Local Mission Room messages cleared.'
  });
}

export function listMissionTasks(roomId: string = 'mission_room_main'): MissionTask[] {
  const rows = readJson<MissionTask[]>(TASKS_KEY, []);
  return rows
    .filter((row) => row.roomId === roomId)
    .sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));
}

export function addMissionTask({ roomId = 'mission_room_main', title = '', owner = 'hermes', status = 'todo', priority = 'P1', acceptance = '', proof = '', sourceMessageId = null }: AddTaskParams = {}): MissionTask | null {
  const original = `${title}\n${acceptance}\n${proof}`;
  const cleanTitle = redactMissionRoomSecrets(String(title || '')).trim();
  if (!cleanTitle) return null;
  const safeStatus = sanitizeTaskStatus(status);
  const safeOwner = sanitizeAgentKey(owner, 'hermes');
  const risk = classifyMissionRoomRisk(original);
  const task: MissionTask = {
    id: makeId('mission_task'),
    roomId,
    title: cleanTitle,
    owner: safeOwner,
    status: safeStatus,
    priority,
    acceptance: redactMissionRoomSecrets(String(acceptance || '')).trim(),
    proof: redactMissionRoomSecrets(String(proof || '')).trim(),
    riskLevel: risk.riskLevel,
    approvalRequired: risk.approvalRequired,
    securityFlags: risk.flags,
    sourceMessageId,
    createdAt: nowIso(),
    createdAtMs: timestampMs(),
    updatedAt: nowIso(),
    updatedAtMs: timestampMs()
  };
  const rows = readJson<MissionTask[]>(TASKS_KEY, []);
  writeJson(TASKS_KEY, [task, ...rows].slice(0, 250));
  appendMissionSecurityEvent({
    roomId,
    type: risk.approvalRequired ? 'task_requires_approval' : 'task_created',
    actor: safeOwner,
    riskLevel: risk.riskLevel,
    summary: cleanTitle,
    metadata: { taskId: task.id, flags: risk.flags }
  });
  return task;
}

export function updateMissionTask(taskId: string, patch: TaskPatch = {}): MissionTask | null {
  const rows = readJson<MissionTask[]>(TASKS_KEY, []);
  let updated: MissionTask | null = null;
  const nextRows = rows.map((task) => {
    if (task.id !== taskId) return task;
    updated = {
      ...task,
      ...Object.fromEntries(Object.entries(patch).map(([key, value]) => [
        key,
        typeof value === 'string' ? redactMissionRoomSecrets(value) : value
      ])),
      owner: patch.owner ? sanitizeAgentKey(patch.owner, task.owner) : task.owner,
      status: patch.status ? sanitizeTaskStatus(patch.status) : task.status,
      updatedAt: nowIso(),
      updatedAtMs: timestampMs()
    };
    return updated;
  });
  writeJson(TASKS_KEY, nextRows);
  if (updated) {
    appendMissionSecurityEvent({
      roomId: updated.roomId,
      type: 'task_updated',
      actor: updated.owner,
      riskLevel: updated.riskLevel || 'low',
      summary: `${updated.title} -> ${updated.status}`,
      metadata: { taskId: updated.id }
    });
  }
  return updated;
}

export function createHermesHandoff({ objective = '', project = '', constraints = '', acceptance = '' }: HermesHandoffParams = {}): string {
  const text = [
    'Role: Hermes, external executor worker.',
    `Project: ${redactMissionRoomSecrets(project || 'UNSPECIFIED')}`,
    `Objective: ${redactMissionRoomSecrets(objective || 'Audit and execute the assigned task.')}`,
    'Commander: Kite. Final approval: Shayan.',
    'Requirements:',
    '- Inspect before editing.',
    '- Separate proved facts from assumptions.',
    '- Do not publish, push, delete, spend money, or use secrets without Shayan approval.',
    '- Report changed files, verification commands, results, blockers, and risks.',
    '- If any task requires external action, secrets, production access, or destructive changes: stop and request Shayan approval in the Mission Room.',
    constraints ? `Constraints: ${redactMissionRoomSecrets(constraints)}` : 'Constraints: local/reversible work only unless approved.',
    acceptance ? `Acceptance criteria: ${redactMissionRoomSecrets(acceptance)}` : 'Acceptance criteria: clear status, evidence, and next action.'
  ].join('\n');
  return redactMissionRoomSecrets(text);
}
