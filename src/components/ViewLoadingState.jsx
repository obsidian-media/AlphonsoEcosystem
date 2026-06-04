import React from 'react';

export function ViewLoadingState({ activeTab }) {
  return (
    <div className="flex h-full items-center justify-center px-6 py-10">
      <div className="rounded-2xl border border-white/10 bg-zinc-950/75 px-5 py-4 text-sm text-zinc-400">
        Loading {activeTab}...
      </div>
    </div>
  );
}
