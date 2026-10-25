// Before a step runs: pick its skill, gather what the skill's tools find, put
// both in the step input, and save which skill and why on the request step so
// the board shows it (agent roles Part B). Skills never stop a step: if any of
// this fails, the step runs as before and the board says why.
import { pickSkill } from './skillPick';
import { gatherForSkill } from './skillGather';
import { recordSkillUse } from './skillUse';
import { usesOwnToolCalls } from '../jose/joseModels';
import { findRequestByPacket, updateJoseStep } from '../jose/joseRequestStore';
import type { StepInput } from '../jose/stepInput';

function saveOnStep(packetId: string | undefined, stepId: string | undefined, skill: string | undefined, reason: string): void {
  if (!packetId || !stepId) return;
  try {
    const request = findRequestByPacket(packetId);
    if (request) updateJoseStep(request.id, stepId, { skill, skillReason: reason });
  } catch { /* the board misses one line; the step still runs */ }
}

export async function prepareSkill(
  packet: { id?: string; payload?: { joseCommandId?: string } } | null | undefined,
  assignment: any,
  stepInput: StepInput,
  opts: { workspaceRoot?: string } = {},
): Promise<StepInput> {
  const agent = String(assignment?.agent || '');
  const actionType = String(assignment?.actionType || '');
  if (!agent || agent === 'jose' || actionType.startsWith('boardroom_')) return stepInput;
  const contentStep = Boolean(assignment?.contentStep);
  try {
    const picked = await pickSkill(agent, actionType, stepInput, { contentStep });
    saveOnStep(packet?.id, assignment?.stepId, picked.skill?.name, picked.reason);
    if (!picked.skill) return { ...stepInput, skill: null };
    recordSkillUse(agent, picked.skill.name);
    // A content step's skill is already its prompt (its ask); adding it again would repeat it.
    if (contentStep) return { ...stepInput, skill: null };
    const commandId = packet?.payload?.joseCommandId;
    const gathered = await gatherForSkill(picked.skill, { agent, stepInput, workspaceRoot: opts.workspaceRoot, commandId }, { ownCalls: usesOwnToolCalls(assignment) });
    return {
      ...stepInput,
      skill: {
        name: picked.skill.name,
        reason: picked.reason,
        instructions: picked.skill.instructions,
        results: gathered.results.map((r) => ({ tool: r.tool, text: r.text })),
      },
    };
  } catch (error) {
    saveOnStep(packet?.id, assignment?.stepId, undefined, `The skill could not be prepared (${error instanceof Error ? error.message : String(error)}); the step ran without one.`);
    return { ...stepInput, skill: null };
  }
}
