import React from 'react';

interface Skill {
  id: string;
  label: string;
  purpose: string;
}

interface Props {
  skills: Skill[];
  compact?: boolean;
}

export function CoachSkillGrid({ skills, compact = false }: Props) {
  return (
    <div className={compact ? 'grid grid-cols-2 gap-1.5' : 'grid grid-cols-2 gap-2'}>
      {skills.map((skill) => (
        <button
          key={skill.id}
          type="button"
          title={skill.purpose}
          className={`rounded-xl border border-[var(--border)] bg-[var(--surface-0)] text-left transition hover:border-[var(--agent-alphonso-glow)] hover:bg-[var(--agent-alphonso-glow)] ${compact ? 'px-2 py-1.5' : 'px-3 py-2'}`}
        >
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--agent-alphonso)]">{skill.label}</div>
          {!compact && <div className="mt-1 text-[11px] leading-relaxed text-[var(--text-3)]">{skill.purpose}</div>}
        </button>
      ))}
    </div>
  );
}
