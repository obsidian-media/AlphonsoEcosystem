import { describe, it, expect, beforeEach, vi } from 'vitest';

const invoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args)
}));

describe('memoryGraphService', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  describe('addNode', () => {
    it('returns the node id from the backend on success', async () => {
      invoke.mockResolvedValue('memory_item:mem-1');
      const { addNode } = await import('../../services/memoryGraphService');
      const id = await addNode('memory_item', 'mem-1');
      expect(id).toBe('memory_item:mem-1');
      expect(invoke).toHaveBeenCalledWith('memory_graph_add_node', {
        nodeType: 'memory_item',
        refId: 'mem-1'
      });
    });

    it('returns null instead of throwing when invoke fails (e.g. non-Tauri web mode)', async () => {
      invoke.mockRejectedValue(new Error('not in tauri'));
      const { addNode } = await import('../../services/memoryGraphService');
      const id = await addNode('memory_item', 'mem-1');
      expect(id).toBeNull();
    });
  });

  describe('addEdge', () => {
    it('passes confidence/createdBy/createdEvent through to the backend', async () => {
      invoke.mockResolvedValue('edge-123');
      const { addEdge } = await import('../../services/memoryGraphService');
      const id = await addEdge('memory_item:mem-1', 'memory_item:mem-2', 'mentions', {
        confidence: 'user_confirmed',
        createdBy: 'echo',
        createdEvent: 'mem-1'
      });
      expect(id).toBe('edge-123');
      expect(invoke).toHaveBeenCalledWith('memory_graph_add_edge', {
        fromNodeId: 'memory_item:mem-1',
        toNodeId: 'memory_item:mem-2',
        edgeType: 'mentions',
        confidence: 'user_confirmed',
        createdBy: 'echo',
        createdEvent: 'mem-1'
      });
    });

    it('defaults createdEvent to null when not provided', async () => {
      invoke.mockResolvedValue('edge-124');
      const { addEdge } = await import('../../services/memoryGraphService');
      await addEdge('a', 'b', 'mentions', { confidence: 'verified', createdBy: 'jose' });
      expect(invoke).toHaveBeenCalledWith('memory_graph_add_edge', expect.objectContaining({
        createdEvent: null
      }));
    });

    it('returns null instead of throwing when invoke fails', async () => {
      invoke.mockRejectedValue(new Error('not in tauri'));
      const { addEdge } = await import('../../services/memoryGraphService');
      const id = await addEdge('a', 'b', 'mentions', { confidence: 'verified', createdBy: 'jose' });
      expect(id).toBeNull();
    });
  });

  describe('queryRelated', () => {
    it('returns the edges array from the backend', async () => {
      const edges = [{
        id: 'edge-1', fromNodeId: 'a', toNodeId: 'b', edgeType: 'mentions',
        confidence: 'verified', createdBy: 'jose', createdEvent: null, createdAtMs: 123
      }];
      invoke.mockResolvedValue(edges);
      const { queryRelated } = await import('../../services/memoryGraphService');
      const result = await queryRelated('a');
      expect(result).toEqual(edges);
      expect(invoke).toHaveBeenCalledWith('memory_graph_query_related', { nodeId: 'a' });
    });

    it('returns an empty array instead of throwing when invoke fails', async () => {
      invoke.mockRejectedValue(new Error('not in tauri'));
      const { queryRelated } = await import('../../services/memoryGraphService');
      const result = await queryRelated('a');
      expect(result).toEqual([]);
    });

    it('returns an empty array if the backend returns something non-array', async () => {
      invoke.mockResolvedValue(null);
      const { queryRelated } = await import('../../services/memoryGraphService');
      const result = await queryRelated('a');
      expect(result).toEqual([]);
    });
  });
});
