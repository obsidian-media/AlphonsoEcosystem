import { describe, it, expect } from 'vitest';
import {
  BASE_ALLOWED_ACTIONS,
  BASE_BLOCKED_ACTIONS,
  BASE_APPROVAL_REQUIRED_ACTIONS,
  createPermissionProfile,
} from '../../agents/shared/permissionModel';

describe('permissionModel', () => {
  describe('BASE_ALLOWED_ACTIONS', () => {
    it('has 8 entries', () => {
      expect(BASE_ALLOWED_ACTIONS).toHaveLength(8);
    });

    it('is frozen', () => {
      expect(Object.isFrozen(BASE_ALLOWED_ACTIONS)).toBe(true);
    });

    it('includes generate_plan', () => {
      expect(BASE_ALLOWED_ACTIONS).toContain('generate_plan');
    });

    it('includes generate_code', () => {
      expect(BASE_ALLOWED_ACTIONS).toContain('generate_code');
    });

    it('includes propose_file_changes', () => {
      expect(BASE_ALLOWED_ACTIONS).toContain('propose_file_changes');
    });
  });

  describe('BASE_BLOCKED_ACTIONS', () => {
    it('has 8 entries', () => {
      expect(BASE_BLOCKED_ACTIONS).toHaveLength(8);
    });

    it('is frozen', () => {
      expect(Object.isFrozen(BASE_BLOCKED_ACTIONS)).toBe(true);
    });

    it('includes delete_files', () => {
      expect(BASE_BLOCKED_ACTIONS).toContain('delete_files');
    });

    it('includes expose_secrets', () => {
      expect(BASE_BLOCKED_ACTIONS).toContain('expose_secrets');
    });
  });

  describe('BASE_APPROVAL_REQUIRED_ACTIONS', () => {
    it('has 9 entries', () => {
      expect(BASE_APPROVAL_REQUIRED_ACTIONS).toHaveLength(9);
    });

    it('is frozen', () => {
      expect(Object.isFrozen(BASE_APPROVAL_REQUIRED_ACTIONS)).toBe(true);
    });

    it('includes file_write', () => {
      expect(BASE_APPROVAL_REQUIRED_ACTIONS).toContain('file_write');
    });

    it('includes terminal_command', () => {
      expect(BASE_APPROVAL_REQUIRED_ACTIONS).toContain('terminal_command');
    });
  });

  describe('createPermissionProfile', () => {
    it('creates profile with correct agentId', () => {
      const profile = createPermissionProfile('test-agent');
      expect(profile.agentId).toBe('test-agent');
    });

    it('includes all base allowed actions', () => {
      const profile = createPermissionProfile('test-agent');
      expect(profile.allowed).toEqual(expect.arrayContaining(BASE_ALLOWED_ACTIONS));
      expect(profile.allowed).toHaveLength(BASE_ALLOWED_ACTIONS.length);
    });

    it('includes all base blocked actions', () => {
      const profile = createPermissionProfile('test-agent');
      expect(profile.blocked).toEqual(expect.arrayContaining(BASE_BLOCKED_ACTIONS));
      expect(profile.blocked).toHaveLength(BASE_BLOCKED_ACTIONS.length);
    });

    it('includes all base approval-required actions', () => {
      const profile = createPermissionProfile('test-agent');
      expect(profile.approvalRequired).toEqual(expect.arrayContaining(BASE_APPROVAL_REQUIRED_ACTIONS));
      expect(profile.approvalRequired).toHaveLength(BASE_APPROVAL_REQUIRED_ACTIONS.length);
    });

    it('appends custom allowed actions to base', () => {
      const profile = createPermissionProfile('test-agent', {
        allowed: ['custom_action_1', 'custom_action_2'],
      });
      expect(profile.allowed).toContain('custom_action_1');
      expect(profile.allowed).toContain('custom_action_2');
      expect(profile.allowed).toHaveLength(BASE_ALLOWED_ACTIONS.length + 2);
    });

    it('appends custom blocked actions to base', () => {
      const profile = createPermissionProfile('test-agent', {
        blocked: ['custom_blocked'],
      });
      expect(profile.blocked).toContain('custom_blocked');
      expect(profile.blocked).toHaveLength(BASE_BLOCKED_ACTIONS.length + 1);
    });

    it('appends custom approval-required actions to base', () => {
      const profile = createPermissionProfile('test-agent', {
        approvalRequired: ['custom_approval'],
      });
      expect(profile.approvalRequired).toContain('custom_approval');
      expect(profile.approvalRequired).toHaveLength(BASE_APPROVAL_REQUIRED_ACTIONS.length + 1);
    });

    it('handles empty overrides object', () => {
      const profile = createPermissionProfile('test-agent', {});
      expect(profile.allowed).toHaveLength(BASE_ALLOWED_ACTIONS.length);
      expect(profile.blocked).toHaveLength(BASE_BLOCKED_ACTIONS.length);
      expect(profile.approvalRequired).toHaveLength(BASE_APPROVAL_REQUIRED_ACTIONS.length);
    });

    it('handles missing overrides parameter', () => {
      const profile = createPermissionProfile('test-agent');
      expect(profile.allowed).toHaveLength(BASE_ALLOWED_ACTIONS.length);
    });

    it('does not mutate base arrays', () => {
      createPermissionProfile('test-agent', { allowed: ['extra'] });
      expect(BASE_ALLOWED_ACTIONS).toHaveLength(8);
    });

    it('returns a new object each call', () => {
      const p1 = createPermissionProfile('test-agent');
      const p2 = createPermissionProfile('test-agent');
      expect(p1).not.toBe(p2);
      expect(p1.allowed).not.toBe(p2.allowed);
    });

    it('all three arrays are separate references', () => {
      const profile = createPermissionProfile('test-agent');
      expect(profile.allowed).not.toBe(profile.blocked);
      expect(profile.blocked).not.toBe(profile.approvalRequired);
    });
  });
});
