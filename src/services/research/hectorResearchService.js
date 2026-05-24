const baseResearchState = {
  researchBackendStatus: 'not_wired',
  liveResearchAvailable: false,
  confidence: 'source_needed',
  message: 'Hector research backend is local-only. Live research requires approved connector.'
};

function createChecklist(title, items = []) {
  return {
    ...baseResearchState,
    title,
    items: items.map((item, index) => ({
      id: `research-item-${index + 1}`,
      item,
      sourceTypeNeeded: 'official_docs_or_policy',
      status: 'pending'
    }))
  };
}

export function createResearchBrief(topic) {
  return {
    ...baseResearchState,
    topic,
    summary: `Research brief created for "${topic}".`,
    whatNeedsResearch: [
      'Official documentation references',
      'Compliance and policy requirements',
      'Integration constraints and limitations'
    ],
    sourceTypesNeeded: ['official_docs', 'provider_api_docs', 'compliance_guidance']
  };
}

export function createSourceChecklist(topic) {
  return createChecklist(`Source checklist for ${topic}`, [
    'Collect primary official docs',
    'Collect API authentication requirements',
    'Collect rate-limit and cost constraints',
    'Collect terms/compliance constraints'
  ]);
}

export function createResearchQuestions(project) {
  return {
    ...baseResearchState,
    projectId: project?.id || null,
    questions: [
      'Which provider APIs are officially supported for this stack?',
      'What compliance/legal constraints apply to payout and rewards workflows?',
      'What anti-fraud baseline controls are required?',
      'What security requirements apply to auth/session flows?'
    ]
  };
}

export function createAPIDocsChecklist(project) {
  return createChecklist(`${project?.projectName || 'Project'} API docs checklist`, [
    'Auth model + token lifecycle docs',
    'Webhook signature verification docs',
    'Rate limit and retry policy docs',
    'Error model and idempotency docs'
  ]);
}

export function createComplianceChecklist(project) {
  return createChecklist(`${project?.projectName || 'Project'} compliance checklist`, [
    'KYC/age/region requirements',
    'Payout/financial policy constraints',
    'Privacy + data retention constraints',
    'Fraud and abuse prevention expectations'
  ]);
}
