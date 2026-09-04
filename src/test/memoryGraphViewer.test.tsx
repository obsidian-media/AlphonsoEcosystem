import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const mockForceGraph3D = vi.fn((props: any) => (
  <div data-testid="force-graph-3d" data-graph-data={JSON.stringify(props.graphData)} />
));

vi.mock('react-force-graph-3d', () => ({
  default: (props: any) => mockForceGraph3D(props)
}));

vi.mock('../services/memoryGraphService', () => ({
  listAllNodes: vi.fn(),
  listAllEdges: vi.fn(),
  queryRelated: vi.fn()
}));

import { listAllNodes, listAllEdges, queryRelated } from '../services/memoryGraphService';
import { MemoryGraphViewer, NODE_TYPE_COLORS } from '../components/MemoryGraphViewer';

describe('MemoryGraphViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an empty state when there are no nodes', async () => {
    vi.mocked(listAllNodes).mockResolvedValue([]);
    vi.mocked(listAllEdges).mockResolvedValue([]);

    render(<MemoryGraphViewer size="compact" />);

    expect(await screen.findByText(/no memory graph data yet/i)).toBeInTheDocument();
  });

  it('fetches nodes and edges on mount and passes them to ForceGraph3D', async () => {
    vi.mocked(listAllNodes).mockResolvedValue([
      { id: 'memory_item:a', nodeType: 'memory_item', refId: 'a', createdAtMs: 100 },
      { id: 'memory_item:b', nodeType: 'memory_item', refId: 'b', createdAtMs: 200 }
    ]);
    vi.mocked(listAllEdges).mockResolvedValue([
      { id: 'edge-1', fromNodeId: 'memory_item:a', toNodeId: 'memory_item:b', edgeType: 'mentions', confidence: 'verified', createdBy: 'echo', createdEvent: null, createdAtMs: 150 }
    ]);

    render(<MemoryGraphViewer size="compact" />);

    await waitFor(() => expect(screen.getByTestId('force-graph-3d')).toBeInTheDocument());
    const graphData = JSON.parse(screen.getByTestId('force-graph-3d').getAttribute('data-graph-data') || '{}');
    expect(graphData.nodes).toHaveLength(2);
    expect(graphData.links).toEqual([
      { source: 'memory_item:a', target: 'memory_item:b', id: 'edge-1', edgeType: 'mentions', confidence: 'verified', createdBy: 'echo', createdEvent: null, createdAtMs: 150 }
    ]);
  });

  it('requests 500 nodes and 1000 edges', async () => {
    vi.mocked(listAllNodes).mockResolvedValue([]);
    vi.mocked(listAllEdges).mockResolvedValue([]);

    render(<MemoryGraphViewer size="compact" />);

    await waitFor(() => expect(listAllNodes).toHaveBeenCalledWith(500));
    expect(listAllEdges).toHaveBeenCalledWith(1000);
  });

  it('colors nodes by node type, with a fallback for unmapped types', async () => {
    vi.mocked(listAllNodes).mockResolvedValue([
      { id: 'memory_item:a', nodeType: 'memory_item', refId: 'a', createdAtMs: 100 },
      { id: 'research_report:b', nodeType: 'research_report', refId: 'b', createdAtMs: 100 },
      { id: 'mystery:c', nodeType: 'some_future_type', refId: 'c', createdAtMs: 100 }
    ]);
    vi.mocked(listAllEdges).mockResolvedValue([]);

    render(<MemoryGraphViewer size="compact" />);

    await waitFor(() => expect(mockForceGraph3D).toHaveBeenCalled());
    const props = mockForceGraph3D.mock.calls[mockForceGraph3D.mock.calls.length - 1][0];
    expect(typeof props.nodeColor).toBe('function');
    expect(props.nodeColor({ nodeType: 'memory_item' })).toBe(NODE_TYPE_COLORS.memory_item);
    expect(props.nodeColor({ nodeType: 'research_report' })).toBe(NODE_TYPE_COLORS.research_report);
    expect(props.nodeColor({ nodeType: 'some_future_type' })).toBe(NODE_TYPE_COLORS.default);
  });

  it('opens a detail panel with the node fields and its direct connections when a node is clicked', async () => {
    vi.mocked(listAllNodes).mockResolvedValue([
      { id: 'memory_item:a', nodeType: 'memory_item', refId: 'a', createdAtMs: 100 },
      { id: 'memory_item:b', nodeType: 'memory_item', refId: 'b', createdAtMs: 200 }
    ]);
    vi.mocked(listAllEdges).mockResolvedValue([]);
    vi.mocked(queryRelated).mockResolvedValue([
      { id: 'edge-1', fromNodeId: 'memory_item:a', toNodeId: 'memory_item:b', edgeType: 'mentions', confidence: 'verified', createdBy: 'echo', createdEvent: null, createdAtMs: 150 }
    ]);

    render(<MemoryGraphViewer size="compact" />);
    await waitFor(() => expect(mockForceGraph3D).toHaveBeenCalled());

    const props = mockForceGraph3D.mock.calls[mockForceGraph3D.mock.calls.length - 1][0];
    props.onNodeClick({ id: 'memory_item:a', nodeType: 'memory_item', refId: 'a', createdAtMs: 100 });

    expect(await screen.findByText('memory_item')).toBeInTheDocument();
    expect(await screen.findByText(/mentions/i)).toBeInTheDocument();
    expect(queryRelated).toHaveBeenCalledWith('memory_item:a');
  });

  it('selects the other node when a listed connection is clicked, without re-fetching graph data', async () => {
    vi.mocked(listAllNodes).mockResolvedValue([
      { id: 'memory_item:a', nodeType: 'memory_item', refId: 'a', createdAtMs: 100 },
      { id: 'research_report:b', nodeType: 'research_report', refId: 'b', createdAtMs: 200 }
    ]);
    vi.mocked(listAllEdges).mockResolvedValue([]);
    vi.mocked(queryRelated).mockImplementation(async (nodeId: string) => {
      if (nodeId === 'memory_item:a') {
        return [{ id: 'edge-1', fromNodeId: 'memory_item:a', toNodeId: 'research_report:b', edgeType: 'mentions', confidence: 'verified', createdBy: 'echo', createdEvent: null, createdAtMs: 150 }];
      }
      return [];
    });

    render(<MemoryGraphViewer size="compact" />);
    await waitFor(() => expect(mockForceGraph3D).toHaveBeenCalled());

    const props = mockForceGraph3D.mock.calls[mockForceGraph3D.mock.calls.length - 1][0];
    props.onNodeClick({ id: 'memory_item:a', nodeType: 'memory_item', refId: 'a', createdAtMs: 100 });
    await screen.findByText(/mentions/i);

    const connectionButton = await screen.findByRole('button', { name: /research_report:b/i });
    connectionButton.click();

    expect(await screen.findByText('research_report')).toBeInTheDocument();
    expect(listAllNodes).toHaveBeenCalledTimes(1);
    expect(listAllEdges).toHaveBeenCalledTimes(1);
  });
});
