import { DEFAULT_TEMPLATES } from '../../shared/templates';
import { AGENT_ACTIONS, type Action, type AgentAction } from '../../shared/types';

export const SETTINGS_KEY = 'settings';

export interface RepoOverride {
  repo: string;
  action: AgentAction;
  template: string;
}

export interface Settings {
  agent: string;
  /** Parent folder for "Clone in Orca" (absolute or `~/…`, expanded by the host). */
  cloneDir: string;
  templates: Record<AgentAction, string>;
  overrides: RepoOverride[];
}

export const DEFAULT_SETTINGS: Settings = { agent: 'claude', cloneDir: '~/orca-projects', templates: { ...DEFAULT_TEMPLATES }, overrides: [] };

function isOverride(v: unknown): v is RepoOverride {
  const o = v as RepoOverride;
  return (
    typeof o === 'object' && o !== null &&
    typeof o.repo === 'string' && typeof o.template === 'string' &&
    AGENT_ACTIONS.includes(o.action)
  );
}

export function mergeSettings(stored: unknown): Settings {
  const s = (typeof stored === 'object' && stored !== null ? stored : {}) as Partial<Settings>;
  return {
    agent: typeof s.agent === 'string' && s.agent.trim() ? s.agent.trim() : DEFAULT_SETTINGS.agent,
    cloneDir: typeof s.cloneDir === 'string' && s.cloneDir.trim() ? s.cloneDir.trim() : DEFAULT_SETTINGS.cloneDir,
    templates: { ...DEFAULT_SETTINGS.templates, ...(s.templates ?? {}) },
    overrides: Array.isArray(s.overrides) ? s.overrides.filter(isOverride) : [],
  };
}

export function resolveTemplate(s: Settings, action: Action, owner: string, repo: string, customPrompt?: string): string | undefined {
  if (action === 'checkout') return undefined;
  if (action === 'custom') return customPrompt?.trim() || undefined;
  const key = `${owner}/${repo}`.toLowerCase();
  const override = s.overrides.find((o) => o.repo.trim().toLowerCase() === key && o.action === action && o.template.trim());
  return override ? override.template : s.templates[action];
}
