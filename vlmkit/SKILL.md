---
name: vlmkit
description: "Verify frontend changes with @mizchi/vlmkit: compare rendered HTML or screenshots, manage visual baselines, and inspect layout, accessibility or interaction defects. Use after visible UI changes or for a requested visual audit. Choose deterministic checks first, then use model-assisted modes when the task requires them."
---

# vlmkit

Use Node 24+. The published `@mizchi/vlmkit@0.24.0` CLI was checked on
2026-11-16 with Playwright 1.65.1. Its bin is `vlmkit`.
`@mizchi/vrt@0.5.0` is an older package whose bin is `vrt`; installing it does
not provide the current command described here.

## Install in the project

```sh
pnpm add -D @mizchi/vlmkit
pnpm exec vlmkit --help
```

Resolve the CLI's Playwright peer requirements and install the matching browser
through that same project. A different global `playwright install` can download
a browser build the project does not use. The
[smoke fixture](assets/smoke/package.json) explicitly pins both Playwright packages.
Keep the project's package-manager version and lockfile.

## Select the operation

| Need | Entry point |
| --- | --- |
| Compare before/after HTML or URLs | `vlmkit diff html --help` |
| Summarize an existing diff for an agent | `vlmkit diff agent --help` |
| Keep a screenshot baseline across runs | `vlmkit snapshot --help` |
| Find defects without a baseline | `vlmkit check integrity --help` |
| Inspect layout, responsive behavior or accessibility | `vlmkit check --help`, then the selected gate |
| Explore behavior or inventory the page | `vlmkit inspect --help`, `vlmkit scan --help` |
| Use model-assisted generation or repair | Read that installed command's help and provider requirements |

These are distinct operations; do not assume they share flags or output schemas.
The published CLI is usable without separately installing historical `vrt-*`
sub-skills. Load deeper instructions only if they exist at the revision being
used, rather than inventing an APM subdirectory path.

## Compare HTML and consume the report

```sh
pnpm exec vlmkit diff html before.html after.html --output-dir reports/ --no-discover
pnpm exec vlmkit diff agent reports/diff-report.json --no-history
```

`diff html` uses `--output-dir`, not the snapshot command's `--output` flag.
The checked run writes `diff-report.json` plus viewport artifacts into that
folder. Inspect the report's actual `results`, `viewports`, computed-style and
DOM-position sections before choosing thresholds. `diff agent` writes Markdown
to stdout; `--out` writes a file. Its default history lives under `.vlmkit/`;
use `--no-history` for a one-shot comparison, or explicit `--previous` and
`--persist-summary` paths for an intentional history workflow.

A zero-diff self-comparison is the control for rendering noise. Keep fonts,
viewport, OS and browser versions consistent. Mask dynamic content using flags
supported by the selected command, and check that the mask actually removes the
noise. A pixel difference is a candidate for inspection, not a defect verdict.

## Snapshot lifecycle

```sh
pnpm exec vlmkit snapshot https://example.com --output snapshots/ --fail-on-diff
pnpm exec vlmkit snapshot approve --output snapshots/
```

Approving a snapshot changes the accepted baseline. Inspect the current artifacts
and intended UI change before approving; do not use approval to hide a failed
comparison. The snapshot command has its own threshold, label and stability
options. Check its help instead of transplanting `diff html` flags.

## Published versions and upstream main

The npm CLI, GitHub release tags and repository main are separate channels.
At this check, npm published 0.24.0, GitHub's latest release tag was v0.9.1 and
main's CHANGELOG described 0.27.0. Main-only commands such as the newer recording
workflow are not evidence that the installed npm release has them. Use the
installed help as the operational contract, and compare changes against the
chosen release before upgrading.

Sources: [repository](https://github.com/mizchi/vlmkit),
[CHANGELOG](https://github.com/mizchi/vlmkit/blob/main/CHANGELOG.md), and
[published package metadata](https://registry.npmjs.org/@mizchi/vlmkit/latest).
The freshness monitor tracks all three channels independently.

## Validate this recipe

```sh
pnpm --dir assets/smoke install --frozen-lockfile --ignore-scripts
pnpm --dir assets/smoke exec playwright install chromium
pnpm --dir assets/smoke test
```

The local fixture resolves the documented binary and runs a real local HTML
comparison through Chromium, without a model key. It verifies only this pinned
CLI path and deterministic comparison; provider-backed generation/repair modes
need their own checks. API keys belong in the existing project's credential
configuration when those modes are explicitly selected.
