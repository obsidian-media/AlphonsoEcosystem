import React, { useState } from 'react';
import { SystemScan } from './setup/SystemScan';
import { IntentSelection, type IntentId } from './setup/IntentSelection';
import { RecommendedSetup } from './setup/RecommendedSetup';
import { InstallQueue } from './setup/InstallQueue';
import { ActivationSequence } from './setup/ActivationSequence';
import { markSetupComplete } from '../services/setupFlowService';
import type { HardwareProfile, SelectableComponent } from '../services/setupFlowService';
import type { PrereqStatus } from '../services/runtimeManagerService';

export interface SetupFlowProps {
  onComplete: (chosenModel?: string, chosenProvider?: string) => void;
}

type SetupStep = 'scan' | 'intent' | 'recommend' | 'queue' | 'activation';
type LabeledComponent = SelectableComponent & { label: string };

export function SetupFlow({ onComplete }: SetupFlowProps) {
  const [step, setStep] = useState<SetupStep>('scan');
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [, setPrereqs] = useState<PrereqStatus | null>(null);
  const [intent, setIntent] = useState<IntentId | null>(null);
  const [queueComponents, setQueueComponents] = useState<LabeledComponent[]>([]);
  const [earlyExited, setEarlyExited] = useState(false);
  const [activationVariant, setActivationVariant] = useState<'full' | 'toast'>('full');

  const finishSetup = () => {
    markSetupComplete();
    onComplete();
  };

  const handleScanContinue = (hw: HardwareProfile, prereq: PrereqStatus) => {
    setHardware(hw);
    setPrereqs(prereq);
    setStep('intent');
  };

  const handleIntentSelect = (selected: IntentId) => {
    setIntent(selected);
    if (selected === 'custom') {
      // The agent-grid Custom path is out of scope for this plan (see the
      // design doc §5 step 3/4 — it's the power-user path, not the golden
      // path this plan covers). Falls through to completing Setup directly
      // for now rather than presenting a broken/half-built grid screen.
      finishSetup();
      return;
    }
    setStep('recommend');
  };

  const handleProceed = (selected: (SelectableComponent & { label?: string })[]) => {
    const labeled: LabeledComponent[] = selected.map((c) => ({ ...c, label: c.label ?? c.id }));
    setQueueComponents(labeled);
    setStep('queue');
  };

  const handleCustomize = () => {
    finishSetup();
  };

  const handleStarterReady = () => {
    setEarlyExited(true);
    setActivationVariant('toast');
    finishSetup();
  };

  const handleAllComplete = () => {
    if (!earlyExited) {
      setActivationVariant('full');
      setStep('activation');
    }
    // If earlyExited is true, the user already left via handleStarterReady;
    // a real toast-variant Activation for "last background task finished"
    // needs the main app shell to still be mounted to show a non-blocking
    // toast over it — that cross-component wiring is deferred, tracked as
    // a follow-up, not silently dropped (design doc §5 step 7's second
    // trigger context is genuinely not reachable from inside SetupFlow's
    // own lifecycle, since the component unmounts once finishSetup() runs).
  };

  return (
    <div data-testid="setup-flow-root" className="flex h-screen w-screen items-center justify-center bg-[var(--surface-0)] text-[var(--text-1)]">
      {step === 'scan' && <SystemScan onContinue={handleScanContinue} />}
      {step === 'intent' && <IntentSelection onSelect={handleIntentSelect} />}
      {step === 'recommend' && hardware && intent && intent !== 'custom' && (
        <RecommendedSetup intent={intent} hardware={hardware} onProceed={handleProceed} onCustomize={handleCustomize} />
      )}
      {step === 'queue' && (
        <InstallQueue components={queueComponents} onStarterReady={handleStarterReady} onAllComplete={handleAllComplete} />
      )}
      {step === 'activation' && (
        <ActivationSequence variant={activationVariant} onFinish={finishSetup} />
      )}
    </div>
  );
}
