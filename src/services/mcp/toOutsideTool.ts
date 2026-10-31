// When a request names a connected outside server and asks for a change, the plan's one Marcus
// send uses that server's tool (final review, 2026-10-30). Found live: Jose's planner gave
// "open an issue through my GitHub MCP tool" to the built-in GitHub connector. Only one send and
// no outside step already there; anything less clear is left to the planner. A server you named
// wins over a built-in connector of the same kind: you added it and named it in the request,
// and the approval shows the exact call either way.
import type { PlanStep } from '../jose/stepGraph';
import { isReadingTool, OUTSIDE_TASK, serversNamedIn } from './mcpTools';
import type { McpServer } from './mcpServers';

const NOT_A_SEND = new Set(['distribution_readiness', 'distribution_review']);

/** A named server Marcus can use for a change: a tool not marked "Reading only", or a paid server's tool. */
function canChange(server: McpServer): boolean {
  return server.tools.some((t) => !t.off && (!isReadingTool(t) || server.cost !== 'free'));
}

function isMarcusSend(step: PlanStep): boolean {
  return String(step.agent || '').toLowerCase() === 'marcus'
    && !NOT_A_SEND.has(step.actionType)
    && !(step as PlanStep & { contentStep?: unknown }).contentStep
    && (step.effects || []).includes('publish_or_send');
}

/** The plan with its one Marcus send moved to the outside tool the request names. */
export function toOutsideTool<T extends PlanStep>(steps: T[], request: string): T[] {
  if (!serversNamedIn(request).some(canChange)) return steps;
  if (steps.some((s) => s.actionType === OUTSIDE_TASK)) return steps;
  const sends = steps.filter(isMarcusSend);
  if (sends.length !== 1) return steps;
  const only = sends[0];
  return steps.map((s) => (s === only ? { ...s, actionType: OUTSIDE_TASK } : s));
}
