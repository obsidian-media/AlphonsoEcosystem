import React, { useState } from 'react';
import { SystemScan } from './setup/SystemScan';
import { IntentSelection, type IntentId } from './setup/IntentSelection';
import { RecommendedSetup } from './setup/RecommendedSetup';
import type { HardwareProfile, SelectableComponent } from '../services/setupFlowService';
import type { PrereqStatus } from '../services/runtimeManagerService';

export interface SetupFlowProps {
  onComplete: (chosenModel?: string, chosenProvider?: string) => void;
}

type SetupStep = 'scan' | 'intent' | 'recommend';

export function SetupFlow({ onComplete }: SetupFlowProps) {
  const [step, setStep] = useState<SetupStep>('scan');
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [, setPrereqs] = useState<PrereqStatus | null>(null);
  const [intent, setIntent] = useState<IntentId | null>(null);

  const handleScanContinue = (hw: HardwareProfile, prereq: PrereqStatus) => {
    setHardware(hw);
    setPrereqs(prereq);
    setStep('intent');
  };

  const handleIntentSelect = (selected: IntentId) => {
    setIntent(selected);
    if (selected === 'custom') {
      // Task 10's agent-grid Custom path replaces this direct completion.
      onComplete();
      return;
    }
    setStep('recommend');
  };

  const handleProceed = (_selected: SelectableComponent[]) => {
    // Task 10 (Install Queue) replaces this direct completion with the
    // real install flow.
    onComplete();
  };

  const handleCustomize = () => {
    // Task 10's agent-grid Custom path replaces this direct completion.
    onComplete();
  };

  return (
    <div data-testid="setup-flow-root" className="flex h-screen w-screen items-center justify-center bg-[var(--surface-0)] text-[var(--text-1)]">
      {step === 'scan' && <SystemScan onContinue={handleScanContinue} />}
      {step === 'intent' && <IntentSelection onSelect={handleIntentSelect} />}
      {step === 'recommend' && hardware && intent && intent !== 'custom' && (
        <RecommendedSetup intent={intent} hardware={hardware} onProceed={handleProceed} onCustomize={handleCustomize} />
      )}
    </div>
  );
}
