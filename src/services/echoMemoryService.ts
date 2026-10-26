// Echo's memory, for older imports (agent phase 7). Echo's work lives in src/services/echo/:
// the decision store (decisions.ts), finding decisions (recall.ts), his steps (echoSteps.ts) and
// cleanup (cleanup.ts). The note-per-request path, its keyword fallback and the nightly
// consolidation were removed with it.
export { addDecision, editDecision, forgetDecision, getDecision, listDecisions, activePreferences, ECHO_LIMITS } from './echo/decisions';
export type { Decision, DecisionKind, Surface } from './echo/decisions';
export { searchDecisions, decisionsFor, decisionsText } from './echo/recall';
export { runEchoStep, extractDecisions } from './echo/echoSteps';
export { isChromaHealthy } from './chromaDbService.js';
