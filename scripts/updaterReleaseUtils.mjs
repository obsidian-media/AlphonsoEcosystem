export function parseGithubRepository(repository) {
  const clean = String(repository || '').trim().replace(/^https:\/\/github.com\//i, '').replace(/\.git$/i, '');
  const [owner, repo] = clean.split('/');
  if (!owner || !repo) {
    return null;
  }
  return { owner, repo };
}

export function resolveUpdaterReleaseTag(version, overrideTag = '') {
  const cleanOverride = String(overrideTag || '').trim();
  if (cleanOverride) return cleanOverride;
  const cleanVersion = String(version || '').trim().replace(/^v/i, '');
  return `v${cleanVersion || '0.1.0'}`;
}

export function resolveUpdaterBaseUrl({ baseUrl = '', githubRepository = '', releaseTag = '', version = '' } = {}) {
  const cleanBase = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (cleanBase) return cleanBase;
  const repo = parseGithubRepository(githubRepository);
  if (!repo) return '';
  const tag = resolveUpdaterReleaseTag(version, releaseTag);
  return `https://github.com/${repo.owner}/${repo.repo}/releases/download/${tag}`;
}

export function buildUpdaterManifest({ version, baseUrl, fileName, signature, notes = '' }) {
  const cleanBase = String(baseUrl || '').trim().replace(/\/+$/, '');
  return {
    version: String(version || '0.1.0'),
    notes: notes || `Alphonso ${version || '0.1.0'} release`,
    pub_date: new Date().toISOString(),
    platforms: {
      'windows-x86_64': {
        signature,
        url: `${cleanBase}/${fileName}`
      }
    }
  };
}

export function assetNameFromPath(path) {
  return String(path || '').split(/[\\/]/).pop();
}
