---
name: review-image
description: Review screenshots or other images with OpenRouter vision models via bundled Deno scripts. Use for quick VRT sanity checks, invalid-image screening, or CI gates. `scripts/review-image.ts` returns freeform feedback; `scripts/review-image-ci.ts` returns strict `pass|fail` JSON and exits non-zero on fail.
---

# review-image

Use this skill when you want a cheap vision-model opinion on an image before doing heavier work.

## When to use

- Quick VRT sanity checks
- Detect obviously broken, blank, malformed, or suspicious inputs
- Ask a model whether a screenshot or generated image matches a prompt
- Add a simple image-review gate to CI

## Requirements

- Deno
- `OPENROUTER_API_KEY` or `OPENROUTER_KEY`

## Invocation

Both scripts are executable Deno files with shebang `#!/usr/bin/env -S deno run --allow-env --allow-net --allow-read`. Run them directly — no `deno run` wrapper needed.

When the skill is APM-installed, the scripts live under `~/.claude/skills/review-image/scripts/`. Examples below use the `~/...` form, which is shell-expanded. In non-shell exec contexts (e.g. `child_process.spawn` without `shell: true`) both `~` and `$HOME` stay literal — substitute the resolved absolute path (`/Users/<you>/.claude/skills/review-image/scripts/...`).

Flags can appear before, between, or after the positional args. `--model` accepts both `--model X` and `--model=X`. Both scripts write program output to **stdout** and logs/errors to **stderr** — but only the JSON-emitting modes (CI gate always; freeform with `--json`) are safe to pipe straight into `jq` / `JSON.parse`. Freeform default mode is prose, not JSON.

## Scripts

### Freeform review — `review-image.ts`

```sh
~/.claude/skills/review-image/scripts/review-image.ts <image-path-or-url> "<prompt>" [--model <id>] [--json]

# example with flag interleaved with positionals:
~/.claude/skills/review-image/scripts/review-image.ts ./shot.png "VRT diff broken?" --model google/gemini-2.5-flash
```

Default output: plain prose on stdout (the model's reply, single block).

With `--json`: stdout becomes a single JSON object, safe to pipe into `jq` / `JSON.parse`:

```json
{
  "id": "gen-...",
  "model": "<resolved>",
  "text": "<freeform answer>",
  "usage": { "prompt_tokens": 123, "completion_tokens": 45, "total_tokens": 168, "cost": 0.0001 },
  "raw": { /* full upstream OpenRouter response, opaque */ }
}
```

Read `.text` for the answer; `.usage.cost` (USD) and `.usage.total_tokens` for cost telemetry.

Exit codes: `0` on success, `1` on any error (missing API key, network/HTTP failure, malformed response).

### CI gate — `review-image-ci.ts`

```sh
~/.claude/skills/review-image/scripts/review-image-ci.ts <image-path-or-url> "<prompt>" [--model <id>]
```

Always prints a single JSON object on stdout (the `--json` flag is silently ignored without warning — output is always JSON):

```json
{
  "decision": "pass",
  "summary": "<short reason>",
  "issues": [],
  "model": "<resolved>",
  "usage": { "prompt_tokens": 123, "completion_tokens": 45, "total_tokens": 168, "cost": 0.0001 },
  "rawText": "<unparsed model reply>"
}
```

`issues` is always an array of strings (never null / never omitted) — empty on `pass`, populated with one or more reasons on `fail`. `usage` keys match the freeform script and may include additional OpenRouter-passthrough fields (e.g. `is_byok`, `*_details`); treat the four listed keys (`prompt_tokens`, `completion_tokens`, `total_tokens`, `cost`) as the stable contract.

The CI gate **wraps your prompt internally** with strict JSON-schema instructions for the model. Write `<prompt>` as plain English describing the gate criteria — do not include schema, formatting directives, or "respond in JSON" yourself; those are supplied automatically and your additions can conflict with them.

Exit codes:

- `0` — `decision: pass`
- `2` — `decision: fail`
- `1` — script error (missing API key, network/HTTP failure, malformed model response). Treat as neither pass nor fail in CI; do not gate on `$? -ne 0` alone.

## Writing prompts

The `<prompt>` argument is plain English describing what to check. Use these as starting templates:

**CI gate (gate-criteria style)** — describe what *should* be there and what counts as failure. Avoid vague "is this broken?"; pixel art and intentionally low-res content fail naively-worded gates:

```
"This image is {expected: a Playwright screenshot of /dashboard / a generated cactus illustration / ...}. Pass if it shows recognizable intended content (any style, including pixel art, low-res, or stylized). Fail only if blank, all-black/all-white, corrupted, an error page, or visibly malformed."
```

**Freeform (diagnostic style)** — ask for specifics so the prose answer is actionable:

```
"This image is supposed to be {expected subject}. Describe what you see and call out any visual artifacts, broken layout, color anomalies, or signs of file corruption."
```

## Default model

`google/gemini-2.5-flash-lite`

Override per call with `--model` or globally with `OPENROUTER_MODEL`.
