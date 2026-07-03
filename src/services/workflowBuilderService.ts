import { TRUST_STATES, timestampMs } from './trustModel';

const WORKFLOW_KEY = 'alphonso_visual_workflows_v1';

export interface WorkflowNodeDef {
  type: string;
  label: string;
  category: string;
}

export const WORKFLOW_NODE_LIBRARY: WorkflowNodeDef[] = [
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

export interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  config: Record<string, unknown>;
  trust: string;
  createdAtMs: number;
}

export interface WorkflowEdge {
  id: string;
  fromNode: string;
  toNode: string;
  condition: string;
}

export interface Workflow {
  id: string;
  name: string;
  agentScope: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  trust: string;
  createdAtMs: number;
  updatedAtMs: number;
  [key: string]: unknown;
}

function readWorkflows(): Workflow[] {
  try {
    const raw = localStorage.getItem(WORKFLOW_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeWorkflows(items: Workflow[]): void {
  localStorage.setItem(WORKFLOW_KEY, JSON.stringify(items.slice(-120)));
}

export function listWorkflows(): Workflow[] {
  return readWorkflows();
}

export function createWorkflow(name: string, agentScope = 'shared'): Workflow | null {
  if (!name || typeof name !== 'string' || !name.trim()) return null;
  if (typeof agentScope !== 'string' || !agentScope) agentScope = 'shared';
  const workflows = readWorkflows();
  const workflow: Workflow = {
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

export function updateWorkflow(workflowId: string, updates: Partial<Workflow>): Workflow | null {
  if (!workflowId || !updates || typeof updates !== 'object' || Array.isArray(updates)) return null;
  const workflows = readWorkflows().map((workflow) => (
    workflow.id === workflowId ? { ...workflow, ...updates, updatedAtMs: timestampMs() } : workflow
  ));
  writeWorkflows(workflows);
  return workflows.find((workflow) => workflow.id === workflowId) || null;
}

export function addWorkflowNode(workflowId: string, type: string, position: { x: number; y: number } = { x: 0, y: 0 }, config: Record<string, unknown> = {}): Workflow | null {
  if (!workflowId || !type) return null;
  if (!position || typeof position !== 'object') position = { x: 0, y: 0 };
  if (typeof config !== 'object' || config === null) config = {};
  const workflows = readWorkflows().map((workflow) => {
    if (workflow.id !== workflowId) return workflow;
    const node: WorkflowNode = {
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

export function addWorkflowEdge(workflowId: string, fromNode: string, toNode: string, condition = 'always'): Workflow | null {
  if (!workflowId || !fromNode || !toNode) return null;
  const workflows = readWorkflows().map((workflow) => {
    if (workflow.id !== workflowId) return workflow;
    const edge: WorkflowEdge = {
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
