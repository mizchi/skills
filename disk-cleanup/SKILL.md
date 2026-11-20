---
name: disk-cleanup
description: Reclaim local developer disk space on macOS or Linux. Use when storage is low or the user asks to inspect disk usage, remove inactive repositories' build caches, retire pushed worktrees and merged local branches, collect Nix garbage, or consolidate obsolete tool versions.
---

# Developer disk cleanup

Recover measured free space while preserving source, local work, installed tools,
and the user's chosen rollback history. Separate discovery, eligibility checks,
and deletion. The bundled Node 24+ survey only reads metadata and measures paths;
it does not choose or delete cleanup targets.

## Scope and defaults

Use the user's existing authorization and age threshold. If none is supplied,
state a 30-day inactivity default for project caches. A cleanup request authorizes
verified disposable artifacts in that scope; an inspection request authorizes
inspection only. Ask only about unresolved choices that change scope, such as
which installations to upgrade or which rollback generations to retire.

Prefer removing build artifacts to removing a source checkout. Repository,
worktree, and merged local branch cleanup follow [Git cleanup](references/git.md).
Retire eligible worktrees before rechecking merged branch candidates; preserve
protected branches and branches checked out in any remaining worktree. Remote
branch deletion requires its own scope.
Updating software and expiring profile history are separate from cache pruning;
do not silently rewrite project lockfiles or upgrade every installed tool.

## 1. Get a fast volume result

Start with filesystem metadata, not a recursive scan:

```sh
df -h "$HOME"
df -i "$HOME"
node "<skill-dir>/scripts/survey.mjs"
```

The helper reports `/` and home volume availability without walking directories.
On APFS, the root snapshot and writable data volume may share storage. Measure
the volume containing the actual data and do not add shared-volume capacities.

Then measure a few explicit local paths:

```sh
node "<skill-dir>/scripts/survey.mjs" --timeout-ms 2000 \
  "$HOME/Library/pnpm/store" "$HOME/Library/Caches" "$HOME/ghq"
```

Only pass paths that exist on this machine. The helper runs at most two `du`
processes at once, accepts at most eight distinct paths, and kills each scan at
its timeout. Exit 2 means the JSON includes an incomplete measurement; `timeout`,
`error`, `missing`, and `symlink` have a null size. They never mean zero usage.
Filesystem metadata calls themselves are not timeout-bounded: avoid network
mounts and offline external disks in this first pass.

`du -d 1` limits output depth, not traversal cost. Do not launch overlapping
whole-home, whole-ghq, whole-cache, and whole-Nix scans together, or repeatedly
retry the same timed-out tree. Drill into selected children, use an existing
usage report, or spend a larger explicit budget on the promising subtree.
Directory sizes are estimates: nested paths, hard links, APFS clones, snapshots,
and open deleted files prevent their sum from predicting reclaimed space.

Useful starting points are ghq, package-manager caches, Cargo targets, Nix store,
Docker build cache, and Xcode DerivedData. Discover actual cache locations with
their owning tools; do not assume a macOS path exists on Linux. See
[tool-specific cleanup](references/tools.md) for native commands and analyzers.

## 2. Find inactive project caches

Use `ghq list --full-path` when available, or a bounded host/owner/repository
directory listing. Discover linked worktrees with `git worktree list --porcelain`
once per resolved Git common directory. Do not traverse every `.git` object or
`node_modules` tree merely to enumerate repositories.

Capture inactivity evidence **before** fetching, pruning, or deleting:

- Per-worktree index and HEAD reflog timestamps, recent source/build activity,
  and the newest entry in the candidate cache. The checkout's top directory
  mtime and the latest upstream commit date alone do not establish inactivity.
- Active process working directories, open files inside the candidate, active
  agent tasks, and symlinks from user commands/configuration. Use
  `lsof -nP -a -d cwd -F pn` where available; `-nP` avoids name-resolution waits.
  Exclude the survey's own processes. An open parent directory from a scanner
  does not make every descendant an active project.

Treat missing evidence as unknown. Fetching changes metadata; removing a cache
changes its parent's mtime. Preserve the original observations in the plan.
Archive timestamps can also be preserved during installation, so an old SDK's
embedded dependencies are not evidence that the installed tool is unused.

For each candidate, check its resolved location and its owner:

| Candidate | Evidence that it is regenerable |
| --- | --- |
| `node_modules` | Project manifest and lockfile; not inside a bundled app, SDK, global tool installation, or vendored runtime |
| Cargo `target` | Cargo manifest or `.rustc_info.json` plus fingerprint directories; account for shared `CARGO_TARGET_DIR` |
| MoonBit `_build` | `moon.mod` / `moon.mod.json`, or documented build output; keep committed bootstrap seeds |
| Swift `.build` | `Package.swift` and the package's generated build tree |
| `.next`, `.turbo`, test reports | The project's documented framework/build outputs |

Check Git with `GIT_OPTIONAL_LOCKS=0`:

```sh
git -C "$repo" ls-files -z -- "$relative_cache"
git -C "$repo" check-ignore -q -- "$relative_cache"
```

Require no tracked files in the candidate and positive ignore evidence, or
equivalent explicit producer documentation. Recheck immediately before deletion.
Use exact manifest paths, reject symlink escapes, and do not follow links into
another project. Preserve nested Git repositories, `.env`, `.ai`, `.claude`,
review notes, local databases, `.wrangler` state, and unknown ignored files.
In particular, a generic `build/` can contain modified compiler forks: its name
is insufficient. Deleting a verified ignored cache can be safe even when the
surrounding repository has unrelated edits; retain those edits and `.git`.

Record exact paths, estimated allocation, original age evidence, producer,
active/linked checks, and reasons for keeping uncertain entries. Delete only
verified entries in the authorized scope; log each outcome as it happens.

## 3. Prune caches and converge installations

Remove old project build/dependency directories first, then use the installed
package manager's cache-pruning command. Removing consumers can release store
references. Native pruning may remove unused entries of **any age**; do not
substitute it for a strict age-limited request without establishing that scope.

When version consolidation is requested, follow
[update, validate, prune](references/tools.md#update-validate-prune). Install or
activate the selected replacement, verify commands and dependent projects, then
retire obsolete versions. Updating alone often increases disk use until old
generations and caches are removed. If space is critically low, first recover
headroom from disposable caches or unreachable Nix paths before updating.

For Nix, read [Nix GC and optimisation](references/nix.md): inspect roots and
profiles, update/switch only the chosen environment, retire selected old
generations, run `nix store gc`, then `nix store optimise`. GC and optimisation
have different purposes, and old profiles can keep old packages live.

## 4. Verify actual space and stop

Compare availability on the same volume before and after. Report actual free
space change separately from estimated deleted bytes, including update/download
overhead when relevant. If the numbers disagree, inspect open deleted files
(`lsof -nP +L1`), snapshots, shared extents, or VM disk compaction before claiming
the space is available. Do not kill applications or delete snapshots by default.

Check that source repositories and protected paths still exist; compare shared
refs before and after Git cleanup. Worktree-only cleanup leaves refs unchanged;
branch cleanup removes only the planned local heads, preserving protected refs,
tags, and stash. Do not rebuild or reinstall every cleaned project as a check:
that recreates the cache just removed.
Keep a private local deletion record with paths and recovery information. Once
the requested free-space target is met, report remaining candidates instead of
expanding into more costly upgrades or rollback-history removal.
