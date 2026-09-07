import React, { useState } from 'react';
import { IntentSelection, type IntentId } from './setup/IntentSelection';

export interface SetupFlowProps {
  onComplete: (chosenModel?: string, chosenProvider?: string) => void;
}

type SetupStep = 'intent';

export function SetupFlow({ onComplete }: SetupFlowProps) {
  const [step, setStep] = useState<SetupStep>('intent');
  const [, setIntent] = useState<IntentId | null>(null);

  const handleIntentSelect = (selected: IntentId) => {
    setIntent(selected);
    // Later tasks (8-11) add the remaining steps (scan, recommend, queue,
    // activation) and advance `step` through them instead of completing
    // immediately here. Left as a direct call to onComplete for now so
    // this task's test suite exercises a real, working path end-to-end
    // rather than a dead-end screen.
    onComplete();
  };

  if (step === 'intent') {
    return (
      <div data-testid="setup-flow-root" className="flex h-screen w-screen items-center justify-center bg-[var(--surface-0)] text-[var(--text-1)]">
        <IntentSelection onSelect={handleIntentSelect} />
      </div>
    );
  }

  return null;
}
