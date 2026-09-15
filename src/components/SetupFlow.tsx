import React, { useState } from 'react';
import { BootRitualIntro } from './setup/BootRitualIntro';
import { SystemScan } from './setup/SystemScan';
import { IntentSelection, type IntentId } from './setup/IntentSelection';
import { RecommendedSetup } from './setup/RecommendedSetup';
import { AgentGrid } from './setup/AgentGrid';
import { InstallQueue, type FailedComponent } from './setup/InstallQueue';
import { ActivationSequence } from './setup/ActivationSequence';
import { markSetupComplete, STARTER_MODEL_ID } from '../services/setupFlowService';
import type { HardwareProfile, SelectableComponent } from '../services/setupFlowService';
import type { PrereqStatus } from '../services/runtimeManagerService';

export interface SetupFlowProps {
  onComplete: (chosenModel?: string, chosenProvider?: string) => void;
}

type SetupStep = 'boot' | 'scan' | 'intent' | 'recommend' | 'agent-grid' | 'queue' | 'activation' | 'failed';
type LabeledComponent = SelectableComponent & { label: string };

export function SetupFlow({ onComplete }: SetupFlowProps) {
  const [step, setStep] = useState<SetupStep>('boot');
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [prereqs, setPrereqs] = useState<PrereqStatus | null>(null);
  const [intent, setIntent] = useState<IntentId | null>(null);
  const [queueComponents, setQueueComponents] = useState<LabeledComponent[]>([]);
  const [earlyExited, setEarlyExited] = useState(false);
  const [activationVariant, setActivationVariant] = useState<'full' | 'toast'>('full');
  const [failedLabels, setFailedLabels] = useState<string[]>([]);
  const [starterModelFailed, setStarterModelFailed] = useState(false);

  const finishSetup = () => {
    markSetupComplete();
    onComplete();
  };

  const handleBootFinish = () => {
    setStep('scan');
  };

  const handleScanContinue = (hw: HardwareProfile, prereq: PrereqStatus) => {
    setHardware(hw);
    setPrereqs(prereq);
    setStep('intent');
  };

  const handleIntentSelect = (selected: IntentId) => {
    setIntent(selected);
    // 'custom' skips the recommendation screen entirely — there's no intent
    // to combine with the hardware scan for a recommendation, so it goes
    // straight to the agent grid (the same screen "Customize" below reaches).
    setStep(selected === 'custom' ? 'agent-grid' : 'recommend');
  };

  const handleProceed = (selected: (SelectableComponent & { label?: string })[]) => {
    const labeled: LabeledComponent[] = selected.map((c) => ({ ...c, label: c.label ?? c.id }));
    setQueueComponents(labeled);
    setStep('queue');
  };

  const handleCustomize = () => {
    setStep('agent-grid');
  };

  const handleAgentGridBack = () => {
    // Return to wherever makes sense: the recommendation screen if there was
    // an intent to show one for, otherwise back to picking an intent at all.
    setStep(intent && intent !== 'custom' ? 'recommend' : 'intent');
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
    // If earlyExited is true, this callback itself is genuinely unreachable:
    // finishSetup() already unmounted SetupFlow (and InstallQueue with it),
    // so InstallQueue's internal effect that would call onAllComplete for
    // later-settling background tasks never re-runs post-unmount — a raw
    // setState on an unmounted component is a no-op, not a scheduled
    // re-render. That's fine, not a gap: the "did my other components
    // finish?" concern this comment used to flag as unaddressed is now
    // covered a different way — InstallQueue dispatches a per-task
    // alphonso:toast directly from its raw promise .then()/.catch()
    // handlers (not gated on any React lifecycle, so it fires whether or
    // not this component tree still exists), for both success and failure.
    // No design-doc-promised Activation toast variant is missing here; the
    // toast-variant activationVariant above is for the *starter* model's
    // own early-exit moment, a separate and already-working case.
  };

  const handleFailed = (failed: FailedComponent[]) => {
    setFailedLabels(failed.map((f) => f.label));
    setStarterModelFailed(failed.some((f) => f.id === STARTER_MODEL_ID));
    setStep('failed');
  };

  return (
    <div data-testid="setup-flow-root" className="flex h-screen w-screen items-center justify-center bg-[var(--surface-0)] text-[var(--text-1)]">
      {step === 'boot' && <BootRitualIntro onFinish={handleBootFinish} />}
      {step === 'scan' && <SystemScan onContinue={handleScanContinue} />}
      {step === 'intent' && <IntentSelection onSelect={handleIntentSelect} />}
      {step === 'recommend' && hardware && prereqs && intent && intent !== 'custom' && (
        <RecommendedSetup intent={intent} hardware={hardware} prereqs={prereqs} onProceed={handleProceed} onCustomize={handleCustomize} />
      )}
      {step === 'agent-grid' && hardware && prereqs && (
        <AgentGrid hardware={hardware} prereqs={prereqs} onProceed={handleProceed} onBack={handleAgentGridBack} />
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
          {/* role="alert" (assertive): this interrupts deliberately, because
              the user has to decide between retrying and continuing. */}
          <div
            role="alert"
            className="w-full rounded bg-[var(--error-dim)] px-3 py-2 text-[var(--error)] text-sm"
          >
            Failed: {failedLabels.join(', ')}
          </div>
          <p className="text-sm text-[var(--text-3)] text-center">
            {starterModelFailed
              ? // Continue Anyway is deliberately not offered here: it calls
                // finishSetup(), which persists setup as complete and hides
                // Setup from every future launch. Without the starter model,
                // chat has no working Ollama model to talk to and no
                // automatic path back into Setup to fix it -- a real, quiet
                // trap the original unconditional button could put a user
                // into (CodeRabbit finding on PR #233, verified against
                // current code before fixing).
                'The starter model is required for chat and couldn\'t be installed. Retry to continue.'
              : 'You can continue into Alphonso and retry these any time from Runtime Hub, or go back and try the install again now.'}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setStep('queue')}
              className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast)]"
            >
              Retry
            </button>
            {!starterModelFailed && (
              <button
                onClick={finishSetup}
                className="rounded border border-[var(--border-strong)] px-4 py-2 text-sm text-[var(--text-2)]"
              >
                Continue Anyway
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
