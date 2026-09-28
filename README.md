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
| Address comments | same workspace as Continue work (PR branch, upstream set), agent fixes review comments and pushes, status `in-progress` (not for forks) |
| Custom prompt… | your prompt |

A PR's workspace is recognised by the Orca comment `github-orca:<owner>/<repo>#<n>` (suffix `:branch` for
Continue work / Address comments, whose workspace is named `PR #<n> (branch) <title>`): clicking again reuses it.
On reuse the workspace is fetched and fast-forwarded to the current PR head first; if that is refused
(local changes, diverged history) the agent still starts and the button shows a ⚠️ warning.
Prompts (global and per repo) are set in the extension options. Variables: `{pr_url} {pr_number} {pr_title} {owner} {repo} {head_ref} {base_ref}`.

## Sécurité

Review / Checkout / Custom run an agent — and, for PRs from the same repo, the repo's Orca setup hooks —
inside the PR's code. Fork PRs are created with `--setup skip` (no setup hooks). Only use the button on PRs
whose code you are willing to run.

## Troubleshooting

- “Host non installé” → run `./scripts/install.sh`, then reload the extension.
- “Host refusé” → the loaded extension ID differs from `extension/extension-id.txt`.
- Host log: `~/Library/Logs/github-orca/host.log`.
- “Le host natif s'est arrêté” → read the host log, or re-run `./scripts/install.sh`.
- `git fetch` fails with a credentials error → the host is started by the browser and does not inherit
  variables exported only in `.zshrc` (e.g. `SSH_AUTH_SOCK`); git also runs with `GIT_TERMINAL_PROMPT=0`.
  Use an https remote (with `gh auth setup-git`) or an ssh-agent available to launchd.
- Button misplaced after a GitHub redesign → update `ANCHOR_SELECTORS` in `extension/src/content/inject.ts`.

## Manual end-to-end checklist

- [ ] Button appears on a PR, once, and follows navigation PR → PR → issues list.
- [ ] Review on an open PR → Orca shows the new workspace, agent receives the prompt, board status In review.
- [ ] Review again → “(réutilisé)”, a new agent tab in the same workspace.
- [ ] Checkout only → workspace without agent; HEAD equals the PR head SHA.
- [ ] Continue work → upstream is `origin/<head_ref>`.
- [ ] Custom prompt → the agent receives the typed text.
- [ ] Multi-line Custom prompt on a reused workspace → sent as one prompt.
- [ ] Orca comes to the front on Review (`--activate` / `--focus`).
- [ ] Continue work on a PR that already has a Review workspace → a second, separate workspace.
- [ ] Address comments after Continue work → reuses the `(branch)` workspace; the agent can push.
- [ ] Review again after a new commit on the PR → the reused workspace is fast-forwarded; with local changes → ⚠️ warning, agent still starts.
- [ ] Remove a Review workspace in Orca (`orca worktree rm`), click Review again → a new workspace at the current PR head (Orca keeps the old branch: check what it does).
- [ ] Merged PR → Review shows “PR mergée : seul Checkout only est possible”.
- [ ] Repo not in Orca → “n'est pas dans Orca”.
- [ ] Orca quit → it starts, then the workspace opens.
