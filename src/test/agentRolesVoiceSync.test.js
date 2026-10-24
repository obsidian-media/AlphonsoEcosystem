// The voice backend's roles say exactly what the app's ownership map says (agent roles Part A).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { AGENT_PERMISSION_TABLE, describeResponsibility } from '../services/jose/agentPermissionTable';

const source = fs.readFileSync(path.resolve(__dirname, '../../voice/backend/agent_roles.py'), 'utf-8');

function voiceRoles() {
  const roles = {};
  const re = /'(\w+)': \{\s*'owns': "([^"]*)",\s*'never': "([^"]*)",\s*\}/g;
  let m;
  while ((m = re.exec(source))) roles[m[1]] = { owns: m[2], never: m[3] };
  return roles;
}

describe('voice roles match the app', () => {
  it('has every agent, with the same two sentences', () => {
    const roles = voiceRoles();
    expect(Object.keys(roles).sort()).toEqual(Object.keys(AGENT_PERMISSION_TABLE).sort());
    for (const agent of Object.keys(AGENT_PERMISSION_TABLE)) {
      expect(roles[agent], agent).toEqual(describeResponsibility(agent));
    }
  });
});
