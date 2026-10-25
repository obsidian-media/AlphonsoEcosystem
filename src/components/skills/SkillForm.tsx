// "New skill" for one agent (agent roles Part B): the same file a skill on
// disk is, written by a form. The task types and tools offered are only the
// agent's own; the check runs again on save and its reasons are shown.
import React, { useMemo, useState } from 'react';
import { Button } from '../ui';
import { agentName } from '../../services/jose/agentNames';
import { ownerOf } from '../../services/jose/agentPermissionTable';
import { ACTION_EFFECTS } from '../../services/jose/joseEffects';
import { ACTION_TOOLS, SKILL_TOOLS, toolsFor } from '../../services/skills/skillTools';
import { listSkills } from '../../services/skills/skillLibrary';
import { saveUserSkill } from '../../services/skills/userSkills';
import type { Skill } from '../../services/skills/skillFile';

/** The task types an agent owns that a skill could name: those in use, and those its skills name. */
export function ownTaskTypes(agent: string): string[] {
  const types = new Set<string>();
  for (const type of Object.keys(ACTION_EFFECTS)) if (ownerOf(type) === agent) types.add(type);
  for (const skill of listSkills(agent)) for (const type of skill.taskTypes) types.add(type);
  return [...types].sort();
}

export function SkillForm({ agent, onSaved, onCancel }: { agent: string; onSaved: () => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [useWhen, setUseWhen] = useState('');
  const [taskTypes, setTaskTypes] = useState<string[]>([]);
  const [tools, setTools] = useState<string[]>([]);
  const [inOrder, setInOrder] = useState(true);
  const [instructions, setInstructions] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const types = useMemo(() => ownTaskTypes(agent), [agent]);
  const toolNames = useMemo(() => toolsFor(agent), [agent]);
  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const save = async () => {
    setSaving(true);
    const skill: Skill = {
      name: name.trim(), agent, useWhen: useWhen.trim(), taskTypes, tools,
      steps: inOrder ? tools.filter((t) => !ACTION_TOOLS.has(t)) : [],
      output: 'text', instructions: instructions.trim(), source: 'user', file: '',
    };
    const result = await saveUserSkill(skill);
    setSaving(false);
    if (result.ok) onSaved();
    else if ('problems' in result) setProblems(result.problems);
  };

  const field = 'mt-1 w-full rounded-lg bg-(--surface-2) px-3 py-2 text-[12px] text-(--text-1)';
  return (
    <div className="mt-2 rounded-lg bg-(--surface-1) p-3 space-y-2" data-testid="skill-form">
      <div className="text-xs font-semibold text-(--text-2)">New skill for {agentName(agent)}</div>
      <label className="block text-[11px] text-(--text-3)">Name
        <input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} className={field} />
      </label>
      <label className="block text-[11px] text-(--text-3)">Use when
        <input aria-label="Use when" value={useWhen} onChange={(e) => setUseWhen(e.target.value)} placeholder="When should the agent pick this skill?" className={field} />
      </label>
      <fieldset className="text-[11px] text-(--text-3)">
        <legend>Kinds of work it does</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {types.map((type) => (
            <label key={type} className="inline-flex items-center gap-1 font-mono text-[10px]">
              <input type="checkbox" aria-label={type} checked={taskTypes.includes(type)} onChange={() => setTaskTypes(toggle(taskTypes, type))} />{type}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="text-[11px] text-(--text-3)">
        <legend>Tools</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {toolNames.map((tool) => (
            <label key={tool} className="inline-flex items-center gap-1" title={tool}>
              <input type="checkbox" aria-label={tool} checked={tools.includes(tool)} onChange={() => setTools(toggle(tools, tool))} />{SKILL_TOOLS[tool].label}
            </label>
          ))}
        </div>
        <label className="mt-1 inline-flex items-center gap-1">
          <input type="checkbox" checked={inOrder} onChange={() => setInOrder(!inOrder)} />Smaller models run these tools in order
        </label>
      </fieldset>
      <label className="block text-[11px] text-(--text-3)">Instructions
        <textarea aria-label="Instructions" value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={5} className={field} />
      </label>
      {problems.length > 0 && (
        <ul className="text-[11px] text-(--error) list-disc pl-4" data-testid="skill-form-problems">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
      <div className="flex gap-2">
        <Button size="sm" variant="primary" onClick={save} loading={saving}>Save skill</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
