import { AGENT_WORKFLOW_PACKS } from './skillPackWorkflowData';
import { CORE_BASE_PACKS } from './skillPackContentCore';
import { ECHO_BASE_PACKS } from './skillPackContentEcho';
import { JOSE_BASE_PACKS } from './skillPackContentJose';
import { MARCUS_BASE_PACKS } from './skillPackContentMarcus';
import { MARIA_BASE_PACKS } from './skillPackContentMaria';
import { NOVA_BASE_PACKS } from './skillPackContentNova';
import { SENTINEL_BASE_PACKS } from './skillPackContentSentinel';

const BASE_PACKS = [
  ...CORE_BASE_PACKS,
  ...JOSE_BASE_PACKS,
  ...MARIA_BASE_PACKS,
  ...MARCUS_BASE_PACKS,
  ...ECHO_BASE_PACKS,
  ...SENTINEL_BASE_PACKS,
  ...NOVA_BASE_PACKS
];

export const DEFAULT_PACKS = [...BASE_PACKS, ...AGENT_WORKFLOW_PACKS];
