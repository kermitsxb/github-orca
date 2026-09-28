export interface PrRef {
  owner: string;
  repo: string;
  prNumber: number;
}

const PR_URL = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/(\d+)(?:[/?#]|$)/;

export function parsePrUrl(url: string): PrRef | null {
  const m = PR_URL.exec(url);
  return m ? { owner: m[1], repo: m[2], prNumber: Number(m[3]) } : null;
}

export function prKey(pr: PrRef): string {
  return `${pr.owner}/${pr.repo}#${pr.prNumber}`;
}
