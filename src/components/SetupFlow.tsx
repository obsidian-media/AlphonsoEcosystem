import React, { useState } from 'react';
import { SystemScan } from './setup/SystemScan';
import { IntentSelection, type IntentId } from './setup/IntentSelection';
import type { HardwareProfile } from '../services/setupFlowService';
import type { PrereqStatus } from '../services/runtimeManagerService';

export interface SetupFlowProps {
  onComplete: (chosenModel?: string, chosenProvider?: string) => void;
}

type SetupStep = 'scan' | 'intent';

export function SetupFlow({ onComplete }: SetupFlowProps) {
  const [step, setStep] = useState<SetupStep>('scan');
  const [, setHardware] = useState<HardwareProfile | null>(null);
  const [, setPrereqs] = useState<PrereqStatus | null>(null);
  const [, setIntent] = useState<IntentId | null>(null);

  const handleScanContinue = (hw: HardwareProfile, prereq: PrereqStatus) => {
    setHardware(hw);
    setPrereqs(prereq);
    setStep('intent');
  };

  const handleIntentSelect = (selected: IntentId) => {
    setIntent(selected);
    // Task 9 (Recommended Setup) and beyond replace this direct completion
    // with the rest of the flow. Kept as a real, working end-to-end path
    // for now rather than a dead end.
    onComplete();
  };

  return (
    <div data-testid="setup-flow-root" className="flex h-screen w-screen items-center justify-center bg-[var(--surface-0)] text-[var(--text-1)]">
      {step === 'scan' && <SystemScan onContinue={handleScanContinue} />}
      {step === 'intent' && <IntentSelection onSelect={handleIntentSelect} />}
    </div>
  );
}
