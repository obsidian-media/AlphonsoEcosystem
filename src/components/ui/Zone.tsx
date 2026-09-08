import React from 'react';

type ZoneMood = 'neutral' | 'hector' | 'miya' | 'warm' | 'cool';

interface ZoneProps {
  mood?: ZoneMood;
  children: React.ReactNode;
  className?: string;
  'data-testid'?: string;
}

const moodClasses: Record<ZoneMood, string> = {
  neutral: 'bg-surface-2',
  hector: 'bg-agent-hector/10',
  miya: 'bg-agent-miya/10',
  warm: 'bg-[var(--warning-dim)]',
  cool: 'bg-[var(--accent-dim)]',
};

// No border, no shadow, no radius-as-card treatment — hierarchy comes from
// the tinted background wash alone, per the Phase 1 design system spec's
// "no cards" rule. Extend moodClasses as more rooms/agents need a Zone
// variant; never add a border-* or shadow-* class here.
export function Zone({ mood = 'neutral', children, className = '', ...rest }: ZoneProps) {
  return (
    <div className={`rounded-2xl p-4 ${moodClasses[mood]} ${className}`} {...rest}>
      {children}
    </div>
  );
}
