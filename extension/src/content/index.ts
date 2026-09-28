import { prKey } from '../pr-url';
import { createOrcaButton } from './button';
import { syncButton } from './inject';
import { createSender } from './send';
import { injectStyles } from './styles';

injectStyles(document);

const instanceId = crypto.randomUUID();

const observer = new MutationObserver(schedule);
let scheduled = false;

/** After an extension reload this script is orphaned (runtime id gone): stop, the new instance owns the page. */
function stop(): void {
  observer.disconnect();
  document.removeEventListener('turbo:load', schedule);
  window.removeEventListener('popstate', schedule);
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    if (!globalThis.chrome?.runtime?.id) return stop();
    syncButton(
      document,
      location.href,
      (pr) => createOrcaButton(prKey(pr), createSender(() => globalThis.chrome?.runtime, pr)),
      instanceId,
    );
  });
}

observer.observe(document.body, { childList: true, subtree: true });
document.addEventListener('turbo:load', schedule);
window.addEventListener('popstate', schedule);
schedule();
