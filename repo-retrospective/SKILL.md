---
name: repo-retrospective
description: Use when looking back over a repository's history — a project retrospective, "how was this built / how long did it take", when direction changed or a decision was made, how a KPI moved over time, milestones or phases, or a progress dashboard built from git history. Works on any git repo, including agent-driven ones with Claude-Session trailers.
---

# Repo retrospective

## Overview

A retrospective is a dataset first and a page second. Build versioned data files that follow one contract, with every
number labelled recorded, re-measured, derived or hand-picked; any dashboard, deck or chart is a disposable view of
them. Decisions leave structural traces in git (renames, new packages, removed directories, new gates); find those
mechanically, then choose by judgement.

## Workflow

1. **Inventory.** The project's priority KPIs and where their history lives: a KPI log in the repo, CI benchmark
   history (e.g. a gh-pages `data.js`), numbers in READMEs updated by CI, reports. If no KPI is declared, ask which
   numbers matter before measuring anything.
2. **Decisions.** `python3 scripts/decision_points.py -C <repo>` lists candidates (`--help` has the signals; over
   ~2000 commits use `--min-weight 4` or `--since`). Expect 5-10x more than you keep. Verify each pick introduces the
   thing: `git log --reverse --diff-filter=A --format='%h %aI %s' -- <file> | head -1`. Keep 10-15 that changed what
   the project is or how it is judged; drop "one more feature". Check the list into the repo.
3. **KPIs.**
   - History recorded: use it as `recorded`. Map logged hashes to times; mark rows whose commit was rebased away.
   - Gaps (before logging began, or never logged): re-measure at the milestones plus a regular sample with
     `scripts/kpi_backfill.py --setup '<build>' --measure '<bench>' --milestones milestones.json --include-head`.
     It uses temporary worktrees and resumes after interruption.
   - Calibrate: compare the re-measured HEAD with the recorded HEAD. If they differ, plot them as separate series or
     show the ratio; never splice them into one line.
   - Prefer instruction counts or sizes over wall time when re-measuring on different hardware.
4. **Data.** Write `manifest.json` and one JSON array per dataset following `references/data-contract.md`, from one
   script in the repo (not by hand), and run `python3 scripts/validate_retro.py <dir>` in CI.
5. **Views.** A view reads only the manifest and the files it names. Text that depends on numbers (deltas, "rose",
   "fell") is computed in the view from the data, so regenerating the data never leaves stale prose.

## Pitfalls

| Trap | Fix |
|---|---|
| Documents moved or translated later look newly added | `git log --follow --diff-filter=A`; trust the date in the name or body |
| The first commit is a rename or import | say that earlier history is not included |
| Bot commits (`*[bot]`) and merges inflate counts | exclude both; use merges only for PR series |
| Mixed time zones (`+0900` merges, `+0000` agents) | UTC in the data; the reader's zone in the view |
| Counts where the denominator moves (applicable tests change) | record rates with their denominators |
| A phase boundary chosen by feel | use the commit that introduced the gate or spec, and name it in `phases` |
| Numbers typed into a page | they go stale silently; put them in a dataset |

## Files

- `scripts/decision_points.py`: decision candidates from git history
- `scripts/kpi_backfill.py`: KPIs re-measured at past commits
- `scripts/validate_retro.py`: contract check for a data directory
- `scripts/test_scripts.py`: tests for the two above
- `references/data-contract.md`: the contract
