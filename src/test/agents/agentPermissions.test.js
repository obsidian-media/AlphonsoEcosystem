import { describe, it, expect } from 'vitest';
import { canEchoPerform, ECHO_ALLOWED_ACTIONS, ECHO_BLOCKED_ACTIONS } from '../../agents/echo/echoPermissions';
import { canSentinelPerform, SENTINEL_ALLOWED_ACTIONS, SENTINEL_BLOCKED_ACTIONS } from '../../agents/sentinel/sentinelPermissions';
import { canNovaPerform, NOVA_ALLOWED_ACTIONS, NOVA_BLOCKED_ACTIONS } from '../../agents/nova/novaPermissions';
import { canHectorPerform, HECTOR_PERMISSIONS, HECTOR_ALLOWED_ACTIONS, HECTOR_BLOCKED_ACTIONS } from '../../agents/hector/hectorPermissions';
import { canMariaPerform, MARIA_PERMISSIONS, MARIA_ALLOWED_ACTIONS, MARIA_BLOCKED_ACTIONS } from '../../agents/maria/mariaPermissions';
import { canMarcusPerform, MARCUS_PERMISSIONS, MARCUS_ALLOWED_ACTIONS, MARCUS_BLOCKED_ACTIONS } from '../../agents/marcus/marcusPermissions';
import { ALPHONSO_PERMISSIONS } from '../../agents/alphonso/alphonsoPermissions';
import { JOSE_PERMISSIONS } from '../../agents/jose/josePermissions';
import { MIYA_PERMISSIONS } from '../../agents/miya/miyaPermissions';

describe('agentPermissions', () => {
  describe('Echo permissions', () => {
    it('ECHO_ALLOWED_ACTIONS has 5 entries', () => {
      expect(ECHO_ALLOWED_ACTIONS).toHaveLength(5);
    });

    it('ECHO_BLOCKED_ACTIONS has 4 entries', () => {
      expect(ECHO_BLOCKED_ACTIONS).toHaveLength(4);
    });

    it('canEchoPerform returns true for allowed actions', () => {
      expect(canEchoPerform('memory_preservation')).toBe(true);
      expect(canEchoPerform('decision_capture')).toBe(true);
      expect(canEchoPerform('knowledge_indexing')).toBe(true);
    });

    it('canEchoPerform returns false for blocked actions', () => {
      expect(canEchoPerform('external_publish')).toBe(false);
      expect(canEchoPerform('connector_send')).toBe(false);
      expect(canEchoPerform('destructive_execution')).toBe(false);
    });

    it('canEchoPerform returns false for unknown action', () => {
      expect(canEchoPerform('terminal_command')).toBe(false);
    });
  });

  describe('Sentinel permissions', () => {
    it('SENTINEL_ALLOWED_ACTIONS has 6 entries', () => {
      expect(SENTINEL_ALLOWED_ACTIONS).toHaveLength(6);
    });

    it('SENTINEL_BLOCKED_ACTIONS has 4 entries', () => {
      expect(SENTINEL_BLOCKED_ACTIONS).toHaveLength(4);
    });

    it('canSentinelPerform returns true for allowed actions', () => {
      expect(canSentinelPerform('permission_monitoring')).toBe(true);
      expect(canSentinelPerform('connector_risk_audit')).toBe(true);
      expect(canSentinelPerform('policy_violation_alert')).toBe(true);
    });

    it('canSentinelPerform returns false for blocked actions', () => {
      expect(canSentinelPerform('destructive_execution')).toBe(false);
      expect(canSentinelPerform('connector_send')).toBe(false);
    });

    it('canSentinelPerform returns false for unknown action', () => {
      expect(canSentinelPerform('generate_code')).toBe(false);
    });
  });

  describe('Nova permissions', () => {
    it('NOVA_ALLOWED_ACTIONS has 5 entries', () => {
      expect(NOVA_ALLOWED_ACTIONS).toHaveLength(5);
    });

    it('NOVA_BLOCKED_ACTIONS has 4 entries', () => {
      expect(NOVA_BLOCKED_ACTIONS).toHaveLength(4);
    });

    it('canNovaPerform returns true for allowed actions', () => {
      expect(canNovaPerform('opportunity_scoring')).toBe(true);
      expect(canNovaPerform('risk_value_analysis')).toBe(true);
      expect(canNovaPerform('effort_estimation')).toBe(true);
    });

    it('canNovaPerform returns false for blocked actions', () => {
      expect(canNovaPerform('connector_send')).toBe(false);
      expect(canNovaPerform('external_publish')).toBe(false);
    });

    it('canNovaPerform returns false for unknown action', () => {
      expect(canNovaPerform('file_write')).toBe(false);
    });
  });

  describe('Hector permissions', () => {
    it('HECTOR_PERMISSIONS has agentId hector', () => {
      expect(HECTOR_PERMISSIONS.agentId).toBe('hector');
    });

    it('HECTOR_ALLOWED_ACTIONS includes web_research', () => {
      expect(HECTOR_ALLOWED_ACTIONS).toContain('web_research');
    });

    it('HECTOR_ALLOWED_ACTIONS includes citation_gathering', () => {
      expect(HECTOR_ALLOWED_ACTIONS).toContain('citation_gathering');
    });

    it('HECTOR_BLOCKED_ACTIONS includes terminal_execution', () => {
      expect(HECTOR_BLOCKED_ACTIONS).toContain('terminal_execution');
    });

    it('HECTOR_BLOCKED_ACTIONS includes purchase', () => {
      expect(HECTOR_BLOCKED_ACTIONS).toContain('purchase');
    });

    it('canHectorPerform returns true for allowed actions', () => {
      expect(canHectorPerform('web_research')).toBe(true);
      expect(canHectorPerform('official_docs_lookup')).toBe(true);
      expect(canHectorPerform('market_research')).toBe(true);
    });

    it('canHectorPerform returns false for blocked actions', () => {
      expect(canHectorPerform('terminal_execution')).toBe(false);
      expect(canHectorPerform('filesystem_writes')).toBe(false);
    });

    it('canHectorPerform returns false for unknown action', () => {
      expect(canHectorPerform('totally_unknown_action')).toBe(false);
    });
  });

  describe('Maria permissions', () => {
    it('MARIA_PERMISSIONS has agentId maria', () => {
      expect(MARIA_PERMISSIONS.agentId).toBe('maria');
    });

    it('MARIA_ALLOWED_ACTIONS includes requirements_planning', () => {
      expect(MARIA_ALLOWED_ACTIONS).toContain('requirements_planning');
    });

    it('MARIA_ALLOWED_ACTIONS includes roadmap_creation', () => {
      expect(MARIA_ALLOWED_ACTIONS).toContain('roadmap_creation');
    });

    it('MARIA_BLOCKED_ACTIONS includes external_publish', () => {
      expect(MARIA_BLOCKED_ACTIONS).toContain('external_publish');
    });

    it('MARIA_BLOCKED_ACTIONS includes destructive_execution', () => {
      expect(MARIA_BLOCKED_ACTIONS).toContain('destructive_execution');
    });

    it('canMariaPerform returns true for allowed actions', () => {
      expect(canMariaPerform('requirements_planning')).toBe(true);
      expect(canMariaPerform('backlog_management')).toBe(true);
      expect(canMariaPerform('milestone_tracking')).toBe(true);
    });

    it('canMariaPerform returns false for blocked actions', () => {
      expect(canMariaPerform('external_publish')).toBe(false);
      expect(canMariaPerform('destructive_execution')).toBe(false);
    });

    it('canMariaPerform returns false for unknown action', () => {
      expect(canMariaPerform('totally_unknown_action')).toBe(false);
    });
  });

  describe('Marcus permissions', () => {
    it('MARCUS_PERMISSIONS has agentId marcus', () => {
      expect(MARCUS_PERMISSIONS.agentId).toBe('marcus');
    });

    it('MARCUS_ALLOWED_ACTIONS includes generate_audit_report', () => {
      expect(MARCUS_ALLOWED_ACTIONS).toContain('generate_audit_report');
    });

    it('MARCUS_ALLOWED_ACTIONS includes release_readiness_check', () => {
      expect(MARCUS_ALLOWED_ACTIONS).toContain('release_readiness_check');
    });

    it('MARCUS_BLOCKED_ACTIONS includes strategy_override', () => {
      expect(MARCUS_BLOCKED_ACTIONS).toContain('strategy_override');
    });

    it('MARCUS_BLOCKED_ACTIONS includes purchase', () => {
      expect(MARCUS_BLOCKED_ACTIONS).toContain('purchase');
    });

    it('canMarcusPerform returns true for allowed actions', () => {
      expect(canMarcusPerform('generate_audit_report')).toBe(true);
      expect(canMarcusPerform('security_review')).toBe(true);
      expect(canMarcusPerform('risk_detection')).toBe(true);
    });

    it('canMarcusPerform returns false for blocked actions', () => {
      expect(canMarcusPerform('strategy_override')).toBe(false);
      expect(canMarcusPerform('purchase')).toBe(false);
    });

    it('canMarcusPerform returns false for unknown action', () => {
      expect(canMarcusPerform('totally_unknown_action')).toBe(false);
    });
  });

  describe('Alphonso permissions', () => {
    it('ALPHONSO_PERMISSIONS has agentId alphonso', () => {
      expect(ALPHONSO_PERMISSIONS.agentId).toBe('alphonso');
    });

    it('ALPHONSO_PERMISSIONS has allowed array', () => {
      expect(Array.isArray(ALPHONSO_PERMISSIONS.allowed)).toBe(true);
      expect(ALPHONSO_PERMISSIONS.allowed.length).toBeGreaterThan(0);
    });

    it('ALPHONSO_PERMISSIONS has blocked array', () => {
      expect(Array.isArray(ALPHONSO_PERMISSIONS.blocked)).toBe(true);
      expect(ALPHONSO_PERMISSIONS.blocked.length).toBeGreaterThan(0);
    });

    it('ALPHONSO_PERMISSIONS has approvalRequired array', () => {
      expect(Array.isArray(ALPHONSO_PERMISSIONS.approvalRequired)).toBe(true);
      expect(ALPHONSO_PERMISSIONS.approvalRequired.length).toBeGreaterThan(0);
    });
  });

  describe('Jose permissions', () => {
    it('JOSE_PERMISSIONS has agentId jose', () => {
      expect(JOSE_PERMISSIONS.agentId).toBe('jose');
    });

    it('JOSE_PERMISSIONS has allowed array', () => {
      expect(Array.isArray(JOSE_PERMISSIONS.allowed)).toBe(true);
      expect(JOSE_PERMISSIONS.allowed.length).toBeGreaterThan(0);
    });

    it('JOSE_PERMISSIONS has blocked array', () => {
      expect(Array.isArray(JOSE_PERMISSIONS.blocked)).toBe(true);
      expect(JOSE_PERMISSIONS.blocked.length).toBeGreaterThan(0);
    });
  });

  describe('Miya permissions', () => {
    it('MIYA_PERMISSIONS has agentId miya', () => {
      expect(MIYA_PERMISSIONS.agentId).toBe('miya');
    });

    it('MIYA_PERMISSIONS has allowed array', () => {
      expect(Array.isArray(MIYA_PERMISSIONS.allowed)).toBe(true);
      expect(MIYA_PERMISSIONS.allowed.length).toBeGreaterThan(0);
    });

    it('MIYA_PERMISSIONS has blocked array', () => {
      expect(Array.isArray(MIYA_PERMISSIONS.blocked)).toBe(true);
      expect(MIYA_PERMISSIONS.blocked.length).toBeGreaterThan(0);
    });
  });

  describe('Cross-agent permission isolation', () => {
    it('no two agents share the same allowed actions array', () => {
      const profiles = [ALPHONSO_PERMISSIONS, JOSE_PERMISSIONS, MIYA_PERMISSIONS, HECTOR_PERMISSIONS, MARIA_PERMISSIONS, MARCUS_PERMISSIONS];
      const arrays = profiles.map((p) => p.allowed);
      for (let i = 0; i < arrays.length; i++) {
        for (let j = i + 1; j < arrays.length; j++) {
          expect(arrays[i]).not.toBe(arrays[j]);
        }
      }
    });

    it('echo/sentinel/nova use raw arrays (not permission profiles)', () => {
      expect(Array.isArray(ECHO_ALLOWED_ACTIONS)).toBe(true);
      expect(Array.isArray(SENTINEL_ALLOWED_ACTIONS)).toBe(true);
      expect(Array.isArray(NOVA_ALLOWED_ACTIONS)).toBe(true);
      expect(typeof ECHO_ALLOWED_ACTIONS.includes).toBe('function');
    });
  });
});
