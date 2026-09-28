import { parsePrUrl, prKey, type PrRef } from '../pr-url';

/** Most specific first. GitHub changes its DOM often: adjust here only (see Task 10). */
export const ANCHOR_SELECTORS = [
  '.gh-header-actions',
  '[data-component="PH_Actions"]',
  '#partial-discussion-header h1',
  'main h1',
];

function findAnchor(doc: Document): Element | null {
  for (const sel of ANCHOR_SELECTORS) {
    const found = doc.querySelector(sel);
    if (found) return found;
  }
  return null;
}

export function syncButton(doc: Document, url: string, factory: (pr: PrRef) => HTMLElement): void {
  const pr = parsePrUrl(url);
  const key = pr ? prKey(pr) : null;
  const existing = doc.querySelector<HTMLElement>('[data-github-orca]');
  const anchor = pr ? findAnchor(doc) : null;

  if (existing && existing.dataset.githubOrca === key && !(existing.classList.contains('gho-floating') && anchor)) return;
  existing?.remove();
  if (!pr) return;

  const button = factory(pr);
  if (!anchor) {
    button.classList.add('gho-floating');
    doc.body.append(button);
  } else if (anchor.tagName === 'H1') {
    anchor.insertAdjacentElement('afterend', button);
  } else {
    anchor.prepend(button);
  }
}
