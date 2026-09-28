import { AGENT_ACTIONS, type AgentAction } from '../../../shared/types';
import { DEFAULT_SETTINGS, mergeSettings, type RepoOverride, type Settings } from '../settings';

const LABELS: Record<AgentAction, string> = { review: 'Review', continue: 'Continue work', 'address-comments': 'Address comments' };

function field(doc: Document, label: string, control: HTMLElement): HTMLLabelElement {
  const l = doc.createElement('label');
  l.append(label, control);
  return l;
}

export function addOverrideRow(root: HTMLElement, o: RepoOverride = { repo: '', action: 'review', template: '' }): void {
  const doc = root.ownerDocument;
  const row = doc.createElement('div');
  row.className = 'override';
  const repo = doc.createElement('input');
  repo.name = 'repo';
  repo.placeholder = 'owner/repo';
  repo.value = o.repo;
  const action = doc.createElement('select');
  action.name = 'action';
  for (const a of AGENT_ACTIONS) action.append(new Option(LABELS[a], a, false, a === o.action));
  const template = doc.createElement('textarea');
  template.name = 'template';
  template.rows = 2;
  template.value = o.template;
  const remove = doc.createElement('button');
  remove.type = 'button';
  remove.className = 'remove';
  remove.textContent = 'Supprimer';
  remove.addEventListener('click', () => row.remove());
  row.append(repo, action, template, remove);
  root.querySelector('.overrides')!.append(row);
}

export function renderOptions(root: HTMLElement, s: Settings): void {
  const doc = root.ownerDocument;
  root.replaceChildren();
  const agent = doc.createElement('input');
  agent.name = 'agent';
  agent.value = s.agent;
  root.append(field(doc, 'Agent (commande Orca --agent)', agent));

  const help = doc.createElement('p');
  help.textContent = 'Variables : {pr_url} {pr_number} {pr_title} {owner} {repo} {head_ref} {base_ref}';
  root.append(help);

  for (const a of AGENT_ACTIONS) {
    const t = doc.createElement('textarea');
    t.name = `template-${a}`;
    t.rows = 3;
    t.value = s.templates[a];
    root.append(field(doc, `Prompt « ${LABELS[a]} »`, t));
  }

  const title = doc.createElement('h2');
  title.textContent = 'Prompts par dépôt';
  const overrides = doc.createElement('div');
  overrides.className = 'overrides';
  const add = doc.createElement('button');
  add.type = 'button';
  add.className = 'add';
  add.textContent = 'Ajouter un dépôt';
  add.addEventListener('click', () => addOverrideRow(root));
  root.append(title, overrides, add);
  for (const o of s.overrides) addOverrideRow(root, o);
}

const AGENT_RE = /^[a-z0-9-]{1,40}$/; // same rule as the host (host/src/validate.ts)

/** Returns a French error message, or null when the settings can be saved. */
export function validateSettings(s: Settings): string | null {
  return AGENT_RE.test(s.agent) ? null : 'Agent invalide';
}

export function readForm(root: HTMLElement): Settings {
  const value = (sel: string) => root.querySelector<HTMLInputElement | HTMLTextAreaElement>(sel)?.value ?? '';
  const templates = {} as Record<AgentAction, string>;
  for (const a of AGENT_ACTIONS) {
    const t = value(`[name="template-${a}"]`);
    templates[a] = t.trim() ? t : DEFAULT_SETTINGS.templates[a];
  }
  const overrides: RepoOverride[] = [...root.querySelectorAll<HTMLElement>('.override')]
    .map((row) => ({
      repo: row.querySelector<HTMLInputElement>('[name="repo"]')!.value.trim(),
      action: row.querySelector<HTMLSelectElement>('[name="action"]')!.value as AgentAction,
      template: row.querySelector<HTMLTextAreaElement>('[name="template"]')!.value,
    }))
    .filter((o) => o.repo && o.template.trim());
  return mergeSettings({ agent: value('[name="agent"]'), templates, overrides });
}
