import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseGithubRepository, resolveUpdaterBaseUrl, resolveUpdaterReleaseTag, assetNameFromPath } from './updaterReleaseUtils.mjs';

const GITHUB_API_BASE = 'https://api.github.com';

function jsonHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { message: text };
  }
  if (!response.ok) {
    const error = new Error(payload?.message || `GitHub API request failed: HTTP ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function upsertRelease({ token, repository, tag, name, body, prerelease = false, draft = false }) {
  const repo = parseGithubRepository(repository);
  if (!repo) throw new Error(`Invalid GITHUB_REPOSITORY: ${repository}`);
  const releaseTag = resolveUpdaterReleaseTag('0.1.0', tag);
  const base = `${GITHUB_API_BASE}/repos/${repo.owner}/${repo.repo}`;
  const release = await fetchJson(`${base}/releases/tags/${encodeURIComponent(releaseTag)}`, {
    method: 'GET',
    headers: jsonHeaders(token)
  }).catch(async (error) => {
    if (error.status !== 404) throw error;
    return fetchJson(`${base}/releases`, {
      method: 'POST',
      headers: { ...jsonHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tag_name: releaseTag,
        name: name || releaseTag,
        body: body || '',
        draft,
        prerelease
      })
    });
  });

  return release;
}

async function deleteAssetIfPresent({ token, repository, releaseId, assetName }) {
  const repo = parseGithubRepository(repository);
  if (!repo) return;
  const assets = await fetchJson(`${GITHUB_API_BASE}/repos/${repo.owner}/${repo.repo}/releases/${releaseId}/assets`, {
    headers: jsonHeaders(token)
  });
  const asset = Array.isArray(assets) ? assets.find((item) => item.name === assetName) : null;
  if (!asset) return;
  await fetchJson(`${GITHUB_API_BASE}/repos/${repo.owner}/${repo.repo}/releases/assets/${asset.id}`, {
    method: 'DELETE',
    headers: jsonHeaders(token)
  });
}

async function uploadAsset({ token, uploadUrl, filePath, contentType }) {
  const url = uploadUrl.replace(/\{.*\}$/, '') + `?name=${encodeURIComponent(basename(filePath))}`;
  const body = readFileSync(filePath);
  return fetchJson(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': contentType || 'application/octet-stream',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body
  });
}

export async function publishUpdaterRelease({
  token,
  repository,
  tag,
  name,
  body,
  assets = []
}) {
  if (!token) throw new Error('GITHUB_TOKEN is required for release publishing.');
  if (!repository) throw new Error('GITHUB_REPOSITORY is required for release publishing.');
  const release = await upsertRelease({ token, repository, tag, name, body, prerelease: false, draft: false });
  for (const asset of assets) {
    const assetName = assetNameFromPath(asset.path);
    await deleteAssetIfPresent({ token, repository, releaseId: release.id, assetName }).catch(() => undefined);
    await uploadAsset({
      token,
      uploadUrl: release.upload_url,
      filePath: asset.path,
      contentType: asset.contentType
    });
  }
  return release;
}

export function deriveUpdaterReleaseContext({
  version,
  baseUrl = '',
  githubRepository = '',
  githubReleaseTag = ''
} = {}) {
  const tag = resolveUpdaterReleaseTag(version, githubReleaseTag);
  const resolvedBaseUrl = resolveUpdaterBaseUrl({
    baseUrl,
    githubRepository,
    releaseTag: tag,
    version
  });
  return {
    tag,
    baseUrl: resolvedBaseUrl
  };
}
