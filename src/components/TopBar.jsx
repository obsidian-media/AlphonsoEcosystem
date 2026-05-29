import { ArrowUpCircle, Globe, User } from 'lucide-react';
import { normalizeEndpoint } from '../lib/ollama';
import { Badge, StatusDot } from './ui/Badge';

export function TopBar({ settings, ollamaStatus, selectedModelMissing, operatorMode, activeTab, updateAvailable, updateVersion, onOpenSettings }) {
  const modelLabel = selectedModelMissing
    ? 'Model not found'
    : settings.selectedModel || 'No model selected';

  return (
    <header className="h-16 flex items-center justify-between px-6 border-b border-white/[0.05] bg-zinc-950/80 backdrop-blur-md z-20 sticky top-0">
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 rounded-full border border-white/5 min-w-0">
          <Globe className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          <span className="text-[11px] font-mono text-zinc-400 truncate">{normalizeEndpoint(settings.endpoint)}</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 rounded-full border border-white/5">
          <StatusDot state={ollamaStatus.state} />
          <span className="text-[11px] font-semibold text-zinc-300">{ollamaStatus.label}</span>
        </div>
        {updateAvailable && (
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-900/40 hover:bg-emerald-900/60 border border-emerald-500/30 rounded-full text-emerald-300 transition-colors"
            title={`Update ${updateVersion} available — open Settings to download`}
          >
            <ArrowUpCircle className="w-3.5 h-3.5" />
            <span className="text-[11px] font-bold">{updateVersion} ready</span>
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        {activeTab === 'orchestrator' && <Badge color="amber">Jose</Badge>}
        {activeTab === 'hector' && <Badge color="green">Hector</Badge>}
        {activeTab === 'miya' && <Badge color="blue">Miya</Badge>}
        {activeTab === 'content' && <Badge color="cyan">Content</Badge>}
        {activeTab === 'ecosystem' && <Badge color="indigo">Ecosystem</Badge>}
        {activeTab === 'project_execution' && <Badge color="indigo">Project Execution</Badge>}
        {operatorMode && <Badge color="blue">Operator</Badge>}
        {settings.approvalMode && <Badge color="amber">Approval</Badge>}
        {settings.safeMode && <Badge color="green">Safe</Badge>}
        {settings.localOnlyMode && <Badge color="indigo">Local Only</Badge>}
        {settings.zeroCostMode && <Badge color="green">Zero Cost</Badge>}
        <Badge color={selectedModelMissing ? 'amber' : 'indigo'}>{modelLabel}</Badge>
        <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
          <User className="w-4 h-4 text-zinc-400" />
        </div>
      </div>
    </header>
  );
}
