import React, { useState } from 'react';
interface Tab { id: string; label: string; icon?: React.ReactNode; }
interface TabsProps { tabs: Tab[]; defaultTab?: string; onChange?: (id: string) => void; children: (activeTab: string) => React.ReactNode; }
export function Tabs({ tabs, defaultTab, onChange, children }: TabsProps) {
  const [active, setActive] = useState(defaultTab || tabs[0]?.id);
  const handleChange = (id: string) => { setActive(id); onChange?.(id); };
  return (
    <div className="flex flex-col gap-0">
      <div className="flex gap-0.5 p-1 bg-[--surface-3] rounded-[--radius-lg] w-fit">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => handleChange(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[--radius-md] transition-all duration-[--duration-normal] ${active === tab.id ? 'bg-[--surface-4] text-[--text-1] shadow-[--shadow-sm]' : 'text-[--text-3] hover:text-[--text-2]'}`}>
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>
      <div className="pt-4">{children(active)}</div>
    </div>
  );
}