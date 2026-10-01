# GitHub → Orca

Adds two buttons to GitHub:

- on a pull request, `[ Review in Orca | ▾ ]`: one click creates (or reuses) an Orca workspace on the PR and
  starts an agent with a review prompt;
- on a repository page, `Clone in Orca`: one click clones the repo and registers it in Orca.

## Requirements

- Orca installed (it is started if needed), with its **shell command** enabled
  (Orca → Settings → enable the shell command): `orca` on macOS, `orca-ide` on Linux, `orca.cmd` on Windows.
  On Linux, `orca` is usually the GNOME screen reader: the host never runs it.
- Node.js, `git`, and the GitHub CLI with `gh auth login` done.
- For PR actions, the repo registered in Orca — either with `Clone in Orca` on its page, or
  `orca repo add --path <existing clone>`.

The installer pins the absolute paths of `node`, the Orca launcher, `gh` and `git` into the host wrapper (browsers
start the host without your shell `PATH`): re-run it after moving any of them.

## Install

Every OS: `npm install`, then the installer (it builds, writes the host wrapper and registers the native host
`com.stocki.github_orca` for the supported browsers: on macOS and Linux, those launched at least once), then load
the extension:

- Chrome-family browsers: `chrome://extensions` (Arc: `arc://extensions`, Edge: `edge://extensions`,
  Brave: `brave://extensions`) → Developer mode → *Load unpacked* → `extension/`.
  The displayed ID must match `extension/extension-id.txt` (`npm run gen-key` created it once; already done here).
- Firefox 140+: see [Firefox](#firefox) below.

### macOS (Chrome, Arc, Firefox)

```bash
npm install
./scripts/install.sh
```

Launch each browser once before installing: the host is registered only for browsers whose profile folder exists.

### Linux (Chrome, Chromium, Brave, Edge, Firefox)

```bash
npm install
./scripts/install.sh
```

The host is registered under `${XDG_CONFIG_HOME:-~/.config}` for Google Chrome (and Beta), Chromium, Brave and
Edge, and in `~/.mozilla/native-messaging-hosts` for Firefox, for each browser launched at least once.

Sandboxed browsers (snap, flatpak) usually cannot start native messaging hosts: the installer warns when it finds
one. Use a deb/rpm/tarball build of the browser if the buttons report “Host not installed”.

### Windows (Chrome, Edge, Brave, Firefox)

```powershell
npm install
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

It writes `host\dist\github-orca-host.bat` and the manifests next to it, and registers them under
`HKCU\Software\…\NativeMessagingHosts` for Chrome, Edge, Brave and Firefox (no admin rights needed).
`cmd.exe` runs the wrapper, so the repository, Node, Orca, `gh` and `git` paths must contain only characters of
the console (OEM) code page: the installer stops and lists the offending paths otherwise.

### Firefox

1. Launch Firefox once (it creates the Mozilla native messaging folder), then run the installer for your OS.
2. Get AMO API keys (addons.mozilla.org → Developer Hub → Manage API Keys), then
   `WEB_EXT_API_KEY=… WEB_EXT_API_SECRET=… npm run sign:firefox` (PowerShell:
   `$env:WEB_EXT_API_KEY='…'; $env:WEB_EXT_API_SECRET='…'; npm run sign:firefox`) → the signed `.xpi` lands in
   `web-ext-artifacts/` (or take the `.xpi` attached to a [release](#releases)).
3. Firefox → `about:addons` → gear → *Install Add-on From File…* → the `.xpi`.
4. Signing the same version again downloads its existing signed XPI (or waits for its pending approval).
   Changed extension code needs a new `version`, managed by release-please; AMO versions are immutable.
5. Development: `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on…* →
   `extension-firefox/manifest.json` (gone on restart).

The Firefox extension ID is stored in `extension/firefox-id.txt`. Options: `about:addons` → GitHub → Orca → *Preferences*.
Troubleshooting messages are the same as on Chrome.

## Releases

Releases are cut by [release-please](https://github.com/googleapis/release-please) from the Conventional Commits on
`main`: it keeps a release PR open (version bump in `package.json` and `extension/manifest.json`, `CHANGELOG.md`).
Merging that PR tags `vX.Y.Z` and creates the GitHub Release, to which the workflow (`.github/workflows/release.yml`)
attaches:

- `github-orca-chrome-X.Y.Z.zip`: unzip, then *Load unpacked* in a Chrome-family browser (same extension ID as a
  local build);
- `github-orca-firefox-X.Y.Z.xpi`: signed by AMO (unlisted), install it from `about:addons`.

The native host is not part of a release: clone the repo and run the installer for your OS either way.
Signing needs the `WEB_EXT_API_KEY` / `WEB_EXT_API_SECRET` repository secrets; if it fails, re-run the failed job.
The release is created only after the build passes. Retries recover the XPI from AMO if that version was already
submitted, including after an approval timeout or a failed download/upload.

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

A new PR workspace's local branch is named after the PR's branch (`<head_ref>`). Git allows a branch in one
worktree only, so when that name is taken (checked out in your clone or in the PR's other workspace, a fork
branch named like a local one, a leftover branch) the workspace keeps Orca's branch name and the button shows a
⚠️ warning.

## Repository page

`Clone in Orca` sits before Watch / Fork / Star on the repo home and its `tree/…` / `blob/…` views (not on
issues, actions, settings…). It runs `orca project setup-clone` with the SSH URL
`git@github.com:<owner>/<repo>.git` into `<clone folder>/<repo>`, then Orca lists the project.
If the repo is already in Orca, nothing is cloned and the toast shows its path (“is already in Orca”).

## Options

Extension options (`chrome://extensions` → GitHub → Orca → *Details* → *Extension options*; Firefox: see above):

- **Agent**: the `--agent` command passed to Orca (`claude` by default).
- **Clone folder**: parent folder for `Clone in Orca`, absolute or `~/…` (default `~/orca-projects`,
  created if missing). On Windows: `C:\…` or `~\…`.
- **Prompts**, global and per repo. Variables: `{pr_url} {pr_number} {pr_title} {owner} {repo} {head_ref} {base_ref}`.

## Security

Review / Checkout / Custom run an agent — and, for PRs from the same repo, the repo's Orca setup hooks —
inside the PR's code. Fork PRs are created with `--setup skip` (no setup hooks). Only use the button on PRs
whose code you are willing to run.

Clone in Orca only clones and registers the repo: it creates no worktree and starts no agent.

## Troubleshooting

- “Host not installed” → run the installer (`./scripts/install.sh`, Windows: `scripts\install.ps1`), then reload
  the extension. On Linux, check the browser is not a snap/flatpak.
- “Host refused” → the loaded extension ID differs from `extension/extension-id.txt`.
- Button missing in Firefox → `about:addons` → GitHub → Orca → *Permissions* → “Access your data for github.com” must be allowed.
- Host log:
  - macOS: `~/Library/Logs/github-orca/host.log`;
  - Linux: `$XDG_STATE_HOME/github-orca/host.log` (default `~/.local/state/github-orca/host.log`);
  - Windows: `%LOCALAPPDATA%\github-orca\logs\host.log`.
- “The native host stopped” → read the host log, or re-run the installer.
- `Not found in PATH: orca-ide` / `orca.cmd` / `orca` from the installer, or Orca errors in the host log → enable
  Orca's shell command (Orca → Settings), then re-run the installer.
- `git fetch` fails with a credentials error → the host is started by the browser and does not inherit variables
  exported only in your shell profile (e.g. `SSH_AUTH_SOCK` in `.zshrc` / `.bashrc`); git also runs with
  `GIT_TERMINAL_PROMPT=0`. Use an https remote (with `gh auth setup-git`), or an ssh-agent the browser can see:
  available to launchd on macOS, started with your desktop session on Linux (e.g. GNOME Keyring or a systemd user
  service), the *OpenSSH Authentication Agent* service on Windows.
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
- [ ] Review on a PR whose branch is not checked out locally → the workspace's branch is `<head_ref>`.
- [ ] Review on a PR whose branch is checked out in your clone → ⚠️ “Local branch kept as …”, the agent still starts.
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
- [ ] Orca not running → Review on Linux/Windows → Orca starts and the agent runs.
- [ ] Repo page (home, `tree/`, `blob/`) → one `Clone in Orca` button before Watch/Fork/Star; none on issues, actions, settings.
- [ ] Clone in Orca on a repo not in Orca → cloned into `~/orca-projects/<repo>` (folder created), project visible in Orca.
- [ ] Clone in Orca again → “is already in Orca”, nothing cloned.

## License

MIT — see [LICENSE](LICENSE).
