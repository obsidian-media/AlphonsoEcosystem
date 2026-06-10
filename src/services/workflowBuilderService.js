/**
 * Visual/node-based workflow builder.
 * Workflows are stored in localStorage as nodes+edges arrays intended for a drag-and-drop UI.
 * Each workflow has typed nodes (trigger, ocr, analysis, condition, etc.) and edges between them.
 *
 * @see ./workflowOperationsRegistryService — predefined governance-enriched operations (16 workflows with agentSequence, riskLevel, connectorRequirements)
 * @see ./workflowRegistryService — predefined agent-chain workflows (25+ workflows routed through Jose)
 * @see ./workflowExecutionService — execution engine that runs visual workflows from this builder AND operations from the ops registry
 *
 * DIFFERENCE: workflowBuilderService = user-built visual/node-based workflows (stored in localStorage as nodes+edges).
 *             workflowOperationsRegistryService = 16 predefined operations with governance metadata (risk, approvals, etc.).
 *             They are complementary — the builder creates arbitrary graphs; the ops registry provides governed templates.
 */

import { TRUST_STATES, timestampMs } from './trustModel';

const WORKFLOW_KEY = 'alphonso_visual_workflows_v1';

export const WORKFLOW_NODE_LIBRARY = [
  { type: 'trigger', label: 'Trigger', category: 'flow' },
  { type: 'ocr', label: 'OCR Check', category: 'intelligence' },
  { type: 'memory', label: 'Memory Link', category: 'intelligence' },
  { type: 'analysis', label: 'AI Analysis', category: 'ai' },
  { type: 'condition', label: 'Condition', category: 'logic' },
  { type: 'approval', label: 'Approval Gate', category: 'control' },
  { type: 'action', label: 'Action', category: 'execution' },
  { type: 'notification', label: 'Notification', category: 'reporting' },
  { type: 'report', label: 'Report', category: 'reporting' }
];

function readWorkflows() {
  try {
    const raw = localStorage.getItem(WORKFLOW_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeWorkflows(items) {
  localStorage.setItem(WORKFLOW_KEY, JSON.stringify(items.slice(-120)));
}

export function listWorkflows() {
  return readWorkflows();
}

export function createWorkflow(name, agentScope = 'shared') {
  if (!name || typeof name !== 'string' || !name.trim()) return null;
  if (typeof agentScope !== 'string' || !agentScope) agentScope = 'shared';
  const workflows = readWorkflows();
  const workflow = {
    id: `wf-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    name: name.trim(),
    agentScope,
    nodes: [],
    edges: [],
    trust: TRUST_STATES.TEMPORARY,
    createdAtMs: timestampMs(),
    updatedAtMs: timestampMs()
  };
  workflows.push(workflow);
  writeWorkflows(workflows);
  return workflow;
}

export function updateWorkflow(workflowId, updates) {
  if (!workflowId || !updates || typeof updates !== 'object' || Array.isArray(updates)) return null;
  const workflows = readWorkflows().map((workflow) => (
    workflow.id === workflowId ? { ...workflow, ...updates, updatedAtMs: timestampMs() } : workflow
  ));
  writeWorkflows(workflows);
  return workflows.find((workflow) => workflow.id === workflowId) || null;
}

export function addWorkflowNode(workflowId, type, position = { x: 0, y: 0 }, config = {}) {
  if (!workflowId || !type) return null;
  if (!position || typeof position !== 'object') position = { x: 0, y: 0 };
  if (typeof config !== 'object' || config === null) config = {};
  const workflows = readWorkflows().map((workflow) => {
    if (workflow.id !== workflowId) return workflow;
    const node = {
      id: `node-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
      type,
      position,
      config,
      trust: TRUST_STATES.TEMPORARY,
      createdAtMs: timestampMs()
    };
    return {
      ...workflow,
      nodes: [...workflow.nodes, node],
      updatedAtMs: timestampMs()
    };
  });
  writeWorkflows(workflows);
  return workflows.find((workflow) => workflow.id === workflowId) || null;
}

export function addWorkflowEdge(workflowId, fromNode, toNode, condition = 'always') {
  if (!workflowId || !fromNode || !toNode) return null;
  const workflows = readWorkflows().map((workflow) => {
    if (workflow.id !== workflowId) return workflow;
    const edge = {
      id: `edge-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
      fromNode,
      toNode,
      condition: condition || 'always'
    };
    return {
      ...workflow,
      edges: [...workflow.edges, edge],
      updatedAtMs: timestampMs()
    };
  });
  writeWorkflows(workflows);
  return workflows.find((workflow) => workflow.id === workflowId) || null;
}
