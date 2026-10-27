// Every agent's skills (agent roles Part B): what each knows how to do, its
// tools, built-in or yours, when last used; skill files that were refused and
// why; and adding your own (a form, a file, or the folder itself).
import React, { useState } from 'react';
import { Button, Badge } from '../ui';
import { agentName } from '../../services/jose/agentNames';
import { listSkills, refusedSkills } from '../../services/skills/skillLibrary';
import { deleteUserSkill, exportSkill, importUserSkill, loadUserSkills, openSkillsFolder } from '../../services/skills/userSkills';
import { skillStats, statsLine } from '../../services/skills/skillOutcomes';
import { skillLastUsed } from '../../services/skills/skillUse';
import { SKILL_TOOLS } from '../../services/skills/skillTools';
import { SkillForm } from './SkillForm';
import type { Skill } from '../../services/skills/skillFile';

const AGENTS = ['alphonso', 'miya', 'hector', 'nova', 'maria', 'sentinel', 'marcus', 'echo'];

function download(skill: Skill) {
  try {
    const blob = new Blob([exportSkill(skill)], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = skill.file.split('/').pop() || 'skill.md';
    a.click();
    URL.revokeObjectURL(url);
  } catch { /* no download in this window */ }
}

export function SkillsPage() {
  const [, setVersion] = useState(0);
  const [formFor, setFormFor] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const refresh = () => setVersion((v) => v + 1);
  const refused = refusedSkills();

  const runImport = async () => {
    const result = await importUserSkill();
    if (result.ok) setMessage('Imported.');
    else if ('problems' in result && result.problems.length) setMessage(`Not imported: ${result.problems.join(' ')}`);
    refresh();
  };
  const runReload = async () => { await loadUserSkills(); refresh(); };

  return (
    <div className="space-y-4" data-testid="skills-page">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[12px] text-(--text-2) flex-1 min-w-[240px]">
          Each agent picks one of its skills for every step, and the board shows which and why. A skill can only give an agent its own work and its own tools.
        </p>
        <Button size="sm" onClick={runImport}>Import a skill file</Button>
        <Button size="sm" onClick={() => { void openSkillsFolder(); }}>Open skills folder</Button>
        <Button size="sm" variant="ghost" onClick={runReload}>Reload</Button>
      </div>
      {message && <p className="text-[11px] text-(--text-2)" data-testid="skills-message">{message}</p>}
      {refused.length > 0 && (
        <div className="rounded-lg bg-(--error-dim) p-3 text-[11px] text-(--error)" data-testid="skills-refused">
          <div className="font-semibold mb-1">Not used (they break the rules):</div>
          <ul className="list-disc pl-4">
            {refused.map((r) => <li key={r.file}>{`${r.file}: ${r.problems.join(' ')}`}</li>)}
          </ul>
        </div>
      )}
      {AGENTS.map((agent) => (
        <section key={agent} data-testid={`skills-agent-${agent}`} className="rounded-xl bg-(--surface-2) p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-(--text-1)" style={{ color: `var(--agent-${agent}, inherit)` }}>{agentName(agent)}</h3>
            <Button size="sm" variant="ghost" onClick={() => setFormFor(formFor === agent ? null : agent)}>New skill</Button>
          </div>
          {formFor === agent && <SkillForm agent={agent} onSaved={() => { setFormFor(null); setMessage('Saved.'); refresh(); }} onCancel={() => setFormFor(null)} />}
          <div className="mt-2 space-y-1">
            {listSkills(agent).map((skill) => {
              const used = skillLastUsed(agent, skill.name);
              return (
                <div key={`${skill.source}-${skill.file}`} data-testid="skill-row" className="rounded-lg bg-(--surface-1) px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-(--text-2)">{skill.name}</span>
                    {skill.source === 'user' && <Badge variant="info">Yours</Badge>}
                    <span data-testid="skill-stats" className="ml-auto text-[10px] text-(--text-3)">{skillStats(agent, skill.name).used ? statsLine(skillStats(agent, skill.name)) : used ? `Last used ${new Date(used).toLocaleString()}` : 'Not used yet'}</span>
                  </div>
                  <div className="text-[11px] text-(--text-3)">{skill.useWhen}</div>
                  {skill.tools.length > 0 && <div className="text-[10px] text-(--text-3)">Tools: {skill.tools.map((t) => SKILL_TOOLS[t]?.label || t).join(', ')}</div>}
                  <div className="mt-1 flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => download(skill)}>Export</Button>
                    {skill.source === 'user' && <Button size="sm" variant="danger" onClick={async () => { await deleteUserSkill(skill); refresh(); }}>Delete</Button>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
