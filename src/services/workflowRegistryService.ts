/**
 * Agent-chain workflow registry — 25+ predefined workflows routed through Jose.
 * Each workflow defines an agent chain, task list, and expected outputs.
 * These workflows are simpler than ops-registry workflows — they focus on agent orchestration
 * rather than governance metadata.
 *
 * @see ./workflowOperationsRegistryService — governance-enriched operations with risk/approval/connector metadata
 * @see ./workflowBuilderService — visual/node-based workflow builder (user-created, stored as nodes+edges)
 * @see ./workflowExecutionService — execution engine for operations and visual workflows
 *
 * DIFFERENCE: workflowRegistryService = 25+ static agent-chain workflows (routed through Jose).
 *             workflowOperationsRegistryService = 16 governed operations with rich metadata.
 *             workflowBuilderService = user-built visual graphs.
 */

import { AGENTS, createAgentPacket } from './agentBusService';
import { createJoseCommandRoute } from './joseCommandRouterService';
import { TRUST_STATES, timestampMs } from './trustModel';
import { appendSessionEvent } from './sessionIntelligenceService';
import { appendConnectorAudit } from './connectorRegistryService';
import { executeWorkflowStep } from './workflowExecutionService';

// ── Types ─────────────────────────────────────────────────────────────────────

interface WorkflowDefinition {
  id: string;
  name: string;
  purpose: string;
  chain: string[];
  tasks: string[];
  outputs: string[];
}

interface WorkflowContext {
  prompt?: string;
  command?: string;
  source?: string;
  zeroCostMode?: boolean;
  [key: string]: unknown;
}

interface JoseRoute {
  id: string;
  assignments?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

interface WorkflowRunResult {
  ok: boolean;
  workflowId?: string;
  workflow?: string;
  commandId?: string;
  assignments?: Array<Record<string, unknown>>;
  chain?: string[];
  outputTarget?: string;
  error?: string;
}

interface WorkflowChainResult extends WorkflowRunResult {
  chain?: string[];
  steps?: Array<{
    agent: string;
    packetId: string;
    execution: unknown;
  }>;
  stepCount?: number;
}

interface WorkflowTaskResult {
  ok: boolean;
  workflowId?: string;
  workflow?: string;
  results?: Array<{
    task: string;
    execution: unknown;
  }>;
  outputCount?: number;
  error?: string;
}

// ── Workflows ─────────────────────────────────────────────────────────────────

export const WORKFLOWS: Record<string, WorkflowDefinition> = {
  WF_AI_SELF_DEV: {
    id: 'WF_AI_SELF_DEV',
    name: 'AI Self-Development',
    purpose: 'Improve Alphonso.',
    chain: [AGENTS.JOSE, AGENTS.ALPHONSO, AGENTS.NOVA, AGENTS.MARIA],
    tasks: [
      'Repo Audits',
      'Technical Debt',
      'Missing Features',
      'Bug Discovery',
      'Improvement Packets',
      'Codex Packets'
    ],
    outputs: ['Development Roadmaps', 'Improvement Reports', 'Technical Audits']
  },
  WF_PRODUCT_DEV: {
    id: 'WF_PRODUCT_DEV',
    name: 'Product Development',
    purpose: 'Build products.',
    chain: [AGENTS.JOSE, AGENTS.NOVA, AGENTS.HECTOR, AGENTS.MIYA, AGENTS.ALPHONSO, AGENTS.MARIA],
    tasks: [
      'Research',
      'Requirements',
      'Architecture',
      'UX',
      'Development',
      'Testing',
      'Launch Readiness'
    ],
    outputs: ['PRDs', 'Architecture Docs', 'Launch Plans']
  },
  WF_REVENUE_GEN: {
    id: 'WF_REVENUE_GEN',
    name: 'Revenue Generation',
    purpose: 'Generate income.',
    chain: [AGENTS.JOSE, AGENTS.NOVA, AGENTS.HECTOR, AGENTS.MARCUS],
    tasks: [
      'Lead Discovery',
      'Client Prospecting',
      'Partnerships',
      'Grants',
      'Tenders',
      'Opportunities'
    ],
    outputs: ['Revenue Pipeline', 'Opportunity Reports']
  },
  WF_CONSTRUCTION_OPS: {
    id: 'WF_CONSTRUCTION_OPS',
    name: 'Construction Operations',
    purpose: 'Run construction business.',
    chain: [AGENTS.JOSE, AGENTS.NOVA, AGENTS.HECTOR, AGENTS.ALPHONSO, AGENTS.MARIA],
    tasks: [
      'Estimating',
      'Scheduling',
      'Permits',
      'Procurement',
      'Inspections',
      'Site Coordination',
      'Subcontractors'
    ],
    outputs: ['Quotes', 'Budgets', 'Schedules']
  },
  WF_CONTENT_EMPIRE: {
    id: 'WF_CONTENT_EMPIRE',
    name: 'Content Empire',
    purpose: 'Manage media channels.',
    chain: [AGENTS.JOSE, AGENTS.NOVA, AGENTS.HECTOR, AGENTS.MIYA, AGENTS.MARCUS],
    tasks: [
      'Content Planning',
      'Script Writing',
      'Storyboards',
      'Production',
      'Publishing'
    ],
    outputs: ['Content Calendar', 'Videos', 'Posts']
  },
  WF_OPPORTUNITY_RADAR: {
    id: 'WF_OPPORTUNITY_RADAR',
    name: 'Opportunity Radar',
    purpose: 'Scan world continuously.',
    chain: [AGENTS.JOSE, AGENTS.NOVA, AGENTS.HECTOR],
    tasks: [
      'Trends',
      'Competitors',
      'Funding',
      'Startups',
      'Risks'
    ],
    outputs: ['Alerts', 'Opportunity Feed']
  },
  WF_PERSONAL_COS: {
    id: 'WF_PERSONAL_COS',
    name: 'Personal Chief of Staff',
    purpose: "Run Shayan's life.",
    chain: [AGENTS.JOSE, AGENTS.NOVA, AGENTS.ECHO],
    tasks: [
      'Priorities',
      'Calendar',
      'Follow-ups',
      'Decision Support',
      'Goal Tracking'
    ],
    outputs: ['Daily Briefings', 'Weekly Reviews']
  },
  WF_LEARNING_MASTERY: {
    id: 'WF_LEARNING_MASTERY',
    name: 'Learning & Mastery',
    purpose: 'Skill development.',
    chain: [AGENTS.JOSE, AGENTS.NOVA, AGENTS.HECTOR],
    tasks: [
      'Courses',
      'Certifications',
      'Learning Plans',
      'Testing'
    ],
    outputs: ['Learning Roadmaps']
  },
  WF_ECOSYSTEM_EXPANSION: {
    id: 'WF_ECOSYSTEM_EXPANSION',
    name: 'Ecosystem Expansion',
    purpose: 'Grow Alphonso.',
    chain: [AGENTS.JOSE, AGENTS.NOVA, AGENTS.ALPHONSO, AGENTS.MARCUS],
    tasks: [
      'Connectors',
      'Agents',
      'Integrations',
      'Marketplace'
    ],
    outputs: ['Expansion Plans']
  },
  WF_MARKETING_OPS: {
    id: 'WF_MARKETING_OPS',
    name: 'Marketing Operations',
    purpose: 'Drive demand.',
    chain: [AGENTS.JOSE, AGENTS.NOVA, AGENTS.MIYA, AGENTS.MARCUS],
    tasks: [
      'Campaign Planning',
      'Funnel Design',
      'Lead Magnets',
      'Ad Strategy',
      'Conversion Tracking'
    ],
    outputs: ['Marketing Systems']
  },
  WF_SOCIAL_MEDIA_OPS: {
    id: 'WF_SOCIAL_MEDIA_OPS',
    name: 'Social Media Operations',
    purpose: 'Own owned channels.',
    chain: [AGENTS.JOSE, AGENTS.NOVA, AGENTS.MIYA, AGENTS.MARCUS],
    tasks: [
      'Scheduling',
      'Posting',
      'Analytics',
      'Community Management'
    ],
    outputs: ['Growth Reports']
  },
  WF_YOUTUBE_CHANNEL: {
    id: 'WF_YOUTUBE_CHANNEL',
    name: 'YouTube Channel Management',
    purpose: 'Grow YouTube channel.',
    chain: [AGENTS.JOSE, AGENTS.NOVA, AGENTS.HECTOR, AGENTS.MIYA, AGENTS.MARCUS],
    tasks: [
      'Research',
      'Scripts',
      'Production',
      'Upload',
      'Analytics'
    ],
    outputs: ['Channel Growth Plans']
  },
  WF_LINKEDIN_AUTHORITY: {
    id: 'WF_LINKEDIN_AUTHORITY',
    name: 'LinkedIn Authority Building',
    purpose: 'Build thought leadership.',
    chain: [AGENTS.JOSE, AGENTS.NOVA, AGENTS.MIYA],
    tasks: [
      'Thought Leadership',
      'Networking',
      'Content'
    ],
    outputs: ['Authority Reports']
  },
  WF_SALES_OPS: {
    id: 'WF_SALES_OPS',
    name: 'Sales Operations',
    purpose: 'Run pipelines.',
    chain: [AGENTS.JOSE, AGENTS.NOVA, AGENTS.MARCUS],
    tasks: [
      'Prospecting',
      'Qualification',
      'CRM Updates',
      'Follow-Ups'
    ],
    outputs: ['Sales Pipeline']
  },
  WF_CLIENT_ACQUISITION: {
    id: 'WF_CLIENT_ACQUISITION',
    name: 'Client Acquisition',
    purpose: 'Acquire new clients.',
    chain: [AGENTS.JOSE, AGENTS.NOVA, AGENTS.HECTOR, AGENTS.MARCUS],
    tasks: [
      'Lead Discovery',
      'Outreach',
      'Qualification',
      'Conversion'
    ],
    outputs: ['New Clients']
  },
  WF_REPUTATION_MGMT: {
    id: 'WF_REPUTATION_MGMT',
    name: 'Reputation Management',
    purpose: 'Protect brand.',
    chain: [AGENTS.JOSE, AGENTS.NOVA, AGENTS.SENTINEL, AGENTS.MIYA],
    tasks: [
      'Brand Monitoring',
      'Mentions',
      'Sentiment Analysis'
    ],
    outputs: ['Reputation Dashboard']
  },
  WF_CUSTOMER_SUCCESS: {
    id: 'WF_CUSTOMER_SUCCESS',
    name: 'Customer Success',
    purpose: 'Retain clients.',
    chain: [AGENTS.JOSE, AGENTS.NOVA, AGENTS.MARIA, AGENTS.ECHO],
    tasks: [
      'Onboarding',
      'Retention',
      'Satisfaction'
    ],
    outputs: ['Success Metrics']
  },
  WF_KNOWLEDGE_PRESERVATION: {
    id: 'WF_KNOWLEDGE_PRESERVATION',
    name: 'Knowledge Preservation',
    purpose: 'Archive org knowledge.',
    chain: [AGENTS.JOSE, AGENTS.ECHO, AGENTS.MARIA],
    tasks: [
      'Archive',
      'Summaries',
      'Documentation'
    ],
    outputs: ['Knowledge Vault']
  },
  WF_AUTOMATION_GOVERNANCE: {
    id: 'WF_AUTOMATION_GOVERNANCE',
    name: 'Automation Governance',
    purpose: 'Govern automations.',
    chain: [AGENTS.JOSE, AGENTS.MARIA, AGENTS.SENTINEL],
    tasks: [
      'Automation Audits',
      'Approval Reviews',
      'Risk Reviews'
    ],
    outputs: ['Governance Reports']
  },
  WF_STARTUP_LAUNCH: {
    id: 'WF_STARTUP_LAUNCH',
    name: 'Startup Launch Engine',
    purpose: 'Launch new ventures.',
    chain: [AGENTS.JOSE, AGENTS.NOVA, AGENTS.HECTOR, AGENTS.MIYA, AGENTS.ALPHONSO, AGENTS.MARCUS],
    tasks: [
      'Validation',
      'MVP',
      'Go-To-Market',
      'Fundraising'
    ],
    outputs: ['Startup Playbook']
  },
  WF_INVESTMENT_INTEL: {
    id: 'WF_INVESTMENT_INTEL',
    name: 'Investment Intelligence',
    purpose: 'Evaluate investments.',
    chain: [AGENTS.JOSE, AGENTS.NOVA, AGENTS.HECTOR],
    tasks: [
      'Market Analysis',
      'Risk Analysis',
      'Portfolio Reviews'
    ],
    outputs: ['Investment Reports']
  },
  WF_REAL_ESTATE_OPS: {
    id: 'WF_REAL_ESTATE_OPS',
    name: 'Real Estate Operations',
    purpose: 'Run real estate.',
    chain: [AGENTS.JOSE, AGENTS.NOVA, AGENTS.HECTOR, AGENTS.ALPHONSO],
    tasks: [
      'Property Research',
      'Deal Analysis',
      'Rental Management'
    ],
    outputs: ['Property Reports']
  },
  WF_PROCUREMENT_MGMT: {
    id: 'WF_PROCUREMENT_MGMT',
    name: 'Procurement Management',
    purpose: 'Manage purchasing.',
    chain: [AGENTS.JOSE, AGENTS.NOVA, AGENTS.MARCUS, AGENTS.MARIA],
    tasks: [
      'Vendor Selection',
      'RFQs',
      'Purchasing'
    ],
    outputs: ['Procurement Plans']
  },
  WF_FINANCIAL_INTEL: {
    id: 'WF_FINANCIAL_INTEL',
    name: 'Financial Intelligence',
    purpose: 'Operate financial view.',
    chain: [AGENTS.JOSE, AGENTS.NOVA, AGENTS.ALPHONSO],
    tasks: [
      'Budgeting',
      'Forecasting',
      'Cash Flow'
    ],
    outputs: ['Financial Dashboards']
  },
  WF_RECRUITMENT_ENGINE: {
    id: 'WF_RECRUITMENT_ENGINE',
    name: 'Recruitment Engine',
    purpose: 'Hire people.',
    chain: [AGENTS.JOSE, AGENTS.NOVA, AGENTS.MARCUS, AGENTS.MARIA],
    tasks: [
      'Candidate Search',
      'Screening',
      'Interview Coordination'
    ],
    outputs: ['Hiring Pipelines']
  },
  WF_RISK_MGMT: {
    id: 'WF_RISK_MGMT',
    name: 'Risk Management',
    purpose: 'Mitigate risk.',
    chain: [AGENTS.JOSE, AGENTS.SENTINEL, AGENTS.MARIA],
    tasks: [
      'Threat Analysis',
      'Mitigation',
      'Monitoring'
    ],
    outputs: ['Risk Registers']
  },
  WF_CRISIS_RESPONSE: {
    id: 'WF_CRISIS_RESPONSE',
    name: 'Crisis Response',
    purpose: 'Respond to incidents.',
    chain: [AGENTS.JOSE, AGENTS.SENTINEL, AGENTS.MARIA],
    tasks: [
      'Incident Detection',
      'Escalation',
      'Recovery'
    ],
    outputs: ['Crisis Reports']
  },
  WF_RD_LAB: {
    id: 'WF_RD_LAB',
    name: 'R&D Laboratory',
    purpose: 'Explore emerging tech.',
    chain: [AGENTS.JOSE, AGENTS.HECTOR, AGENTS.MIYA, AGENTS.ALPHONSO],
    tasks: [
      'Emerging Technology Research',
      'AI Evaluation',
      'Prototype Design'
    ],
    outputs: ['Innovation Reports']
  },
  WF_EXECUTIVE_CMD: {
    id: 'WF_EXECUTIVE_CMD',
    name: 'Executive Command Center',
    purpose: 'Highest-level oversight.',
    chain: [AGENTS.JOSE, AGENTS.NOVA, AGENTS.MARIA, AGENTS.ECHO, AGENTS.SENTINEL],
    tasks: [
      'Monitor Every Workflow',
      'Prioritize System Resources',
      'Identify Bottlenecks',
      'Track Business Health',
      'Track Personal Goals',
      'Track Ecosystem Growth',
      'Produce Executive Briefings'
    ],
    outputs: [
      'Daily Executive Report',
      'Weekly Strategic Review',
      'Monthly Board Report',
      'Ecosystem Health Score',
      'AIOS Readiness Score'
    ]
  }
};

export function listWorkflows(): WorkflowDefinition[] {
  return Object.values(WORKFLOWS);
}

export function getWorkflow(workflowId: string): WorkflowDefinition | null {
  return WORKFLOWS[workflowId] || null;
}

function lastInChain(chain: string[]): string {
  return chain[chain.length - 1];
}

export async function runWorkflow(workflowId: string, context: WorkflowContext = {}): Promise<WorkflowRunResult> {
  if (!workflowId || typeof workflowId !== 'string') return { ok: false, error: 'Invalid workflowId.' };
  const workflow = getWorkflow(workflowId);
  if (!workflow) return { ok: false, error: 'Unknown workflow.' };

  const commandText = String(context.prompt || context.command || `Run workflow: ${workflow.name}`).trim();
  let route: JoseRoute;
  try {
    route = (await createJoseCommandRoute({
      commandText,
      source: context.source || 'workflow_engine',
      zeroCostMode: context.zeroCostMode
    })) as unknown as JoseRoute;
  } catch (error: unknown) {
    appendConnectorAudit('workflow', 'jose_route_failed', {
      workflowId,
      error: String(error)
    });
    return { ok: false, workflowId, error: String(error) };
  }

  if (!route) {
    return { ok: false, workflowId, error: 'Jose route creation returned empty.' };
  }

  appendSessionEvent({
    category: 'workflow',
    title: `Workflow activated: ${workflow.name}`,
    details: {
      workflowId,
      commandId: route.id,
      assignmentCount: route.assignments?.length || 0
    },
    agent: AGENTS.JOSE,
    confidence: TRUST_STATES.TEMPORARY,
    verificationState: TRUST_STATES.UNVERIFIED
  });

  appendConnectorAudit('workflow', 'activated', {
    workflowId,
    commandId: route.id,
    chain: workflow.chain,
    outputTarget: lastInChain(workflow.chain)
  });

  return {
    ok: true,
    workflowId,
    workflow: workflow.name,
    commandId: route.id,
    assignments: route.assignments || [],
    chain: workflow.chain,
    outputTarget: lastInChain(workflow.chain)
  };
}

export async function runWorkflowChain(workflowId: string, context: WorkflowContext = {}): Promise<WorkflowChainResult> {
  if (!workflowId || typeof workflowId !== 'string') return { ok: false, error: 'Invalid workflowId.' };
  const workflow = getWorkflow(workflowId);
  if (!workflow) return { ok: false, error: 'Unknown workflow.' };

  const result = await runWorkflow(workflowId, context);
  if (!result.ok) return result;

  const steps: Array<{ agent: string; packetId: string; execution: unknown }> = [];
  const chain = workflow.chain || [AGENTS.JOSE];
  for (const agent of chain) {
    const packet = createAgentPacket({
      fromAgent: AGENTS.JOSE,
      toAgent: agent,
      title: `${workflow.name} chain execution: ${agent}`,
      packetType: 'workflow_chain_step',
      payload: {
        workflowId,
        commandId: result.commandId,
        agent,
        chain,
        context: context || {}
      },
      source: 'workflow_engine',
      confidence: TRUST_STATES.TEMPORARY,
      verificationState: TRUST_STATES.UNVERIFIED,
      requiresApproval: true,
      riskLevel: 'medium',
      actionType: 'workflow_step',
      commandPreview: `Execute ${workflow.name} step as ${agent}.`,
      fileChangePreview: 'No direct file change. Workflow execution via Jose orchestration only.',
      rollbackAvailable: false
    });

    const execution = await executeWorkflowStep({
      ...packet,
      actionType: workflow.tasks?.[0] || 'workflow_step'
    });

    steps.push({
      agent,
      packetId: packet.id,
      execution
    });
  }

  return {
    ...result,
    chain,
    steps,
    stepCount: steps.length
  };
}

export async function executeWorkflowTasks(workflowId: string, context: WorkflowContext = {}): Promise<WorkflowTaskResult> {
  if (!workflowId || typeof workflowId !== 'string') return { ok: false, error: 'Invalid workflowId.' };
  const workflow = getWorkflow(workflowId);
  if (!workflow) return { ok: false, error: 'Unknown workflow.' };

  const results: Array<{ task: string; execution: unknown }> = [];
  for (const task of workflow.tasks || []) {
    const execution = await executeWorkflowStep({
      id: `${workflowId}-${task}`,
      actionType: task,
      payload: {
        workflowId,
        task,
        context: context || {}
      }
    });
    results.push({ task, execution });
  }

  return {
    ok: true,
    workflowId,
    workflow: workflow.name,
    results,
    outputCount: results.length
  };
}

export const WORKFLOW_EXECUTION_SCOPE = 'workflow_execution_v1';
