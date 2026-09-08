import React from 'react';

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  disabled?: boolean;
  title?: string;
}

interface TabsProps {
  tabs: readonly TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
  /** Smaller scale for tight contexts (e.g. a sidebar panel's own mini tab-strip)
   *  — same underline mechanism, no separate wrapper divider (the surrounding
   *  layout already supplies one in these contexts). */
  compact?: boolean;
}

/**
 * The one shared tab-switcher for page-content navigation (Draft A: "underline-style
 * active tab used instead" of solid pill-tab nav). Controlled — the parent owns
 * activeId/onChange, since every real call site already tracks its own activeTab
 * state and needs to branch its content rendering on it too.
 */
export function Tabs({ tabs, activeId, onChange, className = '', compact = false }: TabsProps) {
  return (
    <div
      className={`flex items-center ${compact ? 'gap-3' : 'gap-5 border-b border-[var(--border)]'} ${className}`.trim()}
    >
      {tabs.map((tab) => {
        const isActive = activeId === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            aria-pressed={isActive}
            disabled={tab.disabled}
            title={tab.title}
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-1.5 -mb-px border-b-2 font-semibold uppercase tracking-widest transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              compact ? 'pb-1 text-[10px]' : 'pb-2.5 text-xs'
            } ${
              isActive
                ? 'border-[var(--accent)] text-[var(--text-1)]'
                : 'border-transparent text-[var(--text-3)] hover:text-[var(--text-2)]'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.badge}
          </button>
        );
      })}
    </div>
  );
}
