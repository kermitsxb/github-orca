const CSS = `
.gho-root { position: relative; display: inline-flex; align-items: center; font-size: 14px; }
.gho-root.gho-floating { position: fixed; right: 16px; bottom: 16px; z-index: 100; }
.gho-group { display: inline-flex; }
.gho-clone { list-style: none; }
.gho-single { height: 28px; padding: 0 12px; line-height: 26px; border-radius: 6px; }
.gho-single:hover:not(:disabled) { background: var(--button-default-bgColor-hover, #f3f4f6); }
.gho-single, .gho-group button, .gho-menu button, .gho-custom button {
  font: inherit; font-weight: 500; cursor: pointer; white-space: nowrap;
  color: var(--button-default-fgColor-rest, #24292f);
  background: var(--button-default-bgColor-rest, #f6f8fa);
  border: 1px solid var(--button-default-borderColor-rest, rgba(31,35,40,.15));
}
.gho-group button { height: 32px; padding: 0 12px; line-height: 30px; }
.gho-main { border-radius: 6px 0 0 6px; }
.gho-toggle { border-radius: 0 6px 6px 0; border-left: 0 !important; padding: 0 8px !important; }
.gho-group button:hover:not(:disabled) { background: var(--button-default-bgColor-hover, #f3f4f6); }
.gho-root button:disabled { opacity: .6; cursor: progress; }
.gho-menu {
  position: absolute; top: 100%; right: 0; z-index: 100; margin-top: 4px; min-width: 260px; padding: 4px;
  display: flex; flex-direction: column; gap: 2px;
  background: var(--overlay-bgColor, #fff); border: 1px solid var(--borderColor-default, #d0d7de);
  border-radius: 8px; box-shadow: var(--shadow-floating-small, 0 8px 24px rgba(140,149,159,.2));
}
.gho-menu[hidden] { display: none; }
.gho-menu > button { text-align: left; border: 0; background: transparent; border-radius: 6px; padding: 6px 8px; line-height: 20px; }
.gho-menu > button:hover { background: var(--control-transparent-bgColor-hover, var(--bgColor-muted, #f6f8fa)); }
.gho-custom { display: flex; flex-direction: column; gap: 4px; padding: 4px; border-top: 1px solid var(--borderColor-muted, #d8dee4); }
.gho-custom textarea { font: inherit; resize: vertical; padding: 4px 8px; border-radius: 6px; border: 1px solid var(--borderColor-default, #d0d7de); background: var(--bgColor-default, #fff); color: inherit; }
.gho-custom button { align-self: flex-end; border-radius: 6px; padding: 3px 12px; line-height: 20px; }
.gho-toast {
  position: fixed; left: 16px; bottom: 16px; z-index: 1000; max-width: min(480px, calc(100vw - 32px));
  display: flex; align-items: flex-start; gap: 12px; padding: 12px 12px 12px 16px; font-size: 14px; line-height: 20px;
  color: var(--fgColor-default, #1f2328); background: var(--overlay-bgColor, #fff);
  border: 1px solid var(--borderColor-default, #d0d7de); border-left: 4px solid var(--borderColor-accent-emphasis, #0969da);
  border-radius: 8px; box-shadow: var(--shadow-floating-medium, 0 8px 24px rgba(140,149,159,.2));
}
.gho-toast[hidden] { display: none; }
.gho-toast[data-state="ok"] { border-left-color: var(--borderColor-success-emphasis, #1a7f37); }
.gho-toast[data-state="warning"] { border-left-color: var(--borderColor-attention-emphasis, #9a6700); }
.gho-toast[data-state="error"] { border-left-color: var(--borderColor-danger-emphasis, #cf222e); }
.gho-toast-text { flex: 1; overflow-wrap: anywhere; }
.gho-toast-close {
  flex: none; width: 20px; height: 20px; padding: 0; border: 0; border-radius: 4px; cursor: pointer;
  font-size: 16px; line-height: 20px; color: var(--fgColor-muted, #59636e); background: transparent;
}
.gho-toast-close:hover { background: var(--control-transparent-bgColor-hover, rgba(208,215,222,.32)); }
`;

export function injectStyles(doc: Document): void {
  // Always (re)write the CSS: after an extension reload the page may still hold an older version.
  let style = doc.getElementById('gho-styles');
  if (!style) {
    style = doc.createElement('style');
    style.id = 'gho-styles';
    doc.head.append(style);
  }
  style.textContent = CSS;
}
