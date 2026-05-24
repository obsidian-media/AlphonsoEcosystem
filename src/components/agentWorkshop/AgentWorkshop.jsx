import React, { useState } from 'react';
import { createAgentOutput, AgentOutputTypes } from '../../agents/shared/agentOutputSchemas';
import { ProjectExecutionMode } from '../projectExecution/ProjectExecutionMode';
import {
  submitAccContentCatalystJob,
  getAccContentCatalystStatus
} from '../../services/agentWorkshop/contentCatalystBridgeService';

const DEV_ACTIONS = {
  jose: ['Generate orchestration plan', 'Route project tasks', 'Create approval gates'],
  alphonso: ['Generate implementation plan', 'Generate build/test checklist', 'Generate local verification report'],
  miya: ['Generate UI direction', 'Generate landing page structure', 'Generate design system notes'],
  hector: ['Generate research checklist', 'Generate API documentation questions', 'Generate source verification template'],
  marcus: ['Generate audit report', 'Generate security checklist', 'Generate release readiness review'],
  maria: ['Generate roadmap', 'Generate backlog', 'Generate acceptance criteria']
};

export function AgentWorkshop() {
  const [devOutput, setDevOutput] = useState(null);
  const [contentIdea, setContentIdea] = useState('A premium social post about launching a new product');
  const [contentBridgeOutput, setContentBridgeOutput] = useState(null);
  const [contentBridgeBusy, setContentBridgeBusy] = useState(false);

  const runDevAction = (agentId, action) => {
    const packet = createAgentOutput(AgentOutputTypes.AGENT_TASK_PACKET, {
      agentId,
      projectId: 'agent-dev-mode',
      title: `${agentId} :: ${action}`,
      summary: `${agentId} produced deterministic ${action.toLowerCase()} local output.`,
      status: 'ready',
      confidence: 'inferred',
      riskLevel: 'low',
      assumptions: ['Agent Development Mode deterministic template'],
      verifiedFacts: [],
      openQuestions: [],
      recommendedNextSteps: ['Review output style', 'Promote to runtime adapter when approved'],
      requiresApproval: false,
      relatedFiles: [],
      proposedChanges: []
    });
    setDevOutput(packet);
  };

  const runContentBridge = async () => {
    setContentBridgeBusy(true);
    try {
      const requestId = `acc_bridge_${Date.now()}`;
      const job = await submitAccContentCatalystJob({
        idea: contentIdea,
        business_context: 'ACC orchestrates, Alphonso generates, approvals stay gated.',
        platform: 'instagram',
        format: 'reel',
        tone: 'confident and polished',
        request_id: requestId,
        needs: {
          image: true,
          video: true,
          narration: false,
          publish: false
        }
      });

      setContentBridgeOutput({
        job,
        status: getAccContentCatalystStatus(job.job_id || job.jobId || job.id)
      });
    } finally {
      setContentBridgeBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-bold mb-3">Agent Development Mode</div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {Object.entries(DEV_ACTIONS).map(([agentId, actions]) => (
            <div key={agentId} className="rounded-xl border border-white/10 bg-zinc-900/40 p-3 space-y-2">
              <div className="text-sm font-semibold text-white capitalize">{agentId}</div>
              {actions.map((action) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => runDevAction(agentId, action)}
                  className="w-full rounded-lg border border-white/10 bg-zinc-800/80 px-2 py-2 text-xs text-zinc-200 hover:bg-zinc-700"
                >
                  {action}
                </button>
              ))}
            </div>
          ))}
        </div>
        {devOutput && (
          <div className="mt-4 rounded-lg border border-indigo-400/20 bg-indigo-500/10 p-3 text-xs text-indigo-100">
            <div className="font-semibold">{devOutput.title}</div>
            <div className="mt-1">{devOutput.summary}</div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-bold mb-3">Content Bridge to Alphonso</div>
        <div className="space-y-3">
          <input
            value={contentIdea}
            onChange={(event) => setContentIdea(event.target.value)}
            className="w-full rounded-lg border border-white/10 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-100"
            placeholder="Content idea"
          />
          <button
            type="button"
            onClick={runContentBridge}
            disabled={contentBridgeBusy || !contentIdea.trim()}
            className="rounded-lg bg-cyan-300 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-950 disabled:opacity-60"
          >
            {contentBridgeBusy ? 'Bridging...' : 'Send to Alphonso Content Catalyst'}
          </button>
          {contentBridgeOutput && (
            <pre className="max-h-64 overflow-auto rounded-lg border border-white/10 bg-zinc-900/70 p-3 text-[11px] text-zinc-200">
              {JSON.stringify(contentBridgeOutput, null, 2)}
            </pre>
          )}
        </div>
      </section>
      <ProjectExecutionMode />
    </div>
  );
}
