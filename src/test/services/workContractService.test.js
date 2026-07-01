import { describe, it, expect, beforeEach } from 'vitest';
import {
  createWorkContractDraft, updateWorkContract, signWorkContract,
  archiveWorkContract, listWorkContracts
} from '../../services/agentWorkshop/workContractService';

describe('workContractService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('createWorkContractDraft creates a draft with id', () => {
    const draft = createWorkContractDraft({ objective: 'Build feature X' });
    expect(draft.id).toContain('contract-');
    expect(draft.objective).toBe('Build feature X');
    expect(draft.state).toBe('drafted');
    expect(draft.signedByShayan).toBe(false);
  });

  it('createWorkContractDraft uses defaults', () => {
    const draft = createWorkContractDraft({});
    expect(draft.draftedBy).toBe('jose');
    expect(draft.riskLevel).toBe('medium');
    expect(draft.objective).toBe('Undefined objective');
  });

  it('updateWorkContract modifies a contract', () => {
    const draft = createWorkContractDraft({ objective: 'Test' });
    const updated = updateWorkContract(draft.id, { objective: 'Updated' });
    expect(updated.objective).toBe('Updated');
    expect(updated.editedByShayan).toBe(true);
    expect(updated.updatedAt).toBeTruthy();
  });

  it('updateWorkContract returns null for unknown id', () => {
    const result = updateWorkContract('nonexistent', { objective: 'X' });
    expect(result).toBeNull();
  });

  it('signWorkContract sets state to signed', () => {
    const draft = createWorkContractDraft({ objective: 'Test' });
    const signed = signWorkContract(draft.id);
    expect(signed.state).toBe('signed');
    expect(signed.signedByShayan).toBe(true);
  });

  it('archiveWorkContract sets state to archived', () => {
    const draft = createWorkContractDraft({ objective: 'Test' });
    const archived = archiveWorkContract(draft.id);
    expect(archived.state).toBe('archived');
    expect(archived.archived).toBe(true);
  });

  it('listWorkContracts returns all contracts', () => {
    createWorkContractDraft({ objective: 'A' });
    createWorkContractDraft({ objective: 'B' });
    expect(listWorkContracts().length).toBe(2);
  });

  it('listWorkContracts filters by state', () => {
    const draft = createWorkContractDraft({ objective: 'A' });
    signWorkContract(draft.id);
    createWorkContractDraft({ objective: 'B' });
    expect(listWorkContracts({ state: 'signed' }).length).toBe(1);
    expect(listWorkContracts({ state: 'drafted' }).length).toBe(1);
  });

  it('listWorkContracts filters by projectId', () => {
    createWorkContractDraft({ objective: 'A', projectId: 'p1' });
    createWorkContractDraft({ objective: 'B', projectId: 'p2' });
    expect(listWorkContracts({ projectId: 'p1' }).length).toBe(1);
  });

  it('listWorkContracts returns newest first', () => {
    createWorkContractDraft({ objective: 'A' });
    createWorkContractDraft({ objective: 'B' });
    const list = listWorkContracts();
    expect(list[0].objective).toBe('B');
  });
});
