# Fixture notes — Task 1 spike

Captured on 2026-09-28 against a real local Orca instance (`orca status`, app
version 1.4.215) and the real `gh` CLI, using repo `acme/web-app`
(local path `/Users/dev/projects/web-app`),
PR #2 ("docs: add contributing guide", `docs/contributing-guide`
→ `develop`, not cross-repository), chosen because it had an open PR.

**All identifying values are anonymized**: owner (`acme`), repo, PR title and branch, local paths
(`/Users/dev/…`), every UUID and commit SHA (randomly regenerated, consistently across files, so
cross-references such as `sourceRepoIds` ↔ repo `id` and worktree `id` ↔ `repoId` still hold), and the pid.
Only the structure and field names are real. Anonymize any new capture the same way before committing it
(see AGENTS.md, Safety).

## `orca worktree create --json` (`orca-worktree-create.json`)

- The worktree object is at **`result.worktree`** (not bare `result`).
- Field names on that object that Task 4 parsers must read:
  - `id` — composite string `"<repoId>::<absolute worktree path>"`, e.g.
    `"3c051247-d8c9-4198-a0bf-27f465bb2d57::/Users/dev/orca/workspaces/web-app/PR-2-spike"`.
    This exact string is what `orca terminal create --worktree "id:<...>"` and
    `orca worktree rm --worktree "id:<...>"` expect after the `id:` prefix.
  - `path` — absolute filesystem path of the worktree
    (`/Users/dev/orca/workspaces/web-app/PR-2-spike`).
  - `displayName` — the `--name` value passed in (`"PR #2 spike"`).
  - `comment` — the `--comment` value passed in
    (`"github-orca:acme/web-app#2"`), persisted verbatim and
    returned unchanged by `orca worktree list --json` (see below).
  - `head` / `git.head` — the checked-out commit SHA (duplicated at top level
    and under `git`).
  - `branch` / `git.branch` — full ref, e.g.
    `"refs/heads/acme/PR-2-spike"` (Orca prefixes the branch it creates
    with the repo's `gitUsername`, here `acme`, then the `--name` value
    slugified to `PR-2-spike`).
  - `baseRef` — the `--base-branch` value as given:
    `"refs/remotes/origin/pr/2"`.
  - `repoId`, `projectId`, `hostId` — identify which repo/project/host.
- Top-level envelope: `{ "id": <request id>, "ok": true, "result": {...},
  "_meta": {...} }`. No `error` was observed in this run (see below for the
  shape to expect on failure).

## `orca terminal create --json` (`orca-terminal-create.json`)

- The terminal handle is at **`result.terminal.handle`**, a string like
  `"term_b9bcffbe-0a89-4f9e-b1d0-c8cf024feb9a"`.
- Other useful fields on `result.terminal`: `tabId`, `paneKey`, `ptyId`,
  `worktreeId` (matches the worktree `id` above), `executionHostId`,
  `hostPlatform`, `surface`.

## `orca worktree create` — timing

`time orca worktree create ... --setup skip --json > ...` reported:
`0,10s user 0,03s system 5% cpu 2,325 total` — i.e. **~2.3s wall clock** for
the whole create (fetch of the PR ref happened separately beforehand via
`git fetch`; the worktree create itself only checks out `origin/pr/2`
locally, no network fetch, `--setup skip` skips repo hooks).

## Branch naming

Orca generated branch **`acme/PR-2-spike`** from `--name "PR #2 spike"`
and the repo's registered `gitUsername` (`acme`). The `#` and spaces in
`--name` were dropped/slugified to `PR-2-spike`.

## SHA verification (step 4)

- `git -C <worktree> rev-parse HEAD` → `455cf010045037760356fcff55ed7b4bc26e22f4`
- `gh pr view 2 --repo acme/web-app --json headRefOid -q .headRefOid`
  → `455cf010045037760356fcff55ed7b4bc26e22f4`
- **Equal.** Confirms `orca worktree create --base-branch origin/pr/N`
  checks out the PR head exactly, after `git fetch origin
  +pull/N/head:refs/remotes/origin/pr/N` was run first.

## `orca worktree list --json` marker check (step 5)

`orca worktree list --json | grep -c "github-orca:acme/web-app#2"`
→ `1`. Confirms the `--comment` value is persisted and appears exactly once
in the full worktree list (i.e. `comment` round-trips through
`orca worktree list`).

## Cleanup (step 6)

`orca worktree rm --worktree "id:<worktree id>" --json` returned
`{"ok": true, "result": {"removed": true, "preservedBranch": {"branchName":
"acme/PR-2-spike", "head": "455cf010..."}, "warning": "orca.yaml
archive hook skipped ...; pass --run-hooks to run it."}}`.

Important: **`orca worktree rm` did NOT delete the local branch** — it
returned it under `result.preservedBranch` instead (per `orca worktree rm
--help`: "Orca retains branches it knows predated the worktree and any
branch whose changes it cannot prove are already merged"). The branch
`acme/PR-2-spike` had to be deleted manually:
`git -C <repoPath> branch -D acme/PR-2-spike`. Task 4 parsers/cleanup
logic must check `result.preservedBranch` and decide whether to delete that
branch themselves.

## Error envelope shape

No error was encountered during this spike (`--base-branch origin/pr/N` was
accepted; the command never failed). The error shape was **not observed
directly**. Based on the envelope convention seen on success
(`{ "id", "ok", "result", "_meta" }`), Task 4 should defensively assume a
failure looks like `{ "id", "ok": false, "error": { "message": "...",
possibly "code": "..." }, "_meta": {...} }` — e.g. `orca worktree rm`'s help
text references a concrete error code (`worktree_archive_hook_failed`) for
one failure mode, suggesting `error.code` is a real, used field — but this
should be verified against a real failing call before Task 4 relies on the
exact shape.

## Trimming applied to fixtures (per controller ruling)

- `orca-project-list.json`: trimmed to 2 entries; `github:acme/web-app`
  (the project used for this spike) is listed **first**, followed by
  `github:acme/api`.
- `orca-repo-list.json`: trimmed to 2 entries; kept the repo whose `id`
  (`3c051247-d8c9-4198-a0bf-27f465bb2d57`) is in
  `github:acme/web-app`'s `sourceRepoIds`, plus one more repo
  (`6805512c-9b89-4b4d-9906-234626120bd7`, which is `api`'s source repo).
  `hookSettings.scripts` contents were cleared (set to `{}`) on the kept
  entries.
- `orca-worktree-list.json`: trimmed `result.worktrees` to its first 2
  entries; `result.totalCount` updated to `2` to match.
