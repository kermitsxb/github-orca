import { parsePrUrl, prKey, type PrRef } from '../pr-url';
import { parseRepoUrl, repoKey, type RepoRef } from '../repo-url';

/** Most specific first. GitHub changes its DOM often: adjust here only (see Task 10). */
export const ANCHOR_SELECTORS = [
  '.gh-header-actions',
  '[data-component="PH_Actions"]',
  '#partial-discussion-header h1',
  'main h1',
];

/** Repo header action list (Watch / Fork / Star). No h1 fallback: on a repo page it would be the README's. */
export const REPO_ANCHOR_SELECTORS = ['ul[data-testid="repo-header-actions"]', 'ul.pagehead-actions'];

/** The button the current page should carry: its identity, where it goes, how to build it. */
export interface ButtonTarget {
  key: string;
  anchors: readonly string[];
  /** Without an anchor: float the button (PR pages) or wait for the anchor to render (repo pages). */
  floating: boolean;
  create(): HTMLElement;
}

export function resolveTarget(
  url: string,
  factories: { pr: (pr: PrRef) => HTMLElement; repo: (repo: RepoRef) => HTMLElement },
): ButtonTarget | null {
  const pr = parsePrUrl(url);
  if (pr) return { key: prKey(pr), anchors: ANCHOR_SELECTORS, floating: true, create: () => factories.pr(pr) };
  const repo = parseRepoUrl(url);
  if (repo) return { key: repoKey(repo), anchors: REPO_ANCHOR_SELECTORS, floating: false, create: () => factories.repo(repo) };
  return null;
}

function findAnchor(doc: Document, selectors: readonly string[]): Element | null {
  for (const sel of selectors) {
    const found = doc.querySelector(sel);
    if (found) return found;
  }
  return null;
}

/**
 * Keeps exactly one button, owned by this content-script instance, bound to the current page.
 * After an extension reload the old script stays in the page with a dead runtime: its button
 * (other or no `data-gho-instance`) is replaced rather than kept.
 */
export function syncButton(doc: Document, target: ButtonTarget | null, instanceId: string): void {
  const anchor = target ? findAnchor(doc, target.anchors) : null;
  const isCurrent = (el: HTMLElement) =>
    el.dataset.githubOrca === target?.key &&
    el.dataset.ghoInstance === instanceId &&
    !(el.classList.contains('gho-floating') && anchor);

  const existing = [...doc.querySelectorAll<HTMLElement>('[data-github-orca]')];
  const kept = existing.find(isCurrent);
  for (const el of existing) if (el !== kept) el.remove();
  if (kept || !target || (!anchor && !target.floating)) return;

  const button = target.create();
  button.dataset.ghoInstance = instanceId;
  if (!anchor) {
    button.classList.add('gho-floating');
    doc.body.append(button);
  } else if (anchor.tagName === 'H1') {
    anchor.insertAdjacentElement('afterend', button);
  } else {
    anchor.prepend(button);
  }
}
