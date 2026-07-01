import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
  isTauri: vi.fn().mockReturnValue(false)
}));

const mockEvaluatePolicyGate = vi.fn().mockReturnValue({
  ok: true, blocked: false, setupRequired: false, reason: null,
  riskLevel: 'medium', confidence: 'verified', verificationState: 'verified'
});

vi.mock('../../services/policyEnforcementService', () => ({
  evaluatePolicyGate: (...args) => mockEvaluatePolicyGate(...args)
}));

const GITHUB_API_BASE = 'https://api.github.com';
let mockFetch;

async function getModule() {
  return import('../../services/connectors/githubConnector.ts');
}

describe('githubConnector', () => {
  beforeEach(() => {
    localStorage.clear();
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    mockEvaluatePolicyGate.mockReturnValue({
      ok: true, blocked: false, setupRequired: false, reason: null,
      riskLevel: 'medium', confidence: 'verified', verificationState: 'verified'
    });
  });

  describe('policy gate blocking', () => {
    it('throws when policy gate blocks a request', async () => {
      mockEvaluatePolicyGate.mockReturnValue({
        ok: false, blocked: true, setupRequired: false,
        reason: 'Approval Mode requires explicit approval',
        riskLevel: 'medium', confidence: 'verified', verificationState: 'pending'
      });
      const { listIssues } = await getModule();
      await expect(listIssues({ token: 'tok', owner: 'o', repo: 'r' }))
        .rejects.toThrow('Approval Mode requires explicit approval');
    });

    it('calls evaluatePolicyGate with correct connectorId for each operation', async () => {
      mockFetch.mockResolvedValue({
        ok: true, json: async () => []
      });
      const { listIssues } = await getModule();
      await listIssues({ token: 'tok', owner: 'o', repo: 'r' });
      expect(mockEvaluatePolicyGate).toHaveBeenCalledWith(
        expect.objectContaining({ connectorId: 'github' })
      );
    });

    it('passes method as actionType in policy gate check', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          number: 1, title: 't', body: 'b', state: 'open',
          labels: [], assignees: [],
          created_at: '2025-01-01', updated_at: '2025-01-01'
        })
      });
      const { createIssue } = await getModule();
      await createIssue({ token: 'tok', owner: 'o', repo: 'r' }, 'title', 'body');
      expect(mockEvaluatePolicyGate).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'post' })
      );
    });

    it('defaults actionType to get for read operations', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => [] });
      const { listIssues } = await getModule();
      await listIssues({ token: 'tok', owner: 'o', repo: 'r' });
      expect(mockEvaluatePolicyGate).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'get' })
      );
    });
  });

  describe('listIssues', () => {
    it('fetches open issues with correct URL and returns mapped result', async () => {
      const { listIssues } = await getModule();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [
          {
            number: 1, title: 'Bug fix', body: 'Fix the thing',
            state: 'open', labels: [{ name: 'bug' }],
            assignees: [{ login: 'user1' }],
            created_at: '2025-01-01', updated_at: '2025-01-02'
          }
        ]
      });

      const issues = await listIssues({ token: 'tok', owner: 'o', repo: 'r' });

      expect(mockFetch).toHaveBeenCalledWith(
        `${GITHUB_API_BASE}/repos/o/r/issues?state=open`,
        expect.objectContaining({
          headers: expect.objectContaining({ 'Authorization': 'Bearer tok' })
        })
      );
      expect(issues).toHaveLength(1);
      expect(issues[0].number).toBe(1);
      expect(issues[0].title).toBe('Bug fix');
      expect(issues[0].labels).toEqual(['bug']);
      expect(issues[0].assignees).toEqual(['user1']);
    });

    it('respects custom state filter', async () => {
      const { listIssues } = await getModule();
      mockFetch.mockResolvedValue({ ok: true, json: async () => [] });
      await listIssues({ token: 'tok', owner: 'o', repo: 'r' }, 'closed');
      expect(mockFetch).toHaveBeenCalledWith(
        `${GITHUB_API_BASE}/repos/o/r/issues?state=closed`,
        expect.any(Object)
      );
    });

    it('returns empty array when no issues exist', async () => {
      const { listIssues } = await getModule();
      mockFetch.mockResolvedValue({ ok: true, json: async () => [] });
      const issues = await listIssues({ token: 'tok', owner: 'o', repo: 'r' });
      expect(issues).toEqual([]);
    });
  });

  describe('createIssue', () => {
    it('sends POST with title, body, labels', async () => {
      const { createIssue } = await getModule();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          number: 2, title: 'New feature', body: 'desc',
          state: 'open', labels: [{ name: 'enhancement' }],
          assignees: [], created_at: '2025-02-01', updated_at: '2025-02-01'
        })
      });

      const issue = await createIssue({ token: 'tok', owner: 'o', repo: 'r' }, 'New feature', 'desc', ['enhancement']);

      expect(mockFetch).toHaveBeenCalledWith(
        `${GITHUB_API_BASE}/repos/o/r/issues`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ title: 'New feature', body: 'desc', labels: ['enhancement'] })
        })
      );
      expect(issue.number).toBe(2);
    });

    it('defaults labels to empty array', async () => {
      const { createIssue } = await getModule();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          number: 3, title: 'T', body: 'B', state: 'open',
          labels: [], assignees: [], created_at: '2025-01-01', updated_at: '2025-01-01'
        })
      });
      await createIssue({ token: 'tok', owner: 'o', repo: 'r' }, 'T', 'B');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ title: 'T', body: 'B', labels: [] })
        })
      );
    });
  });

  describe('closeIssue', () => {
    it('sends PATCH with state closed', async () => {
      const { closeIssue } = await getModule();
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

      await closeIssue({ token: 'tok', owner: 'o', repo: 'r' }, 42);

      expect(mockFetch).toHaveBeenCalledWith(
        `${GITHUB_API_BASE}/repos/o/r/issues/42`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ state: 'closed' })
        })
      );
    });
  });

  describe('listPullRequests', () => {
    it('maps merged state correctly', async () => {
      const { listPullRequests } = await getModule();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [
          { number: 10, title: 'PR1', body: 'b', state: 'closed', merged: true,
            head: { ref: 'feat' }, base: { ref: 'main' },
            labels: [], requested_reviewers: [],
            created_at: '2025-03-01', updated_at: '2025-03-02' }
        ]
      });

      const prs = await listPullRequests({ token: 'tok', owner: 'o', repo: 'r' });

      expect(prs[0].state).toBe('merged');
      expect(prs[0].head).toBe('feat');
      expect(prs[0].base).toBe('main');
    });

    it('maps open PR state correctly', async () => {
      const { listPullRequests } = await getModule();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [
          { number: 11, title: 'PR2', body: 'b', state: 'open', merged: false,
            head: { ref: 'fix' }, base: { ref: 'develop' },
            labels: [{ name: 'bug' }], requested_reviewers: [{ login: 'reviewer1' }],
            created_at: '2025-03-01', updated_at: '2025-03-01' }
        ]
      });

      const prs = await listPullRequests({ token: 'tok', owner: 'o', repo: 'r' });
      expect(prs[0].state).toBe('open');
      expect(prs[0].labels).toEqual(['bug']);
      expect(prs[0].reviewers).toEqual(['reviewer1']);
    });
  });

  describe('createPullRequest', () => {
    it('sends POST with title, body, head, base', async () => {
      const { createPullRequest } = await getModule();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          number: 11, title: 'PR', body: 'b', state: 'open',
          head: { ref: 'feat' }, base: { ref: 'main' },
          labels: [], requested_reviewers: [],
          created_at: '2025-04-01', updated_at: '2025-04-01'
        })
      });

      const pr = await createPullRequest({ token: 'tok', owner: 'o', repo: 'r' }, 'PR', 'b', 'feat', 'main');

      expect(mockFetch).toHaveBeenCalledWith(
        `${GITHUB_API_BASE}/repos/o/r/pulls`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ title: 'PR', body: 'b', head: 'feat', base: 'main' })
        })
      );
      expect(pr.number).toBe(11);
    });

    it('defaults base to main', async () => {
      const { createPullRequest } = await getModule();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          number: 12, title: 'PR', body: 'b', state: 'open',
          head: { ref: 'feat' }, base: { ref: 'main' },
          labels: [], requested_reviewers: [],
          created_at: '2025-04-01', updated_at: '2025-04-01'
        })
      });
      await createPullRequest({ token: 'tok', owner: 'o', repo: 'r' }, 'PR', 'b', 'feat');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ title: 'PR', body: 'b', head: 'feat', base: 'main' })
        })
      );
    });
  });

  describe('mergePullRequest', () => {
    it('sends PUT with merge_method', async () => {
      const { mergePullRequest } = await getModule();
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

      await mergePullRequest({ token: 'tok', owner: 'o', repo: 'r' }, 7, 'squash');

      expect(mockFetch).toHaveBeenCalledWith(
        `${GITHUB_API_BASE}/repos/o/r/pulls/7/merge`,
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ merge_method: 'squash' })
        })
      );
    });

    it('defaults merge method to squash', async () => {
      const { mergePullRequest } = await getModule();
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
      await mergePullRequest({ token: 'tok', owner: 'o', repo: 'r' }, 1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ merge_method: 'squash' })
        })
      );
    });
  });

  describe('searchCode', () => {
    it('URL-encodes the query and appends language filter', async () => {
      const { searchCode } = await getModule();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ total_count: 5, items: [] })
      });

      const result = await searchCode({ token: 'tok' }, 'function foo', 'javascript');

      expect(mockFetch).toHaveBeenCalledWith(
        `${GITHUB_API_BASE}/search/code?q=function%20foo%20language%3Ajavascript`,
        expect.any(Object)
      );
      expect(result.totalCount).toBe(5);
    });

    it('encodes query without language', async () => {
      const { searchCode } = await getModule();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ total_count: 1, items: [] })
      });

      await searchCode({ token: 'tok' }, 'class Foo');

      expect(mockFetch).toHaveBeenCalledWith(
        `${GITHUB_API_BASE}/search/code?q=class%20Foo`,
        expect.any(Object)
      );
    });
  });

  describe('searchIssues', () => {
    it('appends repo filter when provided', async () => {
      const { searchIssues } = await getModule();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ total_count: 0, items: [] })
      });

      await searchIssues({ token: 'tok' }, 'bug', 'owner/repo');

      expect(mockFetch).toHaveBeenCalledWith(
        `${GITHUB_API_BASE}/search/issues?q=bug%20repo%3Aowner%2Frepo`,
        expect.any(Object)
      );
    });

    it('sends query without repo filter when not provided', async () => {
      const { searchIssues } = await getModule();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ total_count: 0, items: [] })
      });
      await searchIssues({ token: 'tok' }, 'bug');
      expect(mockFetch).toHaveBeenCalledWith(
        `${GITHUB_API_BASE}/search/issues?q=bug`,
        expect.any(Object)
      );
    });
  });

  describe('searchRepos', () => {
    it('sends encoded query to repositories endpoint', async () => {
      const { searchRepos } = await getModule();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ total_count: 3, items: [] })
      });

      const result = await searchRepos({ token: 'tok' }, 'alphonso');

      expect(mockFetch).toHaveBeenCalledWith(
        `${GITHUB_API_BASE}/search/repositories?q=alphonso`,
        expect.any(Object)
      );
      expect(result.totalCount).toBe(3);
    });
  });

  describe('getFileContent', () => {
    it('decodes base64 content', async () => {
      const { getFileContent } = await getModule();
      const encoded = btoa('hello world');
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ content: encoded, encoding: 'base64' })
      });

      const content = await getFileContent({ token: 'tok', owner: 'o', repo: 'r' }, 'README.md');

      expect(content).toBe('hello world');
    });

    it('returns raw content when not base64 encoded', async () => {
      const { getFileContent } = await getModule();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ content: 'raw text', encoding: 'none' })
      });
      const content = await getFileContent({ token: 'tok', owner: 'o', repo: 'r' }, 'file.txt');
      expect(content).toBe('raw text');
    });

    it('appends ref parameter when provided', async () => {
      const { getFileContent } = await getModule();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ content: 'raw', encoding: 'none' })
      });

      await getFileContent({ token: 'tok', owner: 'o', repo: 'r' }, 'file.js', 'v1.0');

      expect(mockFetch).toHaveBeenCalledWith(
        `${GITHUB_API_BASE}/repos/o/r/contents/file.js?ref=v1.0`,
        expect.any(Object)
      );
    });

    it('omits ref parameter when not provided', async () => {
      const { getFileContent } = await getModule();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ content: 'raw', encoding: 'none' })
      });
      await getFileContent({ token: 'tok', owner: 'o', repo: 'r' }, 'file.js');
      expect(mockFetch).toHaveBeenCalledWith(
        `${GITHUB_API_BASE}/repos/o/r/contents/file.js`,
        expect.any(Object)
      );
    });
  });

  describe('listReleases', () => {
    it('maps assets correctly', async () => {
      const { listReleases } = await getModule();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [
          {
            id: 1, tag_name: 'v1', name: 'v1', body: 'first release',
            draft: false, prerelease: false,
            created_at: '2025-01-01', published_at: '2025-01-02',
            assets: [{
              id: 10, name: 'asset.zip', size: 100,
              download_count: 50, browser_download_url: 'https://example.com/asset.zip'
            }]
          }
        ]
      });

      const releases = await listReleases({ token: 'tok', owner: 'o', repo: 'r' });

      expect(releases).toHaveLength(1);
      expect(releases[0].tagName).toBe('v1');
      expect(releases[0].assets[0].name).toBe('asset.zip');
      expect(releases[0].assets[0].downloadCount).toBe(50);
      expect(releases[0].assets[0].size).toBe(100);
    });

    it('returns empty array when no releases exist', async () => {
      const { listReleases } = await getModule();
      mockFetch.mockResolvedValue({ ok: true, json: async () => [] });
      const releases = await listReleases({ token: 'tok', owner: 'o', repo: 'r' });
      expect(releases).toEqual([]);
    });
  });

  describe('createRelease', () => {
    it('sends POST with release payload and returns mapped result', async () => {
      const { createRelease } = await getModule();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 5, tag_name: 'v2', name: 'v2', body: 'release body',
          draft: true, prerelease: false,
          created_at: '2025-06-01', published_at: '2025-06-01',
          assets: []
        })
      });

      const release = await createRelease({ token: 'tok', owner: 'o', repo: 'r' }, 'v2', 'v2', 'release body', true);

      expect(mockFetch).toHaveBeenCalledWith(
        `${GITHUB_API_BASE}/repos/o/r/releases`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            tag_name: 'v2', name: 'v2', body: 'release body',
            draft: true, prerelease: false
          })
        })
      );
      expect(release.id).toBe(5);
      expect(release.draft).toBe(true);
    });

    it('defaults draft and prerelease to false', async () => {
      const { createRelease } = await getModule();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 6, tag_name: 'v3', name: 'v3', body: '',
          draft: false, prerelease: false,
          created_at: '2025-06-01', published_at: '2025-06-01', assets: []
        })
      });
      await createRelease({ token: 'tok', owner: 'o', repo: 'r' }, 'v3', 'v3', '');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            tag_name: 'v3', name: 'v3', body: '',
            draft: false, prerelease: false
          })
        })
      );
    });
  });

  describe('listWorkflows', () => {
    it('fetches workflows and returns them', async () => {
      const { listWorkflows } = await getModule();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          workflows: [{ id: 1, name: 'CI', state: 'active' }]
        })
      });

      const workflows = await listWorkflows({ token: 'tok', owner: 'o', repo: 'r' });
      expect(workflows).toHaveLength(1);
      expect(workflows[0].name).toBe('CI');
    });

    it('throws when owner or repo is missing', async () => {
      const { listWorkflows } = await getModule();
      await expect(listWorkflows({ token: 'tok' }))
        .rejects.toThrow('owner and repo are required');
    });
  });

  describe('triggerWorkflow', () => {
    it('sends POST with ref and inputs', async () => {
      const { triggerWorkflow } = await getModule();
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

      await triggerWorkflow({ token: 'tok', owner: 'o', repo: 'r' }, 'ci.yml', 'main', { env: 'prod' });

      expect(mockFetch).toHaveBeenCalledWith(
        `${GITHUB_API_BASE}/repos/o/r/actions/workflows/ci.yml/dispatches`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ ref: 'main', inputs: { env: 'prod' } })
        })
      );
    });

    it('defaults ref to main and inputs to empty object', async () => {
      const { triggerWorkflow } = await getModule();
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
      await triggerWorkflow({ token: 'tok', owner: 'o', repo: 'r' }, 'ci.yml');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ ref: 'main', inputs: {} })
        })
      );
    });
  });

  describe('error handling', () => {
    it('throws on 401 bad token', async () => {
      const { listIssues } = await getModule();
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Bad credentials'
      });

      await expect(listIssues({ token: 'bad', owner: 'o', repo: 'r' }))
        .rejects.toThrow('GitHub API error: 401 - Bad credentials');
    });

    it('throws on 404 repo not found', async () => {
      const { listIssues } = await getModule();
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => 'Not Found'
      });

      await expect(listIssues({ token: 'tok', owner: 'o', repo: 'nonexistent' }))
        .rejects.toThrow('GitHub API error: 404 - Not Found');
    });

    it('throws on 422 validation error', async () => {
      const { createIssue } = await getModule();
      mockFetch.mockResolvedValue({
        ok: false,
        status: 422,
        text: async () => 'Validation error'
      });

      await expect(createIssue({ token: 'tok', owner: 'o', repo: 'r' }, '', ''))
        .rejects.toThrow('GitHub API error: 422 - Validation error');
    });
  });

  describe('missing config', () => {
    it('throws when owner is missing', async () => {
      const { listIssues } = await getModule();
      await expect(listIssues({ token: 'tok' }))
        .rejects.toThrow('owner and repo are required');
    });

    it('throws when repo is missing from createIssue', async () => {
      const { createIssue } = await getModule();
      await expect(createIssue({ token: 'tok', owner: 'o' }, 't', 'b'))
        .rejects.toThrow('owner and repo are required');
    });

    it('throws when owner is missing in mergePullRequest', async () => {
      const { mergePullRequest } = await getModule();
      await expect(mergePullRequest({ token: 'tok', repo: 'r' }, 1))
        .rejects.toThrow('owner and repo are required');
    });

    it('throws when owner is missing in closeIssue', async () => {
      const { closeIssue } = await getModule();
      await expect(closeIssue({ token: 'tok', repo: 'r' }, 1))
        .rejects.toThrow('owner and repo are required');
    });

    it('throws when owner is missing in getFileContent', async () => {
      const { getFileContent } = await getModule();
      await expect(getFileContent({ token: 'tok' }, 'file.txt'))
        .rejects.toThrow('owner and repo are required');
    });

    it('throws when owner is missing in listReleases', async () => {
      const { listReleases } = await getModule();
      await expect(listReleases({ token: 'tok' }))
        .rejects.toThrow('owner and repo are required');
    });

    it('throws when owner is missing in createRelease', async () => {
      const { createRelease } = await getModule();
      await expect(createRelease({ token: 'tok' }, 'v1', 'v1', ''))
        .rejects.toThrow('owner and repo are required');
    });

    it('throws when owner is missing in triggerWorkflow', async () => {
      const { triggerWorkflow } = await getModule();
      await expect(triggerWorkflow({ token: 'tok' }, 'ci.yml'))
        .rejects.toThrow('owner and repo are required');
    });
  });

  describe('request headers', () => {
    it('includes Accept header with GitHub v3 media type', async () => {
      const { listIssues } = await getModule();
      mockFetch.mockResolvedValue({ ok: true, json: async () => [] });
      await listIssues({ token: 'tok', owner: 'o', repo: 'r' });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Accept': 'application/vnd.github.v3+json'
          })
        })
      );
    });

    it('includes Content-Type application/json', async () => {
      const { listIssues } = await getModule();
      mockFetch.mockResolvedValue({ ok: true, json: async () => [] });
      await listIssues({ token: 'tok', owner: 'o', repo: 'r' });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
    });
  });
});
