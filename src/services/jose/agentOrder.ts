// The fixed order Jose's rule-based splitter has always used: which agents'
// work an agent waits for. Plans written as step graphs use `needs` instead;
// legacyNeeds() turns this table into `needs` for the splitter's tasks.
export const AGENT_DEPENDENCIES: Record<string, string[]> = Object.freeze({
  hector: [],
  maria: [],
  sentinel: [],
  // Nova judges what Hector found (agent phase 2).
  nova: ['hector'],
  jose: [],
  miya: ['hector'],
  alphonso: ['miya'],
  marcus: ['maria'],
  echo: ['hector', 'miya', 'maria', 'marcus', 'nova', 'sentinel', 'alphonso']
}) as Record<string, string[]>;
