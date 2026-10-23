// Editing a plan before it runs (owner, Q5; phase 3): remove or add a step,
// change a step's agent, what it needs or its instruction. The rule check runs
// as you edit; a plan that breaks the rules cannot be saved, so it cannot run.
import React, { useMemo, useState } from 'react';
import { Button } from '../ui';
import { AGENT_PERMISSION_TABLE } from '../../services/jose/agentPermissionTable';
import { addStep, changeStepAgent, removeStep, setStepInstruction, setStepNeeds } from '../../services/jose/josePlanEdits';
import { replacePlanSteps, type JoseRequest } from '../../services/jose/joseRequestStore';
import { checkPlan, type PlanStep } from '../../services/jose/stepGraph';

const AGENT_NAMES: Record<string, string> = {
  alphonso: 'Alphonso', jose: 'Jose', miya: 'Miya', hector: 'Hector', maria: 'Maria',
  marcus: 'Marcus', echo: 'Echo', sentinel: 'Sentinel', nova: 'Nova',
};
const agentName = (agent: string) => AGENT_NAMES[agent] || agent;
const AGENTS = Object.keys(AGENT_PERMISSION_TABLE);

const toPlanSteps = (request: JoseRequest): PlanStep[] =>
  request.steps.map(({ stepId, agent, actionType, effects, needs, instruction }) => ({ stepId, agent, actionType, effects, needs, instruction }));

export function JosePlanEditor({ request, onSaved }: { request: JoseRequest; onSaved: () => void }) {
  const [steps, setSteps] = useState<PlanStep[]>(() => toPlanSteps(request));
  const [reasons, setReasons] = useState<string[]>([]);
  const [newAgent, setNewAgent] = useState('hector');
  const [newType, setNewType] = useState('');
  const [newInstruction, setNewInstruction] = useState('');
  const check = useMemo(() => checkPlan(steps), [steps]);

  const edit = (next: PlanStep[], reason: string) => {
    setSteps(next);
    setReasons((current) => [...current, reason]);
  };

  const save = () => {
    if (!check.ok || reasons.length === 0) return;
    replacePlanSteps(request.id, steps, reasons.join('; '));
    onSaved();
  };

  return (
    <div className="space-y-3" data-testid="jose-plan-editor">
      {steps.map((step) => (
        <div key={step.stepId} className="rounded-lg bg-(--surface-2) p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-(--text-1)">{step.stepId}</span>
            <select
              aria-label={`Agent for ${step.stepId}`}
              value={step.agent}
              onChange={(e) => edit(changeStepAgent(steps, step.stepId, e.target.value), `Gave ${step.stepId} to ${agentName(e.target.value)}`)}
              className="rounded-sm bg-(--surface-1) px-1 py-0.5 text-xs"
            >
              {AGENTS.map((agent) => <option key={agent} value={agent}>{agentName(agent)}</option>)}
            </select>
            <span className="text-(--text-3)">{step.actionType}</span>
            <Button size="sm" variant="ghost" aria-label={`Remove ${agentName(step.agent)}'s step`} onClick={() => edit(removeStep(steps, step.stepId), `Removed ${agentName(step.agent)}'s step`)}>
              Remove
            </Button>
          </div>
          <input
            aria-label={`Instruction for ${step.stepId}`}
            value={step.instruction || ''}
            onChange={(e) => edit(setStepInstruction(steps, step.stepId, e.target.value), `Changed what ${step.stepId} should do`)}
            className="w-full rounded-sm bg-(--surface-1) px-2 py-1 text-xs"
          />
          {steps.length > 1 && (
            <div className="flex flex-wrap gap-3 text-[11px] text-(--text-2)">
              <span>Needs:</span>
              {steps.filter((other) => other.stepId !== step.stepId).map((other) => (
                <label key={other.stepId} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    aria-label={`${step.stepId} needs ${other.stepId}`}
                    checked={step.needs.includes(other.stepId)}
                    onChange={(e) => {
                      const needs = e.target.checked ? [...step.needs, other.stepId] : step.needs.filter((n) => n !== other.stepId);
                      edit(setStepNeeds(steps, step.stepId, needs), `Changed what ${step.stepId} needs`);
                    }}
                  />
                  {other.stepId}
                </label>
              ))}
            </div>
          )}
        </div>
      ))}

      <div className="rounded-lg border border-dashed border-(--border) p-3 space-y-2 text-xs">
        <div className="font-semibold text-(--text-1)">Add a step</div>
        <div className="flex flex-wrap gap-2">
          <select aria-label="New step agent" value={newAgent} onChange={(e) => setNewAgent(e.target.value)} className="rounded-sm bg-(--surface-1) px-1 py-0.5">
            {AGENTS.map((agent) => <option key={agent} value={agent}>{agentName(agent)}</option>)}
          </select>
          <input aria-label="New step task type" placeholder="Task type, e.g. research_report" value={newType} onChange={(e) => setNewType(e.target.value)} className="rounded-sm bg-(--surface-1) px-2 py-0.5" />
          <input aria-label="New step instruction" placeholder="What it should do" value={newInstruction} onChange={(e) => setNewInstruction(e.target.value)} className="flex-1 rounded-sm bg-(--surface-1) px-2 py-0.5" />
          <Button
            size="sm"
            disabled={!newType.trim()}
            onClick={() => {
              edit(addStep(steps, { agent: newAgent, actionType: newType.trim(), instruction: newInstruction.trim(), needs: [] }), `Added a step for ${agentName(newAgent)}`);
              setNewType('');
              setNewInstruction('');
            }}
          >
            Add step
          </Button>
        </div>
      </div>

      {!check.ok && (
        <ul className="text-xs text-(--error) list-disc pl-5" role="alert">
          {check.problems.map((problem) => <li key={problem}>{problem}</li>)}
        </ul>
      )}
      <Button disabled={!check.ok || reasons.length === 0} onClick={save}>Save changes</Button>
    </div>
  );
}
