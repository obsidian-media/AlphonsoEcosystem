import { TRUST_STATES, timestampMs } from './trustModel';

const POLICY_KEY = 'alphonso_plugin_sandbox_policies_v1';

interface PluginSandboxPolicy {
  maxExtraArgs: number;
  maxArgLength: number;
  blockedTokens: string[];
  requireManifestValidation: boolean;
  trust: string;
  updatedAtMs?: number;
}

interface PluginExecutionInput {
  manifestPath?: string;
  pluginId?: string;
  toolId?: string;
  extraArgs?: string[];
}

interface PluginExecutionResult {
  allowed: boolean;
  violations: string[];
  policy: PluginSandboxPolicy;
  checkedAtMs: number;
  trust: string;
}

const DEFAULT_POLICY: PluginSandboxPolicy = {
  maxExtraArgs: 8,
  maxArgLength: 120,
  blockedTokens: ['&&', '||', ';', '|', '>', '<', '$(', '`'],
  requireManifestValidation: true,
  trust: TRUST_STATES.TEMPORARY
};

function readPolicies(): PluginSandboxPolicy {
  try {
    const raw = localStorage.getItem(POLICY_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // ignore and fall back
  }
  localStorage.setItem(POLICY_KEY, JSON.stringify(DEFAULT_POLICY));
  return DEFAULT_POLICY;
}

function writePolicies(policy: PluginSandboxPolicy) {
  localStorage.setItem(POLICY_KEY, JSON.stringify({
    ...policy,
    updatedAtMs: timestampMs()
  }));
}

export function getPluginSandboxPolicy(): PluginSandboxPolicy {
  return readPolicies();
}

export function updatePluginSandboxPolicy(next: Partial<PluginSandboxPolicy>): PluginSandboxPolicy {
  const merged = {
    ...readPolicies(),
    ...next
  };
  writePolicies(merged);
  return merged;
}

export function evaluatePluginExecutionPolicy({
  manifestPath,
  pluginId,
  toolId,
  extraArgs = []
}: PluginExecutionInput = {}): PluginExecutionResult {
  const policy = readPolicies();
  const violations: string[] = [];

  if (!manifestPath || !pluginId || !toolId) {
    violations.push('Manifest path, plugin id, and tool id are required.');
  }

  if (extraArgs.length > policy.maxExtraArgs) {
    violations.push(`Extra args exceed limit (${policy.maxExtraArgs}).`);
  }

  for (const arg of extraArgs) {
    if (String(arg).length > policy.maxArgLength) {
      violations.push(`Arg length exceeds limit (${policy.maxArgLength}).`);
    }
    for (const token of policy.blockedTokens) {
      if (String(arg).includes(token)) {
        violations.push(`Arg contains blocked token: ${token}`);
      }
    }
  }

  return {
    allowed: violations.length === 0,
    violations,
    policy,
    checkedAtMs: timestampMs(),
    trust: violations.length === 0 ? TRUST_STATES.VERIFIED : TRUST_STATES.FAILED
  };
}
