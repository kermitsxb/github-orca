import { prKey } from '../pr-url';
import { repoKey } from '../repo-url';
import { createCloneButton, createOrcaButton } from './button';
import { resolveTarget, syncButton } from './inject';
import { createCloneSender, createSender } from './send';
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
    const runtime = () => globalThis.chrome?.runtime;
    const target = resolveTarget(location.href, {
      pr: (pr) => createOrcaButton(prKey(pr), createSender(runtime, pr)),
      repo: (repo) => createCloneButton(repoKey(repo), createCloneSender(runtime, repo)),
    });
    syncButton(document, target, instanceId);
  });
}

observer.observe(document.body, { childList: true, subtree: true });
document.addEventListener('turbo:load', schedule);
window.addEventListener('popstate', schedule);
schedule();
