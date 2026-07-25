import { describe, it, expect, afterEach } from 'vitest';

const { AGENT_EXECUTION_CONTRACTS, validateAgentExecutionContract, validateSkillPackAgainstContract, AGENT_SKILL_PACK_BLOCKED_OVERRIDES } = await import('../services/agentContractService.ts');

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

  describe('validateSkillPackAgainstContract — per-skill scoping (Sprint 3)', () => {
    it('passes when permissions fit the agent-wide list and no packId is given', () => {
      const result = validateSkillPackAgainstContract('miya', ['media.generate', 'video.draft']);
      expect(result.ok).toBe(true);
    });

    it('rejects a permission outside the agent-wide list', () => {
      const result = validateSkillPackAgainstContract('miya', ['distribution.publish']);
      expect(result.ok).toBe(false);
      expect(result.offendingPermissions).toContain('distribution.publish');
    });

    it('enforces a narrower per-pack override even though the agent-wide list would allow it', () => {
      // pack.miya-brand-identity's override only allows creative.brand_direction/style_guide —
      // 'video.draft' passes Miya's agent-wide list but must fail this pack's own scope.
      const result = validateSkillPackAgainstContract('miya', ['video.draft'], 'pack.miya-brand-identity');
      expect(result.ok).toBe(false);
      expect(result.offendingPermissions).toContain('video.draft');
    });

    it('allows a pack-scoped permission that matches its own override', () => {
      const result = validateSkillPackAgainstContract('miya', ['creative.brand_direction'], 'pack.miya-brand-identity');
      expect(result.ok).toBe(true);
    });

    it('falls back to the agent-wide list for a packId with no override entry', () => {
      const result = validateSkillPackAgainstContract('miya', ['media.generate'], 'pack.miya-runway-video-generation');
      expect(result.ok).toBe(true);
    });

    it('enforces per-pack overrides for Hector and Jose taxonomy packs too', () => {
      expect(validateSkillPackAgainstContract('hector', ['feed_monitoring'], 'pack.hector-rss-monitoring').ok).toBe(true);
      expect(validateSkillPackAgainstContract('hector', ['campaign_planning'], 'pack.hector-rss-monitoring').ok).toBe(false);
      expect(validateSkillPackAgainstContract('jose', ['task_routing'], 'pack.jose-task-routing').ok).toBe(true);
      expect(validateSkillPackAgainstContract('jose', ['cross_agent_synthesis'], 'pack.jose-task-routing').ok).toBe(false);
    });
  });

  describe('validateSkillPackAgainstContract — least-privilege enforcement for Hector/Echo/Nova taxonomy packs (C2)', () => {
    // Previously these three agents' newer taxonomy packs (everything except
    // the original 4 legacy Hector packs) silently fell back to the full
    // agent-wide permission list regardless of any AGENT_SKILL_PACK_SCOPE_OVERRIDES
    // entry defined for them, because those override entries didn't actually
    // match the packs' real declared permissions in skillPackService.js. Both
    // the fallback bypass and the mismatched override strings are fixed —
    // these tests prove the override is now genuinely enforced per pack.

    it('accepts a Hector taxonomy pack\'s own declared permissions', () => {
      const result = validateSkillPackAgainstContract(
        'hector',
        ['research', 'source_verification', 'citation_gathering'],
        'pack.hector-api-documentation-research'
      );
      expect(result.ok).toBe(true);
    });

    it('rejects a permission that is valid for the Hector agent generally but not this specific pack', () => {
      const result = validateSkillPackAgainstContract(
        'hector',
        ['campaign_planning'],
        'pack.hector-api-documentation-research'
      );
      expect(result.ok).toBe(false);
      expect(result.offendingPermissions).toContain('campaign_planning');
    });

    it('accepts an Echo taxonomy pack\'s own declared permissions', () => {
      const result = validateSkillPackAgainstContract(
        'echo',
        ['memory.decisions', 'knowledge.context', 'timeline.decisions'],
        'pack.echo-decision-capture'
      );
      expect(result.ok).toBe(true);
    });

    it('rejects a permission that is valid for Echo generally but not this specific pack', () => {
      const result = validateSkillPackAgainstContract(
        'echo',
        ['retention.prune'],
        'pack.echo-decision-capture'
      );
      expect(result.ok).toBe(false);
    });

    it('accepts a Nova taxonomy pack\'s own declared permissions', () => {
      const result = validateSkillPackAgainstContract(
        'nova',
        ['opportunity.timing', 'analysis.window', 'strategy.sequencing'],
        'pack.nova-timing-analysis'
      );
      expect(result.ok).toBe(true);
    });

    it('rejects a permission that is valid for Nova generally but not this specific pack', () => {
      const result = validateSkillPackAgainstContract(
        'nova',
        ['analysis.market'],
        'pack.nova-timing-analysis'
      );
      expect(result.ok).toBe(false);
    });

    it('still falls back to the full agent-wide list for the original catch-all packs with no override', () => {
      // pack.hector-professional-marketing / pack.echo-memory-synthesis /
      // pack.nova-opportunity-analysis intentionally have no override entry —
      // they predate the taxonomy split and should keep the broader scope.
      expect(validateSkillPackAgainstContract(
        'hector',
        ['market_research', 'content_strategy', 'campaign_planning', 'workflow_review'],
        'pack.hector-professional-marketing'
      ).ok).toBe(true);
    });

    it('fixes the corrupted override strings found this session (garbled/missing-dot permission tags)', () => {
      expect(validateSkillPackAgainstContract('echo', ['knowledge.trace'], 'pack.echo-audit-trail').ok).toBe(true);
      expect(validateSkillPackAgainstContract('nova', ['strategy.sequencing'], 'pack.nova-timing-analysis').ok).toBe(true);
      expect(validateSkillPackAgainstContract('nova', ['opportunity.readiness'], 'pack.nova-capability-assessment').ok).toBe(true);
      expect(validateSkillPackAgainstContract('nova', ['strategy.portfolio'], 'pack.nova-portfolio-analysis').ok).toBe(true);
    });
  });

  describe('AGENT_SKILL_PACK_BLOCKED_OVERRIDES — per-pack denylist (C2, blocked prefixes)', () => {
    afterEach(() => {
      // These tests mutate the real exported map to prove the wiring works
      // against the actual object validateSkillPackAgainstContract reads,
      // not a mock — always restore it to its true production state (empty)
      // afterward so this doesn't leak into other tests in the file.
      for (const key of Object.keys(AGENT_SKILL_PACK_BLOCKED_OVERRIDES)) {
        delete AGENT_SKILL_PACK_BLOCKED_OVERRIDES[key];
      }
    });

    it('is empty in production — no pack currently needs a denylist entry beyond the universal blocklist', () => {
      expect(AGENT_SKILL_PACK_BLOCKED_OVERRIDES).toEqual({});
    });

    it('when populated, rejects a permission that would otherwise pass the pack\'s own allowlist', () => {
      // pack.alphonso-runtime-diagnostics' real allowlist includes
      // 'runtime.' style prefixes broad enough that a hypothetical
      // 'runtime.diagnose.shell_exec' would pass the allowlist check alone.
      // This proves the denylist layer independently rejects it even though
      // the allowlist would admit it.
      const allowed = validateSkillPackAgainstContract(
        'alphonso',
        ['runtime.diagnose'],
        'pack.alphonso-runtime-diagnostics'
      );
      expect(allowed.ok).toBe(true); // sanity: this permission is normally fine

      AGENT_SKILL_PACK_BLOCKED_OVERRIDES['pack.alphonso-runtime-diagnostics'] = ['runtime.diagnose.shell_exec'];
      const blocked = validateSkillPackAgainstContract(
        'alphonso',
        ['runtime.diagnose.shell_exec'],
        'pack.alphonso-runtime-diagnostics'
      );
      expect(blocked.ok).toBe(false);
      expect(blocked.offendingPermissions).toContain('runtime.diagnose.shell_exec');
    });

    it('the per-pack denylist applies even to Alphonso, who is otherwise exempt from the universal blocklist', () => {
      AGENT_SKILL_PACK_BLOCKED_OVERRIDES['pack.alphonso-code-review'] = ['code.review.auto_merge'];
      const result = validateSkillPackAgainstContract(
        'alphonso',
        ['code.review.auto_merge'],
        'pack.alphonso-code-review'
      );
      expect(result.ok).toBe(false);
    });
  });
});
