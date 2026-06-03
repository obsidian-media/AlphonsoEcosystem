import { timestampMs } from './trustModel';

const ROOMS_KEY = 'alphonso_mission_room_rooms_v1';
const MESSAGES_KEY = 'alphonso_mission_room_messages_v1';
const TASKS_KEY = 'alphonso_mission_room_tasks_v1';
const SECURITY_EVENTS_KEY = 'alphonso_mission_room_security_events_v1';

function nowIso() {
  return new Date().toISOString();
}

function safeStorage() {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function readJson(key, fallback) {
  const storage = safeStorage();
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  const storage = safeStorage();
  if (!storage) return value;
  storage.setItem(key, JSON.stringify(value));
  return value;
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function hashText(text = '') {
  let hash = 2166136261;
  const input = String(text || '');
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{12,}\b/g,
  /\bntn_[A-Za-z0-9_-]{12,}\b/g,
  /\b[A-Za-z0-9_]*(?:API|TOKEN|SECRET|PASSWORD|KEY)[A-Za-z0-9_]*\s*[:=]\s*[^\s,;]+/gi,
  /Bearer\s+[A-Za-z0-9._-]{12,}/gi
];

const HIGH_RISK_PATTERNS = [
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

const MEDIUM_RISK_PATTERNS = [
  /\bmodify\b/i,
  /\bedit\b/i,
  /\bwrite\b/i,
  /\binstall\b/i,
  /\bcredential\b/i,
  /\bintegration\b/i,
  /\bwebhook\b/i
];

export const MISSION_ROOM_AGENTS = {
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
    role: 'Local operator — execution, verification, packaging',
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
    role: 'Scoring, analysis, opportunity prioritization',
    lane: 'analysis',
    accent: 'teal'
  }
};

export const MISSION_TASK_STATUSES = ['todo', 'doing', 'review', 'approved', 'blocked'];

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

function sanitizeAgentKey(key, fallback = 'kite') {
  return Object.prototype.hasOwnProperty.call(MISSION_ROOM_AGENTS, key) ? key : fallback;
}

function sanitizeTaskStatus(status) {
  return MISSION_TASK_STATUSES.includes(status) ? status : 'todo';
}

export function redactMissionRoomSecrets(content = '') {
  let redacted = String(content || '');
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED_SECRET]');
  }
  return redacted;
}

export function classifyMissionRoomRisk(content = '') {
  const text = String(content || '');
  const secretDetected = SECRET_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
  const highMatches = HIGH_RISK_PATTERNS.filter((pattern) => pattern.test(text));
  const mediumMatches = MEDIUM_RISK_PATTERNS.filter((pattern) => pattern.test(text));
  const riskLevel = secretDetected || highMatches.length ? 'high' : mediumMatches.length ? 'medium' : 'low';
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

export function appendMissionSecurityEvent({ roomId = 'mission_room_main', type = 'event', actor = 'kite', riskLevel = 'low', summary = '', metadata = {} } = {}) {
  const rows = readJson(SECURITY_EVENTS_KEY, []);
  const event = {
    id: makeId('mission_security'),
    roomId,
    type,
    actor: sanitizeAgentKey(actor, 'kite'),
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

export function listMissionSecurityEvents(roomId = 'mission_room_main') {
  const rows = readJson(SECURITY_EVENTS_KEY, []);
  return rows
    .filter((row) => row.roomId === roomId)
    .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
}

export function createDefaultMissionRoom() {
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

export function listMissionRooms() {
  const rooms = readJson(ROOMS_KEY, []);
  if (Array.isArray(rooms) && rooms.length) return rooms;
  const room = createDefaultMissionRoom();
  writeJson(ROOMS_KEY, [room]);
  return [room];
}

export function getMissionRoom(roomId = 'mission_room_main') {
  return listMissionRooms().find((room) => room.id === roomId) || listMissionRooms()[0];
}

export function saveMissionRoom(room) {
  const allowedAgents = Array.isArray(room.selectedAgents)
    ? room.selectedAgents.filter((agentKey) => Object.prototype.hasOwnProperty.call(MISSION_ROOM_AGENTS, agentKey))
    : ['shayan', 'kite', 'hermes'];
  const next = {
    ...room,
    selectedAgents: allowedAgents.length ? allowedAgents : ['shayan', 'kite', 'hermes'],
    updatedAt: nowIso(),
    updatedAtMs: timestampMs()
  };
  const rooms = listMissionRooms();
  writeJson(ROOMS_KEY, [next, ...rooms.filter((row) => row.id !== next.id)].slice(0, 20));
  return next;
}

export function listMissionMessages(roomId = 'mission_room_main') {
  const rows = readJson(MESSAGES_KEY, []);
  return rows
    .filter((row) => row.roomId === roomId)
    .sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0));
}

export function addMissionMessage({ roomId = 'mission_room_main', speaker = 'shayan', content = '', status = 'success', kind = 'message', metadata = {} } = {}) {
  const originalText = String(content || '').trim();
  const text = redactMissionRoomSecrets(originalText).trim();
  if (!text) return null;
  const safeSpeaker = sanitizeAgentKey(speaker, 'shayan');
  const risk = classifyMissionRoomRisk(originalText);
  const message = {
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
  const rows = readJson(MESSAGES_KEY, []);
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

export function clearMissionMessages(roomId = 'mission_room_main') {
  const rows = readJson(MESSAGES_KEY, []);
  writeJson(MESSAGES_KEY, rows.filter((row) => row.roomId !== roomId));
  appendMissionSecurityEvent({
    roomId,
    type: 'messages_cleared',
    actor: 'shayan',
    riskLevel: 'medium',
    summary: 'Local Mission Room messages cleared.'
  });
}

export function listMissionTasks(roomId = 'mission_room_main') {
  const rows = readJson(TASKS_KEY, []);
  return rows
    .filter((row) => row.roomId === roomId)
    .sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));
}

export function addMissionTask({ roomId = 'mission_room_main', title = '', owner = 'hermes', status = 'todo', priority = 'P1', acceptance = '', proof = '', sourceMessageId = null } = {}) {
  const original = `${title}\n${acceptance}\n${proof}`;
  const cleanTitle = redactMissionRoomSecrets(String(title || '')).trim();
  if (!cleanTitle) return null;
  const safeStatus = sanitizeTaskStatus(status);
  const safeOwner = sanitizeAgentKey(owner, 'hermes');
  const risk = classifyMissionRoomRisk(original);
  const task = {
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
  const rows = readJson(TASKS_KEY, []);
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

export function updateMissionTask(taskId, patch = {}) {
  const rows = readJson(TASKS_KEY, []);
  let updated = null;
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

export function createHermesHandoff({ objective = '', project = '', constraints = '', acceptance = '' } = {}) {
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
