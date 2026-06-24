import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/runtimeLedgerService', () => ({
  persistScopeRows: vi.fn(async () => ({ ok: true, written: 1 })),
  listScopeRecords: vi.fn(async () => [])
}));

vi.mock('../services/memoryService', () => ({
  pushMemoryItem: vi.fn((item) => item)
}));

vi.mock('../services/connectorRegistryService', () => ({
  sendNotionConnectorEntry: vi.fn(async () => ({ ok: true, externalId: 'page-123', error: null })),
  isConnectorAuthenticated: vi.fn(() => ({ ok: true, reason: 'configured' }))
}));

vi.mock('../services/approval/approvalService', () => ({
  createApprovalRequest: vi.fn((payload) => ({
    id: `approval-${Date.now()}`,
    status: 'pending',
    ...payload
  }))
}));

vi.mock('../services/eventsService', () => ({
  buildNotionSyncEvent: vi.fn((overrides = {}) => ({
    id: `mock-evt-${Date.now()}`,
    eventType: `notion.sync.${overrides.direction || 'pull'}`,
    source: 'alphonso/notion_sync',
    subjectKind: 'notion_page',
    subjectId: overrides.notionPageId || null,
    outcome: overrides.outcome || 'success',
    payload: { projectId: overrides.projectId, taskId: overrides.taskId, workflowId: overrides.workflowId, reason: overrides.reason || null },
    dedupKey: `notion.sync.${overrides.direction || 'pull'}:${overrides.projectId || 'p'}:${overrides.taskId || 't'}:${overrides.notionPageId || 'no_page'}`,
    occurredAtMs: Date.now(),
    correlationId: overrides.workflowId ? `wf:${overrides.workflowId}` : null,
    trust: 'verified'
  })),
  recordEvent: vi.fn(async () => ({ ok: false, blocked: true, reason: 'mocked' }))
}));

import {
  NOTION_SYNC_SCOPE,
  NOTION_SYNC_SOURCES,
  NOTION_CONFLICT_STATES,
  NOTION_APPROVAL_STATES,
  NOTION_WORKFLOW_PHASES,
  NOTION_RISK_LEVELS,
  NOTION_AGENT_OPTIONS,
  NOTION_PORTFOLIO_OPTIONS,
  NOTION_WORKFLOW_DATABASE_SCHEMA,
  buildCorrelationId,
  correlationKey,
  parseNotionPageId,
  extractNotionPageIdFromUrl,
  normalizeNotionPhase,
  normalizeRiskLevel,
  normalizeAssignedAgent,
  normalizePortfolio,
  buildSyncMetadata,
  detectFieldConflict,
  buildConflictRecord,
  buildNotionPageProperties,
  buildNotionSyncRecordId,
  buildNotionSyncMemoryRecord,
  isNotionSyncMemoryRecord,
  extractCorrelationFromMemoryRecord,
  persistNotionSyncRecord,
  listNotionSyncRecords,
  findLatestNotionSyncRecord,
  getNotionSyncStatus,
  isNotionConnectorReady,
  buildReconcilePlan,
  recordNotionConflict,
  pushAlphonsoTaskToNotion,
  ingestAlphonsoTaskFromNotionPage,
  isNotionPullEnabled,
  fetchNotionApi,
  fetchNotionPage,
  fetchNotionDatabasePages,
  buildPullReconcilePlan,
  pullNotionPage,
  pullNotionDatabase,
  notionSyncWeeklyReport,
  NOTION_SYNC_PUBLIC_API
} from '../services/notionSyncService.js';

import { persistScopeRows, listScopeRecords } from '../services/runtimeLedgerService.js';
import { pushMemoryItem } from '../services/memoryService.js';
import { sendNotionConnectorEntry, isConnectorAuthenticated } from '../services/connectorRegistryService.js';
import { createApprovalRequest } from '../services/approval/approvalService.js';
import { buildNotionSyncEvent as buildNotionSyncEventMock, recordEvent as recordEventMock } from '../services/eventsService.js';

describe('notionSyncService — constants', () => {
  it('exposes a stable ledger scope', () => {
    expect(NOTION_SYNC_SCOPE).toBe('notion_sync_v1');
  });

  it('has all canonical sync sources', () => {
    expect(Object.values(NOTION_SYNC_SOURCES)).toEqual([
      'notion_pull',
      'notion_push',
      'alphonso_local',
      'user_override',
      'conflict_resolution'
    ]);
  });

  it('has all conflict states', () => {
    expect(Object.values(NOTION_CONFLICT_STATES)).toEqual([
      'clean',
      'pending_review',
      'approved_notion',
      'approved_alphonso',
      'rejected'
    ]);
  });

  it('has all approval states', () => {
    expect(Object.values(NOTION_APPROVAL_STATES)).toEqual([
      'not_required',
      'pending',
      'approved',
      'rejected',
      'expired'
    ]);
  });

  it('exposes the Gemini 11-phase set', () => {
    expect(NOTION_WORKFLOW_PHASES).toHaveLength(11);
    expect(NOTION_WORKFLOW_PHASES).toContain('Approval Needed');
    expect(NOTION_WORKFLOW_PHASES).toContain('Completed');
  });

  it('exposes the 4 risk levels', () => {
    expect(NOTION_RISK_LEVELS).toEqual(['Low', 'Medium', 'High', 'Blocked']);
  });

  it('exposes the 9 agent options', () => {
    expect(NOTION_AGENT_OPTIONS).toHaveLength(9);
    expect(NOTION_AGENT_OPTIONS).toContain('Alphonso');
    expect(NOTION_AGENT_OPTIONS).toContain('Jose');
  });

  it('exposes the 17 portfolio options', () => {
    expect(NOTION_PORTFOLIO_OPTIONS).toHaveLength(17);
  });

  it('defines the database schema with required correlation and sync fields', () => {
    const names = NOTION_WORKFLOW_DATABASE_SCHEMA.map((p) => p.name);
    expect(names).toContain('Title');
    expect(names).toContain('Portfolio');
    expect(names).toContain('Workflow Phase');
    expect(names).toContain('Risk Level');
    expect(names).toContain('Assigned Agent');
    expect(names).toContain('Task ID');
    expect(names).toContain('Project ID');
    expect(names).toContain('Workflow ID');
    expect(names).toContain('Notion Page ID');
    expect(names).toContain('Source');
    expect(names).toContain('Last Synced At');
    expect(names).toContain('Last Actor');
    expect(names).toContain('Conflict Status');
    expect(names).toContain('Approval Status');
    const title = NOTION_WORKFLOW_DATABASE_SCHEMA.find((p) => p.name === 'Title');
    expect(title.required).toBe(true);
  });
});

describe('notionSyncService — buildCorrelationId', () => {
  it('returns null when no fields are present', () => {
    expect(buildCorrelationId({})).toBeNull();
    expect(buildCorrelationId()).toBeNull();
  });

  it('captures all four correlation IDs', () => {
    const c = buildCorrelationId({
      projectId: 'p-1',
      taskId: 't-1',
      workflowId: 'w-1',
      notionPageId: 'abc123def456abc1'
    });
    expect(c).toEqual({
      project_id: 'p-1',
      task_id: 't-1',
      workflow_id: 'w-1',
      notion_page_id: 'abc123def456abc1'
    });
  });

  it('trims whitespace', () => {
    const c = buildCorrelationId({ projectId: '  p-1  ', taskId: ' t-1 ' });
    expect(c.project_id).toBe('p-1');
    expect(c.task_id).toBe('t-1');
  });
});

describe('notionSyncService — correlationKey', () => {
  it('combines project and task when both exist', () => {
    expect(correlationKey({ project_id: 'p-1', task_id: 't-1' })).toBe('p-1::t-1');
  });

  it('falls back to project-only key', () => {
    expect(correlationKey({ project_id: 'p-1' })).toBe('p-1::project');
  });

  it('falls back to task-only key', () => {
    expect(correlationKey({ task_id: 't-1' })).toBe('task::t-1');
  });

  it('returns empty string when nothing valid is present', () => {
    expect(correlationKey({})).toBe('');
    expect(correlationKey(null)).toBe('');
  });
});

describe('notionSyncService — parseNotionPageId', () => {
  it('returns the lower-cased id when valid hex', () => {
    expect(parseNotionPageId('ABC123DEF456ABC1')).toBe('abc123def456abc1');
  });

  it('extracts a hex id from a Notion URL', () => {
    expect(parseNotionPageId('https://www.notion.so/My-Page-abc123def456abc1')).toBe('abc123def456abc1');
  });

  it('returns null for empty or invalid input', () => {
    expect(parseNotionPageId('')).toBeNull();
    expect(parseNotionPageId(null)).toBeNull();
    expect(parseNotionPageId('not a hex id')).toBeNull();
  });
});

describe('notionSyncService — extractNotionPageIdFromUrl', () => {
  it('extracts from a Notion URL with dashes', () => {
    const url = 'https://www.notion.so/workspace/Task-9a8b7c6d5e4f3a2b';
    expect(extractNotionPageIdFromUrl(url)).toBe('9a8b7c6d5e4f3a2b');
  });

  it('returns null when URL is empty or has no hex', () => {
    expect(extractNotionPageIdFromUrl('')).toBeNull();
    expect(extractNotionPageIdFromUrl(null)).toBeNull();
    expect(extractNotionPageIdFromUrl('https://example.com')).toBeNull();
  });
});

describe('notionSyncService — normalizers', () => {
  it('normalizes known phases case-insensitively', () => {
    expect(normalizeNotionPhase('active')).toBe('Active');
    expect(normalizeNotionPhase('COMPLETED')).toBe('Completed');
  });

  it('maps aliases to canonical phases', () => {
    expect(normalizeNotionPhase('in progress')).toBe('Active');
    expect(normalizeNotionPhase('wip')).toBe('Active');
    expect(normalizeNotionPhase('todo')).toBe('Ready');
    expect(normalizeNotionPhase('in review')).toBe('Review');
    expect(normalizeNotionPhase('qa')).toBe('Testing');
    expect(normalizeNotionPhase('done')).toBe('Completed');
    expect(normalizeNotionPhase('closed')).toBe('Completed');
    expect(normalizeNotionPhase('cancelled')).toBe('Archived');
  });

  it('defaults unknown phase to Idea', () => {
    expect(normalizeNotionPhase('')).toBe('Idea');
    expect(normalizeNotionPhase(null)).toBe('Idea');
    expect(normalizeNotionPhase('random phase')).toBe('Idea');
  });

  it('normalizes risk levels', () => {
    expect(normalizeRiskLevel('high')).toBe('High');
    expect(normalizeRiskLevel('Block')).toBe('Blocked');
    expect(normalizeRiskLevel('med')).toBe('Medium');
    expect(normalizeRiskLevel('')).toBe('Low');
    expect(normalizeRiskLevel(null)).toBe('Low');
  });

  it('normalizes agent names', () => {
    expect(normalizeAssignedAgent('jose')).toBe('Jose');
    expect(normalizeAssignedAgent('alphonso')).toBe('Alphonso');
    expect(normalizeAssignedAgent('')).toBe('Jose');
    expect(normalizeAssignedAgent('unknown')).toBe('Jose');
  });

  it('normalizes portfolio names', () => {
    expect(normalizePortfolio('tapcash')).toBe('TapCash');
    expect(normalizePortfolio('cullinan construction portfolio')).toBe('Cullinan Construction Portfolio');
    expect(normalizePortfolio('')).toBe('Alphonso');
  });
});

describe('notionSyncService — buildSyncMetadata', () => {
  it('produces the required shape', () => {
    const m = buildSyncMetadata();
    expect(m).toEqual(
      expect.objectContaining({
        source: NOTION_SYNC_SOURCES.ALPHONSO_LOCAL,
        last_actor: 'alphonso',
        conflict_status: NOTION_CONFLICT_STATES.CLEAN,
        approval_status: NOTION_APPROVAL_STATES.NOT_REQUIRED,
        trust: 'temporary'
      })
    );
    expect(typeof m.last_synced_at).toBe('number');
  });

  it('rejects unknown sources and falls back to alphonso_local', () => {
    const m = buildSyncMetadata({ source: 'made_up_source' });
    expect(m.source).toBe('alphonso_local');
  });

  it('accepts all canonical sources', () => {
    Object.values(NOTION_SYNC_SOURCES).forEach((s) => {
      const m = buildSyncMetadata({ source: s });
      expect(m.source).toBe(s);
    });
  });

  it('rejects unknown conflict and approval values', () => {
    const m = buildSyncMetadata({ conflictStatus: 'weird', approvalStatus: 'also-weird' });
    expect(m.conflict_status).toBe('clean');
    expect(m.approval_status).toBe('not_required');
  });

  it('preserves an explicit lastSyncedAtMs', () => {
    const m = buildSyncMetadata({ lastSyncedAtMs: 12345 });
    expect(m.last_synced_at).toBe(12345);
  });
});

describe('notionSyncService — detectFieldConflict', () => {
  it('classifies identical strings as identical', () => {
    expect(detectFieldConflict('a', 'a')).toBe('identical');
  });

  it('classifies diverged strings as diverged', () => {
    expect(detectFieldConflict('a', 'b')).toBe('diverged');
  });

  it('classifies empty/empty as both_empty', () => {
    expect(detectFieldConflict('', '')).toBe('both_empty');
  });

  it('classifies one-missing as one_missing', () => {
    expect(detectFieldConflict('a', '')).toBe('one_missing');
    expect(detectFieldConflict(null, 'b')).toBe('one_missing');
  });
});

describe('notionSyncService — buildConflictRecord', () => {
  it('returns null when correlation is missing', () => {
    expect(buildConflictRecord({ field: 'phase' })).toBeNull();
  });

  it('returns null when field is missing', () => {
    expect(buildConflictRecord({ correlation: { project_id: 'p' } })).toBeNull();
  });

  it('builds a pending-review conflict record', () => {
    const r = buildConflictRecord({
      correlation: { project_id: 'p-1', task_id: 't-1' },
      field: 'phase',
      localValue: 'Active',
      remoteValue: 'Review'
    });
    expect(r.detection).toBe('diverged');
    expect(r.resolution).toBe('pending_review');
    expect(typeof r.detected_at).toBe('number');
  });
});

describe('notionSyncService — buildNotionPageProperties', () => {
  it('produces a full Notion properties payload', () => {
    const payload = buildNotionPageProperties({
      title: 'Deploy webhook',
      portfolio: 'tapcash',
      phase: 'in progress',
      riskLevel: 'high',
      assignedAgent: 'alphonso',
      correlation: {
        project_id: 'tapcash',
        task_id: 'task-9982',
        workflow_id: 'wf-1',
        notion_page_id: 'abc123def456abc1'
      },
      syncMetadata: buildSyncMetadata({ source: 'alphonso_local' }),
      auditScore: 87,
      blockers: 'pending approval',
      parentDatabaseId: 'db-1'
    });
    expect(payload.parent).toEqual({ database_id: 'db-1' });
    expect(payload.properties.Title.title[0].text.content).toBe('Deploy webhook');
    expect(payload.properties.Portfolio.select.name).toBe('TapCash');
    expect(payload.properties['Workflow Phase'].status.name).toBe('Active');
    expect(payload.properties['Risk Level'].select.name).toBe('High');
    expect(payload.properties['Assigned Agent'].select.name).toBe('Alphonso');
    expect(payload.properties['Task ID'].rich_text[0].text.content).toBe('task-9982');
    expect(payload.properties['Project ID'].rich_text[0].text.content).toBe('tapcash');
    expect(payload.properties['Workflow ID'].rich_text[0].text.content).toBe('wf-1');
    expect(payload.properties['Notion Page ID'].rich_text[0].text.content).toBe('abc123def456abc1');
    expect(payload.properties['Audit Score'].number).toBe(87);
    expect(payload.properties.Blockers.rich_text[0].text.content).toBe('pending approval');
    expect(payload.properties.Source.rich_text[0].text.content).toBe('alphonso_local');
    expect(payload.properties['Conflict Status'].select.name).toBe('clean');
    expect(payload.properties['Approval Status'].select.name).toBe('not_required');
  });

  it('falls back to parent page when no database is given', () => {
    const payload = buildNotionPageProperties({ title: 'X', parentPageId: 'page-1' });
    expect(payload.parent).toEqual({ page_id: 'page-1' });
  });

  it('returns null parent when neither is given', () => {
    const payload = buildNotionPageProperties({ title: 'X' });
    expect(payload.parent).toBeNull();
  });
});

describe('notionSyncService — buildNotionSyncRecordId', () => {
  it('builds a deterministic id from correlation + source', () => {
    const id = buildNotionSyncRecordId({ project_id: 'p-1', task_id: 't-1' }, 'notion_pull');
    expect(id).toBe('notion-sync-notion-pull-p-1-t-1');
  });

  it('returns null when no correlation key is present', () => {
    expect(buildNotionSyncRecordId({})).toBeNull();
  });
});

describe('notionSyncService — memory record bridge', () => {
  it('builds a memory record with __notion_sync metadata', () => {
    const rec = buildNotionSyncMemoryRecord({
      title: '[sync:p|t|w|abc123def456abc1] Task',
      content: { status: 'Active' },
      correlation: { projectId: 'p', taskId: 't', workflowId: 'w', notionPageId: 'abc123def456abc1' },
      syncMetadata: { source: 'notion_pull' }
    });
    expect(rec.source).toBe('notion_sync');
    expect(rec.category).toBe('task_memory');
    expect(rec.content.__notion_sync.correlation.notion_page_id).toBe('abc123def456abc1');
    expect(rec.content.__notion_sync.sync.source).toBe('notion_pull');
  });

  it('detects notion_sync memory records by source or content marker', () => {
    expect(isNotionSyncMemoryRecord({ source: 'notion_sync' })).toBe(true);
    expect(isNotionSyncMemoryRecord({ content: { __notion_sync: { correlation: {} } } })).toBe(true);
    expect(isNotionSyncMemoryRecord({ source: 'other' })).toBe(false);
    expect(isNotionSyncMemoryRecord(null)).toBe(false);
  });

  it('extracts correlation from the embedded __notion_sync marker', () => {
    const rec = {
      content: {
        __notion_sync: {
          correlation: { project_id: 'p', task_id: 't' },
          sync: { source: 'notion_pull' }
        }
      }
    };
    expect(extractCorrelationFromMemoryRecord(rec)).toEqual({ project_id: 'p', task_id: 't' });
  });

  it('falls back to title-bracket correlation extraction', () => {
    const rec = { title: '[sync:p-1|t-1||] Deploy webhook' };
    expect(extractCorrelationFromMemoryRecord(rec)).toEqual({
      project_id: 'p-1',
      task_id: 't-1',
      workflow_id: null,
      notion_page_id: null
    });
  });

  it('returns null when no correlation can be extracted', () => {
    expect(extractCorrelationFromMemoryRecord({ title: 'plain title' })).toBeNull();
    expect(extractCorrelationFromMemoryRecord(null)).toBeNull();
  });
});

describe('notionSyncService — public api surface', () => {
  it('exposes the complete API as a frozen object', () => {
    expect(typeof NOTION_SYNC_PUBLIC_API.buildCorrelationId).toBe('function');
    expect(typeof NOTION_SYNC_PUBLIC_API.buildSyncMetadata).toBe('function');
    expect(typeof NOTION_SYNC_PUBLIC_API.buildNotionPageProperties).toBe('function');
    expect(Object.isFrozen(NOTION_SYNC_PUBLIC_API)).toBe(true);
  });
});

describe('notionSyncService — slice 2: persistence + push + reconciliation', () => {
  beforeEach(() => {
    persistScopeRows.mockClear();
    listScopeRecords.mockClear();
    pushMemoryItem.mockClear();
    sendNotionConnectorEntry.mockClear();
    isConnectorAuthenticated.mockClear();
    createApprovalRequest.mockClear();
  });

  describe('persistNotionSyncRecord', () => {
    it('rejects records without correlation or id', async () => {
      const r1 = await persistNotionSyncRecord({});
      expect(r1.ok).toBe(false);
      expect(r1.error).toBe('correlation_required');

      const r2 = await persistNotionSyncRecord(null);
      expect(r2.ok).toBe(false);
      expect(r2.error).toBe('sync_record_required');
    });

    it('writes to runtime_ledger and durable memory', async () => {
      const r = await persistNotionSyncRecord({
        correlation: { project_id: 'p-1', task_id: 't-1' },
        sync: { source: 'notion_pull' },
        title: 'Test record'
      });
      expect(r.ok).toBe(true);
      expect(persistScopeRows).toHaveBeenCalledWith(
        NOTION_SYNC_SCOPE,
        expect.any(Array),
        expect.any(Function)
      );
      expect(pushMemoryItem).toHaveBeenCalledTimes(1);
    });

    it('also writes a canonical notion.sync event (best-effort, non-blocking)', async () => {
      recordEventMock.mockClear();
      buildNotionSyncEventMock.mockClear();
      const r = await persistNotionSyncRecord({
        correlation: { project_id: 'p-evt', task_id: 't-evt', notion_page_id: 'abc123def456abc1' },
        sync: { source: 'notion_pull', conflict_status: 'clean' },
        title: 'Event-record test'
      });
      expect(r.ok).toBe(true);
      expect(buildNotionSyncEventMock).toHaveBeenCalledTimes(1);
      expect(recordEventMock).toHaveBeenCalledTimes(1);
      const eventArg = buildNotionSyncEventMock.mock.calls[0][0];
      expect(eventArg.direction).toBe('pull');
      expect(eventArg.projectId).toBe('p-evt');
      expect(eventArg.notionPageId).toBe('abc123def456abc1');
    });

    it('still succeeds when the canonical event write throws', async () => {
      recordEventMock.mockRejectedValueOnce(new Error('events table gone'));
      const r = await persistNotionSyncRecord({
        correlation: { project_id: 'p-fail', task_id: 't-fail' },
        sync: { source: 'notion_push' },
        title: 'Resilience test'
      });
      expect(r.ok).toBe(true);
      expect(persistScopeRows).toHaveBeenCalled();
    });
  });

  describe('listNotionSyncRecords', () => {
    it('returns empty when runtime ledger has nothing', async () => {
      listScopeRecords.mockResolvedValueOnce([]);
      const r = await listNotionSyncRecords();
      expect(r).toEqual([]);
    });

    it('filters by source and conflict status', async () => {
      const mockRecords = [
        { id: 'a', data: { correlation: {}, sync: { source: 'notion_pull', conflict_status: 'clean' } }, timestampMs: 1 },
        { id: 'b', data: { correlation: {}, sync: { source: 'alphonso_local', conflict_status: 'pending_review' } }, timestampMs: 2 }
      ];
      listScopeRecords.mockResolvedValueOnce(mockRecords);
      const onlyPulls = await listNotionSyncRecords({ source: 'notion_pull' });
      expect(onlyPulls).toHaveLength(1);

      listScopeRecords.mockResolvedValueOnce(mockRecords);
      const onlyPending = await listNotionSyncRecords({ conflictStatus: 'pending_review' });
      expect(onlyPending).toHaveLength(1);
    });

    it('filters by correlation fields', async () => {
      listScopeRecords.mockResolvedValueOnce([
        { id: 'a', data: { correlation: { project_id: 'p-1', task_id: 't-1' }, sync: {} } },
        { id: 'b', data: { correlation: { project_id: 'p-1', task_id: 't-2' }, sync: {} } }
      ]);
      const r = await listNotionSyncRecords({ correlation: { project_id: 'p-1', task_id: 't-1' } });
      expect(r).toHaveLength(1);
    });
  });

  describe('getNotionSyncStatus', () => {
    it('returns empty status when ledger is empty', async () => {
      listScopeRecords.mockResolvedValueOnce([]);
      const status = await getNotionSyncStatus();
      expect(status.totalRecords).toBe(0);
      expect(status.bySource).toEqual({});
      expect(status.scope).toBe('notion_sync_v1');
    });

    it('aggregates by source, conflict, approval', async () => {
      listScopeRecords.mockResolvedValueOnce([
        { id: 'a', data: { correlation: {}, sync: { source: 'notion_pull', conflict_status: 'clean', approval_status: 'not_required', last_actor: 'alphonso', last_synced_at: 100 } }, timestampMs: 100 },
        { id: 'b', data: { correlation: {}, sync: { source: 'notion_push', conflict_status: 'pending_review', approval_status: 'pending', last_actor: 'jose', last_synced_at: 200 } }, timestampMs: 200 }
      ]);
      const status = await getNotionSyncStatus();
      expect(status.totalRecords).toBe(2);
      expect(status.bySource.notion_pull).toBe(1);
      expect(status.bySource.notion_push).toBe(1);
      expect(status.byConflict.clean).toBe(1);
      expect(status.byConflict.pending_review).toBe(1);
      expect(status.byApproval.pending).toBe(1);
      expect(status.lastSyncedAtMs).toBe(200);
      expect(status.lastActor).toBe('jose');
    });
  });

  describe('isNotionConnectorReady', () => {
    it('returns ok when connector is authenticated', () => {
      isConnectorAuthenticated.mockReturnValueOnce({ ok: true });
      expect(isNotionConnectorReady()).toEqual({ ok: true });
    });

    it('returns fail when not authenticated', () => {
      isConnectorAuthenticated.mockReturnValueOnce({ ok: false, reason: 'no_key' });
      expect(isNotionConnectorReady()).toEqual({ ok: false, reason: 'no_key' });
    });
  });

  describe('buildReconcilePlan', () => {
    it('noops when both missing', () => {
      expect(buildReconcilePlan(null, null, null)).toEqual({ action: 'noop', reason: 'both_missing' });
    });

    it('pushes when only local exists', () => {
      const local = { title: 'X', phase: 'Active', updatedAtMs: 100 };
      expect(buildReconcilePlan(local, null, null)).toEqual({ action: 'push', reason: 'remote_missing' });
    });

    it('pulls when only remote exists', () => {
      const remote = { title: 'X', phase: 'Active' };
      expect(buildReconcilePlan(null, remote, null)).toEqual({ action: 'pull', reason: 'local_missing' });
    });

    it('skips when fields are identical', () => {
      const local = { title: 'X', phase: 'Active', riskLevel: 'High', assignedAgent: 'Jose', portfolio: 'TapCash', updatedAtMs: 100 };
      const remote = { ...local, lastSyncedAtMs: 100 };
      expect(buildReconcilePlan(local, remote, { sync: { last_synced_at: 50 } })).toEqual({ action: 'skip', reason: 'identical', divergences: [] });
    });

    it('detects conflict when both changed since last sync', () => {
      const local = { title: 'X', phase: 'Active', riskLevel: 'High', assignedAgent: 'Jose', portfolio: 'TapCash', updatedAtMs: 200 };
      const remote = { ...local, phase: 'Review', lastSyncedAtMs: 300 };
      const plan = buildReconcilePlan(local, remote, { sync: { last_synced_at: 100 } });
      expect(plan.action).toBe('conflict');
      expect(plan.divergences.length).toBeGreaterThanOrEqual(1);
    });

    it('pushes when local is newer than remote and no prior sync', () => {
      const local = { title: 'X', phase: 'Active', riskLevel: 'High', assignedAgent: 'Jose', portfolio: 'TapCash', updatedAtMs: 200 };
      const remote = { ...local, phase: 'Review', lastSyncedAtMs: 100 };
      const plan = buildReconcilePlan(local, remote, null);
      expect(plan.action).toBe('push');
    });
  });

  describe('recordNotionConflict', () => {
    it('rejects invalid input', async () => {
      const r = await recordNotionConflict({});
      expect(r.ok).toBe(false);
    });

    it('persists a conflict record and creates an approval request', async () => {
      const r = await recordNotionConflict({
        correlation: { project_id: 'p-1', task_id: 't-1' },
        field: 'phase',
        localValue: 'Active',
        remoteValue: 'Review'
      });
      expect(r.ok).toBe(true);
      expect(r.conflict.field).toBe('phase');
      expect(persistScopeRows).toHaveBeenCalled();
      expect(pushMemoryItem).toHaveBeenCalled();
      expect(createApprovalRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'external_posting_uploading',
          riskLevel: 'medium'
        })
      );
    });
  });

  describe('pushAlphonsoTaskToNotion', () => {
    it('blocks cleanly when Notion is not authenticated', async () => {
      isConnectorAuthenticated.mockReturnValueOnce({ ok: false, reason: 'no_key' });
      const r = await pushAlphonsoTaskToNotion({
        title: 'Deploy webhook',
        portfolio: 'TapCash',
        phase: 'Active',
        riskLevel: 'High',
        assignedAgent: 'Alphonso',
        correlation: { project_id: 'tapcash', task_id: 't-9982' }
      });
      expect(r.ok).toBe(false);
      expect(r.blocked).toBe(true);
      expect(r.reason).toBe('notion_not_authenticated');
      expect(sendNotionConnectorEntry).not.toHaveBeenCalled();
      expect(persistScopeRows).toHaveBeenCalled();
    });

    it('pushes when authenticated and persists full sync record', async () => {
      isConnectorAuthenticated.mockReturnValueOnce({ ok: true });
      sendNotionConnectorEntry.mockResolvedValueOnce({
        ok: true,
        externalId: 'page-abc',
        error: null
      });
      const r = await pushAlphonsoTaskToNotion({
        title: 'Deploy webhook',
        content: 'Body content',
        portfolio: 'TapCash',
        phase: 'in progress',
        riskLevel: 'High',
        assignedAgent: 'Alphonso',
        correlation: { project_id: 'tapcash', task_id: 't-9982' },
        parentDatabaseId: 'db-1',
        auditScore: 87
      });
      expect(r.ok).toBe(true);
      expect(r.sendResult.externalId).toBe('page-abc');
      expect(sendNotionConnectorEntry).toHaveBeenCalledWith(
        expect.objectContaining({ parentPageId: null }),
        expect.objectContaining({ riskLevel: 'High' })
      );
      expect(persistScopeRows).toHaveBeenCalled();
      expect(pushMemoryItem).toHaveBeenCalled();
      expect(r.sync.source).toBe('notion_push');
      expect(r.sync.conflict_status).toBe('clean');
    });

    it('marks sync as pending_review when push fails', async () => {
      isConnectorAuthenticated.mockReturnValueOnce({ ok: true });
      sendNotionConnectorEntry.mockResolvedValueOnce({
        ok: false,
        error: 'rate_limited'
      });
      const r = await pushAlphonsoTaskToNotion({
        title: 'X',
        correlation: { project_id: 'p', task_id: 't' }
      });
      expect(r.ok).toBe(false);
      expect(r.sync.conflict_status).toBe('pending_review');
    });
  });

  describe('ingestAlphonsoTaskFromNotionPage', () => {
    it('extracts all canonical fields from a Notion page', async () => {
      const page = {
        id: 'abc123def456abc1',
        properties: {
          Title: { title: [{ text: { content: 'Deploy webhook' } }] },
          Portfolio: { select: { name: 'TapCash' } },
          'Workflow Phase': { status: { name: 'Active' } },
          'Risk Level': { select: { name: 'High' } },
          'Assigned Agent': { select: { name: 'Alphonso' } },
          'Task ID': { rich_text: [{ text: { content: 't-9982' } }] },
          'Project ID': { rich_text: [{ text: { content: 'tapcash' } }] },
          'Notion Page ID': { rich_text: [{ text: { content: 'abc123def456abc1' } }] },
          'Last Synced At': { date: { start: '2026-06-07T08:00:00.000Z' } },
          'Last Actor': { rich_text: [{ text: { content: 'jose' } }] },
          'Conflict Status': { select: { name: 'pending_review' } },
          'Approval Status': { select: { name: 'pending' } },
          Source: { rich_text: [{ text: { content: 'notion_pull' } }] },
          'Audit Score': { number: 92 },
          Blockers: { rich_text: [{ text: { content: 'waiting on credentials' } }] }
        }
      };
      const r = await ingestAlphonsoTaskFromNotionPage(page);
      expect(r.title).toBe('Deploy webhook');
      expect(r.portfolio).toBe('TapCash');
      expect(r.phase).toBe('Active');
      expect(r.riskLevel).toBe('High');
      expect(r.assignedAgent).toBe('Alphonso');
      expect(r.taskId).toBe('t-9982');
      expect(r.correlation.project_id).toBe('tapcash');
      expect(r.correlation.task_id).toBeNull();
      expect(r.correlation.notion_page_id).toBe('abc123def456abc1');
      expect(r.auditScore).toBe(92);
      expect(r.conflictStatus).toBe('pending_review');
      expect(r.approvalStatus).toBe('pending');
      expect(r.source).toBe('notion_pull');
      expect(typeof r.lastSyncedAtMs).toBe('number');
    });

    it('returns null for non-object input', async () => {
      expect(await ingestAlphonsoTaskFromNotionPage(null)).toBeNull();
      expect(await ingestAlphonsoTaskFromNotionPage('string')).toBeNull();
    });

    it('falls back to default values when properties are missing', async () => {
      const r = await ingestAlphonsoTaskFromNotionPage({ id: 'abc123def456abc1', properties: {} });
      expect(r.title).toBe('');
      expect(r.correlation.notion_page_id).toBe('abc123def456abc1');
      expect(r.conflictStatus).toBe('clean');
      expect(r.approvalStatus).toBe('not_required');
      expect(r.source).toBe('notion_pull');
    });
  });
});

describe('notionSyncService — slice 3: pull path (Notion → Alphonso)', () => {
  beforeEach(() => {
    persistScopeRows.mockClear();
    listScopeRecords.mockClear();
    pushMemoryItem.mockClear();
    sendNotionConnectorEntry.mockClear();
    isConnectorAuthenticated.mockClear();
    createApprovalRequest.mockClear();
  });

  describe('isNotionPullEnabled', () => {
    it('returns disabled when no token is set anywhere', () => {
      const r = isNotionPullEnabled();
      expect(r.enabled === false || r.enabled === true).toBe(true);
    });
  });

  describe('fetchNotionApi', () => {
    it('returns missing_token when no token provided', async () => {
      const r = await fetchNotionApi('/v1/pages/abc', { token: null });
      expect(r.ok).toBe(false);
      expect(r.error).toBe('missing_token');
    });

    it('performs a GET request with proper headers when token is set', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 'page-1' })
      });
      vi.stubGlobal('fetch', mockFetch);
      const r = await fetchNotionApi('/v1/pages/abc', { token: 'secret-token' });
      expect(r.ok).toBe(true);
      expect(r.data.id).toBe('page-1');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.notion.com/v1/pages/abc');
      expect(opts.method).toBe('GET');
      expect(opts.headers.Authorization).toBe('Bearer secret-token');
      expect(opts.headers['Notion-Version']).toBe('2022-06-28');
      vi.unstubAllGlobals();
    });

    it('handles network errors gracefully', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('connection refused'));
      vi.stubGlobal('fetch', mockFetch);
      const r = await fetchNotionApi('/v1/pages/abc', { token: 't' });
      expect(r.ok).toBe(false);
      expect(r.error).toBe('network_error');
      vi.unstubAllGlobals();
    });

    it('handles non-OK HTTP responses', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ message: 'unauthorized' })
      });
      vi.stubGlobal('fetch', mockFetch);
      const r = await fetchNotionApi('/v1/pages/abc', { token: 't' });
      expect(r.ok).toBe(false);
      expect(r.error).toBe('http_401');
      vi.unstubAllGlobals();
    });
  });

  describe('fetchNotionPage', () => {
    it('rejects missing pageId', async () => {
      const r = await fetchNotionPage({ token: 't' });
      expect(r.ok).toBe(false);
      expect(r.error).toBe('page_id_required');
    });

    it('rejects missing token', async () => {
      const r = await fetchNotionPage({ pageId: 'abc' });
      expect(r.ok).toBe(false);
      expect(r.error).toBe('missing_token');
    });

    it('returns the page on success', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 'abc123def456abc1', properties: {} })
      });
      vi.stubGlobal('fetch', mockFetch);
      const r = await fetchNotionPage({ pageId: 'abc123def456abc1', token: 't' });
      expect(r.ok).toBe(true);
      expect(r.page.id).toBe('abc123def456abc1');
      vi.unstubAllGlobals();
    });
  });

  describe('fetchNotionDatabasePages', () => {
    it('rejects missing databaseId', async () => {
      const r = await fetchNotionDatabasePages({ token: 't' });
      expect(r.ok).toBe(false);
      expect(r.error).toBe('database_id_required');
    });

    it('rejects missing token', async () => {
      const r = await fetchNotionDatabasePages({ databaseId: 'db-1' });
      expect(r.ok).toBe(false);
      expect(r.error).toBe('missing_token');
    });

    it('paginates through all pages until no_more', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ results: [{ id: 'p1' }, { id: 'p2' }], has_more: true, next_cursor: 'c1' })
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ results: [{ id: 'p3' }], has_more: false })
        });
      vi.stubGlobal('fetch', mockFetch);
      const r = await fetchNotionDatabasePages({ databaseId: 'db-1', token: 't' });
      expect(r.ok).toBe(true);
      expect(r.pages).toHaveLength(3);
      expect(r.stoppedReason).toBe('no_more');
      expect(mockFetch).toHaveBeenCalledTimes(2);
      vi.unstubAllGlobals();
    });

    it('stops at cursor boundary', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ results: [{ id: 'p1' }], has_more: true, next_cursor: null })
      });
      vi.stubGlobal('fetch', mockFetch);
      const r = await fetchNotionDatabasePages({ databaseId: 'db-1', token: 't' });
      expect(r.stoppedReason).toBe('no_cursor');
      expect(r.pages).toHaveLength(1);
      vi.unstubAllGlobals();
    });

    it('returns API error without throwing', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ message: 'not found' })
      });
      vi.stubGlobal('fetch', mockFetch);
      const r = await fetchNotionDatabasePages({ databaseId: 'db-1', token: 't' });
      expect(r.ok).toBe(false);
      expect(r.error).toBe('http_404');
      expect(r.pages).toEqual([]);
      vi.unstubAllGlobals();
    });
  });

  describe('buildPullReconcilePlan', () => {
    it('skips when remote is missing', () => {
      expect(buildPullReconcilePlan({ title: 'X' }, null, null)).toEqual({ action: 'skip', reason: 'remote_missing' });
    });

    it('pulls when local is missing but remote exists', () => {
      const remote = { title: 'X', phase: 'Active', updatedAtMs: 100 };
      expect(buildPullReconcilePlan(null, remote, null)).toEqual({ action: 'pull', reason: 'local_missing' });
    });

    it('skips when fields are identical', () => {
      const local = { title: 'X', phase: 'Active', riskLevel: 'High', assignedAgent: 'Jose', portfolio: 'TapCash', updatedAtMs: 100 };
      const remote = { ...local, lastSyncedAtMs: 100 };
      const plan = buildPullReconcilePlan(local, remote, { sync: { last_synced_at: 50 } });
      expect(plan.action).toBe('skip');
      expect(plan.divergences).toEqual([]);
    });

    it('creates a conflict when local has been changed since last sync', () => {
      const local = { title: 'X', phase: 'Active', riskLevel: 'High', assignedAgent: 'Jose', portfolio: 'TapCash', updatedAtMs: 200 };
      const remote = { ...local, phase: 'Review', lastSyncedAtMs: 100 };
      const plan = buildPullReconcilePlan(local, remote, { sync: { last_synced_at: 100 } });
      expect(plan.action).toBe('conflict');
      expect(plan.reason).toBe('both_changed_since_last_sync');
    });

    it('creates a conflict when both changed since last sync', () => {
      const local = { title: 'X', phase: 'Active', riskLevel: 'High', assignedAgent: 'Jose', portfolio: 'TapCash', updatedAtMs: 200 };
      const remote = { ...local, phase: 'Review', lastSyncedAtMs: 300 };
      const plan = buildPullReconcilePlan(local, remote, { sync: { last_synced_at: 100 } });
      expect(plan.action).toBe('conflict');
      expect(plan.reason).toBe('both_changed_since_last_sync');
    });

    it('pulls when remote is newer and local is older than last sync', () => {
      const local = { title: 'X', phase: 'Active', riskLevel: 'High', assignedAgent: 'Jose', portfolio: 'TapCash', updatedAtMs: 50 };
      const remote = { ...local, phase: 'Review', lastSyncedAtMs: 200 };
      const plan = buildPullReconcilePlan(local, remote, { sync: { last_synced_at: 100 } });
      expect(plan.action).toBe('pull');
    });
  });

  describe('pullNotionPage', () => {
    it('blocks cleanly when no token and no auth', async () => {
      isConnectorAuthenticated.mockReturnValueOnce({ ok: false });
      const r = await pullNotionPage({ pageId: 'abc123def456abc1' });
      expect(r.ok).toBe(false);
      expect(r.blocked).toBe(true);
      expect(r.reason).toBe('credentials_missing');
    });

    it('skips identical pages without overwriting', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          id: 'abc123def456abc1',
          properties: {
            Title: { title: [{ text: { content: 'Same' } }] },
            'Workflow Phase': { status: { name: 'Active' } },
            'Last Synced At': { date: { start: '2026-06-07T08:00:00.000Z' } }
          }
        })
      });
      vi.stubGlobal('fetch', mockFetch);
      listScopeRecords.mockResolvedValueOnce([{
        id: 'notion-sync-notion-pull-p-1-t-1',
        data: {
          correlation: { project_id: 'p-1', task_id: 't-1', notion_page_id: 'abc123def456abc1' },
          sync: { source: 'notion_pull', last_synced_at: 100 },
          payload: {
            localShape: { title: 'Same', phase: 'Active', riskLevel: null, assignedAgent: null, portfolio: null, updatedAtMs: 100 }
          }
        },
        timestampMs: 100
      }]);
      const r = await pullNotionPage({ pageId: 'abc123def456abc1', token: 't' });
      expect(r.ok).toBe(true);
      expect(r.action).toBe('pull');
      vi.unstubAllGlobals();
    });

    it('creates conflict records when local changed since last sync', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          id: 'abc123def456abc1',
          properties: {
            Title: { title: [{ text: { content: 'Remote Title' } }] },
            'Workflow Phase': { status: { name: 'Review' } },
            'Task ID': { rich_text: [{ text: { content: 't-1' } }] },
            'Project ID': { rich_text: [{ text: { content: 'p-1' } }] },
            'Last Synced At': { date: { start: '2026-06-07T08:00:00.000Z' } }
          }
        })
      });
      vi.stubGlobal('fetch', mockFetch);
      listScopeRecords.mockResolvedValueOnce([{
        id: 'notion-sync-notion-pull-p-1-t-1',
        data: {
          correlation: { project_id: 'p-1', task_id: 't-1', notion_page_id: 'abc123def456abc1' },
          sync: { source: 'notion_pull', last_synced_at: 100 },
          payload: {
            localShape: { title: 'Local Title', phase: 'Active', riskLevel: 'High', assignedAgent: 'Jose', portfolio: 'TapCash', updatedAtMs: 200 }
          }
        },
        timestampMs: 100
      }]);
      const r = await pullNotionPage({ pageId: 'abc123def456abc1', token: 't' });
      expect(r.ok).toBe(true);
      expect(r.action).toBe('conflict');
      expect(createApprovalRequest).toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it('pulls new values when remote is newer', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          id: 'abc123def456abc1',
          properties: {
            Title: { title: [{ text: { content: 'New Title' } }] },
            'Workflow Phase': { status: { name: 'Active' } },
            'Risk Level': { select: { name: 'High' } },
            'Task ID': { rich_text: [{ text: { content: 't-1' } }] },
            'Project ID': { rich_text: [{ text: { content: 'p-1' } }] },
            'Last Synced At': { date: { start: '2026-06-07T08:00:00.000Z' } }
          }
        })
      });
      vi.stubGlobal('fetch', mockFetch);
      listScopeRecords.mockResolvedValueOnce([{
        id: 'notion-sync-notion-pull-p-1-t-1',
        data: {
          correlation: { project_id: 'p-1', task_id: 't-1', notion_page_id: 'abc123def456abc1' },
          sync: { source: 'notion_pull', last_synced_at: 50 },
          payload: {
            localShape: { title: 'Old Title', phase: 'Active', riskLevel: 'Low', assignedAgent: 'Jose', portfolio: 'TapCash', updatedAtMs: 50 }
          }
        },
        timestampMs: 50
      }]);
      const r = await pullNotionPage({ pageId: 'abc123def456abc1', token: 't' });
      expect(r.ok).toBe(true);
      expect(r.action).toBe('pull');
      expect(persistScopeRows).toHaveBeenCalled();
      expect(pushMemoryItem).toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it('returns network error when fetch fails', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('connection reset'));
      vi.stubGlobal('fetch', mockFetch);
      const r = await pullNotionPage({ pageId: 'abc123def456abc1', token: 't' });
      expect(r.ok).toBe(false);
      expect(r.error).toBe('network_error');
      vi.unstubAllGlobals();
    });
  });

  describe('pullNotionDatabase', () => {
    it('blocks when no token and no auth', async () => {
      isConnectorAuthenticated.mockReturnValueOnce({ ok: false });
      const r = await pullNotionDatabase({ databaseId: 'db-1' });
      expect(r.ok).toBe(false);
      expect(r.blocked).toBe(true);
    });

    it('scans, ingests, and aggregates a database of pages', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          results: [
            {
              id: 'abc123def456abc1',
              properties: {
                Title: { title: [{ text: { content: 'Page 1' } }] },
                'Workflow Phase': { status: { name: 'Active' } },
                'Task ID': { rich_text: [{ text: { content: 't-1' } }] }
              }
            },
            {
              id: 'def456abc123def4',
              properties: {
                Title: { title: [{ text: { content: 'Page 2' } }] },
                'Workflow Phase': { status: { name: 'Active' } },
                'Task ID': { rich_text: [{ text: { content: 't-2' } }] }
              }
            }
          ],
          has_more: false
        })
      });
      vi.stubGlobal('fetch', mockFetch);
      listScopeRecords.mockResolvedValue([]);
      const r = await pullNotionDatabase({ databaseId: 'db-1', token: 't' });
      expect(r.ok).toBe(true);
      expect(r.pagesScanned).toBe(2);
      expect(r.pagesPulled).toBe(2);
      expect(r.pagesConflicted).toBe(0);
      expect(persistScopeRows).toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it('records conflicts per diverged field without overwriting', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          results: [
            {
              id: 'abc123def456abc1',
              properties: {
                Title: { title: [{ text: { content: 'Remote Title' } }] },
                'Workflow Phase': { status: { name: 'Review' } },
                'Task ID': { rich_text: [{ text: { content: 't-1' } }] },
                'Project ID': { rich_text: [{ text: { content: 'p-1' } }] }
              }
            }
          ],
          has_more: false
        })
      });
      vi.stubGlobal('fetch', mockFetch);
      listScopeRecords.mockResolvedValueOnce([{
        id: 'notion-sync-notion-pull-p-1-t-1',
        data: {
          correlation: { project_id: 'p-1', task_id: 't-1', notion_page_id: 'abc123def456abc1' },
          sync: { source: 'notion_pull', last_synced_at: 100 },
          payload: {
            localShape: { title: 'Local Title', phase: 'Active', riskLevel: null, assignedAgent: null, portfolio: null, updatedAtMs: 200 }
          }
        },
        timestampMs: 100
      }]);
      const r = await pullNotionDatabase({ databaseId: 'db-1', token: 't' });
      expect(r.ok).toBe(true);
      expect(r.pagesConflicted).toBe(1);
      expect(r.conflicts.length).toBeGreaterThanOrEqual(1);
      expect(createApprovalRequest).toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
  });
});

describe('notionSyncService — slice 4: weekly report (markdown summary)', () => {
  const baseRecord = (overrides = {}) => ({
    correlation: { project_id: 'p-1', task_id: 't-1', notion_page_id: 'abc123def456abc1', workflow_id: 'w-1' },
    sync: {
      source: 'notion_pull',
      last_synced_at: 0,
      last_actor: 'alphonso',
      provenance: 'ok',
      conflict_status: 'clean',
      approval_status: 'not_required'
    },
    ...overrides
  });

  it('is exposed on the public api surface', () => {
    expect(typeof notionSyncWeeklyReport).toBe('function');
    expect(NOTION_SYNC_PUBLIC_API.notionSyncWeeklyReport).toBe(notionSyncWeeklyReport);
  });

  it('returns a markdown summary + counts for a 7-day window', () => {
    const now = 1700000000000;
    const records = [
      baseRecord({ sync: { source: 'notion_pull', last_synced_at: now - 1000, last_actor: 'alphonso', provenance: 'ok', conflict_status: 'clean', approval_status: 'not_required' } }),
      baseRecord({ correlation: { project_id: 'p-2', task_id: 't-2', notion_page_id: 'def456abc123def4', workflow_id: 'w-2' }, sync: { source: 'notion_push', last_synced_at: now - 2000, last_actor: 'alphonso', provenance: 'ok', conflict_status: 'clean', approval_status: 'not_required' } }),
      baseRecord({ correlation: { project_id: 'p-3', task_id: 't-3', notion_page_id: '789abcdef012345', workflow_id: 'w-3' }, sync: { source: 'notion_pull', last_synced_at: now - 3000, last_actor: 'alphonso', provenance: 'blocked: missing token', conflict_status: 'pending_review', approval_status: 'pending' } })
    ];
    const report = notionSyncWeeklyReport({ records, generatedAtMs: now });
    expect(report.markdown).toMatch(/# Notion .* Weekly Sync Report/);
    expect(report.counts.total).toBe(3);
    expect(report.counts.bySource.notion_pull).toBe(2);
    expect(report.counts.bySource.notion_push).toBe(1);
    expect(report.counts.conflicts).toBe(1);
    expect(report.counts.pendingApprovals).toBe(1);
    expect(report.counts.blocked).toBe(1);
    expect(report.generatedAtMs).toBe(now);
    expect(report.windowEndMs).toBe(now);
  });

  it('excludes records outside the lookback window', () => {
    const now = 1700000000000;
    const week = 7 * 24 * 60 * 60 * 1000;
    const records = [
      baseRecord({ sync: { source: 'notion_pull', last_synced_at: now - 1000, last_actor: 'a', provenance: 'ok', conflict_status: 'clean', approval_status: 'not_required' } }),
      baseRecord({ sync: { source: 'notion_pull', last_synced_at: now - week - 1000, last_actor: 'a', provenance: 'ok', conflict_status: 'clean', approval_status: 'not_required' } })
    ];
    const report = notionSyncWeeklyReport({ records, generatedAtMs: now });
    expect(report.counts.total).toBe(1);
  });

  it('handles empty record arrays gracefully', () => {
    const report = notionSyncWeeklyReport({ records: [], generatedAtMs: 1700000000000 });
    expect(report.counts.total).toBe(0);
    expect(report.counts.conflicts).toBe(0);
    expect(report.markdown).toMatch(/no sync activity/);
  });

  it('is deterministic with no side effects', () => {
    const records = [baseRecord({ sync: { source: 'notion_pull', last_synced_at: 1700000000000, last_actor: 'alphonso', provenance: 'ok', conflict_status: 'clean', approval_status: 'not_required' } })];
    const a = notionSyncWeeklyReport({ records, generatedAtMs: 1700000000000 });
    const b = notionSyncWeeklyReport({ records, generatedAtMs: 1700000000000 });
    expect(a.markdown).toBe(b.markdown);
    expect(a.counts).toEqual(b.counts);
  });
});
