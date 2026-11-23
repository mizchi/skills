# Data contract: repo-retrospective/v1

The data directory is the product; pages, decks and charts are views of it and may be rewritten at any time. A view
reads `manifest.json` and the files it names, and nothing else: no git, no network calls of its own, no numbers typed
into the page. `scripts/validate_retro.py DIR` checks everything below.

## manifest.json

```json
{
  "contract": "repo-retrospective/v1",
  "repo": "owner/name",
  "head": "08987da3",
  "generated_at": "2026-11-23T15:20:00Z",
  "generator": "scripts/retro/extract.py",
  "phases": [{"name": "compat", "start_commit": "c155863e", "why": "tests/ui became the spec"}],
  "datasets": {
    "<name>": {
      "file": "<name>.json",
      "title": "short label for a view",
      "grain": "one row per ...",
      "provenance": "recorded | remeasured | derived | hand-picked | mixed",
      "source": "where the rows come from: a file in the repo, a CI history, a command",
      "columns": {
        "<column>": {"type": "time|date|int|number|string|bool|commit|enum", "unit": "ms", "nullable": false,
                     "values": ["only for enum"], "description": "what it is, lower/higher is better, ..."}
      }
    }
  }
}
```

`phases` is optional; everything else is required.

## Datasets

- A JSON array of flat objects. Every key is declared in `columns`; every declared column is present (use `null`
  with `"nullable": true`).
- `time` is UTC `YYYY-MM-DDTHH:MM:SSZ` (author time for commits), `date` is a UTC day. Rows are sorted by `time`, or
  by `date` when there is no `time`. Convert time zones when writing, never in the view.
- `commit` is 7-40 lowercase hex.
- Numbers are numbers, not strings. Units go in the column's `unit`, not in the value.

## Provenance

| value | meaning |
|---|---|
| `recorded` | measured at the time and kept (a KPI log in the repo, CI benchmark history, release notes) |
| `remeasured` | measured now at an old commit (`kpi_backfill.py`); a different machine and toolchain than the original |
| `derived` | computed from git or from other datasets (commit counts, line counts) |
| `hand-picked` | a judgement (milestones) |
| `mixed` | rows differ: the dataset needs a row column `provenance` (enum of the four values above) |

A view must be able to tell recorded from re-measured numbers, so a dataset that holds both is `mixed`, never
`recorded`. When a row's time was inferred (a rebased commit), add a `time_estimated` bool column.

## Required: milestones

`milestones` with at least `time`, `commit`, `label`, `detail`, provenance `hand-picked`. Everything else is up to the
project. Common ones: commits per hour or day (`derived`), KPIs (one row per commit and metric: `time`, `commit`,
`metric`, `value`, `unit`, `provenance`), code size, agent sessions.

## Changing the contract

Adding a column or a dataset is compatible. Renaming or removing one, or changing a type or unit, is not: bump the
version in `contract` and update the views in the same change.
