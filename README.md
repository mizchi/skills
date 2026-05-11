# mizchi/skills

A collection of agent skills maintained by [@mizchi](https://github.com/mizchi), distributed via [APM](https://github.com/apm-sh/apm) (Agent Package Manager).

Each directory is a standalone skill following the [agentskills.io](https://agentskills.io/specification) open standard.

## Install

Install an individual skill (global / user scope):

```sh
apm install -g mizchi/skills/<skill-name>
```

Or add to a project's `apm.yml`:

```yaml
dependencies:
  apm:
    - mizchi/skills/<skill-name>
```

Pin to a tag:

```sh
apm install -g mizchi/skills/<skill-name>#v0.1.0
```

## Skills

### Tooling / Infra

| Skill | Description |
| --- | --- |
| [apm-usage](apm-usage/) | Use APM (Agent Package Manager) to manage agent skills and dependencies. |
| [ast-grep-practice](ast-grep-practice/) | Run ast-grep as a project lint tool — `sgconfig.yml`, fix/rewrite rules, constraints, CI. |
| [chezmoi-management](chezmoi-management/) | mizchi's personal chezmoi dotfiles workflow (diff/apply, skill placement, APM vs chezmoi boundary). |
| [cloudflare-deploy](cloudflare-deploy/) | Deploy applications to Cloudflare Workers / Pages and related platform services. |
| [conventional-changelog](conventional-changelog/) | Conventional Commits + CHANGELOG generator comparison (release-please, changesets, git-cliff, towncrier). |
| [dotenvx](dotenvx/) | dotenvx env-var management reference (encryption, multi-env, CI). |
| [justfile](justfile/) | `just` command runner reference with GitHub Actions examples. |
| [nix-setup](nix-setup/) | Reproducible dev environments via devbox (Nix-backed) or pure Nix flakes — per-language templates (MoonBit / Rust / TS+pnpm / Python+uv / Haskell / OCaml / OxCaml), direnv, GitHub Actions, devbox.json + `setup_nix.sh` for sandbox bootstrap. |
| [gh-fix-ci](gh-fix-ci/) | Debug and fix failing GitHub Actions PR checks via `gh`. |
| [node-sqlite-vec](node-sqlite-vec/) | Combine Node 24+ `node:sqlite` with the `sqlite-vec` extension — extension load, vec0 BigInt rowids, why vitest fails, CLI shebang. |
| [pi-coding-agent](pi-coding-agent/) | Embed `@mariozechner/pi-coding-agent` as a coding-agent runtime in Node scripts, write pi extensions (plugins) with `pi.registerTool` / `pi.on`, package and `pi install` from npm/git, SDK vs `pi --mode rpc`. |
| [aws-ecs-service-connect-ipv6](aws-ecs-service-connect-ipv6/) | Diagnose and work around ECS Service Connect DNS aliases returning IPv6 addresses to IPv4-only Fargate tasks. |
| [aws-vault-mfa-iam](aws-vault-mfa-iam/) | Configure aws-vault for IAM APIs blocked by MFA-required policies; FIDO2 passkey + virtual TOTP setup. |
| [esbuild-otel-instrumentation](esbuild-otel-instrumentation/) | Workaround for `@opentelemetry/instrumentation-*` silently failing under esbuild ESM bundles (no traces sent). |
| [flaker-storage-cache-on-ci](flaker-storage-cache-on-ci/) | Persist flaker's DuckDB storage across GitHub Actions via `actions/cache@v4` with sliding key, plus `--changed` derivation and ingest-source patterns. |

### Testing / Browser

| Skill | Description |
| --- | --- |
| [playwright-cli](playwright-cli/) | Run Playwright via terminal CLI (test runner, codegen, screenshot, CI sharding). |
| [playwright-test](playwright-test/) | Playwright Test (E2E) best practices — no fixed waits, network triggers, DnD, CI sharding/retry. |
| [review-image](review-image/) | Review screenshots or generated images with OpenRouter vision models via Deno scripts; includes a strict CI `pass|fail` wrapper for VRT prechecks. |

### MoonBit

| Skill | Description |
| --- | --- |
| [moonbit-practice](moonbit-practice/) | MoonBit code generation best practices — syntax, tests, benchmarks, FFI, Nix, mbtx. |
| [moonbit-js-binding](moonbit-js-binding/) | Write MoonBit bindings to JavaScript with `extern "js"` (Promises, opaque types, esm/cjs/iife). |

### Languages

| Skill | Description |
| --- | --- |
| [gleam-practice](gleam-practice/) | Build and review Gleam projects on the Erlang target (Wisp + Mist, OTP, just, CI). |

### Process / Meta

| Skill | Description |
| --- | --- |
| [empirical-prompt-tuning](empirical-prompt-tuning/) | Iteratively evaluate and improve agent-facing text instructions using unbiased subagent executors. |
| [retrospective-codify](retrospective-codify/) | Convert trial-and-error lessons into ast-grep rules / skills / CLAUDE.md rules. |
| [skill-selector](skill-selector/) | Decide which skills to add to a project — Phase 1 picks from a curated catalog (Phase 2 escalates to `skill-finder`). |
| [skill-finder](skill-finder/) | Cross-source skill discovery (Anthropic official → claude-skill-registry → VoltAgent → ComposioHQ → Superpowers → GitHub topic) with a mandatory waxa eval gate before adoption. |
| [waxa-eval](waxa-eval/) | Operating manual for the `waxa` CLI — scenario authoring, grader selection, ledger schema, the four-stage iteration pattern, convergence rules. |
| [extract-glossary](extract-glossary/) | Extract domain-specific terms, repository implementation maps, and onboarding Mermaid diagrams from one or more repos / GitHub orgs. |
| [mizchi-blog-style](mizchi-blog-style/) | Style guide and AI-smell detection for blog posts published as mizchi (zenn / dev.to). |
| [tech-article-reproducibility](tech-article-reproducibility/) | Simulate a first-time reader reproducing a technical article and list missing information. |

## Tools

### `waxa` — skill evaluation CLI

Lives at [`tools/waxa/`](tools/waxa/) and is published as [`@mizchi/waxa`](https://www.npmjs.com/package/@mizchi/waxa). Used by the `waxa-eval` skill, and forms the adoption gate of `skill-finder`.

Run via `npx` (no global install needed):

```sh
npx @mizchi/waxa <eval.yaml>
```

`npx` caches the package after the first run, so subsequent invocations are fast. Pin a version with `npx @mizchi/waxa@0.1.1` when reproducibility matters (do not pin `0.1.0` — that release shipped a broken shebang and crashes before argv parsing).

Alternatives:

```sh
# install globally (when calling waxa frequently)
npm i -g @mizchi/waxa

# run from source (requires Deno 2+)
git clone https://github.com/mizchi/skills.git
cd skills/tools/waxa
deno task run -- path/to/eval.yaml
```

Requirements: `claude` CLI on `PATH` and authenticated (OAuth login or `ANTHROPIC_API_KEY`).

Quick reference:

```sh
npx @mizchi/waxa init [--skill <name>] [--force]                   # scaffold evals/<skill>/
npx @mizchi/waxa <eval.yaml>                                       # single run
npx @mizchi/waxa iterate <eval.yaml> [--max N]                     # iteration loop with ledger
npx @mizchi/waxa compare <eval.yaml> --models <m1>,<m2>            # multi-model objective comparison
npx @mizchi/waxa variant <eval.yaml> --base <skill-a> --candidate <skill-b>  # A/B exploration
```

The npm package bundles `references/empirical-prompt-tuning.md` (the full methodology document), so the iter / convergence semantics live alongside the CLI without needing to clone this repo separately.

Full reference: [`tools/waxa/README.md`](tools/waxa/README.md).

## Recommended starter set

If you are setting up a new project that will produce or consume skills, this combination covers selection, discovery, and iteration:

```yaml
# apm.yml
targets:
  - claude
dependencies:
  apm:
    - mizchi/skills/apm-usage          # APM manifest reference
    - mizchi/skills/skill-selector     # Phase 1: pick from curated catalog
    - mizchi/skills/skill-finder       # Phase 2: cross-source discovery + waxa eval gate
    - mizchi/skills/waxa-eval          # waxa CLI operating manual
    - mizchi/skills/empirical-prompt-tuning  # methodology / Iter 0 / [critical]-tag checklist
```

Then:

```sh
apm install                                # installs the skills under .claude/skills/
npx @mizchi/waxa --help                    # cache the waxa CLI on first call
# (or `npm i -g @mizchi/waxa` if you call waxa often enough that startup matters)
```

The skill-selection / discovery / evaluation flow then proceeds as: `skill-selector` (catalog pre-flight) → if no fit, `skill-finder` (Tier 1-4 sweep) → adoption gated by `waxa-eval` running `waxa iterate` against a `evals/<skill>/` directory you author. `empirical-prompt-tuning` covers what `waxa` cannot reach (the Iter 0 description / body consistency check, `tool_uses`-based skill self-containment diagnosis, and the `[critical]`-tagged requirements checklist that gives binary success judgment).

## Language

All `SKILL.md` files are written in English. Skills that were originally written in Japanese preserve the original as `SKILL-ja.md` alongside the English version. `mizchi-blog-style` is the single exception and stays Japanese-only because the skill itself is about Japanese blog writing style.

## Upstream skills (not in this repo)

These are maintained in their own repositories and installed separately:

- [mizchi/flaker](https://github.com/mizchi/flaker) — `flaker-setup`
- [mizchi/tui.mbt](https://github.com/mizchi/tui.mbt) — `tuimbt-practice`
- [moonbitlang/moonbit-agent-guide](https://github.com/moonbitlang/moonbit-agent-guide) — `moonbit-agent-guide`, `moonbit-refactoring`, `moonbit-c-binding`
- [ast-grep/agent-skill](https://github.com/ast-grep/agent-skill) — `ast-grep`

## License

Each skill may carry its own license (see `LICENSE.txt` inside the skill directory). Skills without an explicit license default to MIT at the repository owner's discretion.
