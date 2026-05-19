---
name: vrt
description: Entry-point for the `@mizchi/vrt` toolkit — visual regression testing for HTML/URL pairs across viewports, with agent-readable Markdown diff reports, computed-style breakpoint analysis, snapshot-based regression watch, framework-swap migration audits, and an optional VLM-driven CSS auto-repair loop. Use when a coding agent has edited HTML/CSS and needs to know whether the visible output changed, where it changed, and which CSS properties drove the change. This skill orients you to the 5 detailed sub-skills (visual-diff / migration-eval / markup-synth / regression-watch / css-fix-loop) and the verb-group CLI; pick the matching sub-skill once the task shape is clear.
---

# vrt

`vrt` is a TypeScript visual-regression toolkit built on Playwright +
pixelmatch. Beyond raw pixel diffs, it surfaces **agent-friendly
signal**: computed-style deltas split into universal vs.
breakpoint-gated, per-section diffRatio against component bboxes,
worst-viewport screenshot paths inline, and (optionally) VLM-emitted
CHANGE lists feeding an LLM CSS-fix step.

Source: <https://github.com/mizchi/vrt>. CHANGELOG +
old-CLI-to-new-CLI mapping: [`CHANGELOG.md`](https://github.com/mizchi/vrt/blob/main/CHANGELOG.md).

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

```bash
# CLI (global)
pnpm add -g @mizchi/vrt
# or per-project
pnpm add -D @mizchi/vrt
npx playwright install chromium

# Library packages (deep imports via .ts source — Node 24+ required)
pnpm add @mizchi/vrt-core @mizchi/vrt-capture @mizchi/vrt-markup @mizchi/vrt-ai
```

Required: **Node 24+**. The workspace packages ship raw `.ts` and rely
on Node's `--experimental-strip-types` (default on 24+) to load.

## CLI cheatsheet (0.5.0 verb groups)

```bash
# Diff
vrt diff html <baseline> <variant> --output reports/        # HTML/URL pair → report.json + PNGs
vrt diff agent reports/diff-report.json                     # Markdown for the calling agent
vrt diff png  base.png current.png                          # Direct PNG diff
vrt diff elements --selector .card …                        # Element-level shift isolation
vrt diff browsers <url>                                     # Chromium / Firefox / WebKit parity
vrt diff runs <dirs...>                                     # Aggregate N VRT runs

# Snapshot (baseline + diff lifecycle)
vrt snapshot <url1> [url2]... --output snapshots/
vrt snapshot approve                                        # Promote current → baseline
vrt snapshot stability <url...> --iterations 5              # FP-rate measurement
vrt snapshot flipbook --output snapshots/                   # Embed PNGs in a self-contained HTML

# Check (CI gates)
vrt check a11y contrast|touch|focus <html>                  # WCAG scans
vrt check tokens <html>                                     # Design-token scale conformance
vrt check theme  <html>                                     # prefers-color-scheme parity
vrt check perf   <html>                                     # CLS / LCP / FCP

# Inspect / Stress / Scan / Build
vrt inspect interact|explore|smoke <html|url>
vrt stress  i18n|media  <html>
vrt scan    component|breakpoints  <…>
vrt build   component <target.png> <current.html>           # Markup-from-screenshot loop

# Migration (framework / CSS-library swap audit)
vrt migration compare|blind|subagent <baseline> <variant>

# Long-running / stateful
vrt watch       <baseline> <variant>                        # File-watcher inner loop
vrt manifest    add|list|rm|check                           # Approval rules
vrt diff-pr     pin|verify|post                             # PR CI gate
vrt baseline    pin|verify|post|list|rm                     # Canonical alias of diff-pr
```

The single-token commands from 0.4.x (`vrt compare`, `vrt png-diff`,
`vrt theme-parity`, …) remain as deprecation shims that print a
one-line hint and forward.

## Sub-skill routing

The vrt repo ships five detailed sub-skills under
`.claude/skills/`. Install via APM:

```bash
apm install mizchi/vrt/.claude/skills/<skill-name>
```

Pick by task shape:

| Sub-skill | Use when | Entry workflow |
|---|---|---|
| `vrt-visual-diff` | One-shot "did this CSS edit change pixels, and where?" | `vrt diff html` → `vrt diff agent` |
| `vrt-regression-watch` | CI gate / scheduled drift detection across runs | `vrt diff agent --previous --fail-on-regression` |
| `vrt-migration-eval` | Framework / CSS-lib / build-system swap audit (deliberate large diff) | `vrt migration compare\|blind\|subagent` |
| `vrt-markup-synth` | Screenshot → HTML/CSS, token / theme / i18n / a11y audits | `vrt build\|scan\|check\|stress` |
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

`vrt diff html` writes:

```
<output>/
├── diff-report.json            # canonical machine input for diff agent
├── migration-report.json       # legacy alias, byte-identical (will be removed)
├── diff-mobile.png             # per-viewport pixel diff
├── diff-desktop.png
└── diff-wide.png
```

`vrt diff agent <report.json>` then emits Markdown structured as:

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
  to `vrt diff agent`.
- **Playwright must be installed.** First run errors with "browser not
  found" → `npx playwright install chromium`.
- **Self-comparing the same URL with no mask is the false-positive
  baseline.** Use this to verify `--mask` actually catches every
  flapping element before relying on diff% threshold.
- **The dist binary is bundled.** `dist/vrt.mjs` ships with all leaves
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
import { compareScreenshots } from "@mizchi/vrt-core/heatmap.ts";
import { discoverViewports }  from "@mizchi/vrt-capture/viewport-discovery.ts";
import { extractComponents }  from "@mizchi/vrt-markup/component/component-extract.ts";
import { askVlm }             from "@mizchi/vrt-ai";
```

`@mizchi/vrt-core` has no Playwright dependency for the lightweight
surface (image / DOM / a11y primitives). The other three pull in
Playwright transitively.

## Reporting issues / contributing

- Issues / feature requests: <https://github.com/mizchi/vrt/issues>
- Source: <https://github.com/mizchi/vrt>
- Smoke gate before PRs: `bash scripts/smoke-dist.sh` (strict, 11
  probes against the bundled `dist/vrt.mjs`).
