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

    it('fires a scoped, capped inference pass after a successful add, without blocking the return', async () => {
      invoke.mockResolvedValue('memory_item:mem-1');
      const { addNode } = await import('../../services/memoryGraphService');
      await addNode('memory_item', 'mem-1');
      expect(invoke).toHaveBeenCalledWith('memory_graph_infer_edges', {
        scopeNodeIds: ['memory_item:mem-1'],
        maxSuggestions: 5
      });
    });

    it('does not fire inference when the add itself failed', async () => {
      invoke.mockRejectedValue(new Error('not in tauri'));
      const { addNode } = await import('../../services/memoryGraphService');
      await addNode('memory_item', 'mem-1');
      expect(invoke).not.toHaveBeenCalledWith('memory_graph_infer_edges', expect.anything());
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

    it('fires a scoped, capped inference pass covering both endpoints after a successful add', async () => {
      invoke.mockResolvedValue('edge-999');
      const { addEdge } = await import('../../services/memoryGraphService');
      await addEdge('memory_item:mem-1', 'memory_item:mem-2', 'mentions', {
        confidence: 'user_confirmed',
        createdBy: 'echo'
      });
      expect(invoke).toHaveBeenCalledWith('memory_graph_infer_edges', {
        scopeNodeIds: ['memory_item:mem-1', 'memory_item:mem-2'],
        maxSuggestions: 5
      });
    });

    it('does not fire inference when the add itself failed', async () => {
      invoke.mockRejectedValue(new Error('not in tauri'));
      const { addEdge } = await import('../../services/memoryGraphService');
      await addEdge('a', 'b', 'mentions', { confidence: 'verified', createdBy: 'jose' });
      expect(invoke).not.toHaveBeenCalledWith('memory_graph_infer_edges', expect.anything());
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

  describe('queryRelatedDeep', () => {
    it('passes nodeId, maxDepth, and direction through to the backend', async () => {
      const edges = [{
        id: 'e-1', fromNodeId: 'A', toNodeId: 'B', edgeType: 'next',
        confidence: 'verified', createdBy: 'jose', createdEvent: null, createdAtMs: 123, depth: 1
      }];
      invoke.mockResolvedValue(edges);
      const { queryRelatedDeep } = await import('../../services/memoryGraphService');
      const result = await queryRelatedDeep('A', 3, 'forward');
      expect(result).toEqual(edges);
      expect(invoke).toHaveBeenCalledWith('memory_graph_query_related_deep', {
        nodeId: 'A',
        maxDepth: 3,
        direction: 'forward'
      });
    });

    it('returns an empty array instead of throwing when invoke fails', async () => {
      invoke.mockRejectedValue(new Error('not in tauri'));
      const { queryRelatedDeep } = await import('../../services/memoryGraphService');
      const result = await queryRelatedDeep('A', 3, 'both');
      expect(result).toEqual([]);
    });

    it('returns an empty array if the backend returns something non-array', async () => {
      invoke.mockResolvedValue(null);
      const { queryRelatedDeep } = await import('../../services/memoryGraphService');
      const result = await queryRelatedDeep('A', 3, 'backward');
      expect(result).toEqual([]);
    });
  });

  describe('listAllNodes', () => {
    it('returns the nodes array from the backend', async () => {
      const nodes = [{ id: 'memory_item:a', nodeType: 'memory_item', refId: 'a', createdAtMs: 123 }];
      invoke.mockResolvedValue(nodes);
      const { listAllNodes } = await import('../../services/memoryGraphService');
      const result = await listAllNodes(500);
      expect(result).toEqual(nodes);
      expect(invoke).toHaveBeenCalledWith('memory_graph_list_nodes', { limit: 500 });
    });

    it('returns an empty array instead of throwing when invoke fails', async () => {
      invoke.mockRejectedValue(new Error('not in tauri'));
      const { listAllNodes } = await import('../../services/memoryGraphService');
      const result = await listAllNodes(500);
      expect(result).toEqual([]);
    });

    it('returns an empty array if the backend returns something non-array', async () => {
      invoke.mockResolvedValue(null);
      const { listAllNodes } = await import('../../services/memoryGraphService');
      const result = await listAllNodes(500);
      expect(result).toEqual([]);
    });
  });

  describe('listAllEdges', () => {
    it('returns the edges array from the backend', async () => {
      const edges = [{
        id: 'edge-1', fromNodeId: 'a', toNodeId: 'b', edgeType: 'mentions',
        confidence: 'verified', createdBy: 'jose', createdEvent: null, createdAtMs: 123
      }];
      invoke.mockResolvedValue(edges);
      const { listAllEdges } = await import('../../services/memoryGraphService');
      const result = await listAllEdges(1000);
      expect(result).toEqual(edges);
      expect(invoke).toHaveBeenCalledWith('memory_graph_list_edges', { limit: 1000 });
    });

    it('returns an empty array instead of throwing when invoke fails', async () => {
      invoke.mockRejectedValue(new Error('not in tauri'));
      const { listAllEdges } = await import('../../services/memoryGraphService');
      const result = await listAllEdges(1000);
      expect(result).toEqual([]);
    });

    it('returns an empty array if the backend returns something non-array', async () => {
      invoke.mockResolvedValue(null);
      const { listAllEdges } = await import('../../services/memoryGraphService');
      const result = await listAllEdges(1000);
      expect(result).toEqual([]);
    });
  });

  describe('inferEdges', () => {
    it('calls the backend with scope and max suggestions, and returns the created edges', async () => {
      const edges = [{
        id: 'edge-inf-1', fromNodeId: 'A', toNodeId: 'C', edgeType: 'related',
        confidence: 'inferred', createdBy: 'system:inference', createdEvent: null, createdAtMs: 123
      }];
      invoke.mockResolvedValue(edges);
      const { inferEdges } = await import('../../services/memoryGraphService');
      const result = await inferEdges(['A', 'B'], 5);
      expect(result).toEqual(edges);
      expect(invoke).toHaveBeenCalledWith('memory_graph_infer_edges', {
        scopeNodeIds: ['A', 'B'],
        maxSuggestions: 5
      });
    });

    it('returns an empty array instead of throwing when invoke fails', async () => {
      invoke.mockRejectedValue(new Error('not in tauri'));
      const { inferEdges } = await import('../../services/memoryGraphService');
      const result = await inferEdges(['A'], 5);
      expect(result).toEqual([]);
    });

    it('returns an empty array if the backend returns something non-array', async () => {
      invoke.mockResolvedValue(null);
      const { inferEdges } = await import('../../services/memoryGraphService');
      const result = await inferEdges(['A'], 5);
      expect(result).toEqual([]);
    });
  });
});
