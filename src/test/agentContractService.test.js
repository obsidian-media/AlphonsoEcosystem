import { describe, it, expect } from 'vitest';

const { AGENT_EXECUTION_CONTRACTS, validateAgentExecutionContract } = await import('../services/agentContractService.ts');

describe('agentContractService', () => {
  describe('AGENT_EXECUTION_CONTRACTS', () => {
    it('has contracts for all 9 agents', () => {
      const agents = ['jose', 'alphonso', 'miya', 'hector', 'maria', 'marcus', 'echo', 'sentinel', 'nova'];
      for (const agent of agents) {
        expect(AGENT_EXECUTION_CONTRACTS[agent]).toBeDefined();
      }
    });

    it('every contract has role, allowed, and blocked arrays', () => {
      for (const [agent, contract] of Object.entries(AGENT_EXECUTION_CONTRACTS)) {
        expect(contract).toHaveProperty('role');
        expect(contract).toHaveProperty('allowedActionPrefixes');
        expect(contract).toHaveProperty('blockedActionPrefixes');
        expect(Array.isArray(contract.allowedActionPrefixes)).toBe(true);
        expect(Array.isArray(contract.blockedActionPrefixes)).toBe(true);
      }
    });

    it('all agents include agent_report in allowed prefixes', () => {
      for (const [agent, contract] of Object.entries(AGENT_EXECUTION_CONTRACTS)) {
        expect(contract.allowedActionPrefixes).toContain('agent_report');
      }
    });

    it('all agents block purchase', () => {
      for (const [agent, contract] of Object.entries(AGENT_EXECUTION_CONTRACTS)) {
        expect(contract.blockedActionPrefixes).toContain('purchase');
      }
    });

    it('alphonso does not block execute_command', () => {
      expect(AGENT_EXECUTION_CONTRACTS.alphonso.blockedActionPrefixes).not.toContain('execute_command');
    });

    it('jose blocks execute_command', () => {
      expect(AGENT_EXECUTION_CONTRACTS.jose.blockedActionPrefixes).toContain('execute_command');
    });
  });

  describe('validateAgentExecutionContract', () => {
    it('allows alphonso local_operation', () => {
      const result = validateAgentExecutionContract({
        toAgent: 'alphonso',
        actionType: 'local_operation_run_tests'
      });
      expect(result.ok).toBe(true);
    });

    it('allows jose orchestration_', () => {
      const result = validateAgentExecutionContract({
        toAgent: 'jose',
        actionType: 'orchestration_decompose'
      });
      expect(result.ok).toBe(true);
    });

    it('allows miya creative_', () => {
      const result = validateAgentExecutionContract({
        toAgent: 'miya',
        actionType: 'creative_script_write'
      });
      expect(result.ok).toBe(true);
    });

    it('allows hector research', () => {
      const result = validateAgentExecutionContract({
        toAgent: 'hector',
        actionType: 'research_discover_sources'
      });
      expect(result.ok).toBe(true);
    });

    it('allows maria governance_', () => {
      const result = validateAgentExecutionContract({
        toAgent: 'maria',
        actionType: 'governance_review_approval'
      });
      expect(result.ok).toBe(true);
    });

    it('allows marcus approved_', () => {
      const result = validateAgentExecutionContract({
        toAgent: 'marcus',
        actionType: 'approved_distribution_path'
      });
      expect(result.ok).toBe(true);
    });

    it('allows echo memory_', () => {
      const result = validateAgentExecutionContract({
        toAgent: 'echo',
        actionType: 'memory_store_record'
      });
      expect(result.ok).toBe(true);
    });

    it('allows sentinel security_', () => {
      const result = validateAgentExecutionContract({
        toAgent: 'sentinel',
        actionType: 'security_check_permission'
      });
      expect(result.ok).toBe(true);
    });

    it('allows nova opportunity_', () => {
      const result = validateAgentExecutionContract({
        toAgent: 'nova',
        actionType: 'opportunity_score_leads'
      });
      expect(result.ok).toBe(true);
    });

    it('blocks purchase for alphonso', () => {
      const result = validateAgentExecutionContract({
        toAgent: 'alphonso',
        actionType: 'purchase_upgrade_plan'
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('blocked');
    });

    it('blocks execute_command for jose', () => {
      const result = validateAgentExecutionContract({
        toAgent: 'jose',
        actionType: 'execute_command_run_tests'
      });
      expect(result.ok).toBe(false);
    });

    it('blocks filesystem_write for miya', () => {
      const result = validateAgentExecutionContract({
        toAgent: 'miya',
        actionType: 'filesystem_write_output'
      });
      expect(result.ok).toBe(false);
    });

    it('blocks upload for hector', () => {
      const result = validateAgentExecutionContract({
        toAgent: 'hector',
        actionType: 'upload_research'
      });
      expect(result.ok).toBe(false);
    });

    it('blocks post for maria', () => {
      const result = validateAgentExecutionContract({
        toAgent: 'maria',
        actionType: 'post_announcement'
      });
      expect(result.ok).toBe(false);
    });

    it('fails closed when toAgent is missing', () => {
      const result = validateAgentExecutionContract({
        actionType: 'execute_command_run_tests'
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('Missing toAgent');
    });

    it('fails closed when toAgent is undefined explicitly', () => {
      const result = validateAgentExecutionContract({
        toAgent: undefined,
        actionType: 'execute_command_run_tests'
      });
      expect(result.ok).toBe(false);
    });

    it('fails closed when toAgent is an empty string', () => {
      const result = validateAgentExecutionContract({
        toAgent: '',
        actionType: 'execute_command_run_tests'
      });
      expect(result.ok).toBe(false);
    });

    it('returns ok for unknown agent', () => {
      const result = validateAgentExecutionContract({
        toAgent: 'unknown_agent',
        actionType: 'some_action'
      });
      expect(result.ok).toBe(true);
    });

    it('handles empty actionType', () => {
      const result = validateAgentExecutionContract({
        toAgent: 'jose',
        actionType: ''
      });
      expect(result.ok).toBe(true);
    });

    it('blocks dangerous commandPreview for non-alphonso', () => {
      const result = validateAgentExecutionContract({
        toAgent: 'jose',
        actionType: 'orchestration_route',
        commandPreview: 'execute the deployment script'
      });
      expect(result.ok).toBe(false);
    });

    it('allows dangerous preview for alphonso', () => {
      const result = validateAgentExecutionContract({
        toAgent: 'alphonso',
        actionType: 'local_operation_deploy',
        commandPreview: 'execute the deployment script'
      });
      expect(result.ok).toBe(true);
    });

    it('blocks action not in allowed list', () => {
      const result = validateAgentExecutionContract({
        toAgent: 'hector',
        actionType: 'filesystem_read_file'
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('does not allow');
    });

    it('allows preview with disabled qualifier', () => {
      const result = validateAgentExecutionContract({
        toAgent: 'jose',
        actionType: 'orchestration_route',
        commandPreview: 'upload file (disabled unless separately approved)'
      });
      expect(result.ok).toBe(true);
    });
  });

  describe('blocked actions per agent', () => {
    it('blocks purchase for marcus', () => {
      const result = validateAgentExecutionContract({
        toAgent: 'marcus',
        actionType: 'purchase_upgrade'
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('blocked');
    });

    it('blocks execute_command for marcus', () => {
      const result = validateAgentExecutionContract({
        toAgent: 'marcus',
        actionType: 'execute_command_run'
      });
      expect(result.ok).toBe(false);
    });

    it('blocks purchase for echo', () => {
      const result = validateAgentExecutionContract({
        toAgent: 'echo',
        actionType: 'purchase_storage'
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('blocked');
    });

    it('blocks external_publish for echo', () => {
      const result = validateAgentExecutionContract({
        toAgent: 'echo',
        actionType: 'external_publish_memory'
      });
      expect(result.ok).toBe(false);
    });

    it('blocks purchase for sentinel', () => {
      const result = validateAgentExecutionContract({
        toAgent: 'sentinel',
        actionType: 'purchase_license'
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('blocked');
    });

    it('blocks filesystem_write for sentinel', () => {
      const result = validateAgentExecutionContract({
        toAgent: 'sentinel',
        actionType: 'filesystem_write_log'
      });
      expect(result.ok).toBe(false);
    });

    it('blocks purchase for nova', () => {
      const result = validateAgentExecutionContract({
        toAgent: 'nova',
        actionType: 'purchase_analysis'
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('blocked');
    });

    it('blocks external_publish for nova', () => {
      const result = validateAgentExecutionContract({
        toAgent: 'nova',
        actionType: 'external_publish_report'
      });
      expect(result.ok).toBe(false);
    });

    it('blocks upload for hector', () => {
      const result = validateAgentExecutionContract({
        toAgent: 'hector',
        actionType: 'upload_research_data'
      });
      expect(result.ok).toBe(false);
    });

    it('blocks post for maria', () => {
      const result = validateAgentExecutionContract({
        toAgent: 'maria',
        actionType: 'post_announcement'
      });
      expect(result.ok).toBe(false);
    });

    it('blocks execute_command for jose', () => {
      const result = validateAgentExecutionContract({
        toAgent: 'jose',
        actionType: 'execute_command_deploy'
      });
      expect(result.ok).toBe(false);
    });

    it('blocks filesystem_write for miya', () => {
      const result = validateAgentExecutionContract({
        toAgent: 'miya',
        actionType: 'filesystem_write_script'
      });
      expect(result.ok).toBe(false);
    });

    it('allows alphonso execute_command', () => {
      const result = validateAgentExecutionContract({
        toAgent: 'alphonso',
        actionType: 'execute_command_run_tests'
      });
      expect(result.ok).toBe(true);
    });

    it('allows marcus approved_distribution', () => {
      const result = validateAgentExecutionContract({
        toAgent: 'marcus',
        actionType: 'approved_distribution_release'
      });
      expect(result.ok).toBe(true);
    });

    it('allows echo memory_store', () => {
      const result = validateAgentExecutionContract({
        toAgent: 'echo',
        actionType: 'memory_store_record'
      });
      expect(result.ok).toBe(true);
    });

    it('allows sentinel security_check', () => {
      const result = validateAgentExecutionContract({
        toAgent: 'sentinel',
        actionType: 'security_check_permission'
      });
      expect(result.ok).toBe(true);
    });

    it('allows nova opportunity_score', () => {
      const result = validateAgentExecutionContract({
        toAgent: 'nova',
        actionType: 'opportunity_score_leads'
      });
      expect(result.ok).toBe(true);
    });

    it('allows hector research_discover', () => {
      const result = validateAgentExecutionContract({
        toAgent: 'hector',
        actionType: 'research_discover_sources'
      });
      expect(result.ok).toBe(true);
    });
  });
});
