import type { AgentAction, PrMeta } from './types';

export const DEFAULT_TEMPLATES: Record<AgentAction, string> = {
  review:
    'Review the pull request {pr_url} (#{pr_number} "{pr_title}", {head_ref} → {base_ref}). Summarise the changes, then list bugs, risks and suggestions.',
  continue:
    'Continue work on pull request {pr_url} on branch {head_ref}. Read the PR description and existing commits first. Push with `git push origin HEAD:{head_ref}`.',
  'address-comments':
    'Address the review comments on pull request {pr_url}. Use gh to read them, fix each one, and summarise what changed.',
};

export interface TemplateVars {
  pr_url: string;
  pr_number: string;
  pr_title: string;
  owner: string;
  repo: string;
  head_ref: string;
  base_ref: string;
}

export function varsFromPr(owner: string, repo: string, pr: PrMeta): TemplateVars {
  return {
    pr_url: pr.url,
    pr_number: String(pr.number),
    pr_title: pr.title,
    owner,
    repo,
    head_ref: pr.headRefName,
    base_ref: pr.baseRefName,
  };
}

export function interpolate(template: string, vars: TemplateVars): string {
  return template.replace(/\{([a-z_]+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key as keyof TemplateVars] : match,
  );
}
