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

import { listAllNodes, listAllEdges } from '../services/memoryGraphService';
import { MemoryGraphViewer } from '../components/MemoryGraphViewer';

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
});
