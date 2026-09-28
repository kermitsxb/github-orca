import type { HostResponse } from '../../../shared/types';
import type { RunActionMessage } from '../background/logic';
import { prKey } from '../pr-url';
import { createOrcaButton } from './button';
import { syncButton } from './inject';
import { injectStyles } from './styles';

injectStyles(document);

let scheduled = false;
function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    syncButton(document, location.href, (pr) =>
      createOrcaButton(prKey(pr), (action, customPrompt) => {
        const msg: RunActionMessage = { type: 'run-action', action, ...pr, customPrompt };
        return chrome.runtime.sendMessage(msg) as Promise<HostResponse>;
      }),
    );
  });
}

new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
document.addEventListener('turbo:load', schedule);
window.addEventListener('popstate', schedule);
schedule();
