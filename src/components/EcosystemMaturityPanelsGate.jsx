import React from 'react';
import { useEffect, useState } from 'react';

function LoadingState() {
  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-950/72 p-4 text-sm text-zinc-400">
      Loading maturity panels...
    </div>
  );
}

export function EcosystemMaturityPanelsGate({
  showAdvancedSections = false,
  settings,
  setSettings,
  ollamaStatus,
  verificationLogs,
  voiceStatus,
  workspaceFoundation,
  onRefresh
}) {
  const [moduleState, setModuleState] = useState({ loaded: false, module: null });

  useEffect(() => {
    let cancelled = false;
    import('./EcosystemMaturityPanels')
      .then((module) => {
        if (!cancelled) {
          setModuleState({ loaded: true, module });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setModuleState({ loaded: false, module: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const module = moduleState.module;
  if (!moduleState.loaded || !module) return <LoadingState />;

  const {
    ApprovalCenterPanel,
    EcosystemMapPanel,
    MemoryConfidencePanel,
    OperatorModesPanel,
    PrivacyShieldPanel,
    SessionIntelligencePanel,
    TrustLayerPanel,
    WorkflowOperationsPanel
  } = module;

  return (
    <>
      <OperatorModesPanel settings={settings} setSettings={setSettings} />
      <TrustLayerPanel verificationLogs={verificationLogs} ollamaStatus={ollamaStatus} />
      <ApprovalCenterPanel onRefresh={onRefresh} />
      <MemoryConfidencePanel />
      {showAdvancedSections && (
        <>
          <EcosystemMapPanel ollamaStatus={ollamaStatus} />
          <WorkflowOperationsPanel />
          <SessionIntelligencePanel />
          <PrivacyShieldPanel settings={settings} voiceStatus={voiceStatus} workspaceFoundation={workspaceFoundation} />
        </>
      )}
    </>
  );
}
