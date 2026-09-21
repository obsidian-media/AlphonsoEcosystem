// Closes docs/TRUTH_FIRST_EXECUTION_PLAN.md's G-T20: multi-agent fan-out
// (Boardroom @mention chains) had only a hop-count ceiling (MAX_CHAIN_DEPTH
// in BoardroomChatView.tsx), no cost/token ceiling of any kind. A single hop
// with a very long prior-message history or a verbose model reply could
// still generate an unbounded amount of content within that hop count.
//
// Uses total prompt+response character count as the "token" proxy — the
// same approximation this codebase's streamingService.ts already uses for
// its own live token counter (`tokens: fullText.length`), not a real
// per-provider token count. None of the 4 LLM provider paths reachable via
// generateAgentLlmResponse (ollama/nvidia_nim/gemini/hermes) currently
// return real usage figures, so a literal token/dollar meter would need new
// plumbing across all 4 — out of scope for this fix. This is a resource-
// consumption ceiling, not a real-dollar-cost meter.

export const DEFAULT_FANOUT_CHAR_BUDGET = 40000;

export interface FanOutBudgetTracker {
  readonly limit: number;
  readonly spent: number;
  recordUsage(chars: number): void;
  remaining(): number;
  isExceeded(): boolean;
}

export function createFanOutBudgetTracker(limit: number = DEFAULT_FANOUT_CHAR_BUDGET): FanOutBudgetTracker {
  let spent = 0;
  return {
    limit,
    get spent() {
      return spent;
    },
    recordUsage(chars: number) {
      spent += Math.max(0, Number(chars) || 0);
    },
    remaining() {
      return Math.max(0, limit - spent);
    },
    isExceeded() {
      return spent >= limit;
    }
  };
}
