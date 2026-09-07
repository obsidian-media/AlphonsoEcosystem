import React from 'react';

interface Props {
  activeTab: string;
}

export function ViewLoadingState({ activeTab }: Props) {
  return (
    <div className="flex h-full items-center justify-center px-6 py-10">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-0)] px-5 py-4 text-sm text-[var(--text-3)]">
        Loading {activeTab}...
      </div>
    </div>
  );
}
