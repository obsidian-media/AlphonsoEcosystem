import { createAgentOutput, AgentOutputTypes } from '../../agents/shared/agentOutputSchemas';

function createProjectId(name = 'project') {
  return `project-${String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
}

export function createAcceptanceCriteria(project) {
  const features = project?.targetFeatures || [];
  return features.map((feature, index) => ({
    id: `ac-${index + 1}`,
    feature,
    criteria: [
      `Feature "${feature}" has clear UI flow and validation states.`,
      `Feature "${feature}" has test plan and verification owner.`,
      `Feature "${feature}" has explicit risk + rollback notes if needed.`
    ]
  }));
}

export function createRiskRegister(project) {
  const stack = String(project?.stack || '').toLowerCase();
  const risks = [
    { id: 'risk-approval', title: 'Unapproved external action', severity: 'high', mitigation: 'Approval gate required.' },
    { id: 'risk-secrets', title: 'Secret exposure risk', severity: 'critical', mitigation: 'Use env vars + never expose tokens in frontend.' }
  ];
  if (stack.includes('firebase')) {
    risks.push({ id: 'risk-firestore', title: 'Firestore rule misconfiguration', severity: 'high', mitigation: 'Review security rules + emulator tests.' });
  }
  if (stack.includes('stripe') || stack.includes('paypal')) {
    risks.push({ id: 'risk-payments', title: 'Payout/payment fraud risk', severity: 'critical', mitigation: 'Fraud checks + approval checkpoints + audit logs.' });
  }
  return risks;
}

export function createVerificationChecklist(project) {
  return [
    'Requirements and acceptance criteria approved by Maria.',
    'Research checklist and source requirements prepared by Hector.',
    'UI/UX and flow design packet prepared by Miya.',
    'Implementation and build/test plan prepared by Alphonso.',
    'Security and release readiness audit prepared by Marcus.',
    'Jose final synthesis packet generated with approval gates.'
  ].map((item, index) => ({
    id: `verify-${index + 1}`,
    item,
    checked: false,
    owner: index === 0 ? 'maria' : index === 1 ? 'hector' : index === 2 ? 'miya' : index === 3 ? 'alphonso' : index === 4 ? 'marcus' : 'jose'
  }));
}

export function generateExecutionTimeline(project) {
  const now = Date.now();
  return [
    { id: 'phase-1', phase: 'Intake + decomposition', owner: 'jose', startAt: now, endAt: now + 30 * 60 * 1000 },
    { id: 'phase-2', phase: 'Parallel agent planning', owner: 'multi-agent', startAt: now + 30 * 60 * 1000, endAt: now + 2 * 60 * 60 * 1000 },
    { id: 'phase-3', phase: 'Audit + approvals', owner: 'marcus+jose', startAt: now + 2 * 60 * 60 * 1000, endAt: now + 3 * 60 * 60 * 1000 },
    { id: 'phase-4', phase: 'Implementation handoff', owner: 'alphonso', startAt: now + 3 * 60 * 60 * 1000, endAt: now + 4 * 60 * 60 * 1000 }
  ].map((entry) => ({ ...entry, projectId: project.id }));
}

export function assignTasksToAgents(project) {
  return {
    maria: ['requirements breakdown', 'roadmap', 'backlog', 'acceptance criteria'],
    hector: ['api/docs/compliance research checklist', 'source matrix', 'open research questions'],
    miya: ['ui/ux structure', 'brand direction', 'landing/dashboard wire plan'],
    alphonso: ['implementation plan', 'local setup plan', 'build/test verification checklist'],
    marcus: ['security and risk review', 'release readiness checklist'],
    jose: ['task routing', 'approval gates', 'final execution packet synthesis']
  };
}

export function decomposeProjectIntoAgentTasks(project) {
  const assignments = assignTasksToAgents(project);
  return Object.entries(assignments).flatMap(([agentId, tasks]) =>
    tasks.map((task, index) => ({
      id: `${agentId}-task-${index + 1}`,
      agentId,
      projectId: project.id,
      title: task,
      status: 'queued',
      requiresApproval: /release|security|deployment|payout|publish|upload/i.test(task),
      dependencies: []
    }))
  );
}

export function createProjectExecutionPlan(input) {
  const project = {
    id: input?.projectId || createProjectId(input?.projectName || 'project'),
    projectName: input?.projectName || 'Untitled Project',
    projectDescription: input?.projectDescription || '',
    stack: input?.stack || '',
    deadline: input?.deadline || null,
    constraints: input?.constraints || [],
    targetFeatures: input?.targetFeatures || [],
    risks: input?.risks || [],
    priorityLevel: input?.priorityLevel || 'medium',
    projectType: input?.projectType || 'other'
  };

  const tasks = decomposeProjectIntoAgentTasks(project);
  const timeline = generateExecutionTimeline(project);
  const acceptanceCriteria = createAcceptanceCriteria(project);
  const riskRegister = createRiskRegister(project);
  const verificationChecklist = createVerificationChecklist(project);

  const summary = `${project.projectName} decomposed into ${tasks.length} routed tasks with supervised approval gates.`;
  const output = createAgentOutput(AgentOutputTypes.PROJECT_BREAKDOWN, {
    agentId: 'jose',
    projectId: project.id,
    title: `${project.projectName} execution plan`,
    summary,
    status: 'ready',
    confidence: 'inferred',
    riskLevel: 'medium',
    assumptions: ['Deterministic local planner only', 'No live external connector calls in this step'],
    verifiedFacts: ['Project intake captured locally'],
    openQuestions: ['Which tasks should execute first in real runtime?', 'Which connector creds are already configured?'],
    recommendedNextSteps: ['Run agent workshop', 'Review approval gates', 'Approve first execution packet'],
    requiresApproval: false,
    relatedFiles: [],
    proposedChanges: []
  });

  return {
    ...project,
    tasks,
    timeline,
    acceptanceCriteria,
    riskRegister,
    verificationChecklist,
    output
  };
}

