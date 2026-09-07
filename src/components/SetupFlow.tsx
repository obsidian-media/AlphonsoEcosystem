import React from 'react';

export interface SetupFlowProps {
  onComplete: (chosenModel?: string, chosenProvider?: string) => void;
}

export function SetupFlow({ onComplete }: SetupFlowProps) {
  return (
    <div data-testid="setup-flow-root" className="flex h-screen w-screen items-center justify-center bg-[var(--surface-0)] text-[var(--text-1)]">
      <button onClick={() => onComplete()}>Continue</button>
    </div>
  );
}
