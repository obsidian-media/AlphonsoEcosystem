import React from 'react';

/** Shown while the computer can't be reached: the screens keep its last known state. */
export function OfflineBanner({ text }: { text: string }) {
  return <div role="status" data-testid="mobile-offline" className="mx-4 mb-2 rounded-lg bg-(--warning-dim) px-3 py-2 text-xs">{text}</div>;
}
