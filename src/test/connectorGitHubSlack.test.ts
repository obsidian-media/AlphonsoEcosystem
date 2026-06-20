import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_CONNECTORS } from '../services/connectors/connectorRegistry';

describe('connectorRegistry - GitHub and Slack', () => {
  describe('DEFAULT_CONNECTORS', () => {
    it('includes github connector', () => {
      const github = DEFAULT_CONNECTORS.find(c => c.id === 'github');
      expect(github).toBeDefined();
      expect(github.name).toBe('GitHub Connector');
      expect(github.transport).toBe('github_rest_api_v3');
      expect(github.requiredEnv).toContain('GITHUB_TOKEN');
      expect(github.permissions).toContain('repo_read');
      expect(github.permissions).toContain('repo_write');
      expect(github.permissions).toContain('issue_read');
      expect(github.permissions).toContain('issue_write');
      expect(github.permissions).toContain('pr_read');
      expect(github.permissions).toContain('pr_write');
      expect(github.permissions).toContain('release_read');
      expect(github.permissions).toContain('release_write');
      expect(github.permissions).toContain('code_search');
      expect(github.permissions).toContain('approval_requests');
    });

    it('includes slack connector', () => {
      const slack = DEFAULT_CONNECTORS.find(c => c.id === 'slack');
      expect(slack).toBeDefined();
      expect(slack.name).toBe('Slack Connector');
      expect(slack.transport).toBe('slack_web_api');
      expect(slack.requiredEnv).toContain('SLACK_BOT_TOKEN');
      expect(slack.permissions).toContain('channel_read');
      expect(slack.permissions).toContain('channel_write');
      expect(slack.permissions).toContain('message_send');
      expect(slack.permissions).toContain('file_upload');
      expect(slack.permissions).toContain('reaction_add');
      expect(slack.permissions).toContain('approval_requests');
    });

    it('has 15 connectors total', () => {
      expect(DEFAULT_CONNECTORS.length).toBe(15);
    });

    it('github connector has not_configured status by default', () => {
      const github = DEFAULT_CONNECTORS.find(c => c.id === 'github');
      expect(github.status).toBe('not_configured');
    });

    it('slack connector has not_configured status by default', () => {
      const slack = DEFAULT_CONNECTORS.find(c => c.id === 'slack');
      expect(slack.status).toBe('not_configured');
    });
  });
});
