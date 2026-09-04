import { invoke } from '@tauri-apps/api/core';
import type { TrustState } from './trustModel';

export interface GraphEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  edgeType: string;
  confidence: string;
  createdBy: string;
  createdEvent: string | null;
  createdAtMs: number;
}

export interface AddEdgeOptions {
  confidence: TrustState;
  createdBy: string;
  createdEvent?: string;
}

export type TraversalDirection = 'forward' | 'backward' | 'both';

export interface GraphEdgeWithDepth extends GraphEdge {
  depth: number;
}

export interface GraphNode {
  id: string;
  nodeType: string;
  refId: string;
  createdAtMs: number;
}

/**
 * Creates (or no-ops if it already exists) a graph node for the given
 * node type + ref id pair. Node ids are deterministic ("{nodeType}:{refId}"),
 * so callers never need to look up an id separately before building an edge.
 * Returns null instead of throwing when the Tauri backend is unavailable
 * (e.g. running in a plain browser during development).
 */
export async function addNode(nodeType: string, refId: string): Promise<string | null> {
  try {
    return await invoke<string>('memory_graph_add_node', { nodeType, refId });
  } catch {
    return null;
  }
}

/**
 * Records a typed, directed edge between two already-known node ids.
 * Phase 1 is manual-only: callers must only invoke this at a moment they
 * already know a real relationship exists — no inference happens here.
 */
export async function addEdge(
  fromNodeId: string,
  toNodeId: string,
  edgeType: string,
  opts: AddEdgeOptions
): Promise<string | null> {
  try {
    return await invoke<string>('memory_graph_add_edge', {
      fromNodeId,
      toNodeId,
      edgeType,
      confidence: opts.confidence,
      createdBy: opts.createdBy,
      createdEvent: opts.createdEvent ?? null
    });
  } catch {
    return null;
  }
}

/**
 * One-hop neighbors only. Multi-hop traversal is `queryRelatedDeep` (Phase
 * 2), a separate function — not an extension of this one. This function's
 * behavior and signature are unchanged since Phase 1.
 */
export async function queryRelated(nodeId: string): Promise<GraphEdge[]> {
  try {
    const rows = await invoke<GraphEdge[]>('memory_graph_query_related', { nodeId });
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

/**
 * Phase 2 query capability: multi-hop traversal via the backend's
 * `WITH RECURSIVE` implementation. `maxDepth` and `direction` are required,
 * not optional/defaulted — every call site must state its own intent
 * rather than inherit an invisible default. There is no ceiling on
 * `maxDepth`; the backend's cycle protection (visited-edge tracking) is
 * what prevents a runaway query, not a depth cap.
 */
export async function queryRelatedDeep(
  nodeId: string,
  maxDepth: number,
  direction: TraversalDirection
): Promise<GraphEdgeWithDepth[]> {
  try {
    const rows = await invoke<GraphEdgeWithDepth[]>('memory_graph_query_related_deep', {
      nodeId,
      maxDepth,
      direction
    });
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

/**
 * Fetches up to `limit` nodes, most recently created first. Every other
 * query function in this file starts from a single node id -- this and
 * `listAllEdges` are the only way to see the whole graph.
 */
export async function listAllNodes(limit: number): Promise<GraphNode[]> {
  try {
    const rows = await invoke<GraphNode[]>('memory_graph_list_nodes', { limit });
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

/**
 * Fetches up to `limit` edges, most recently created first.
 */
export async function listAllEdges(limit: number): Promise<GraphEdge[]> {
  try {
    const rows = await invoke<GraphEdge[]>('memory_graph_list_edges', { limit });
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}
