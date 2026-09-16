---
name: vlmkit
description: Entry-point for the `@mizchi/vlmkit` toolkit — VLM-driven frontend kit covering visual regression (snapshot / diff / regression-watch), markup synthesis from screenshots, design-token / theme / a11y / i18n audits, and a 2-stage VLM + LLM CSS auto-repair loop. Use when a coding agent has edited HTML/CSS and needs to know whether the visible output changed, where it changed, and which CSS properties drove the change — or when the task is markup-from-image / token / theme audit / fix-loop driven by VLM. This skill orients you to the 5 detailed sub-skills (vrt-visual-diff / vrt-migration-eval / vrt-markup-synth / vrt-regression-watch / vrt-css-fix-loop) and the verb-group CLI; pick the matching sub-skill once the task shape is clear.
---

# vrt

`vlmkit` is a TypeScript visual-regression toolkit built on Playwright +
pixelmatch. Beyond raw pixel diffs, it surfaces **agent-friendly
signal**: computed-style deltas split into universal vs.
breakpoint-gated, per-section diffRatio against component bboxes,
worst-viewport screenshot paths inline, and (optionally) VLM-emitted
CHANGE lists feeding an LLM CSS-fix step.

Source: <https://github.com/mizchi/vlmkit>. CHANGELOG +
old-CLI-to-new-CLI mapping: [`CHANGELOG.md`](https://github.com/mizchi/vlmkit/blob/main/CHANGELOG.md).

## When to invoke this skill

- An agent edited CSS / HTML / a component and you need "what visibly
  changed, and where."
- You're auditing a refactor PR for unintended layout drift.
- You're comparing two URLs (dev server vs. preview deploy; baseline
  vs. variant).
- You want a CI gate that flags regression across PRs.
- You're swapping a framework / CSS library and need to verify the
  rewrite is visually equivalent.

## When NOT to invoke

- Snapshot testing of pure-data structures (use Jest snapshots).
- Lighthouse / Web Vitals beyond CLS/LCP/FCP (use Lighthouse directly).
- Browser-driver-only flows with no diff component (use Playwright Test).
- Reviewing AI-generated **screenshots** for content correctness (use a
  vision-LLM tool like `review-image`).

## Install

**Prerequisite: Node 24+.** The CLI and the workspace packages all
rely on Node's `--experimental-strip-types` (default-on at 24+).
**Node 22 will not work** — verify with `node --version` before
installing. Use `nvm install 24 && nvm use 24` (or `fnm` / `volta` /
your preferred manager) to upgrade.

**Pre-flight check**: run `scripts/doctor.sh` to verify Node version,
Playwright Chromium, optional API keys, and installed sub-skills in
one pass. Two invocation forms by setup phase:

- **Pre-install (no apm yet)**: one-shot via curl —
  `bash <(curl -sSL https://raw.githubusercontent.com/mizchi/skills/main/vlmkit/scripts/doctor.sh)`
- **Post-install (`apm install -g mizchi/skills/vlmkit/vlmkit` done)**: local
  copy — `bash ~/.claude/skills/vlmkit/scripts/doctor.sh`

Severity rules: only **Node 24+** and **Playwright Chromium** are
FAIL-class (block exit 0). Everything else — including `vrt` CLI not
yet on PATH — is WARN by design, because the script is meant to be
runnable mid-install (a WARN on `vlmkit CLI` is expected the first time
through; resolve all FAILs first, install vrt, re-run, and the WARN
clears).

```bash
# CLI (global)
pnpm add -g @mizchi/vrt
# or per-project
pnpm add -D @mizchi/vrt
npx playwright install chromium

# Library packages (deep imports via .ts source)
pnpm add @mizchi/vlmkit-core @mizchi/vlmkit-capture @mizchi/vlmkit-markup @mizchi/vlmkit-ai
```

## CLI cheatsheet (0.5.0 verb groups)

**I/O conventions used below**: `--output <dir>` always takes a
**directory** path (the engine writes `diff-report.json` + per-viewport
PNGs into it). `vlmkit diff agent` writes Markdown to **stdout** by
default; pass `--out <path>` to write to a file instead.
Commands taking two positional args (e.g. `vlmkit diff html <baseline>
<variant>`) accept **either two local file paths or two URLs**; use
`--url`/`--current-url` if you want to be explicit.

```bash
# Diff
vlmkit diff html <baseline> <variant> --output reports/        # → reports/diff-report.json + PNGs (dir output)
vlmkit diff agent reports/diff-report.json [--out diff.md]     # → stdout (default) or --out path
vlmkit diff png  base.png current.png                          # Direct PNG diff (positional files)
vlmkit diff elements --selector .card …                        # Element-level shift isolation
vlmkit diff browsers <url>                                     # Chromium / Firefox / WebKit parity
vlmkit diff runs <dirs...>                                     # Aggregate N VRT runs

# Snapshot (baseline + diff lifecycle)
vlmkit snapshot <url1> [url2]... --output snapshots/
vlmkit snapshot approve                                        # Promote current → baseline
vlmkit snapshot stability <url...> --iterations 5              # FP-rate measurement
vlmkit snapshot flipbook --output snapshots/                   # Embed PNGs in a self-contained HTML

# Check (CI gates)
vlmkit check a11y contrast|touch|focus <html>                  # WCAG scans
vlmkit check tokens <html>                                     # Design-token scale conformance
vlmkit check theme  <html>                                     # prefers-color-scheme parity
vlmkit check perf   <html>                                     # CLS / LCP / FCP

# Inspect / Stress / Scan / Build
vlmkit inspect interact|explore|smoke <html|url>
vlmkit stress  i18n|media  <html>
vlmkit scan    component|breakpoints  <…>
vlmkit build   component <target.png> <current.html>           # Markup-from-screenshot loop

# Migration (framework / CSS-library swap audit). Three modes:
#   compare  — deterministic side-by-side audit; the default. Start here.
#   blind    — variant agent never sees baseline pixels (forces convergence from spec text alone).
#   subagent — dispatched subagent runs `compare` + writes a verdict.
# `--mask` and `--output` work identically across all three modes.
vlmkit migration compare|blind|subagent <baseline> <variant> --output reports/

# Long-running / stateful
vlmkit watch       <baseline> <variant>                        # File-watcher inner loop
vlmkit manifest    add|list|rm|check                           # Approval rules
vlmkit diff-pr     pin|verify|post                             # PR CI gate
vlmkit baseline    pin|verify|post|list|rm                     # Canonical alias of diff-pr
```

The single-token commands from 0.4.x (`vrt compare`, `vrt png-diff`,
`vrt theme-parity`, …) remain as deprecation shims that print a
one-line hint and forward.

## Sub-skill routing

**Two repos, by design**: this orient skill lives in
[`mizchi/skills`](https://github.com/mizchi/skills) (general-purpose
skills); the five vrt-specific sub-skills live in
[`mizchi/vlmkit/vlmkit`](https://github.com/mizchi/vrt) under
`.claude/skills/`. The two `apm install` paths below look different
because they target different repos — that is intentional, not a typo.

**The CLI is fully functional without any sub-skill installed** —
sub-skills are agent-facing reference material that deepens the routing
for a specific task shape. Install only when an agent needs the extra
context; end users running `vrt` from the command line never need
them.

**Scope boundary**: this orient skill stops at *routing*. Once you know
which sub-skill to load, deeper operational detail — full flag lists,
persistence paths (e.g. `.vrt/last-diff-for-agent.json` for regression
watch), per-mode semantics, output schema — lives in the corresponding
sub-skill. Install it via the `apm` command above when an agent needs
that depth.

```bash
apm install mizchi/vlmkit/.claude/skills/<skill-name>
```

Pick by task shape:

| Sub-skill | Use when | Entry workflow |
|---|---|---|
| `vrt-visual-diff` | One-shot "did this CSS edit change pixels, and where?" | `vlmkit diff html` → `vlmkit diff agent` |
| `vrt-regression-watch` | CI gate / scheduled drift detection across runs | `vlmkit diff agent --previous --fail-on-regression` |
| `vrt-migration-eval` | Framework / CSS-lib / build-system swap audit (deliberate large diff) | `vlmkit migration compare\|blind\|subagent` |
| `vrt-markup-synth` | Screenshot → HTML/CSS, token / theme / i18n / a11y audits | `vlmkit build\|scan\|check\|stress` |
| `vrt-css-fix-loop` | Automated CSS-repair loop with VLM + LLM | `fix-loop.ts` (VRT_VLM_MODEL=…) |

**Routing heuristic** (ask yourself once the user states the task):

```
Is the markup deliberately different (rewrite / framework swap)?
├─ yes → vrt-migration-eval
└─ no
   ├─ Need to detect change between runs over time? → vrt-regression-watch
   ├─ Want a CSS-fix loop (auto-repair)?          → vrt-css-fix-loop
   ├─ Building from a screenshot / token audit?   → vrt-markup-synth
   └─ One-shot "what changed"                     → vrt-visual-diff
```

## Output anatomy

`vlmkit diff html` writes:

```
<output>/
├── diff-report.json            # canonical machine input for diff agent
├── migration-report.json       # legacy alias, byte-identical (will be removed)
├── diff-mobile.png             # per-viewport pixel diff
├── diff-desktop.png
└── diff-wide.png
```

`vlmkit diff agent <report.json>` then emits Markdown structured as:

```
# VRT diff (for agent)

### Diff by viewport (worst first)
| Viewport | Diff | Dominant category | Categories | Shift bands |
| ...

### Verified deltas (computed-style) × viewport     ← HOISTED to #2
#### Universal pairs         ← fix the base rule
#### Breakpoint-gated pairs  ← fix or add @media rule

### Per-section diffRatio
### Heuristic fix candidates
```

The hoisted **Verified deltas** is the load-bearing signal — read
Universal pairs first, then Breakpoint-gated, then drill into
Per-section.

## Common gotchas

- **Masking is load-bearing.** Pass `--mask ".marquee,.timestamp,
  [data-testid='live-counter']"` for anything that flaps run-to-run.
  An unexpected baseline-noise diff is almost always a missing mask,
  not a real regression.
- **Output is a directory, not a file.** `--output reports/` makes
  `reports/diff-report.json` + PNGs. Feed the JSON path (not the dir)
  to `vlmkit diff agent`.
- **Playwright must be installed.** First run errors with "browser not
  found" → `npx playwright install chromium`.
- **Self-comparing the same URL with no mask is the false-positive
  baseline.** Use this to verify `--mask` actually catches every
  flapping element before relying on diff% threshold.
- **The dist binary is bundled.** `dist/vlmkit.mjs` ships with all leaves
  code-split. There is no source dependency at install time.

## Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `VRT_LLM_PROVIDER` | LLM provider for fix-loop (`gemini` / `openrouter` / `anthropic`) | `gemini` |
| `VRT_LLM_MODEL` | LLM model override | Provider default |
| `VRT_VLM_MODEL` | VLM model (OpenRouter id, or `gemini:`/`claude:` prefix) | `bytedance/ui-tars-1.5-7b` |
| `OPENROUTER_API_KEY` / `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` | Per-provider auth | — |
| `VRT_CAPTURE_BACKEND` | `local` (default Playwright) or `cloudflare` (Browser Run) | `local` |
| `DEBUG_VRT` | Verbose log output | unset |

## Library use (vrt-core / vrt-capture / vrt-markup / vrt-ai)

When the CLI surface isn't enough, deep-import the relevant package:

```ts
import { compareScreenshots } from "@mizchi/vlmkit-core/heatmap.ts";
import { discoverViewports }  from "@mizchi/vlmkit-capture/viewport-discovery.ts";
import { extractComponents }  from "@mizchi/vlmkit-markup/component/component-extract.ts";
import { askVlm }             from "@mizchi/vlmkit-ai";
```

`@mizchi/vlmkit-core` has no Playwright dependency for the lightweight
surface (image / DOM / a11y primitives). The other three pull in
Playwright transitively.

## Reporting issues / contributing

- Issues / feature requests: <https://github.com/mizchi/vlmkit/issues>
- Source: <https://github.com/mizchi/vlmkit>
- Smoke gate before PRs: `bash scripts/smoke-dist.sh` (strict, 11
  probes against the bundled `dist/vlmkit.mjs`).
