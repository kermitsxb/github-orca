// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { injectStyles } from './styles';

describe('injectStyles', () => {
  it('adds one style element', () => {
    injectStyles(document);
    injectStyles(document);
    expect(document.querySelectorAll('#gho-styles')).toHaveLength(1);
    expect(document.getElementById('gho-styles')!.textContent).toContain('.gho-toast');
  });

  it('replaces the CSS left by an older version of the extension', () => {
    const stale = '.gho-root { display: inline-flex; flex-direction: column; } /* old version */';
    document.getElementById('gho-styles')!.textContent = stale;
    injectStyles(document);
    expect(document.getElementById('gho-styles')!.textContent).not.toContain('/* old version */');
    expect(document.getElementById('gho-styles')!.textContent).toContain('.gho-toast');
  });
});
