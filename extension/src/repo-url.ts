export interface RepoRef {
  owner: string;
  repo: string;
}

/** Repo home and code views only (`/tree/…`, `/blob/…`): PR pages have their own button. */
const REPO_URL = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\/(?:tree|blob)\/[^?#]*)?\/?(?:[?#]|$)/;

/** First path segments that are GitHub pages, not users or organizations. */
const RESERVED_OWNERS = new Set([
  'about', 'account', 'apps', 'codespaces', 'collections', 'copilot', 'customer-stories', 'dashboard', 'enterprise',
  'enterprises', 'explore', 'features', 'issues', 'login', 'marketplace', 'new', 'notifications', 'organizations',
  'orgs', 'pricing', 'pulls', 'search', 'security', 'settings', 'sponsors', 'stars', 'topics', 'trending', 'users',
]);

export function parseRepoUrl(url: string): RepoRef | null {
  const m = REPO_URL.exec(url);
  if (!m || RESERVED_OWNERS.has(m[1].toLowerCase())) return null;
  return { owner: m[1], repo: m[2] };
}

export function repoKey(r: RepoRef): string {
  return `${r.owner}/${r.repo}`;
}
