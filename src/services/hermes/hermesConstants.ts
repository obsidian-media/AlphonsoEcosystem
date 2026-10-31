import { agentName } from '../jose/agentNames';

// Hermes gateway (2026-10-30): the app's copy of the reading toolsets. The
// backend's READING_TOOLSETS (hermes_profiles.rs) is the one Alphonso's profiles
// use; src/test/services/hermes/hermesConstants.test.js fails when they differ.
export const READING_TOOLSETS = ['web', 'vision', 'memory', 'session_search', 'todo', 'clarify'] as const;

/** Said when Hermes's own time for an approval answer ran out. */
export const HERMES_TIMED_OUT = 'Hermes stopped waiting for your answer.';

/** What a Hermes run asks to do, in plain words, for the board and Telegram. */
export function describeHermesApproval(req: { agent: string; command?: string; description: string; runId?: string }): string {
  const who = `${agentName(req.agent)}'s Hermes profile`;
  return req.command ? `${who} wants to run: ${req.command}` : `${who} wants to: ${req.description}`;
}

/** A Hermes profile as one of the resource manager's tools: `hermes:<agent>`. */
export const HERMES_TOOL_PREFIX = 'hermes:';

export function isHermesTool(name: string): boolean {
  return name.startsWith(HERMES_TOOL_PREFIX);
}

export function hermesToolAgent(tool: string): string {
  return tool.slice(HERMES_TOOL_PREFIX.length);
}

export function hermesToolLabel(tool: string): string {
  return `${agentName(hermesToolAgent(tool))}'s Hermes profile`;
}
