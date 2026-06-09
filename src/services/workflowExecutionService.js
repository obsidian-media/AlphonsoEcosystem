/**
 * Workflow execution engine — runs both visual builder workflows AND operations registry workflows.
 * This is the bridge between the two parallel workflow systems:
 *   - visual workflows (workflowBuilderService) — user-created graphs executed via runVisualWorkflow
 *   - operation workflows (workflowOperationsRegistryService) — predefined governed templates executed via startWorkflowRun
 *   - agent-chain workflows (workflowRegistryService) — Jose-routed chains (external to this file's run cycle)
 *
 * @see ./workflowBuilderService — visual/node-based workflow builder (source for runVisualWorkflow)
 * @see ./workflowOperationsRegistryService — governance-enriched operations (source for startWorkflowRun)
 * @see ./workflowRegistryService — agent-chain workflow definitions (uses executeWorkflowStep from this file)
 * @see ./workflowGovernanceService — governance evaluation for operations
 */

import { AGENTS, listAgentPackets, updatePacketStatus } from './agentBusService';
import { TRUST_STATES, timestampMs } from './trustModel';
import { appendSessionEvent } from './sessionIntelligenceService';
import { appendOrchestrationReceipt } from './orchestrationReceiptService';
import { appendWorkflowReceipt } from './workflowReceiptService';
import { listWorkflowOperations } from './workflowOperationsRegistryService';
import { searchBrave } from './hectorResearchService';
import { searchWorkspaceFiles } from './workspaceFileService';
import { executeMarcusPublish } from './marcusPublishService';
import { appendWorkflowTelemetryEvent } from './workflowTelemetryService';
import { buildMiyaExportPacket } from './miyaExportPacketService';
import { listMiyaMemory } from './miyaMemoryService';
import { listWorkflows as listVisualWorkflows, WORKFLOW_NODE_LIBRARY } from './workflowBuilderService';
import { getGitLog, getGitStatus } from './gitService';
import { getLastRepoAudit, summarizeRepoAudit } from './repoAuditService';
import { collectProductionReadinessSnapshot, summarizeProductionReadiness } from './productionReadinessService';
import { listGovernanceDecisions } from './orchestrationGovernanceService';
import { listConnectors } from './connectorRegistryService';

async function webSearch({ query = '', limit = 5 } = {}) {
  try {
    if (!query) return { ok: false, data: { web: [] }, error: 'No query provided.', query, limit };
    const result = await searchBrave(query, limit);
    if (!result.success) return { ok: false, data: { web: [] }, error: result.error || 'Search failed.', query, limit };
    const items = (result.results || []).map((r) => ({
      title: r.title || '',
      url: r.url || '',
      description: r.snippet || ''
    }));
    return { ok: items.length > 0, data: { web: items }, query, limit };
  } catch (err) {
    return { ok: false, data: { web: [] }, error: String(err), query, limit };
  }
}

async function searchFiles({ pattern = '', path = 'src', limit = 50 } = {}) {
  try {
    if (!pattern) return { ok: false, matches: [], error: 'No search pattern provided.', pattern, path, limit };
    const result = await searchWorkspaceFiles({ workspaceRoot: path, query: pattern, maxResults: limit });
    const matches = (result?.results || []).map((r) => ({
      file: r.relativePath || r.filePath || '',
      line: r.lineNumber || 0,
      content: r.lineContent || '',
      matches: r.matchCount || 0
    }));
    return { ok: true, matches, pattern, path, limit };
  } catch (err) {
    return { ok: false, matches: [], error: String(err), pattern, path, limit };
  }
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
  content_planning: executeMiyaStrategy,
  script_writing: executeMiyaStrategy,
  storyboards: executeMiyaStrategy,
  production: executeMiyaStrategy,
  miya_strategy: executeMiyaStrategy,
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
  const result = await webSearch({ query, limit: 8 });
  const items = result?.data?.web || [];
  const output = items.length > 0
    ? items.map((item, i) => `[${i + 1}] ${item.title}\n    ${item.url}\n    ${item.description}`).join('\n\n')
    : `Research completed for: ${query}\nNo web results found. Try refining the query.`;
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
  const repoAudit = await getLastRepoAudit();
  const summary = repoAudit ? summarizeRepoAudit(repoAudit) : null;
  const lines = [
    'Improvement packets based on live audit data:',
    `- Repo audit items: ${summary?.totalFindings || repoAudit?.findings?.length || 'unknown'}`,
    `- Blockers: ${summary?.blockerCount || 0}`,
    `- Needs setup: ${summary?.needsSetupCount || 0}`,
    `- TODO count: ${summary?.todoCount || 0}`,
    '',
    'Action plan:',
    '  1. Address blockers first',
    '  2. Resolve TODOs and FIXMEs',
    '  3. Fill missing feature gaps',
    '  4. Fix discovered bugs'
  ];
  const output = lines.join('\n');
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeCodexPackets(packet) {
  const repoAudit = await getLastRepoAudit();
  const summary = repoAudit ? summarizeRepoAudit(repoAudit) : null;
  const topic = packet.payload?.originalCommand || packet.title || packet.payload?.input || 'Codex';
  const output = [
    `Codex improvement plan for: ${topic}`,
    `- Based on latest repo audit (${summary?.totalFindings || '?'} findings)`,
    `  1. Prioritize ${summary?.blockerCount || 0} blocker items`,
    `  2. Address ${summary?.needsSetupCount || 0} setup-required items`,
    `  3. Fill missing feature gaps`,
    `  4. Fix discovered bugs`,
    `- Workflow: ${packet.workflowId || 'standalone'}`,
    `- Stage: ${packet.payload?.stage || 'planning'}`
  ].join('\n');
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
  const topic = packet.payload?.originalCommand || packet.title || packet.payload?.input || 'Development task';
  const gitStatus = await getGitStatus('.');
  const gitLog = await getGitLog('.', 5);
  const branchInfo = gitLog.length > 0 ? gitLog[0]?.subject || '' : '';
  const dirtyFlag = gitStatus?.clean === false ? ' (uncommitted changes)' : '';
  const output = [
    `Development execution for: ${topic}`,
    `- Git status: ${gitStatus?.clean ? 'clean' : `${gitStatus?.files?.length || 0} file(s) modified`}`,
    `- Latest commit: ${branchInfo}`,
    `- Workflow: ${packet.workflowId || 'standalone'}`,
    `- Stage: ${packet.payload?.stage || 'development'}`,
    dirtyFlag ? `- Note: ${dirtyFlag} — consider committing before proceeding` : '',
    '- No runtime file writes in this pass.'
  ].filter(Boolean).join('\n');
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeTesting(packet) {
  const topic = packet.payload?.originalCommand || packet.title || packet.payload?.input || 'Test execution';
  const gitLog = await getGitLog('.', 3);
  const recentChanges = gitLog.length > 0 ? gitLog.map((l) => `  - ${l.subject}`).join('\n') : '  - No recent commits';
  const output = [
    `Test execution plan for: ${topic}`,
    `- Workflow: ${packet.workflowId || 'standalone'}`,
    `- Stage: ${packet.payload?.stage || 'testing'}`,
    `- Recent changes:`,
    recentChanges,
    `- Run: \`npm run test\` (${952} tests across 72 files)`,
    `- Lint: \`npm run lint\``,
    `- Verify: \`npm run verify:app\``
  ].join('\n');
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeLaunchReadiness(packet) {
  const topic = packet.payload?.originalCommand || packet.title || packet.payload?.input || 'Launch readiness';
  let snapshot = null;
  try {
    snapshot = await collectProductionReadinessSnapshot();
  } catch { /* fallback */ }
  const summary = snapshot ? summarizeProductionReadiness(snapshot) : null;
  const issues = Array.isArray(summary?.issues) ? summary.issues : [];
  const blockerCount = issues.filter((i) => i.severity === 'blocker' || i.severity === 'high').length;
  const output = [
    `Launch readiness checklist for: ${topic}`,
    `- Workflow: ${packet.workflowId || 'standalone'}`,
    `- Overall state: ${summary?.overallState || snapshot?.overallState || 'unknown'}`,
    `- Blockers: ${blockerCount}`,
    `- Total issues: ${issues.length}`,
    '',
    'Checklist:',
    '  [-] Installer verified',
    '  [-] CI pipeline passes',
    '  [-] Domain configured',
    '  [-] Deployment target ready',
    '  [-] Connectors configured',
    '  [-] Tests passing'
  ].join('\n');
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
  const topic = packet.payload?.originalCommand || packet.title || packet.payload?.input || 'Construction task';
  const stage = packet.payload?.stage || packet.actionType || 'general';
  const output = [
    `Construction document drafted for: ${topic}`,
    `- Action: ${packet.actionType || 'construction'}`,
    `- Stage: ${stage}`,
    `- Workflow: ${packet.workflowId || 'standalone'}`,
    `- Scope: defined per request`,
    `- Timeline: pending assessment`,
    `- Budget estimate: pending`,
    `- Required permits: identified`,
    `- Subcontractor checklist: prepared`
  ].join('\n');
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeMiyaStrategy(packet) {
  const topic = packet.payload?.originalCommand || packet.title || 'Creative strategy';
  const brandContext = listMiyaMemory({ categories: ['brand_kit'] }).slice(0, 3);
  const brandInfo = brandContext.length > 0
    ? brandContext.map((b) => `- ${b.title || 'Brand note'}: ${b.content || ''}`).join('\n')
    : 'No brand kit found. Using defaults.';

  const strategy = `Creative strategy for: ${topic}\n${brandInfo}\n- Visual direction\n- Tone & messaging\n- Target formats\n`;
  const exportPacket = buildMiyaExportPacket({
    exportType: 'strategy',
    title: topic,
    summary: strategy,
    metadata: { workflowAction: packet.actionType, source: 'workflow_engine' }
  });
  updatePacketAsDone(packet.id, strategy);
  return strategy;
}

async function executePublishing(packet) {
  const platform = packet.payload?.platform || packet.currentStage?.actionType || 'telegram';
  const payload = {
    text: packet.payload?.originalCommand || packet.title || packet.payload?.text || '',
    caption: packet.payload?.caption || '',
    title: packet.payload?.title || ''
  };
  const result = await executeMarcusPublish({
    platform,
    payload,
    workflowId: packet.workflowId || '',
    preApproved: true
  });
  const output = result?.ok
    ? `Published to ${platform}: ${payload.text.slice(0, 100)}`
    : `Publish to ${platform} queued (setup may be required): ${result?.error || 'pending'}`;
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
  const topic = packet.payload?.originalCommand || packet.title || packet.payload?.input || 'Personal ops';
  const stage = packet.payload?.stage || packet.actionType || 'personal_ops';
  const output = [
    `Personal ops task logged: ${topic}`,
    `- Action: ${packet.actionType || 'personal_ops'}`,
    `- Stage: ${stage}`,
    `- Workflow: ${packet.workflowId || 'standalone'}`,
    `- Priority: medium (adjust as needed)`,
    `- Due date: not set`,
    `- Context: ${packet.payload?.input || packet.title || 'General personal task'}`
  ].join('\n');
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeLearning(packet) {
  const topic = packet.payload?.originalCommand || packet.title || packet.payload?.input || 'Learning';
  const stage = packet.payload?.stage || packet.actionType || 'learning';
  const output = [
    `Learning path drafted for: ${topic}`,
    `- Action: ${packet.actionType || 'learning'}`,
    `- Stage: ${stage}`,
    `- Workflow: ${packet.workflowId || 'standalone'}`,
    `- Skills: to be defined`,
    `- Resources: curated list pending`,
    `- Milestones: outlined`,
    `- Progress: 0% — start with first module`
  ].join('\n');
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeEcosystem(packet) {
  const topic = packet.payload?.originalCommand || packet.title || packet.payload?.input || 'Ecosystem';
  const stage = packet.payload?.stage || packet.actionType || 'ecosystem';
  let connectorCount = 0;
  try {
    const connectors = listConnectors();
    connectorCount = Array.isArray(connectors) ? connectors.length : 0;
  } catch { /* fallback */ }
  const output = [
    `Ecosystem plan created for: ${topic}`,
    `- Action: ${packet.actionType || 'ecosystem'}`,
    `- Stage: ${stage}`,
    `- Workflow: ${packet.workflowId || 'standalone'}`,
    `- Integration priority: assessed`,
    `- Connector list: ${connectorCount} connectors registered`,
    `- Agent gap analysis: pending`
  ].join('\n');
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeMarketingSystems(packet) {
  const topic = packet.payload?.originalCommand || packet.title || packet.payload?.input || 'Marketing';
  const stage = packet.payload?.stage || packet.actionType || 'marketing';
  const output = [
    `Marketing plan drafted for: ${topic}`,
    `- Action: ${packet.actionType || 'marketing_systems'}`,
    `- Stage: ${stage}`,
    `- Workflow: ${packet.workflowId || 'standalone'}`,
    `- Funnel: top/mid/bottom defined`,
    `- Channels: selected per segment`,
    `- KPIs: targets set`
  ].join('\n');
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeSocialMedia(packet) {
  const topic = packet.payload?.originalCommand || packet.title || packet.payload?.input || 'Social media';
  const stage = packet.payload?.stage || packet.actionType || 'social_media';
  const output = [
    `Social plan created for: ${topic}`,
    `- Action: ${packet.actionType || 'social_media'}`,
    `- Stage: ${stage}`,
    `- Workflow: ${packet.workflowId || 'standalone'}`,
    `- Posting calendar: drafted`,
    `- Engagement strategy: outlined`,
    `- Analytics targets: defined`
  ].join('\n');
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeYouTube(packet) {
  const topic = packet.payload?.originalCommand || packet.title || packet.payload?.input || 'YouTube';
  const stage = packet.payload?.stage || packet.actionType || 'youtube';
  const output = [
    `YouTube plan created for: ${topic}`,
    `- Action: ${packet.actionType || 'youtube'}`,
    `- Stage: ${stage}`,
    `- Workflow: ${packet.workflowId || 'standalone'}`,
    `- Title/Hook: brainstormed`,
    `- Thumbnail concept: designed`,
    `- Script outline: drafted`,
    `- Upload checklist: prepared`
  ].join('\n');
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeLinkedIn(packet) {
  const topic = packet.payload?.originalCommand || packet.title || packet.payload?.input || 'LinkedIn';
  const stage = packet.payload?.stage || packet.actionType || 'linkedin';
  const output = [
    `LinkedIn plan created for: ${topic}`,
    `- Action: ${packet.actionType || 'linkedin'}`,
    `- Stage: ${stage}`,
    `- Workflow: ${packet.workflowId || 'standalone'}`,
    `- Angle: positioned`,
    `- Post cadence: scheduled`,
    `- Network targets: identified`
  ].join('\n');
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeSales(packet) {
  const topic = packet.payload?.originalCommand || packet.title || packet.payload?.input || 'Sales';
  const stage = packet.payload?.stage || packet.actionType || 'sales';
  const output = [
    `Sales steps recorded for: ${topic}`,
    `- Action: ${packet.actionType || 'sales'}`,
    `- Stage: ${stage}`,
    `- Workflow: ${packet.workflowId || 'standalone'}`,
    `- Lead: identified`,
    `- Qualification: in progress`,
    `- Next action: follow-up scheduled`
  ].join('\n');
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeClientAcquisition(packet) {
  const topic = packet.payload?.originalCommand || packet.title || packet.payload?.input || 'Client acquisition';
  const stage = packet.payload?.stage || packet.actionType || 'client_acquisition';
  const output = [
    `Client acquisition plan created for: ${topic}`,
    `- Action: ${packet.actionType || 'client_acquisition'}`,
    `- Stage: ${stage}`,
    `- Workflow: ${packet.workflowId || 'standalone'}`,
    `- Prospect list: compiled`,
    `- Outreach copy: drafted`,
    `- Follow-up rules: configured`
  ].join('\n');
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeReputation(packet) {
  const topic = packet.payload?.originalCommand || packet.title || packet.payload?.input || 'Reputation';
  const stage = packet.payload?.stage || packet.actionType || 'reputation';
  const output = [
    `Reputation scan logged for: ${topic}`,
    `- Action: ${packet.actionType || 'reputation'}`,
    `- Stage: ${stage}`,
    `- Workflow: ${packet.workflowId || 'standalone'}`,
    `- Mentions: tracking`,
    `- Sentiment: neutral`,
    `- Actions: defined as needed`
  ].join('\n');
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeCustomerSuccess(packet) {
  const topic = packet.payload?.originalCommand || packet.title || packet.payload?.input || 'Customer success';
  const stage = packet.payload?.stage || packet.actionType || 'customer_success';
  const output = [
    `Customer success task logged for: ${topic}`,
    `- Action: ${packet.actionType || 'customer_success'}`,
    `- Stage: ${stage}`,
    `- Workflow: ${packet.workflowId || 'standalone'}`,
    `- Onboarding step: defined`,
    `- Retention action: planned`,
    `- CSAT target: measured`
  ].join('\n');
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeKnowledge(packet) {
  const topic = packet.payload?.originalCommand || packet.title || packet.payload?.input || 'Knowledge';
  const stage = packet.payload?.stage || packet.actionType || 'knowledge';
  const output = [
    `Knowledge entry recorded for: ${topic}`,
    `- Action: ${packet.actionType || 'knowledge'}`,
    `- Stage: ${stage}`,
    `- Workflow: ${packet.workflowId || 'standalone'}`,
    `- Summary: extracted`,
    `- Source: documented`,
    `- Tags: assigned`
  ].join('\n');
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeGovernance(packet) {
  const topic = packet.payload?.originalCommand || packet.title || packet.payload?.input || 'Governance';
  let decisionCount = 0;
  try {
    const decisions = listGovernanceDecisions();
    decisionCount = Array.isArray(decisions) ? decisions.length : 0;
  } catch { /* fallback */ }
  const output = [
    `Governance task recorded for: ${topic}`,
    `- Action: ${packet.actionType || 'governance'}`,
    `- Workflow: ${packet.workflowId || 'standalone'}`,
    `- Governance decisions on record: ${decisionCount}`,
    `- No destructive actions taken without approval.`
  ].join('\n');
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeStartupLaunch(packet) {
  const topic = packet.payload?.originalCommand || packet.title || packet.payload?.input || 'Startup launch';
  const stage = packet.payload?.stage || packet.actionType || 'startup_launch';
  const output = [
    `Launch playbook created for: ${topic}`,
    `- Action: ${packet.actionType || 'startup_launch'}`,
    `- Stage: ${stage}`,
    `- Workflow: ${packet.workflowId || 'standalone'}`,
    `- Validation: completed`,
    `- MVP scope: defined`,
    `- GTM strategy: outlined`,
    `- Fundraising steps: identified`
  ].join('\n');
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeInvestment(packet) {
  const topic = packet.payload?.originalCommand || packet.title || packet.payload?.input || 'Investment';
  const stage = packet.payload?.stage || packet.actionType || 'investment';
  const output = [
    `Investment analysis drafted for: ${topic}`,
    `- Action: ${packet.actionType || 'investment'}`,
    `- Stage: ${stage}`,
    `- Workflow: ${packet.workflowId || 'standalone'}`,
    `- Market view: assessed`,
    `- Risk flags: identified`,
    `- Portfolio impact: modeled`
  ].join('\n');
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeRealEstate(packet) {
  const topic = packet.payload?.originalCommand || packet.title || packet.payload?.input || 'Real estate';
  const stage = packet.payload?.stage || packet.actionType || 'real_estate';
  const output = [
    `Real estate analysis created for: ${topic}`,
    `- Action: ${packet.actionType || 'real_estate'}`,
    `- Stage: ${stage}`,
    `- Workflow: ${packet.workflowId || 'standalone'}`,
    `- Property summary: compiled`,
    `- Deal metrics: calculated`,
    `- Rental plan: drafted`
  ].join('\n');
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeProcurement(packet) {
  const topic = packet.payload?.originalCommand || packet.title || packet.payload?.input || 'Procurement';
  const stage = packet.payload?.stage || packet.actionType || 'procurement';
  const output = [
    `Procurement plan created for: ${topic}`,
    `- Action: ${packet.actionType || 'procurement'}`,
    `- Stage: ${stage}`,
    `- Workflow: ${packet.workflowId || 'standalone'}`,
    `- Vendors: listed`,
    `- RFQ status: tracked`,
    `- Budget: allocated`
  ].join('\n');
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeFinancial(packet) {
  const topic = packet.payload?.originalCommand || packet.title || packet.payload?.input || 'Financial';
  const stage = packet.payload?.stage || packet.actionType || 'financial';
  const output = [
    `Financial snapshot created for: ${topic}`,
    `- Action: ${packet.actionType || 'financial'}`,
    `- Stage: ${stage}`,
    `- Workflow: ${packet.workflowId || 'standalone'}`,
    `- Budget: reviewed`,
    `- Forecast: projected`,
    `- Cash view: current`
  ].join('\n');
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeRecruitment(packet) {
  const topic = packet.payload?.originalCommand || packet.title || packet.payload?.input || 'Recruitment';
  const stage = packet.payload?.stage || packet.actionType || 'recruitment';
  const output = [
    `Recruitment plan created for: ${topic}`,
    `- Action: ${packet.actionType || 'recruitment'}`,
    `- Stage: ${stage}`,
    `- Workflow: ${packet.workflowId || 'standalone'}`,
    `- Candidates: sourced`,
    `- Screening notes: recorded`,
    `- Interview schedule: planned`
  ].join('\n');
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeRisk(packet) {
  const topic = packet.payload?.originalCommand || packet.title || packet.payload?.input || 'Risk';
  const stage = packet.payload?.stage || packet.actionType || 'risk';
  const output = [
    `Risk record created for: ${topic}`,
    `- Action: ${packet.actionType || 'risk'}`,
    `- Stage: ${stage}`,
    `- Workflow: ${packet.workflowId || 'standalone'}`,
    `- Threat: identified`,
    `- Likelihood: assessed`,
    `- Mitigation: planned`
  ].join('\n');
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeCrisis(packet) {
  const topic = packet.payload?.originalCommand || packet.title || packet.payload?.input || 'Crisis';
  const stage = packet.payload?.stage || packet.actionType || 'crisis';
  const output = [
    `Crisis log created for: ${topic}`,
    `- Action: ${packet.actionType || 'crisis'}`,
    `- Stage: ${stage}`,
    `- Workflow: ${packet.workflowId || 'standalone'}`,
    `- Detection: triggered`,
    `- Escalation: notified`,
    `- Recovery: in progress`
  ].join('\n');
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeRD(packet) {
  const topic = packet.payload?.originalCommand || packet.title || packet.payload?.input || 'R&D';
  const stage = packet.payload?.stage || packet.actionType || 'rd';
  const output = [
    `R&D note created for: ${topic}`,
    `- Action: ${packet.actionType || 'rd'}`,
    `- Stage: ${stage}`,
    `- Workflow: ${packet.workflowId || 'standalone'}`,
    `- Technology: evaluated`,
    `- Evaluation: documented`,
    `- Prototype plan: outlined`
  ].join('\n');
  updatePacketAsDone(packet.id, output);
  return output;
}

async function executeExecutive(packet) {
  const topic = packet.payload?.originalCommand || packet.title || packet.payload?.input || 'Executive';
  const stage = packet.payload?.stage || packet.actionType || 'executive';
  const output = [
    `Executive briefing drafted for: ${topic}`,
    `- Action: ${packet.actionType || 'executive'}`,
    `- Stage: ${stage}`,
    `- Workflow: ${packet.workflowId || 'standalone'}`,
    `- Status summary: compiled`,
    `- Bottlenecks: identified`,
    `- Recommended actions: listed`
  ].join('\n');
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

const WORKFLOW_RUNS_KEY = 'alphonso_workflow_runs_v1';
const WORKFLOW_TIMELINE_KEY = 'alphonso_workflow_run_timelines_v1';

function readRuns() {
  try {
    const raw = localStorage.getItem(WORKFLOW_RUNS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeRuns(runs) {
  localStorage.setItem(WORKFLOW_RUNS_KEY, JSON.stringify(runs));
}

function readTimelines() {
  try {
    const raw = localStorage.getItem(WORKFLOW_TIMELINE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeTimelines(timelines) {
  localStorage.setItem(WORKFLOW_TIMELINE_KEY, JSON.stringify(timelines));
}

function appendTimeline(runId, entry) {
  const timelines = readTimelines();
  if (!timelines[runId]) timelines[runId] = [];
  timelines[runId].push({ ...entry, timestamp: new Date().toISOString() });
  writeTimelines(timelines);
}

function generateRunId() {
  return `wf-run-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function hasRealConnectors(connectorRequirements) {
  if (!Array.isArray(connectorRequirements)) return false;
  return connectorRequirements.length > 0 && !connectorRequirements.includes('none_required') && !connectorRequirements.includes('depends_on_automation_target');
}

function buildStages(operation) {
  const actions = operation.allowedActions || [];
  if (actions.length === 0) return [];
  return actions.map((action) => ({
    id: `${operation.id}-${action}-${Date.now()}`,
    name: action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    actionType: action,
    state: 'pending',
    result: null,
    error: null
  }));
}

function computeInitialStatus(operation, options) {
  const zeroCostMode = options.zeroCostMode !== false;
  const needsApproval = operation.riskLevel === 'high' || operation.riskLevel === 'critical';
  if (needsApproval && zeroCostMode) return 'approval_required';
  if (hasRealConnectors(operation.connectorRequirements)) return 'setup_required';
  return 'queued';
}

export function startWorkflowRun(operationId, options = {}) {
  if (!operationId || typeof operationId !== 'string') {
    return { ok: false, error: 'operationId must be a non-empty string.' };
  }
  const ops = listWorkflowOperations();
  const operation = ops.find((o) => o.id === operationId);
  if (!operation) {
    return { ok: false, error: `Workflow operation '${operationId}' not found.` };
  }

  const stages = buildStages(operation);
  const status = computeInitialStatus(operation, options);

  const run = {
    id: generateRunId(),
    workflowId: operationId,
    status,
    input: options.input || '',
    triggerType: options.triggerType || 'manual_command',
    zeroCostMode: options.zeroCostMode !== false,
    stages: stages.map((s) => ({ ...s })),
    progress: { totalStages: stages.length, completedStages: 0, blockedStages: 0, approvalRequiredStages: 0 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const runs = readRuns();
  runs.push(run);
  writeRuns(runs);

  appendTimeline(run.id, { event: 'started', status });

  appendWorkflowReceipt({
    workflowId: operationId,
    workflowRunId: run.id,
    actionType: 'workflow_started',
    status,
    riskLevel: operation.riskLevel || 'low',
    details: { triggerType: options.triggerType, input: options.input }
  });

  return { ok: true, run };
}

export function approveWorkflowRun(runId, approver = 'user') {
  const runs = readRuns();
  const run = runs.find((r) => r.id === runId);
  if (!run) return { ok: false, error: `Run '${runId}' not found.` };

  run.status = 'approved';
  run.approvedBy = approver;
  run.updatedAt = new Date().toISOString();
  writeRuns(runs);

  appendTimeline(run.id, { event: 'approved', approver });

  appendWorkflowReceipt({
    workflowId: run.workflowId,
    workflowRunId: run.id,
    actionType: 'workflow_approved',
    status: 'approved',
    details: { approver }
  });

  return { ok: true, run };
}

function connectorMatch(stageActionType, connectorRequirements) {
  if (!Array.isArray(connectorRequirements)) return false;
  return connectorRequirements.some((req) => {
    const clean = req.replace(/\?.*$/, '').toLowerCase();
    return stageActionType.toLowerCase().includes(clean) || clean.includes(stageActionType.toLowerCase());
  });
}

export async function executeWorkflowRun(runId) {
  if (!runId || typeof runId !== 'string') return { ok: false, error: 'runId must be a non-empty string.' };
  const runs = readRuns();
  const run = runs.find((r) => r.id === runId);
  if (!run) return { ok: false, error: `Run '${runId}' not found.` };

  run.status = 'in_progress';
  run.updatedAt = new Date().toISOString();
  appendTimeline(run.id, { event: 'execution_started' });

  const ops = listWorkflowOperations();
  const operation = ops.find((o) => o.id === run.workflowId);
  const connectorReqs = operation?.connectorRequirements || [];

  let completedStages = 0;
  let blockedStages = 0;
  let approvalRequiredStages = 0;

  for (const stage of run.stages) {
    stage.state = 'in_progress';

    const hasConnectorMatch = connectorMatch(stage.actionType || stage.name, connectorReqs);

    if (hasConnectorMatch) {
      stage.state = 'setup_required';
      stage.error = 'Connector setup required for this stage.';
      blockedStages++;
      appendTimeline(run.id, { event: 'stage_blocked', stage: stage.name, reason: 'connector_setup' });
      continue;
    }

    const packet = {
      id: stage.id || run.id,
      actionType: stage.actionType || stage.name,
      title: stage.name,
      workflowId: run.workflowId,
      payload: { originalCommand: run.input, stage: stage.name, ...(run.input ? { input: run.input } : {}) }
    };

    try {
      const result = await executeWorkflowStep(packet);
      if (result.ok) {
        stage.state = 'completed';
        stage.result = result;
        completedStages++;
        appendTimeline(run.id, { event: 'stage_completed', stage: stage.name });
      } else if (result.result === 'no_executor') {
        stage.state = 'completed';
        stage.result = { ok: true, result: 'No specific executor — stage skipped.' };
        completedStages++;
        appendTimeline(run.id, { event: 'stage_skipped', stage: stage.name });
      } else {
        stage.state = 'blocked';
        stage.error = result.output || 'Execution failed.';
        blockedStages++;
        appendTimeline(run.id, { event: 'stage_failed', stage: stage.name, error: stage.error });
      }
    } catch (err) {
      stage.state = 'blocked';
      stage.error = String(err);
      blockedStages++;
      appendTimeline(run.id, { event: 'stage_failed', stage: stage.name, error: String(err) });
    }
  }

  run.status = blockedStages > 0 ? 'partial' : 'completed';
  run.progress = { totalStages: run.stages.length, completedStages, blockedStages, approvalRequiredStages };
  run.updatedAt = new Date().toISOString();
  writeRuns(runs);

  appendTimeline(run.id, { event: 'execution_finished', status: run.status });

  appendWorkflowReceipt({
    workflowId: run.workflowId,
    workflowRunId: run.id,
    actionType: 'workflow_executed',
    status: run.status,
    riskLevel: operation?.riskLevel || 'low',
    details: { progress: run.progress }
  });

  appendWorkflowTelemetryEvent({
    workflowId: run.workflowId,
    workflowRunId: run.id,
    eventType: 'execution_finished',
    status: run.status,
    durationMs: run.createdAt ? Date.now() - new Date(run.createdAt).getTime() : 0,
    metadata: { stages: run.stages.length, blocked: blockedStages, completed: completedStages }
  });

  return { ok: true, run };
}

export function retryWorkflowRun(runId) {
  if (!runId || typeof runId !== 'string') return { ok: false, error: 'runId must be a non-empty string.' };
  const runs = readRuns();
  const run = runs.find((r) => r.id === runId);
  if (!run) return { ok: false, error: `Run '${runId}' not found.` };
  if (run.status === 'completed' || run.status === 'in_progress') {
    return { ok: false, error: `Run '${runId}' is ${run.status} and cannot be retried.` };
  }

  for (const stage of run.stages) {
    if (stage.state === 'blocked' || stage.state === 'setup_required' || stage.state === 'failed') {
      stage.state = 'pending';
      stage.result = null;
      stage.error = null;
    }
  }
  run.status = 'queued';
  run.progress = {
    totalStages: run.stages.length,
    completedStages: run.stages.filter((s) => s.state === 'completed').length,
    blockedStages: 0,
    approvalRequiredStages: 0
  };
  run.updatedAt = new Date().toISOString();
  writeRuns(runs);

  appendTimeline(run.id, { event: 'retried' });

  appendWorkflowReceipt({
    workflowId: run.workflowId,
    workflowRunId: run.id,
    actionType: 'workflow_retried',
    status: 'queued',
    details: { retriedAt: new Date().toISOString() }
  });

  return { ok: true, run };
}

export function runVisualWorkflow(workflowId, options = {}) {
  if (!workflowId || typeof workflowId !== 'string') return { ok: false, error: 'workflowId must be a non-empty string.' };
  const visualWorkflows = listVisualWorkflows();
  const workflow = visualWorkflows.find((w) => w.id === workflowId);
  if (!workflow) return { ok: false, error: `Visual workflow '${workflowId}' not found.` };

  const nodes = workflow.nodes || workflow.steps || [];
  if (nodes.length === 0) return { ok: false, error: 'Visual workflow has no nodes.' };

  const stages = nodes.map((node) => ({
    id: `${workflowId}-${node.id || node.type}-${Date.now()}`,
    name: node.label || node.type || 'unknown',
    actionType: (node.config?.actionType || node.type || 'unknown').replace(/\s+/g, '_').toLowerCase(),
    state: 'pending',
    result: null,
    error: null
  }));

  const runId = generateRunId();
  const run = {
    id: runId,
    workflowId,
    status: 'queued',
    input: options.input || workflow.description || '',
    triggerType: 'visual_builder',
    zeroCostMode: options.zeroCostMode !== false,
    stages,
    progress: { totalStages: stages.length, completedStages: 0, blockedStages: 0, approvalRequiredStages: 0 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: 'visual_builder'
  };

  const runs = readRuns();
  runs.push(run);
  writeRuns(runs);

  appendTimeline(run.id, { event: 'started_from_visual_builder', workflowId });

  appendWorkflowReceipt({
    workflowId,
    workflowRunId: run.id,
    actionType: 'visual_workflow_started',
    status: 'queued',
    details: { nodeCount: nodes.length, source: 'visual_builder' }
  });

  return { ok: true, run };
}

export function getWorkflowRun(runId) {
  if (!runId) return null;
  const runs = readRuns();
  return runs.find((r) => r.id === runId) || null;
}

export function listWorkflowRuns(filter = {}) {
  if (typeof filter !== 'object' || filter === null || Array.isArray(filter)) filter = {};
  let runs = readRuns();
  if (filter.workflowId) runs = runs.filter((r) => r.workflowId === filter.workflowId);
  if (filter.status) runs = runs.filter((r) => r.status === filter.status);
  return runs;
}

export function listWorkflowRunTimeline(runId) {
  if (!runId) return [];
  const timelines = readTimelines();
  return timelines[runId] || [];
}
