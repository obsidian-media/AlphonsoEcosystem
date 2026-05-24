import React, { Suspense, useMemo } from 'react';
import { Activity, Database, Mic, Monitor, RefreshCw, Terminal } from 'lucide-react';
import { formatModelSize, OLLAMA_TROUBLESHOOTING_COMMAND } from '../lib/ollama';
import { MicrophoneStatus } from './MicrophoneStatus';

export function RightPanel({
  settings,
  ollamaStatus,
  installedModels,
  desktopBridge,
  voiceStatus,
  selectedModelMissing,
  lastCheckedAt,
  onCheckOllama,
  onCopyTroubleshootingCommand,
  copyState,
  onMinimizeToCoach,
  operatorMode,
  approvalRequiredNotice,
  miyaCompanionState,
  joseCompanionState,
  hectorCompanionState,
  screenObserverState,
  updateCheckState,
  onCheckUpdates
}) {
  const compact = (text, max = 42) => {
    const value = String(text || '');
    if (value.length <= max) return value;
    return `${value.slice(0, max - 1)}...`;
  };

  const diagnostics = useMemo(() => [
    { label: 'Ollama Runtime', value: ollamaStatus.label, state: ollamaStatus.state },
    { label: 'Selected Model', value: selectedModelMissing ? 'Model not found' : settings.selectedModel || 'None', state: selectedModelMissing ? 'model_missing' : settings.selectedModel ? 'connected' : 'no_models' },
    { label: 'Project Workspace', value: settings.workspaceRoot ? compact(settings.workspaceRoot, 34) : 'Workspace not configured', state: settings.workspaceRoot ? 'connected' : 'warning' },
    { label: 'Desktop Bridge', value: desktopBridge.label, state: desktopBridge.state === 'connected' ? 'connected' : 'disconnected' },
    { label: 'Microphone', value: voiceStatus.privacyLabel, state: voiceStatus.state },
    { label: 'Miya Creative', value: compact(miyaCompanionState?.message || 'Not active', 36), state: miyaCompanionState?.state === 'warning' ? 'warning' : 'connected' },
    { label: 'Jose Orchestrator', value: compact(joseCompanionState?.message || 'Not active', 36), state: joseCompanionState?.state === 'warning' ? 'warning' : 'connected' },
    {
      label: 'Hector Research',
      value: compact(
        hectorCompanionState?.currentSourceUrl
          ? `Scanning ${hectorCompanionState.currentSourceUrl}`
          : (hectorCompanionState?.message || 'Not active'),
        36
      ),
      state: hectorCompanionState?.state === 'warning' ? 'warning' : hectorCompanionState?.state === 'researching' ? 'connecting' : 'connected'
    },
    {
      label: 'Screen Observer',
      value: screenObserverState?.enabled
        ? `On (${screenObserverState.status})`
        : `Off (${screenObserverState?.status || 'idle'})`,
      state: screenObserverState?.enabled ? 'connected' : screenObserverState?.status === 'permission_denied' ? 'warning' : 'disconnected'
    },
    {
      label: 'Updater',
      value: updateCheckState?.available
        ? `Update ${updateCheckState.latestVersion} available`
        : updateCheckState?.configured
          ? 'No update available'
          : 'Not configured',
      state: updateCheckState?.available ? 'warning' : updateCheckState?.configured ? 'connected' : 'idle'
    }
  ], [desktopBridge, voiceStatus, ollamaStatus, selectedModelMissing, settings.selectedModel, settings.workspaceRoot, miyaCompanionState, joseCompanionState, hectorCompanionState, screenObserverState, updateCheckState]);

  const Badge = ({ children, color = 'zinc' }) => {
    const colors = {
      zinc: 'bg-zinc-800/60 text-zinc-300 border-zinc-600/30',
      green: 'bg-zinc-800/60 text-zinc-200 border-zinc-600/30',
      blue: 'bg-zinc-800/60 text-zinc-200 border-zinc-600/30',
      amber: 'bg-zinc-800/60 text-zinc-200 border-zinc-600/30',
      red: 'bg-zinc-800/60 text-zinc-200 border-zinc-600/30',
      indigo: 'bg-zinc-800/60 text-zinc-200 border-zinc-600/30'
    };
    return <span className={`px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold rounded border ${colors[color]}`}>{children}</span>;
  };

  const StatusDot = ({ state }) => {
    const color = {
      connected: 'bg-emerald-400',
      listening: 'bg-emerald-400',
      connecting: 'bg-blue-400',
      requesting: 'bg-blue-400',
      requesting_permission: 'bg-blue-400',
      permission_granted: 'bg-emerald-400',
      model_missing: 'bg-amber-400',
      no_models: 'bg-amber-400',
      no_microphone: 'bg-amber-400',
      unsupported: 'bg-amber-400',
      timeout: 'bg-amber-400',
      warning: 'bg-amber-400',
      cors: 'bg-red-400',
      not_running: 'bg-red-400',
      disconnected: 'bg-red-400',
      permission_denied: 'bg-red-400',
      error: 'bg-red-400',
      observing: 'bg-emerald-400'
    }[state] || 'bg-zinc-500';
    return <span className={`h-2 w-2 rounded-full ${color}`} />;
  };

  return (
    <aside className="w-64 bg-zinc-950 border-l border-white/[0.05] flex flex-col shrink-0">
      <div className="h-14 flex items-center px-4 border-b border-white/[0.05]">
        <h2 className="font-bold text-[10px] uppercase tracking-[0.18em] text-zinc-400 flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-indigo-400" />
          System Diagnostics
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex flex-wrap gap-2">
          {operatorMode && <Badge color="blue">Operator</Badge>}
          {settings.localOnlyMode && <Badge color="indigo">Local Only</Badge>}
          {settings.zeroCostMode && <Badge color="green">Zero Cost Mode</Badge>}
          {settings.approvalMode && <Badge color="amber">Approval Mode</Badge>}
          {settings.safeMode && <Badge color="green">Safe Mode</Badge>}
          {settings.privacyShieldActive && <Badge color="green">Privacy Shield</Badge>}
          {settings.environmentTheme === 'orchestrator_gold' && <Badge color="amber">Jose Theme</Badge>}
          {approvalRequiredNotice && <Badge color="red">Approval Required</Badge>}
        </div>
        <div className="space-y-2">
          {diagnostics.map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-zinc-900/40 px-2.5 py-2">
              <div className="space-y-0.5 min-w-0">
                <div className="text-[9px] uppercase tracking-widest text-zinc-600">{item.label}</div>
                <div className="text-[11px] font-semibold text-zinc-200 truncate">{item.value}</div>
              </div>
              <StatusDot state={item.state} />
            </div>
          ))}
        </div>
        <div className="p-3 bg-zinc-900/30 border border-white/5 rounded-xl space-y-2.5">
          <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
            <Database className="w-3.5 h-3.5" /> Installed Models
          </div>
          {installedModels.length === 0 ? (
            <p className="text-[11px] text-zinc-500 leading-relaxed">No models detected yet. Use Check Ollama after starting Ollama.</p>
          ) : (
            <div className="space-y-2">
              {installedModels.map((model) => (
                <div key={model.name} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="truncate text-zinc-300">{model.name}</span>
                  <span className="font-mono text-zinc-600">{formatModelSize(model.size)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="p-3 bg-zinc-900/30 border border-white/5 rounded-xl space-y-2.5">
          <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
            <Mic className="w-3.5 h-3.5" /> Voice Feature
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">{voiceStatus.message}</p>
          <Suspense fallback={null}>
            <MicrophoneStatus voiceStatus={voiceStatus} compact />
          </Suspense>
          <Badge color={colorForState(voiceStatus.state)}>{voiceStatus.state}</Badge>
          <p className="text-[10px] text-zinc-600 leading-relaxed">{voiceStatus.transcription.message}</p>
        </div>
        <div className="p-3 bg-zinc-900/30 border border-white/5 rounded-xl space-y-2.5">
          <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
            <Terminal className="w-3.5 h-3.5" /> Ollama Startup
          </div>
          <div className="rounded-xl bg-black/30 border border-white/5 px-3 py-2 font-mono text-[11px] text-zinc-400 whitespace-pre-wrap">
            {OLLAMA_TROUBLESHOOTING_COMMAND}
          </div>
          <div className="flex gap-2">
            <button onClick={onCheckOllama} className="flex-1 rounded-lg bg-zinc-800 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-200 hover:bg-zinc-700">
              Check Installed Models
            </button>
            <button onClick={onCopyTroubleshootingCommand} className="flex-1 rounded-lg bg-zinc-800 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-200 hover:bg-zinc-700">
              {copyState === 'copied' ? 'Copied' : 'Copy'}
            </button>
          </div>
          {lastCheckedAt && <p className="text-[10px] text-zinc-600">Last checked: {lastCheckedAt.toLocaleTimeString()}</p>}
        </div>
        <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
          <div className="flex items-center gap-2 text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
            <Monitor className="w-3.5 h-3.5" /> Desktop Bridge
          </div>
          <p className="mt-2 text-[10px] text-zinc-400 leading-relaxed">{desktopBridge.message}</p>
          <button onClick={onMinimizeToCoach} className="mt-3 w-full rounded-lg bg-zinc-800 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-200 hover:bg-zinc-700">
            Minimize to Coach Mode
          </button>
        </div>
        <div className="p-3 bg-zinc-900/30 border border-white/5 rounded-xl space-y-2.5">
          <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
            <RefreshCw className="w-3.5 h-3.5" /> Auto Updater
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            {updateCheckState?.available
              ? `New version ${updateCheckState.latestVersion} is available.`
              : updateCheckState?.error
                ? updateCheckState.error
                : updateCheckState?.configured
                  ? 'No update available from configured endpoint.'
                  : 'Updater endpoint and public key are not configured yet.'}
          </p>
          <button onClick={onCheckUpdates} className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-200 hover:bg-zinc-700">
            {updateCheckState?.checking ? 'Checking...' : 'Check for Updates'}
          </button>
        </div>
      </div>
    </aside>
  );
}

function colorForState(state) {
  return {
    connected: 'green',
    listening: 'green',
    connecting: 'blue',
    requesting: 'blue',
    requesting_permission: 'blue',
    permission_granted: 'green',
    model_missing: 'amber',
    no_models: 'amber',
    no_microphone: 'amber',
    unsupported: 'amber',
    timeout: 'amber',
    warning: 'amber',
    cors: 'red',
    not_running: 'red',
    disconnected: 'red',
    permission_denied: 'red',
    error: 'red',
    observing: 'green'
  }[state] || 'zinc';
}
