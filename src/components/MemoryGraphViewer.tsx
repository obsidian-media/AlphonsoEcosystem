import React, { useEffect, useState } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { listAllNodes, listAllEdges, type GraphNode, type GraphEdge } from '../services/memoryGraphService';

const NODE_LIMIT = 500;
const EDGE_LIMIT = 1000;

interface MemoryGraphViewerProps {
  size: 'compact' | 'full';
}

interface ForceGraphNode {
  id: string;
  nodeType: string;
  refId: string;
  createdAtMs: number;
}

interface ForceGraphLink {
  source: string;
  target: string;
  id: string;
  edgeType: string;
  confidence: string;
  createdBy: string;
  createdEvent: string | null;
  createdAtMs: number;
}

function toGraphData(nodes: GraphNode[], edges: GraphEdge[]): { nodes: ForceGraphNode[]; links: ForceGraphLink[] } {
  return {
    nodes: nodes.map((n) => ({ id: n.id, nodeType: n.nodeType, refId: n.refId, createdAtMs: n.createdAtMs })),
    links: edges.map((e) => ({
      source: e.fromNodeId,
      target: e.toNodeId,
      id: e.id,
      edgeType: e.edgeType,
      confidence: e.confidence,
      createdBy: e.createdBy,
      createdEvent: e.createdEvent,
      createdAtMs: e.createdAtMs
    }))
  };
}

export function MemoryGraphViewer({ size }: MemoryGraphViewerProps) {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([listAllNodes(NODE_LIMIT), listAllEdges(EDGE_LIMIT)]).then(([nodeRows, edgeRows]) => {
      if (cancelled) return;
      setNodes(nodeRows);
      setEdges(edgeRows);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  if (!loading && nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-[var(--text-3)]">
        No memory graph data yet.
      </div>
    );
  }

  const graphData = toGraphData(nodes, edges);
  const height = size === 'full' ? window.innerHeight * 0.8 : 240;

  return (
    <div className={size === 'full' ? 'h-full w-full' : 'h-60 w-full'}>
      <ForceGraph3D graphData={graphData} height={height} />
    </div>
  );
}
