import React from 'react';
import { Bot, CheckCircle2, Clock, Copy, ExternalLink, Eye, FileText, AlertTriangle, RefreshCw, XCircle } from 'lucide-react';

const AGENT_ICONS = {
  hector: '🔬',
  miya: '🎨',
  maria: '⚖️',
  marcus: '🚀',
  echo: '💾',
  sentinel: '🛡️',
  nova: '📊',
  alphonso: '⚡',
  jose: '🧠'
};

const AGENT_COLORS = {
  hector: 'from-blue-500/20 to-blue-600/10 border-blue-500/30 text-blue-300',
  miya: 'from-purple-500/20 to-purple-600/10 border-purple-500/30 text-purple-300',
  maria: 'from-amber-500/20 to-amber-600/10 border-amber-500/30 text-amber-300',
  marcus: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30 text-emerald-300',
  echo: 'from-cyan-500/20 to-cyan-600/10 border-cyan-500/30 text-cyan-300',
  sentinel: 'from-red-500/20 to-red-600/10 border-red-500/30 text-red-300',
  nova: 'from-orange-500/20 to-orange-600/10 border-orange-500/30 text-orange-300',
  alphonso: 'from-indigo-500/20 to-indigo-600/10 border-indigo-500/30 text-indigo-300',
  jose: 'from-zinc-500/20 to-zinc-600/10 border-zinc-500/30 text-zinc-300'
};

const STATUS_STYLES = {
  executed: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', icon: CheckCircle2 },
  reported_to_jose: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', icon: CheckCircle2 },
  pending_approval: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', icon: Clock },
  approval_required: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', icon: Clock },
  queued: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20', icon: Clock },
  failed: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20', icon: XCircle },
  dead_letter: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20', icon: XCircle }
};

function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.queued;
  const Icon = style.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${style.bg} ${style.text} ${style.border}`}>
      <Icon className="w-3 h-3" />
      {status?.replace(/_/g, ' ')}
    </span>
  );
}

function AgentCard({ receipt, onRetry }) {
  const icon = AGENT_ICONS[receipt.agent] || '🤖';
  const colorClass = AGENT_COLORS[receipt.agent] || AGENT_COLORS.jose;
  const isFailed = receipt.status === 'failed' || receipt.status === 'dead_letter';
  return (
    <div className={`flex items-start gap-3 p-2.5 rounded-xl bg-gradient-to-br ${colorClass} border transition-all`}>
      <span className="text-lg mt-0.5 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold uppercase tracking-wider">{receipt.agent}</span>
          <StatusBadge status={receipt.status} />
          {receipt.riskLevel && receipt.riskLevel !== 'low' && (
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
              receipt.riskLevel === 'high' || receipt.riskLevel === 'critical'
                ? 'bg-red-500/20 text-red-300'
                : 'bg-amber-500/20 text-amber-300'
            }`}>
              {receipt.riskLevel}
            </span>
          )}
          {isFailed && onRetry && (
            <button
              onClick={() => onRetry(receipt)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-colors"
              title="Retry this agent"
            >
              <RefreshCw className="w-2.5 h-2.5" />
              Retry
            </button>
          )}
        </div>
        <div className="text-[11px] text-zinc-400 mt-1 truncate">{receipt.actionType || receipt.eventType}</div>
        {isFailed && receipt.reason && (
          <div className="text-[10px] text-red-300/70 mt-0.5 truncate">Error: {receipt.reason}</div>
        )}
      </div>
    </div>
  );
}

function ArtifactDisplay({ artifacts }) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {artifacts.map((artifact, idx) => {
        if (!artifact || typeof artifact !== 'object') return null;
        if (artifact.script || artifact.prompts || artifact.scenes) {
          return (
            <div key={idx} className="p-2 rounded-lg bg-purple-500/5 border border-purple-500/10">
              <div className="text-[10px] font-bold uppercase tracking-wider text-purple-400 mb-1">Creative Package</div>
              {artifact.title && <div className="text-[12px] text-zinc-200 font-medium">{artifact.title}</div>}
              {artifact.hook && <div className="text-[11px] text-zinc-400 mt-0.5">{artifact.hook}</div>}
              {Array.isArray(artifact.prompts) && artifact.prompts.length > 0 && (
                <div className="mt-1.5 space-y-0.5">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-purple-300/60">Prompts</div>
                  {artifact.prompts.map((p, i) => (
                    <div key={i} className="text-[11px] text-zinc-400 pl-2 border-l border-purple-500/20">{p}</div>
                  ))}
                </div>
              )}
              {Array.isArray(artifact.scenes) && artifact.scenes.length > 0 && (
                <div className="mt-1.5 space-y-0.5">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-purple-300/60">Scenes</div>
                  {artifact.scenes.map((s, i) => (
                    <div key={i} className="text-[11px] text-zinc-400 pl-2 border-l border-purple-500/20">{s}</div>
                  ))}
                </div>
              )}
            </div>
          );
        }
        if (artifact.type === 'hector_report' || artifact.type === 'research_draft') {
          return (
            <div key={idx} className="p-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
              <div className="text-[10px] font-bold uppercase tracking-wider text-blue-400">Research Report</div>
              <div className="text-[11px] text-zinc-400 mt-0.5">{artifact.reportId || artifact.type}</div>
            </div>
          );
        }
        if (artifact.type === 'governance_audit' || artifact.type === 'governance_review_input') {
          return (
            <div key={idx} className="p-2 rounded-lg bg-amber-500/5 border border-amber-500/10">
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Governance Audit</div>
              {artifact.governanceSummary && <div className="text-[11px] text-zinc-400 mt-0.5">{artifact.governanceSummary}</div>}
              {artifact.resultState && <div className="text-[10px] text-zinc-500 mt-0.5">Status: {artifact.resultState}</div>}
            </div>
          );
        }
        if (artifact.type === 'security_monitor') {
          return (
            <div key={idx} className="p-2 rounded-lg bg-red-500/5 border border-red-500/10">
              <div className="text-[10px] font-bold uppercase tracking-wider text-red-400">Security Review</div>
              <div className="text-[11px] text-zinc-400 mt-0.5">{artifact.status || 'Reviewed'}</div>
            </div>
          );
        }
        if (artifact.type === 'opportunity_score') {
          return (
            <div key={idx} className="p-2 rounded-lg bg-orange-500/5 border border-orange-500/10">
              <div className="text-[10px] font-bold uppercase tracking-wider text-orange-400">Opportunity Score</div>
              <div className="text-[11px] text-zinc-400 mt-0.5">{artifact.status || 'Scored'}</div>
            </div>
          );
        }
        if (artifact.type === 'memory_preservation') {
          return (
            <div key={idx} className="p-2 rounded-lg bg-cyan-500/5 border border-cyan-500/10">
              <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">Memory Preserved</div>
              {Array.isArray(artifact.preservedAgents) && artifact.preservedAgents.length > 0 && (
                <div className="text-[11px] text-zinc-400 mt-0.5">{artifact.preservedAgents.join(', ')}</div>
              )}
            </div>
          );
        }
        return (
          <div key={idx} className="p-2 rounded-lg bg-zinc-500/5 border border-white/5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{artifact.type || 'Artifact'}</div>
            <div className="text-[11px] text-zinc-500 mt-0.5">{artifact.status || ''}</div>
          </div>
        );
      })}
    </div>
  );
}

export function PipelineResultCard({ result, commandText, onRetryAgent }) {
  if (!result) return null;
  const executedCount = result.executedCount || 0;
  const pendingCount = result.pendingApprovalCount || 0;
  const failedCount = result.failedCount || 0;
  const total = executedCount + pendingCount + failedCount;
  const receipts = result.executionReceipts || [];
  const command = result.command || {};
  const shayanReport = command.shayanReport || null;
  const summary = shayanReport?.summary || 'Pipeline completed.';
  const url = shayanReport?.resultUrl || null;
  const assignmentSummaries = shayanReport?.assignmentSummaries || [];
  const artifacts = assignmentSummaries.flatMap((a) => a.artifacts || []);

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-zinc-900/80 to-zinc-950/60 shadow-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.04] bg-gradient-to-r from-indigo-500/5 to-purple-500/5">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-indigo-400" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-indigo-300">Jose Pipeline Result</span>
        </div>
        {commandText && (
          <div className="text-[12px] text-zinc-300 mt-1.5 line-clamp-2">{commandText}</div>
        )}
      </div>

      <div className="px-4 py-3 border-b border-white/[0.04]">
        <div className="text-[11px] text-zinc-400">{summary}</div>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 mt-1.5 transition-colors">
            <ExternalLink className="w-3 h-3" />
            View Result
          </a>
        )}
      </div>

      <div className="px-4 py-2.5 border-b border-white/[0.04] flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[11px] text-zinc-300 font-medium">{executedCount}</span>
          <span className="text-[10px] text-zinc-500">executed</span>
        </div>
        {pendingCount > 0 && (
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[11px] text-zinc-300 font-medium">{pendingCount}</span>
            <span className="text-[10px] text-zinc-500">pending</span>
          </div>
        )}
        {failedCount > 0 && (
          <div className="flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5 text-red-400" />
            <span className="text-[11px] text-zinc-300 font-medium">{failedCount}</span>
            <span className="text-[10px] text-zinc-500">failed</span>
          </div>
        )}
        <div className="text-[10px] text-zinc-600 ml-auto">{total} total</div>
      </div>

      {receipts.length > 0 && (
        <div className="px-4 py-3 border-b border-white/[0.04]">
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Agent Activity</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {receipts.map((receipt, idx) => (
              <AgentCard key={receipt.packetId || idx} receipt={receipt} onRetry={onRetryAgent} />
            ))}
          </div>
        </div>
      )}

      {artifacts.length > 0 && (
        <div className="px-4 py-3 border-b border-white/[0.04]">
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Outputs</div>
          <ArtifactDisplay artifacts={artifacts} />
        </div>
      )}

      {artifacts.filter((a) => a.type === 'generated_images').map((imgArtifact, idx) => (
        <div key={`gen-img-${idx}`} className="px-4 py-3 border-b border-white/[0.04]">
          <div className="text-[10px] font-bold uppercase tracking-widest text-purple-400 mb-2">
            Generated Images ({imgArtifact.count || 0})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(imgArtifact.images || []).map((img, i) => (
              <div key={i} className={`p-2 rounded-lg border ${
                img.status === 'generated'
                  ? 'bg-emerald-500/5 border-emerald-500/20'
                  : 'bg-red-500/5 border-red-500/20'
              }`}>
                {img.status === 'generated' ? (
                  <>
                    {img.previewBase64 && (
                      <img
                        src={`data:image/png;base64,${img.previewBase64}`}
                        alt={img.prompt}
                        className="w-full h-32 object-cover rounded mb-1.5"
                      />
                    )}
                    {img.imageUrls?.length > 0 && !img.previewBase64 && (
                      <div className="text-[10px] text-emerald-400">
                        {img.imageUrls.length} image(s) saved
                      </div>
                    )}
                    <div className="text-[10px] text-zinc-400 truncate">{img.prompt}</div>
                    <div className="text-[9px] text-zinc-600 mt-0.5">{img.provider} · {img.checkpoint || 'default'}</div>
                  </>
                ) : (
                  <div className="text-[11px] text-red-300">
                    <div className="font-medium">Failed: {img.prompt}</div>
                    <div className="text-[10px] text-red-300/70 mt-0.5">{img.error}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {result.commandId && (
        <div className="px-4 py-2 flex items-center justify-between">
          <span className="text-[9px] text-zinc-600 font-mono">{result.commandId}</span>
          <span className="text-[9px] text-zinc-600">{new Date().toLocaleTimeString()}</span>
        </div>
      )}
    </div>
  );
}
