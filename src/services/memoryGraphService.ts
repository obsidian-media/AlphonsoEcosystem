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
 * Phase 1 query capability: direct (one-hop) neighbors only. Multi-hop
 * traversal is a Phase 2 addition to this same function, not a new one.
 */
export async function queryRelated(nodeId: string): Promise<GraphEdge[]> {
  try {
    const rows = await invoke<GraphEdge[]>('memory_graph_query_related', { nodeId });
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}
