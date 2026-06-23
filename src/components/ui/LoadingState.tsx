import React from 'react';
export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'w-3 h-3 border', md: 'w-5 h-5 border-2', lg: 'w-8 h-8 border-2' };
  return <span className={`inline-block rounded-full border-[--text-3] border-t-accent animate-spin ${s[size]}`} />;
}
export function LoadingState({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12">
      <Spinner size="lg" />
      {message && <p className="text-xs text-[--text-3]">{message}</p>}
    </div>
  );
}