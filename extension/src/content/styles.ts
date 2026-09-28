const CSS = `
.gho-root { position: relative; display: inline-flex; flex-direction: column; margin: 0 8px 0 0; font-size: 12px; }
.gho-root.gho-floating { position: fixed; right: 16px; bottom: 16px; z-index: 100; }
.gho-group { display: inline-flex; }
.gho-group button, .gho-menu button, .gho-custom button {
  font: inherit; font-weight: 500; line-height: 20px; padding: 3px 12px; cursor: pointer;
  color: var(--button-default-fgColor-rest, #24292f);
  background: var(--button-default-bgColor-rest, #f6f8fa);
  border: 1px solid var(--button-default-borderColor-rest, rgba(31,35,40,.15));
}
.gho-main { border-radius: 6px 0 0 6px; }
.gho-toggle { border-radius: 0 6px 6px 0; border-left: 0 !important; padding: 3px 8px !important; }
.gho-group button:hover:not(:disabled) { background: var(--button-default-bgColor-hover, #f3f4f6); }
.gho-root button:disabled { opacity: .6; cursor: progress; }
.gho-menu {
  position: absolute; top: 100%; left: 0; z-index: 100; margin-top: 4px; min-width: 240px; padding: 4px;
  display: flex; flex-direction: column; gap: 2px;
  background: var(--overlay-bgColor, #fff); border: 1px solid var(--borderColor-default, #d0d7de);
  border-radius: 8px; box-shadow: var(--shadow-floating-small, 0 8px 24px rgba(140,149,159,.2));
}
.gho-menu[hidden] { display: none; }
.gho-menu > button { text-align: left; border: 0; background: transparent; border-radius: 6px; }
.gho-menu > button:hover { background: var(--bgColor-muted, #f6f8fa); }
.gho-custom { display: flex; flex-direction: column; gap: 4px; padding: 4px; border-top: 1px solid var(--borderColor-muted, #d8dee4); }
.gho-custom textarea { font: inherit; resize: vertical; padding: 4px; border-radius: 6px; border: 1px solid var(--borderColor-default, #d0d7de); background: var(--bgColor-default, #fff); color: inherit; }
.gho-custom button { align-self: flex-end; border-radius: 6px; }
.gho-status { margin-top: 4px; max-width: 360px; color: var(--fgColor-muted, #57606a); }
.gho-root[data-state="error"] .gho-status { color: var(--fgColor-danger, #d1242f); }
.gho-root[data-state="warning"] .gho-status { color: var(--fgColor-attention, #9a6700); }
`;

export function injectStyles(doc: Document): void {
  if (doc.getElementById('gho-styles')) return;
  const style = doc.createElement('style');
  style.id = 'gho-styles';
  style.textContent = CSS;
  doc.head.append(style);
}
