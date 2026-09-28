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

/**
 * Keeps exactly one button, owned by this content-script instance, bound to the current PR.
 * After an extension reload the old script stays in the page with a dead runtime: its button
 * (other or no `data-gho-instance`) is replaced rather than kept.
 */
export function syncButton(doc: Document, url: string, factory: (pr: PrRef) => HTMLElement, instanceId: string): void {
  const pr = parsePrUrl(url);
  const key = pr ? prKey(pr) : null;
  const anchor = pr ? findAnchor(doc) : null;
  const isCurrent = (el: HTMLElement) =>
    el.dataset.githubOrca === key &&
    el.dataset.ghoInstance === instanceId &&
    !(el.classList.contains('gho-floating') && anchor);

  const existing = [...doc.querySelectorAll<HTMLElement>('[data-github-orca]')];
  const kept = existing.find(isCurrent);
  for (const el of existing) if (el !== kept) el.remove();
  if (kept || !pr) return;

  const button = factory(pr);
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
