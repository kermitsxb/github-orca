# GitHub → Orca

Adds two buttons to GitHub:

- on a pull request, `[ Review in Orca | ▾ ]`: one click creates (or reuses) an Orca workspace on the PR and
  starts an agent with a review prompt;
- on a repository page, `Clone in Orca`: one click clones the repo and registers it in Orca.

## Install (macOS, Chrome or Arc)

1. `npm install`
2. `npm run gen-key` (once; commits a stable extension ID; already done in this repo)
3. `./scripts/install.sh` (builds and registers the native host `com.stocki.github_orca`)
4. Browser → `chrome://extensions` (Arc: `arc://extensions`) → Developer mode → *Load unpacked* → `extension/`.
   The displayed ID must match `extension/extension-id.txt`.

## Install (macOS, Firefox 128+)

1. `npm install`, then launch Firefox once (it creates the Mozilla native messaging directory) and run
   `./scripts/install.sh` (it registers the host for Chrome, Arc and Firefox, whichever are present).
2. Get AMO API keys (addons.mozilla.org → Developer Hub → Manage API Keys), then
   `WEB_EXT_API_KEY=… WEB_EXT_API_SECRET=… npm run sign:firefox` → the signed `.xpi` lands in `web-ext-artifacts/`.
3. Firefox → `about:addons` → gear → *Install Add-on From File…* → the `.xpi`.
4. Re-signing needs a new `version` in `extension/manifest.json` (AMO rejects an already-signed version).
5. Development: `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on…* →
   `extension-firefox/manifest.json` (gone on restart).

The Firefox extension ID is stored in `extension/firefox-id.txt`. Options: `about:addons` → GitHub → Orca → *Preferences*.
Troubleshooting messages are the same as on Chrome.

Requirements: Orca installed (it is started if needed), `gh auth login` done, and for PR actions the repo
registered in Orca — either with `Clone in Orca` on its page, or `orca repo add --path <existing clone>`.

## Releases

Releases are cut by [release-please](https://github.com/googleapis/release-please) from the Conventional Commits on
`main`: it keeps a release PR open (version bump in `package.json` and `extension/manifest.json`, `CHANGELOG.md`).
Merging that PR tags `vX.Y.Z` and creates the GitHub Release, to which the workflow (`.github/workflows/release.yml`)
attaches:

- `github-orca-chrome-X.Y.Z.zip`: unzip, then *Load unpacked* in Chrome/Arc (same extension ID as a local build);
- `github-orca-firefox-X.Y.Z.xpi`: signed by AMO (unlisted), install it from `about:addons`.

The native host is not part of a release: clone the repo and run `./scripts/install.sh` either way.
Signing needs the `WEB_EXT_API_KEY` / `WEB_EXT_API_SECRET` repository secrets; if it fails, re-run the failed job.

## Pull request page

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

## Repository page

`Clone in Orca` sits before Watch / Fork / Star on the repo home and its `tree/…` / `blob/…` views (not on
issues, actions, settings…). It runs `orca project setup-clone` with the SSH URL
`git@github.com:<owner>/<repo>.git` into `<clone folder>/<repo>`, then Orca lists the project.
If the repo is already in Orca, nothing is cloned and the toast shows its path (“is already in Orca”).

## Options

Extension options (`chrome://extensions` → GitHub → Orca → *Details* → *Extension options*; Firefox: see above):

- **Agent**: the `--agent` command passed to Orca (`claude` by default).
- **Clone folder**: parent folder for `Clone in Orca`, absolute or `~/…` (default `~/orca-projects`,
  created if missing).
- **Prompts**, global and per repo. Variables: `{pr_url} {pr_number} {pr_title} {owner} {repo} {head_ref} {base_ref}`.

## Security

Review / Checkout / Custom run an agent — and, for PRs from the same repo, the repo's Orca setup hooks —
inside the PR's code. Fork PRs are created with `--setup skip` (no setup hooks). Only use the button on PRs
whose code you are willing to run.

Clone in Orca only clones and registers the repo: it creates no worktree and starts no agent.

## Troubleshooting

- “Host not installed” → run `./scripts/install.sh`, then reload the extension.
- “Host refused” → the loaded extension ID differs from `extension/extension-id.txt`.
- Button missing in Firefox → `about:addons` → GitHub → Orca → *Permissions* → “Access your data for github.com” must be allowed.
- Host log: `~/Library/Logs/github-orca/host.log`.
- “The native host stopped” → read the host log, or re-run `./scripts/install.sh`.
- `git fetch` fails with a credentials error → the host is started by the browser and does not inherit
  variables exported only in `.zshrc` (e.g. `SSH_AUTH_SOCK`); git also runs with `GIT_TERMINAL_PROMPT=0`.
  Use an https remote (with `gh auth setup-git`) or an ssh-agent available to launchd.
- Clone fails with `Permission denied (publickey)` → the clone runs in Orca, over SSH: Orca needs an SSH key
  loaded in the agent (`ssh-add`) and accepted by GitHub.
- Clone fails because `<clone folder>/<repo>` already exists → register that folder with
  `orca repo add --path <folder>`, or pick another clone folder in the options.
- Button misplaced after a GitHub redesign → update `ANCHOR_SELECTORS` (PR) or `REPO_ANCHOR_SELECTORS` (repo page) in `extension/src/content/inject.ts`.

## Manual end-to-end checklist

- [ ] Button appears on a PR, once, and follows navigation PR → PR → issues list.
- [ ] Review on an open PR → Orca shows the new workspace, agent receives the prompt, board status In review.
- [ ] Review again → “(reused)”, a new agent tab in the same workspace.
- [ ] Checkout only → workspace without agent; HEAD equals the PR head SHA.
- [ ] Continue work → upstream is `origin/<head_ref>`.
- [ ] Custom prompt → the agent receives the typed text.
- [ ] Multi-line Custom prompt on a reused workspace → sent as one prompt.
- [ ] Orca comes to the front on Review (`--activate` / `--focus`).
- [ ] Continue work on a PR that already has a Review workspace → a second, separate workspace.
- [ ] Address comments after Continue work → reuses the `(branch)` workspace; the agent can push.
- [ ] Review again after a new commit on the PR → the reused workspace is fast-forwarded; with local changes → ⚠️ warning, agent still starts.
- [ ] Remove a Review workspace in Orca (`orca worktree rm`), click Review again → a new workspace at the current PR head (Orca keeps the old branch: check what it does).
- [ ] Merged PR → Review shows “PR merged: only Checkout only is available”.
- [ ] Repo not in Orca → “is not in Orca”.
- [ ] Orca quit → it starts, then the workspace opens.
- [ ] Repo page (home, `tree/`, `blob/`) → one `Clone in Orca` button before Watch/Fork/Star; none on issues, actions, settings.
- [ ] Clone in Orca on a repo not in Orca → cloned into `~/orca-projects/<repo>` (folder created), project visible in Orca.
- [ ] Clone in Orca again → “is already in Orca”, nothing cloned.

## License

MIT — see [LICENSE](LICENSE).
