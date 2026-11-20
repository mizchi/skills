# Source repositories, worktrees, and merged branches

Removing build caches is independent of removing source checkouts. Include
merged local branches in authorized Git housekeeping; remove a whole repository
or linked worktree only when that is within the user's scope.
Apply the chosen age cutoff and keep active, locked, linked, or uncertain paths.
Use NUL-delimited machine output for filenames where available; the human-readable
examples below show the intended checks.

## Enumerate and capture evidence

Use `git rev-parse --git-common-dir` to group worktrees and
`git worktree list --porcelain` to enumerate each group once. Keep the primary
worktree. Git's inventory can include paths outside ghq, nested worktrees, and
directories that no longer exist.

Record each worktree's HEAD, branch, actual Git directory, per-worktree index /
HEAD reflog activity, tracked/untracked changes, ignored files, and active/linked
checks **before fetching**. Set `GIT_OPTIONAL_LOCKS=0` for read-only inspection:

```sh
git -C "$worktree" status --porcelain=v1 --untracked-files=all
git -C "$worktree" ls-files --others --ignored --exclude-standard --directory -z
```

An empty status is not enough: `.env`, `.ai` work notes, local databases, ignored
compiler forks, and nested repositories can contain the only copy of work.
Only discard ignored entries proven to be regenerable caches. Preserve a checkout
with unknown local data; a directory being ignored is not proof of disposability.

## Confirm a current remote copy

For an otherwise eligible old worktree, fetch the relevant remote with pruning
and no checkout or rebase, then find remote refs containing its HEAD:

```sh
git -C "$primary" fetch --no-auto-maintenance --prune --no-tags "$remote"
git -C "$primary" for-each-ref --contains="$head" \
  --format='%(refname)' "refs/remotes/$remote/"
```

Only refs from a successfully refreshed remote count as current evidence.
`git merge-base --is-ancestor "$head" "$remote_ref"` provides the corresponding
ancestry check. Cached tracking refs alone can refer to a branch already deleted
on the server. A configured upstream alone is also insufficient.

Squash/rebase merges can remove this ancestry evidence. If PR state or equivalent
patches are to be used instead, establish that explicitly; otherwise keep the
uncertain worktree. Do not merge, reset, rebase, or push in order to make it
eligible. See [ref containment](https://git-scm.com/docs/git-for-each-ref) and
[merge-base ancestry](https://git-scm.com/docs/git-merge-base).

Fetching many obsolete clones can download substantial history and consume the
headroom just recovered. Inspect age and local state first, fetch only promising
groups, and compare total session space change including this overhead. Disable
fetch's automatic maintenance while inspecting recoverable reflog history. Bound
network operations and terminate the subprocess tree you started on timeout.
After a failed fetch, remove only its identified incomplete temporary pack after
confirming no process still uses it; never glob-delete the repository's pack files.

## Remove a linked worktree

Snapshot shared branch/tag/stash refs, recheck HEAD and local files, then:

```sh
git -C "$primary" worktree remove -- "$worktree"
```

Use the resolved common Git directory explicitly if the recorded primary path
has moved. Avoid `--force`: a refusal is evidence to investigate, not permission
to bypass dirty/locked/submodule checks. During worktree removal, keep shared
branches, tags, and stash and verify their refs afterward. If branch cleanup is
also in scope, perform the separate checks below after removing eligible
worktrees. Shared stash entries remain with the common repository, but worktree-private HEAD
reflog history also needs inspection before discarding its administrative data.
[Git worktree documentation](https://git-scm.com/docs/git-worktree).

For already missing directories, do not blindly prune every registration. Check
that the disk is mounted, the worktree is not locked, metadata is old, HEAD is
backed up, the per-worktree index has no staged changes, and its reflog has no
commits unique to that administrative directory. Retain uncertain registrations.
Record or privately back up the chosen administrative metadata and remove the
specific eligible registration through Git. Use `worktree prune --dry-run` for
inspection; a broad prune must not discard unverified or offline worktrees.

## Delete merged local branches

Choose the actual integration branch from repository policy, the remote default,
or the user's target, and refresh its remote first. For example, use the fetched
`refs/remotes/origin/main`; a feature branch's own `origin/topic` upstream is not
the integration target. Record the chosen base ref and its current OID. Honor
the chosen branch age/retention policy using branch activity, not just the age
of its tip commit.

For branch housekeeping, refresh just the chosen integration branch instead of
every branch in every old clone. Resolve its name from policy or the advertised
default (`git ls-remote --symref "$remote" HEAD`), then:

```sh
git -C "$primary" fetch --no-auto-maintenance --no-tags "$remote" \
  "+refs/heads/$integration_branch:refs/remotes/$remote/$integration_branch"
```

Capture branch activity before fetching. Prefer reflog event times when present.
An existing **empty** reflog has no history to inspect: it need not block cleanup
when independently captured old log/ref metadata and an unchanged tip establish
inactivity. A missing log with no earlier activity evidence remains unknown.
Do not expire reflogs to create this condition.

Exclude the remote default's local counterpart, `main`, `master`, `trunk`,
`develop`, and the repository's other long-lived/release or user-protected
branches. Re-enumerate **all** registered worktrees and exclude every checked-out
branch, including locked, missing, or offline worktrees still registered. Keep
branches serving as another local branch's upstream or referenced by an active
stack/configuration until that dependency is resolved in its owning workflow.

List candidates against the explicit integration base:

```sh
git -C "$primary" for-each-ref --merged="$base_ref" \
  --format='%(refname) %(objectname)' refs/heads/
```

After applying those exclusions, record each exact local ref and tip. Recheck
its tip and integration ancestry immediately before deletion:

```sh
git -C "$primary" merge-base --is-ancestor "$tip" "$base_oid"
```

Only exit 0 proves containment; exit 1 is unmerged and other failures are unknown.
Also inspect the branch reflog: preserve commits not reachable from any retained
local ref or freshly verified integration base, or back them up under an
explicitly chosen retention policy. Stale remote-tracking refs alone are not a
durable backup. Batch reachability checks by common repository when many branches
share a history. Branch deletion
removes that branch's reflog as well as its ref. Record the branch name, tip, base
OID, and merge evidence for recovery.

For each verified, unchanged, unprotected candidate not in a worktree, use:

```sh
git -C "$primary" branch -d -- "$branch"
```

`branch -d` checks the configured upstream, or HEAD when none exists. It can
therefore delete a branch pushed to its own topic upstream even when that work
has **not** landed in main. It is the final deletion command, not sufficient
merge evidence. Do not pipe an unfiltered branch list to `xargs` or fall back to
`-D` when a check or deletion refuses. See [branch deletion semantics](https://git-scm.com/docs/git-branch).

If ancestry to the chosen integration base is already proven but `-d` refuses
because the configured topic upstream is stale/different or HEAD is behind,
resolve that specific mismatch without a force delete. Privately save the exact
local configuration stanza of this already-approved branch, including repeated
values, then align only its upstream:

```sh
git -C "$primary" branch --set-upstream-to="$base_ref" -- "$branch"
```

Verify the resolved upstream, unchanged tip, merge evidence and worktree exclusions
again, then retry `branch -d`. On any failure while the branch remains, restore
that branch's original configuration exactly; do not overwrite the whole shared
config. This alignment is preparation for deleting a verified merged branch,
not a substitute for proving integration. Other refusal reasons remain blockers.

Squash/rebase merges may fail ancestry checks. Keep them by default and report
them separately. A merged PR badge, a deleted remote branch, or patch similarity
alone does not establish that a branch's **current** tip was integrated. Any
separate squash/rebase cleanup policy needs matching PR/repository/base/head
evidence, confirmation that no later commits were added, and an explicit recovery
and force-deletion policy before bypassing the ordinary ancestry/deletion checks.

Verify that only the planned `refs/heads/...` disappeared; other local branches,
tags, stash, and server-side branches must remain. Compare refs around each
repository's mutation and record concurrent updates to retained refs separately;
never reset another task's advancing branch to a session-wide starting snapshot.
A candidate tip changing before deletion still means stop and re-evaluate it.
`fetch --prune` cleans stale
tracking refs; it does not authorize `git push --delete`. Merged commits remain
reachable from the integration branch, so deleting these branch names usually
reclaims little space. Do not expire all reflogs or run an aggressive object GC
to inflate the reported savings.

## Additional requirements for a whole clone

Whole-clone deletion also removes shared branches, stash, hooks, and object
storage. Require no working-tree/untracked/private ignored files, no stash,
no additional worktrees or submodules, no custom hooks/configuration needing
preservation, and no dependent alternate object stores or user symlinks.

Check local branches, tags, HEAD and reflog commits against successfully refreshed
remote refs. Preserve local-only tags and custom refs. A successful fetch does
not prove every local ref is backed up. Record a sanitized remote URL and HEAD
for recovery; never print credential-bearing URLs. Do not run `git gc --prune=now`
or an aggressive repack as a generic disk-cleanup shortcut.
