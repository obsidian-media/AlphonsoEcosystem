import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('workflowBuilderService', () => {
  const storage = {};
  const localStorageMock = {
    getItem: vi.fn((k) => storage[k] ?? null),
    setItem: vi.fn((k, v) => { storage[k] = v; }),
    removeItem: vi.fn((k) => { delete storage[k]; }),
  };

  let service;

  beforeEach(async () => {
    Object.keys(storage).forEach(k => delete storage[k]);
    vi.stubGlobal('localStorage', localStorageMock);
    service = await import('../../services/workflowBuilderService');
  });

  describe('WORKFLOW_NODE_LIBRARY', () => {
    it('contains expected node types', () => {
      expect(service.WORKFLOW_NODE_LIBRARY).toContainEqual(expect.objectContaining({ type: 'trigger' }));
      expect(service.WORKFLOW_NODE_LIBRARY).toContainEqual(expect.objectContaining({ type: 'condition' }));
      expect(service.WORKFLOW_NODE_LIBRARY).toContainEqual(expect.objectContaining({ type: 'approval' }));
    });
  });

  describe('listWorkflows', () => {
    it('returns empty array when no workflows', () => {
      expect(service.listWorkflows()).toEqual([]);
    });
  });

  describe('createWorkflow', () => {
    it('creates workflow with valid name', () => {
      const wf = service.createWorkflow('test-workflow');
      expect(wf).toHaveProperty('id');
      expect(wf.name).toBe('test-workflow');
      expect(wf.agentScope).toBe('shared');
    });

    it('returns null for invalid name', () => {
      expect(service.createWorkflow('')).toBeNull();
      expect(service.createWorkflow(null)).toBeNull();
      expect(service.createWorkflow(123)).toBeNull();
    });
  });

  describe('updateWorkflow', () => {
    it('updates workflow name', () => {
      const wf = service.createWorkflow('original');
      const updated = service.updateWorkflow(wf.id, { name: 'updated' });
      expect(updated.name).toBe('updated');
    });
  });

  describe('addWorkflowNode', () => {
    it('adds node to workflow', () => {
      const wf = service.createWorkflow('test');
      const updated = service.addWorkflowNode(wf.id, 'ocr');
      expect(updated.nodes.length).toBe(1);
      expect(updated.nodes[0].type).toBe('ocr');
    });
  });

  describe('addWorkflowEdge', () => {
    it('adds edge between nodes', () => {
      const wf = service.createWorkflow('test');
      const updated = service.addWorkflowEdge(wf.id, 'node-a', 'node-b');
      expect(updated.edges.length).toBe(1);
      expect(updated.edges[0].fromNode).toBe('node-a');
    });
  });
});