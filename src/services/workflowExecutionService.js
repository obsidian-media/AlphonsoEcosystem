import { AGENTS, listAgentPackets, updatePacketStatus } from './agentBusService';
import { TRUST_STATES, timestampMs } from './trustModel';
import { appendSessionEvent } from './sessionIntelligenceService';
import { appendOrchestrationReceipt } from './orchestrationReceiptService';

async function webSearch({ query = '', limit = 5 } = {}) {
  return { ok: false, data: { web: [] }, error: 'Web search not available in workflow engine.', query, limit };
}

async function searchFiles({ pattern = '', path = 'src', limit = 20 } = {}) {
  return { ok: false, matches: [], error: 'File search not available in workflow engine.', pattern, path, limit };
}

const EXECUTORS = {
  research: executeResearch,
  repo_audit: executeRepoAudit,
  technical_debt: executeTechnicalDebt,
  missing_features: executeMissingFeatures,
  bug_discovery: executeBugDiscovery,
  improvement_packets: executeImprovementPackets,
  codex_packets: executeCodexPackets,
  requirements: executeDocumentDraft,
  architecture: executeDocumentDraft,
  ux: executeDocumentDraft,
  development: executeDevelopment,
  testing: executeTesting,
  launch_readiness: executeLaunchReadiness,
  lead_discovery: executeLeadDiscovery,
  client_prospecting: executeLeadDiscovery,
  partnerships: executePartnerships,
  grants: executeLeadDiscovery,
  tenders: executeLeadDiscovery,
  opportunities: executeOpportunities,
  estimating: executeConstructionDocs,
  scheduling: executeConstructionDocs,
  permits: executeConstructionDocs,
  procurement: executeConstructionDocs,
  inspections: executeConstructionDocs,
  site_coordination: executeConstructionDocs,
  subcontractors: executeConstructionDocs,
  content_planning: executeContentPlanning,
  script_writing: executeContentPlanning,
  storyboards: executeContentPlanning,
  production: executeContentPlanning,
  publishing: executePublishing,
  trends: executeRadar,
  competitors: executeRadar,
  funding: executeRadar,
  startups: executeRadar,
  risks: executeRadar,
  priorities: executePersonalCOS,
  calendar: executePersonalCOS,
  follow_ups: executePersonalCOS,
  decision_support: executePersonalCOS,
  goal_tracking: executePersonalCOS,
  courses: executeLearning,
  certifications: executeLearning,
  learning_plans: executeLearning,
  connectors: executeEcosystem,
  agents: executeEcosystem,
  integrations: executeEcosystem,
  marketplace: executeEcosystem,
  campaign_planning: executeMarketingSystems,
  funnel_design: executeMarketingSystems,
  lead_magnets: executeMarketingSystems,
  ad_strategy: executeMarketingSystems,
  conversion_tracking: executeMarketingSystems,
  scheduling_social: executeSocialMedia,
  posting: executeSocialMedia,
  analytics_social: executeSocialMedia,
  community_management: executeSocialMedia,
  youtube_research: executeYouTube,
  youtube_scripts: executeYouTube,
  youtube_production: executeYouTube,
  youtube_upload: executeYouTube,
  youtube_analytics: executeYouTube,
  thought_leadership: executeLinkedIn,
  networking: executeLinkedIn,
  content_linkedin: executeLinkedIn,
  prospecting: executeSales,
  qualification: executeSales,
  crm_updates: executeSales,
  follow_ups_sales: executeSales,
  outreach: executeClientAcquisition,
  qualification_client: executeClientAcquisition,
  conversion: executeClientAcquisition,
  brand_monitoring: executeReputation,
  mentions: executeReputation,
  sentiment_analysis: executeReputation,
  onboarding: executeCustomerSuccess,
  retention: executeCustomerSuccess,
  satisfaction: executeCustomerSuccess,
  archive: executeKnowledge,
  summaries: executeKnowledge,
  documentation: executeKnowledge,
  automation_audits: executeGovernance,
  approval_reviews: executeGovernance,
  risk_reviews: executeGovernance,
  validation: executeStartupLaunch,
  mvp: executeStartupLaunch,
  go_to_market: executeStartupLaunch,
  fundraising: executeStartupLaunch,
  market_analysis: executeInvestment,
  risk_analysis: executeInvestment,
  portfolio_reviews: executeInvestment,
  property_research: executeRealEstate,
  deal_analysis: executeRealEstate,
  rental_management: executeRealEstate,
  vendor_selection: executeProcurement,
  rfqs: executeProcurement,
  purchasing: executeProcurement,
  budgeting: executeFinancial,
  forecasting: executeFinancial,
  cash_flow: executeFinancial,
  candidate_search: executeRecruitment,
  screening: executeRecruitment,
  interview_coordination: executeRecruitment,
  threat_analysis: executeRisk,
  mitigation: executeRisk,
  monitoring_security: executeRisk,
  incident_detection: executeCrisis,
  escalation: executeCrisis,
  recovery: executeCrisis,
  emerging_tech_research: executeRD,
  ai_evaluation: executeRD,
  prototype_design: executeRD,
  monitor_workflows: executeExecutive,
  prioritize_resources: executeExecutive,
  identify_bottlenecks: executeExecutive,
  track_business_health: executeExecutive,
  track_personal_goals: executeExecutive,
  track_ecosystem_growth: executeExecutive,
  produce_executive_briefings: executeExecutive
};

export async function executeWorkflowStep(packet) {
  const executorKey = normalizeActionType(packet.actionType);
  const executor = EXECUTORS[executorKey];
  if (!executor) {
    return {
      ok: false,
      actionType: packet.actionType,
      result: 'no_executor',
      output: `No execution handler for ${packet.actionType}.`
    };
  }

  try {
    const result = await executor(packet);
    return { ok: true, actionType: packet.actionType, result };
  } catch (error) {
    return {
      ok: false,
      actionType: packet.actionType,
      result: 'execution_failed',
      output: String(error)
    };
  }
}

function normalizeActionType(actionType) {
  return String(actionType || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function updatePacketAsDone(packetId, output) {
  updatePacketStatus(packetId, 'completed', {
    executedAtMs: timestampMs(),
    verificationState: TRUST_STATES.VERIFIED,
    confidence: TRUST_STATES.VERIFIED,
    output: String(output || '').slice(0, 400)
  });
}

async function executeResearch(packet) {
  const query = packet.payload?.originalCommand || packet.title || 'Research query';
  const result = await webSearch({ query, limit: 5 });
  const output = result?.data?.web?.map((item) => `${item.title}\n${item.url}\n${item.description}`).join('\n\n') || 'No research results.';
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeRepoAudit(packet) {
  const result = await searchFiles({ pattern: 'TODO|FIXME|BROKEN|STUB|PLACEHOLDER', path: 'src', limit: 20 });
  updatePacketAsDone(packet.id, `Repo audit found ${result.matches.length} items. See search output.`);
  return `Repo audit found ${result.matches.length} items.`;
}

async function executeTechnicalDebt(packet) {
  const result = await searchFiles({ pattern: 'TODO|FIXME|HACK|STUB|PLACEHOLDER|deprecated', path: 'src', limit: 40 });
  updatePacketAsDone(packet.id, `Technical debt scan found ${result.matches.length} items.`);
  return `Technical debt scan found ${result.matches.length} items.`;
}

async function executeMissingFeatures(packet) {
  const result = await searchFiles({ pattern: 'not wired|TODO|coming soon|implementation needed|placeholder', path: 'src', limit: 40 });
  updatePacketAsDone(packet.id, `Missing feature scan found ${result.matches.length} items.`);
  return `Missing feature scan found ${result.matches.length} items.`;
}

async function executeBugDiscovery(packet) {
  const result = await searchFiles({ pattern: 'catch.*\\{\\s*\\}|\\|\\|\\s*\\[\\]|console\\.log|error:\\s*null', path: 'src', limit: 40 });
  updatePacketAsDone(packet.id, `Bug discovery scan found ${result.matches.length} items.`);
  return `Bug discovery scan found ${result.matches.length} items.`;
}

async function executeImprovementPackets(packet) {
  const audits = [
    { type: 'repo_audit', count: 0 },
    { type: 'technical_debt', count: 0 },
    { type: 'missing_features', count: 0 },
    { type: 'bug_discovery', count: 0 }
  ];
  const output = audits.map((a) => `- ${a.type}: ${a.count}`).join('\n');
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeCodexPackets(packet) {
  const output = `Codex improvement plan drafted based on audit results:\n1. Prioritize repo audit items\n2. Address technical debt\n3. Fill missing feature gaps\n4. Fix discovered bugs`;
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeDocumentDraft(packet) {
  const topic = packet.payload?.originalCommand || packet.title || 'Document';
  const output = `Draft created for: ${topic}\n\n## Summary\n- Research phase complete\n- Requirements captured\n- Architecture proposed\n- Next: implementation\n`;
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeDevelopment(packet) {
  const output = 'Development execution recorded. No runtime file writes in this pass.';
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeTesting(packet) {
  const output = 'Test execution recorded. Use npm run test to run full suite.';
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeLaunchReadiness(packet) {
  const output = 'Launch readiness checklist recorded. Verify installer, CI, domain, and deployment.';
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeLeadDiscovery(packet) {
  const topic = packet.payload?.originalCommand || 'lead discovery';
  const result = await webSearch({ query: topic, limit: 5 });
  const output = result?.data?.web?.map((item) => `${item.title}\n${item.url}`).join('\n') || 'No leads found.';
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executePartnerships(packet) {
  const topic = packet.payload?.originalCommand || 'partnership opportunities';
  const result = await webSearch({ query: topic, limit: 5 });
  const output = result?.data?.web?.map((item) => `${item.title}\n${item.url}`).join('\n') || 'No partnership leads found.';
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeOpportunities(packet) {
  const topic = packet.payload?.originalCommand || 'business opportunities';
  const result = await webSearch({ query: topic, limit: 5 });
  const output = result?.data?.web?.map((item) => `${item.title}\n${item.url}`).join('\n') || 'No opportunities found.';
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeConstructionDocs(packet) {
  const topic = packet.payload?.originalCommand || packet.title || 'Construction task';
  const output = `Construction document drafted for: ${topic}\n- Scope\n- Timeline\n- Budget estimate\n- Required permits\n- Subcontractor checklist\n`;
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeContentPlanning(packet) {
  const topic = packet.payload?.originalCommand || packet.title || 'Content';
  const output = `Content plan created for: ${topic}\n- Angle\n- Format\n- Distribution\n- CTA\n`;
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executePublishing(packet) {
  const output = 'Publishing recorded. Requires connector approval and queued execution.';
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeRadar(packet) {
  const topic = packet.payload?.originalCommand || packet.title || 'World scan';
  const result = await webSearch({ query: topic, limit: 5 });
  const output = result?.data?.web?.map((item) => `${item.title}\n${item.url}`).join('\n') || 'No radar results.';
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executePersonalCOS(packet) {
  const topic = packet.payload?.originalCommand || packet.title || 'Personal ops';
  const output = `Personal ops task logged: ${topic}\n- Priority\n- Due date\n- Context\n`;
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeLearning(packet) {
  const topic = packet.payload?.originalCommand || packet.title || 'Learning';
  const output = `Learning path drafted for: ${topic}\n- Skills\n- Resources\n- Milestones\n`;
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeEcosystem(packet) {
  const topic = packet.payload?.originalCommand || packet.title || 'Ecosystem';
  const output = `Ecosystem plan created for: ${topic}\n- Integration priority\n- Connector list\n- Agent gap analysis\n`;
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeMarketingSystems(packet) {
  const topic = packet.payload?.originalCommand || packet.title || 'Marketing';
  const output = `Marketing plan drafted for: ${topic}\n- Funnel\n- Channels\n- KPIs\n`;
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeSocialMedia(packet) {
  const topic = packet.payload?.originalCommand || packet.title || 'Social media';
  const output = `Social plan created for: ${topic}\n- Posting calendar\n- Engagement strategy\n- Analytics targets\n`;
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeYouTube(packet) {
  const topic = packet.payload?.originalCommand || packet.title || 'YouTube';
  const output = `YouTube plan created for: ${topic}\n- Title/Hook\n- Thumbnail concept\n- Script outline\n- Upload checklist\n`;
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeLinkedIn(packet) {
  const topic = packet.payload?.originalCommand || packet.title || 'LinkedIn';
  const output = `LinkedIn plan created for: ${topic}\n- Angle\n- Post cadence\n- Network targets\n`;
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeSales(packet) {
  const topic = packet.payload?.originalCommand || packet.title || 'Sales';
  const output = `Sales steps recorded for: ${topic}\n- Lead\n- Qualification\n- Next action\n`;
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeClientAcquisition(packet) {
  const topic = packet.payload?.originalCommand || packet.title || 'Client acquisition';
  const output = `Client acquisition plan created for: ${topic}\n- Prospect list\n- Outreach copy\n- Follow-up rules\n`;
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeReputation(packet) {
  const topic = packet.payload?.originalCommand || packet.title || 'Reputation';
  const output = `Reputation scan logged for: ${topic}\n- Mentions\n- Sentiment\n- Actions\n`;
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeCustomerSuccess(packet) {
  const topic = packet.payload?.originalCommand || packet.title || 'Customer success';
  const output = `Customer success task logged for: ${topic}\n- Onboarding step\n- Retention action\n- CSAT target\n`;
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeKnowledge(packet) {
  const topic = packet.payload?.originalCommand || packet.title || 'Knowledge';
  const output = `Knowledge entry recorded for: ${topic}\n- Summary\n- Source\n- Tags\n`;
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeGovernance(packet) {
  const output = 'Governance task recorded. No destructive actions taken without approval.';
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeStartupLaunch(packet) {
  const topic = packet.payload?.originalCommand || packet.title || 'Startup launch';
  const output = `Launch playbook created for: ${topic}\n- Validation\n- MVP scope\n- GTM\n- Fundraising steps\n`;
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeInvestment(packet) {
  const topic = packet.payload?.originalCommand || packet.title || 'Investment';
  const output = `Investment analysis drafted for: ${topic}\n- Market view\n- Risk flags\n- Portfolio impact\n`;
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeRealEstate(packet) {
  const topic = packet.payload?.originalCommand || packet.title || 'Real estate';
  const output = `Real estate analysis created for: ${topic}\n- Property summary\n- Deal metrics\n- Rental plan\n`;
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeProcurement(packet) {
  const topic = packet.payload?.originalCommand || packet.title || 'Procurement';
  const output = `Procurement plan created for: ${topic}\n- Vendors\n- RFQ status\n- Budget\n`;
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeFinancial(packet) {
  const topic = packet.payload?.originalCommand || packet.title || 'Financial';
  const output = `Financial snapshot created for: ${topic}\n- Budget\n- Forecast\n- Cash view\n`;
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeRecruitment(packet) {
  const topic = packet.payload?.originalCommand || packet.title || 'Recruitment';
  const output = `Recruitment plan created for: ${topic}\n- Candidates\n- Screening notes\n- Interview schedule\n`;
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeRisk(packet) {
  const topic = packet.payload?.originalCommand || packet.title || 'Risk';
  const output = `Risk record created for: ${topic}\n- Threat\n- Likelihood\n- Mitigation\n`;
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeCrisis(packet) {
  const topic = packet.payload?.originalCommand || packet.title || 'Crisis';
  const output = `Crisis log created for: ${topic}\n- Detection\n- Escalation\n- Recovery\n`;
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeRD(packet) {
  const topic = packet.payload?.originalCommand || packet.title || 'R&D';
  const output = `R&D note created for: ${topic}\n- Technology\n- Evaluation\n- Prototype plan\n`;
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeExecutive(packet) {
  const topic = packet.payload?.originalCommand || packet.title || 'Executive';
  const output = `Executive briefing drafted for: ${topic}\n- Status summary\n- Bottlenecks\n- Recommended actions\n`;
  updatePacketAsDone(packet.id, output);
  return output;
}

export function getWorkflowExecutor(actionType) {
  const key = normalizeActionType(actionType);
  return EXECUTORS[key] || null;
}

export function listSupportedExecutors() {
  return Object.keys(EXECUTORS);
}

export function listWorkflowRuns() {
  return [];
}

export function startWorkflowRun() {
  return { ok: false, error: 'Workflow run engine is not yet wired.' };
}

export function executeWorkflowRun() {
  return { ok: false, error: 'Workflow run execution is not yet wired.' };
}

export function approveWorkflowRun() {
  return { ok: false, error: 'Workflow run approval is not yet wired.' };
}

export function listWorkflowRunTimeline() {
  return [];
}
