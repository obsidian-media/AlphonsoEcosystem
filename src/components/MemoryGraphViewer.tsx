import React, { useEffect, useState } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { listAllNodes, listAllEdges, queryRelated, type GraphNode, type GraphEdge } from '../services/memoryGraphService';

const NODE_LIMIT = 500;
const EDGE_LIMIT = 1000;

export const NODE_TYPE_COLORS: Record<string, string> = {
  memory_item: '#6366f1',
  boardroom_message: '#f59e0b',
  research_report: '#06b6d4',
  source: '#84cc16',
  receipt: '#ec4899',
  packet: '#8b5cf6',
  default: '#71717a'
};

function colorForNodeType(nodeType: string): string {
  return NODE_TYPE_COLORS[nodeType] || NODE_TYPE_COLORS.default;
}

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

  const [selectedNode, setSelectedNode] = useState<ForceGraphNode | null>(null);
  const [connections, setConnections] = useState<GraphEdge[]>([]);

  useEffect(() => {
    if (!selectedNode) {
      setConnections([]);
      return;
    }
    let cancelled = false;
    queryRelated(selectedNode.id).then((edges) => {
      if (!cancelled) setConnections(edges);
    });
    return () => { cancelled = true; };
  }, [selectedNode]);

  function selectNodeById(nodeId: string) {
    const found = nodes.find((n) => n.id === nodeId);
    if (found) setSelectedNode({ id: found.id, nodeType: found.nodeType, refId: found.refId, createdAtMs: found.createdAtMs });
  }

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
    <div className={size === 'full' ? 'h-full w-full flex gap-4' : 'h-60 w-full flex gap-4'}>
      <div className={size === 'full' ? 'flex-1' : 'flex-1 h-60'}>
        <ForceGraph3D
          graphData={graphData}
          height={height}
          nodeColor={(node: ForceGraphNode) => colorForNodeType(node.nodeType)}
          onNodeClick={(node: ForceGraphNode) => setSelectedNode(node)}
        />
      </div>
      {selectedNode && (
        <div className="w-56 shrink-0 overflow-y-auto text-sm text-[var(--text-2)] space-y-2">
          <p className="font-semibold">{selectedNode.nodeType}</p>
          <p className="text-xs text-[var(--text-3)]">{selectedNode.refId}</p>
          <p className="text-xs text-[var(--text-3)]">{new Date(selectedNode.createdAtMs).toLocaleString()}</p>
          <div className="pt-2 border-t border-[var(--border)] space-y-1">
            <p className="section-label">Connections</p>
            {connections.length === 0 && <p className="text-xs text-[var(--text-3)]">None</p>}
            {connections.map((edge) => {
              const otherId = edge.fromNodeId === selectedNode.id ? edge.toNodeId : edge.fromNodeId;
              return (
                <button
                  key={edge.id}
                  onClick={() => selectNodeById(otherId)}
                  className="block w-full text-left text-xs text-[var(--text-2)] hover:text-[var(--text-1)]"
                >
                  {edge.edgeType} → {otherId}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
