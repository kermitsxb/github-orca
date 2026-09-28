# GitHub → Orca

Adds a `[ Review in Orca | ▾ ]` button to GitHub pull requests. One click creates (or reuses) an Orca
workspace on the PR and starts an agent with a review prompt.

## Install (macOS, Chrome or Arc)

1. `npm install`
2. `npm run gen-key` (once; commits a stable extension ID; already done in this repo)
3. `./scripts/install.sh` (builds and registers the native host `com.stocki.github_orca`)
4. Browser → `chrome://extensions` (Arc: `arc://extensions`) → Developer mode → *Load unpacked* → `extension/`.
   The displayed ID must match `extension/extension-id.txt`.

Requirements: Orca running, the repo registered in Orca (`orca repo add --path <clone>`), `gh auth login` done.

## Actions

| Action | Effect |
|---|---|
| Review in Orca | worktree on the PR head, agent with the review prompt, status `in-review` |
| Checkout only | worktree on the PR head, no agent |
| Continue work | worktree on the PR branch (upstream set), agent, status `in-progress` (not for forks) |
| Address comments | worktree on the PR head, agent fixes review comments |
| Custom prompt… | your prompt |

A PR's workspace is recognised by the Orca comment `github-orca:<owner>/<repo>#<n>`: clicking again reuses it.
Prompts (global and per repo) are set in the extension options. Variables: `{pr_url} {pr_number} {pr_title} {owner} {repo} {head_ref} {base_ref}`.

## Troubleshooting

- “Host non installé” → run `./scripts/install.sh`, then reload the extension.
- “Host refusé” → the loaded extension ID differs from `extension/extension-id.txt`.
- Host log: `~/Library/Logs/github-orca/host.log`.
- Button misplaced after a GitHub redesign → update `ANCHOR_SELECTORS` in `extension/src/content/inject.ts`.

## Manual end-to-end checklist

- [ ] Button appears on a PR, once, and follows navigation PR → PR → issues list.
- [ ] Review on an open PR → Orca shows the new workspace, agent receives the prompt, board status In review.
- [ ] Review again → “(réutilisé)”, a new agent tab in the same workspace.
- [ ] Checkout only → workspace without agent; HEAD equals the PR head SHA.
- [ ] Continue work → upstream is `origin/<head_ref>`.
- [ ] Custom prompt → the agent receives the typed text.
- [ ] Merged PR → Review shows “PR mergée : seul Checkout only est possible”.
- [ ] Repo not in Orca → “n'est pas dans Orca”.
- [ ] Orca quit → it starts, then the workspace opens.
