# AGENTS.md

Guidance for coding agents working in this repo. User-facing docs: [README.md](README.md).

## What this is

A Chrome/Arc/Firefox MV3 extension plus a macOS native messaging host. The extension adds buttons to github.com
(`Review in Orca` on PRs, `Clone in Orca` on repo pages); the host receives one JSON request per click and drives
the `orca`, `git` and `gh` CLIs.

```
content script ──chrome.runtime.sendMessage──▶ service worker ──connectNative (one port per request)──▶ host
(button, toast)     run-action / clone-repo      (settings, dedup)          HostMessage / HostResponse      (orca, git, gh)
```

## Layout

- `shared/`: types shared by both sides (`HostMessage` = PR `HostRequest` | `CloneRequest`, `HostResponse`,
  `ErrorCode`) and prompt templates.
- `host/src/`
  - `main.ts`: reads one native frame, `parseRequest` → `handleRequest`, writes one frame.
    stdout is reserved for the frame: log with `log()` (`~/Library/Logs/github-orca/host.log`).
  - `validate.ts`: validates and normalizes every request (the host trusts nothing from the extension).
  - `handler.ts`: orchestration (PR workspaces create/reuse, clone), pure over the `ports.ts` interfaces.
  - `orca.ts`, `git.ts`, `gh.ts`: CLI adapters; `exec.ts` is the `execFile` runner.
- `extension/src/`
  - `content/`: `index.ts` (glue: MutationObserver, Turbo navigation), `inject.ts` (which button, where),
    `button.ts` (DOM + toast), `send.ts` (messages to the worker), `styles.ts`.
  - `background/`: `logic.ts` (testable: request building, in-flight dedup, port handling), `index.ts` (glue).
  - `options/`, `settings.ts`: options page and stored settings (`chrome.storage.sync`).
  - `pr-url.ts`, `repo-url.ts`: URL parsing that decides which page gets which button.
- `scripts/install.sh`: builds and registers the host for Chrome, Arc and Firefox (pins absolute tool paths).
- `scripts/firefox-manifest.mjs`: derives the Firefox manifest from `extension/manifest.json`; the Gecko ID is in
  `extension/firefox-id.txt`. `extension-firefox/` is the generated build output (git-ignored).
- `host/test/fixtures/`: real CLI outputs, anonymized; `NOTES.md` records how they were captured.

## Commands

```bash
npm test            # vitest, all *.test.ts
npm run typecheck   # tsc --noEmit
npm run build       # esbuild → extension/dist + extension-firefox/ + host/dist/host.cjs
npm run lint:firefox  # web-ext lint on extension-firefox/
npm run sign:firefox  # AMO unlisted signing → web-ext-artifacts/ (needs WEB_EXT_API_KEY / WEB_EXT_API_SECRET)
```

Run `npm test`, `npm run typecheck`, `npm run build` and `npm run lint:firefox` before calling a change done. After a build, the installed host already runs the new
`host/dist/host.cjs` (the wrapper points into this repo); the extension must be reloaded in
`chrome://extensions`, then the GitHub tab refreshed. In Firefox, press *Reload* in `about:debugging`
(temporary add-on) or install a re-signed `.xpi` (`npm run sign:firefox`, bump `version` first). Re-run
`./scripts/install.sh` only when the wrapper or the host manifest must change.

Host smoke test without the browser:

```bash
node -e 'const m=Buffer.from(JSON.stringify({action:"clone",owner:"o",repo:"r",destination:"~/orca-projects"}));const h=Buffer.alloc(4);h.writeUInt32LE(m.length);process.stdout.write(Buffer.concat([h,m]))' \
  | host/dist/github-orca-host | tail -c +5
```

It runs for real against Orca: use a repo already in Orca, or expect a real clone.

## Conventions

- **TDD**: tests first, next to the code (`foo.ts` / `foo.test.ts`). DOM tests use `// @vitest-environment jsdom`.
  Adapters are tested with `fakeRunner` (argv assertions), the handler with `vi.fn()` ports.
- **Language: English for everything**: code, comments, docs, user-facing messages (toasts, host errors,
  options labels, install script output), commit messages and PR descriptions. Commits: Conventional Commits
  with a scope, e.g. `feat(host): …`, `fix(extension): …`.
- **Commands are argv arrays, never shell strings.** PR titles, prompts and paths go through as data.
- **Validate on both sides**: any setting the host consumes (agent, clone folder…) is checked in the options form
  *and* in `host/src/validate.ts` with the same rule.
- Orca `--json` output is `{ ok, result }` / `{ ok: false, error: { message } }`: parse through
  `parseOrcaJson`/`toHostError`, and read fields defensively (`??`). When relying on a new Orca command, check its
  shape (`orca <cmd> --help`, a captured fixture, or Orca's CLI sources in
  `/Applications/Orca.app/Contents/Resources/app.asar.unpacked/out/cli/`).
- Orca project ids are lower-cased `github:<owner>/<repo>`.
- Worktree metadata the CLI has no flag for (`linkedPR`, `pushTarget`) goes through Orca's runtime RPC, loaded
  from the app bundle next to the `orca` binary (`loadOrcaRpc` in `orca.ts`). It is an internal API: such calls are
  best effort (log on failure, never fail the request).
- A new host action = new member of `HostMessage`, a branch in `parseRequest` and `handleRequest`, a message type
  in the worker, and an in-flight key that cannot collide with existing ones.

## GitHub DOM

GitHub changes its markup often. Anchors live only in `extension/src/content/inject.ts`:
`ANCHOR_SELECTORS` (PR header; floats bottom-right when none matches) and `REPO_ANCHOR_SELECTORS`
(`ul[data-testid="repo-header-actions"]`; no fallback: the button waits for the header).
`syncButton` keeps exactly one button per page, owned by the current content-script instance: after an extension
reload the orphaned script's button is replaced. Keep that invariant when touching injection.

## Safety

PR actions run an agent (and, for same-repo PRs, the repo's Orca setup hooks) inside the PR's code; fork PRs
always get `--setup skip`. Never weaken that. Git runs with `GIT_TERMINAL_PROMPT=0`: the host has no terminal.

**Never use personal data for testing.** Tests, fixtures, examples and docs use fictional values only: owners and
repos like `acme/web-app` or `o/r`, paths like `/Users/me/…` or `/Users/dev/…`, made-up names, emails, ids and
tokens. Never the maintainer's or anyone's real GitHub handle, repos, local paths, emails, Orca ids or hook
scripts. When capturing real CLI output as a fixture, anonymize it before committing (replace every
identifying value, and trim fields the tests do not read). Live checks against the real Orca/GitHub (smoke tests,
E2E) are fine, but their output is never committed.

`docs/` is git-ignored (local plans and specs).
