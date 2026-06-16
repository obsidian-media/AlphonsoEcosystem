const GITHUB_API_BASE = 'https://api.github.com';

export interface GitHubConfig {
  token: string;
  owner?: string;
  repo?: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: string[];
  assignees: string[];
  createdAt: string;
  updatedAt: string;
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed' | 'merged';
  head: string;
  base: string;
  labels: string[];
  reviewers: string[];
  createdAt: string;
  updatedAt: string;
}

export interface GitHubRelease {
  id: number;
  tagName: string;
  name: string;
  body: string;
  draft: boolean;
  prerelease: boolean;
  createdAt: string;
  publishedAt: string;
  assets: GitHubAsset[];
}

export interface GitHubAsset {
  id: number;
  name: string;
  size: number;
  downloadCount: number;
  browserDownloadUrl: string;
}

export interface GitHubSearchResult {
  totalCount: number;
  items: any[];
}

async function githubRequest(
  endpoint: string,
  config: GitHubConfig,
  options: RequestInit = {}
): Promise<any> {
  const url = endpoint.startsWith('http') ? endpoint : `${GITHUB_API_BASE}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${config.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitHub API error: ${response.status} - ${error}`);
  }

  return response.json();
}

export async function listIssues(
  config: GitHubConfig,
  state: 'open' | 'closed' | 'all' = 'open'
): Promise<GitHubIssue[]> {
  const { owner, repo } = config;
  if (!owner || !repo) throw new Error('owner and repo are required');

  const data = await githubRequest(`/repos/${owner}/${repo}/issues?state=${state}`, config);
  return data.map((issue: any) => ({
    number: issue.number,
    title: issue.title,
    body: issue.body,
    state: issue.state,
    labels: issue.labels.map((l: any) => l.name),
    assignees: issue.assignees.map((a: any) => a.login),
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
  }));
}

export async function createIssue(
  config: GitHubConfig,
  title: string,
  body: string,
  labels: string[] = []
): Promise<GitHubIssue> {
  const { owner, repo } = config;
  if (!owner || !repo) throw new Error('owner and repo are required');

  const data = await githubRequest(`/repos/${owner}/${repo}/issues`, config, {
    method: 'POST',
    body: JSON.stringify({ title, body, labels }),
  });

  return {
    number: data.number,
    title: data.title,
    body: data.body,
    state: data.state,
    labels: data.labels.map((l: any) => l.name),
    assignees: data.assignees.map((a: any) => a.login),
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function closeIssue(config: GitHubConfig, issueNumber: number): Promise<void> {
  const { owner, repo } = config;
  if (!owner || !repo) throw new Error('owner and repo are required');

  await githubRequest(`/repos/${owner}/${repo}/issues/${issueNumber}`, config, {
    method: 'PATCH',
    body: JSON.stringify({ state: 'closed' }),
  });
}

export async function listPullRequests(
  config: GitHubConfig,
  state: 'open' | 'closed' | 'all' = 'open'
): Promise<GitHubPullRequest[]> {
  const { owner, repo } = config;
  if (!owner || !repo) throw new Error('owner and repo are required');

  const data = await githubRequest(`/repos/${owner}/${repo}/pulls?state=${state}`, config);
  return data.map((pr: any) => ({
    number: pr.number,
    title: pr.title,
    body: pr.body,
    state: pr.merged ? 'merged' : pr.state,
    head: pr.head.ref,
    base: pr.base.ref,
    labels: pr.labels.map((l: any) => l.name),
    reviewers: pr.requested_reviewers.map((r: any) => r.login),
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
  }));
}

export async function createPullRequest(
  config: GitHubConfig,
  title: string,
  body: string,
  head: string,
  base: string = 'main'
): Promise<GitHubPullRequest> {
  const { owner, repo } = config;
  if (!owner || !repo) throw new Error('owner and repo are required');

  const data = await githubRequest(`/repos/${owner}/${repo}/pulls`, config, {
    method: 'POST',
    body: JSON.stringify({ title, body, head, base }),
  });

  return {
    number: data.number,
    title: data.title,
    body: data.body,
    state: data.state,
    head: data.head.ref,
    base: data.base.ref,
    labels: data.labels.map((l: any) => l.name),
    reviewers: data.requested_reviewers.map((r: any) => r.login),
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function mergePullRequest(
  config: GitHubConfig,
  prNumber: number,
  mergeMethod: 'merge' | 'squash' | 'rebase' = 'squash'
): Promise<void> {
  const { owner, repo } = config;
  if (!owner || !repo) throw new Error('owner and repo are required');

  await githubRequest(`/repos/${owner}/${repo}/pulls/${prNumber}/merge`, config, {
    method: 'PUT',
    body: JSON.stringify({ merge_method: mergeMethod }),
  });
}

export async function listReleases(config: GitHubConfig): Promise<GitHubRelease[]> {
  const { owner, repo } = config;
  if (!owner || !repo) throw new Error('owner and repo are required');

  const data = await githubRequest(`/repos/${owner}/${repo}/releases`, config);
  return data.map((release: any) => ({
    id: release.id,
    tagName: release.tag_name,
    name: release.name,
    body: release.body,
    draft: release.draft,
    prerelease: release.prerelease,
    createdAt: release.created_at,
    publishedAt: release.published_at,
    assets: release.assets.map((a: any) => ({
      id: a.id,
      name: a.name,
      size: a.size,
      downloadCount: a.download_count,
      browserDownloadUrl: a.browser_download_url,
    })),
  }));
}

export async function createRelease(
  config: GitHubConfig,
  tagName: string,
  name: string,
  body: string,
  draft: boolean = false,
  prerelease: boolean = false
): Promise<GitHubRelease> {
  const { owner, repo } = config;
  if (!owner || !repo) throw new Error('owner and repo are required');

  const data = await githubRequest(`/repos/${owner}/${repo}/releases`, config, {
    method: 'POST',
    body: JSON.stringify({
      tag_name: tagName,
      name,
      body,
      draft,
      prerelease,
    }),
  });

  return {
    id: data.id,
    tagName: data.tag_name,
    name: data.name,
    body: data.body,
    draft: data.draft,
    prerelease: data.prerelease,
    createdAt: data.created_at,
    publishedAt: data.published_at,
    assets: data.assets.map((a: any) => ({
      id: a.id,
      name: a.name,
      size: a.size,
      downloadCount: a.download_count,
      browserDownloadUrl: a.browser_download_url,
    })),
  };
}

export async function searchCode(
  config: GitHubConfig,
  query: string,
  language?: string
): Promise<GitHubSearchResult> {
  let searchQuery = query;
  if (language) searchQuery += ` language:${language}`;

  const data = await githubRequest(
    `/search/code?q=${encodeURIComponent(searchQuery)}`,
    config
  );

  return {
    totalCount: data.total_count,
    items: data.items,
  };
}

export async function searchIssues(
  config: GitHubConfig,
  query: string,
  repo?: string
): Promise<GitHubSearchResult> {
  let searchQuery = query;
  if (repo) searchQuery += ` repo:${repo}`;

  const data = await githubRequest(
    `/search/issues?q=${encodeURIComponent(searchQuery)}`,
    config
  );

  return {
    totalCount: data.total_count,
    items: data.items,
  };
}

export async function searchRepos(
  config: GitHubConfig,
  query: string
): Promise<GitHubSearchResult> {
  const data = await githubRequest(
    `/search/repositories?q=${encodeURIComponent(query)}`,
    config
  );

  return {
    totalCount: data.total_count,
    items: data.items,
  };
}

export async function getFileContent(
  config: GitHubConfig,
  path: string,
  ref?: string
): Promise<string> {
  const { owner, repo } = config;
  if (!owner || !repo) throw new Error('owner and repo are required');

  const refParam = ref ? `?ref=${ref}` : '';
  const data = await githubRequest(
    `/repos/${owner}/${repo}/contents/${path}${refParam}`,
    config
  );

  if (data.encoding === 'base64') {
    return atob(data.content);
  }

  return data.content;
}

export async function listWorkflows(config: GitHubConfig): Promise<any[]> {
  const { owner, repo } = config;
  if (!owner || !repo) throw new Error('owner and repo are required');

  const data = await githubRequest(`/repos/${owner}/${repo}/actions/workflows`, config);
  return data.workflows;
}

export async function triggerWorkflow(
  config: GitHubConfig,
  workflowId: string,
  ref: string = 'main',
  inputs: Record<string, any> = {}
): Promise<void> {
  const { owner, repo } = config;
  if (!owner || !repo) throw new Error('owner and repo are required');

  await githubRequest(
    `/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`,
    config,
    {
      method: 'POST',
      body: JSON.stringify({ ref, inputs }),
    }
  );
}
