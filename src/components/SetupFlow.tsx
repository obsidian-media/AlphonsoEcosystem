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

type SetupStep = 'scan' | 'intent' | 'recommend' | 'queue' | 'activation' | 'failed';
type LabeledComponent = SelectableComponent & { label: string };

export function SetupFlow({ onComplete }: SetupFlowProps) {
  const [step, setStep] = useState<SetupStep>('scan');
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [, setPrereqs] = useState<PrereqStatus | null>(null);
  const [intent, setIntent] = useState<IntentId | null>(null);
  const [queueComponents, setQueueComponents] = useState<LabeledComponent[]>([]);
  const [earlyExited, setEarlyExited] = useState(false);
  const [activationVariant, setActivationVariant] = useState<'full' | 'toast'>('full');
  const [failedLabels, setFailedLabels] = useState<string[]>([]);

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
    setStep('recommend');
  };

  const handleProceed = (selected: (SelectableComponent & { label?: string })[]) => {
    const labeled: LabeledComponent[] = selected.map((c) => ({ ...c, label: c.label ?? c.id }));
    setQueueComponents(labeled);
    setStep('queue');
  };

  // "Customize" (the agent-grid power-user path) isn't built yet — see the
  // design doc §5 step 3/4. Rather than silently completing Setup and
  // installing nothing (which is what an earlier version did), skip
  // explicitly: the user gets a working app with no optional components,
  // and Runtime Hub remains the way to add them.
  const handleSkipToApp = () => {
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

  const handleFailed = (labels: string[]) => {
    setFailedLabels(labels);
    setStep('failed');
  };

  return (
    <div data-testid="setup-flow-root" className="flex h-screen w-screen items-center justify-center bg-[var(--surface-0)] text-[var(--text-1)]">
      {step === 'scan' && <SystemScan onContinue={handleScanContinue} />}
      {step === 'intent' && <IntentSelection onSelect={handleIntentSelect} />}
      {step === 'recommend' && hardware && intent && (
        <RecommendedSetup intent={intent} hardware={hardware} onProceed={handleProceed} onCustomize={handleSkipToApp} />
      )}
      {step === 'queue' && (
        <InstallQueue
          components={queueComponents}
          onStarterReady={handleStarterReady}
          onAllComplete={handleAllComplete}
          onFailed={handleFailed}
        />
      )}
      {step === 'activation' && (
        <ActivationSequence variant={activationVariant} onFinish={finishSetup} />
      )}
      {step === 'failed' && (
        <div className="flex flex-col items-center gap-4 p-8 w-full max-w-lg">
          <h2 className="text-2xl font-semibold text-[var(--text-1)]">Some components didn&apos;t install</h2>
          <div className="w-full rounded bg-[var(--error-dim)] px-3 py-2 text-[var(--error)] text-sm">
            Failed: {failedLabels.join(', ')}
          </div>
          <p className="text-sm text-[var(--text-3)] text-center">
            You can continue into Alphonso and retry these any time from Runtime Hub, or go back
            and try the install again now.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setStep('queue')}
              className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--surface-0)]"
            >
              Retry
            </button>
            <button
              onClick={finishSetup}
              className="rounded border border-[var(--border-strong)] px-4 py-2 text-sm text-[var(--text-2)]"
            >
              Continue Anyway
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
