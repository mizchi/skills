# mizchi/skills

A collection of agent skills maintained by [@mizchi](https://github.com/mizchi), distributed via [APM](https://github.com/microsoft/apm) (Agent Package Manager).

Each directory is a standalone skill following the [agentskills.io](https://agentskills.io/specification) open standard.

## Install

Install an individual skill (global / user scope):

```sh
apm install -g mizchi/skills/<category>/<skill-name>
```

Or add to a project's `apm.yml`:

```yaml
dependencies:
  apm:
    - mizchi/skills/<category>/<skill-name>
```

Pin to a tag:

```sh
apm install -g mizchi/skills/<category>/<skill-name>#v0.1.0
```

## Skills

### Frontend

A toolkit for frontend consulting engagements. Install skills from `mizchi/skills/frontend/<skill-name>`.

| Skill | Install path | Description |
| --- | --- | --- |
| [frontend-review-triage](frontend/review-triage/) | `frontend/review-triage` | Day 0 initial assessment — scorecard, top 3 risks, app classification. |
| [frontend-review-ci](frontend/review-ci/) | `frontend/review-ci` | CI timing analysis — bottleneck identification, sharding/cache/concurrency recommendations. |
| [frontend-review-hygiene](frontend/review-hygiene/) | `frontend/review-hygiene` | Code quality — TypeScript strictness, lint, dead code, duplication. |
| [frontend-review-deps](frontend/review-deps/) | `frontend/review-deps` | Dependency health — freshness, CVE triage with attack-vector weighting, Tier 1/2/3 library detection. |
| [frontend-review-testing](frontend/review-testing/) | `frontend/review-testing` | Testing posture — vitest coverage, Playwright config, VRT setup. |
| [frontend-review-security](frontend/review-security/) | `frontend/review-security` | Security review — HTML sinks, auth/token storage, route guards, env var exposure, AI self-pentest. |
| [frontend-review-state](frontend/review-state/) | `frontend/review-state` | State management architecture — server/URL/form/UI classification, Jotai/Zustand/Redux anti-patterns. |
| [frontend-review-performance](frontend/review-performance/) | `frontend/review-performance` | Rendering performance — profiler-first, memo correctness, virtual scroll, useTransition. |
| [frontend-review-weekly](frontend/review-weekly/) | `frontend/review-weekly` | Weekly orchestrator — runs all domain skills, diffs KPIs, files repeat-finding issues. |

Perspective sub-skills (invoked by `frontend-review-weekly`): `frontend/review-perspectives/{frontend-expert,react-expert,performance-expert,security-expert,frontend-ops-expert}`.

### Node.js

| Skill | Install path | Description |
| --- | --- | --- |
| [node-sqlite-vec](node/sqlite-vec/) | `node/sqlite-vec` | Combine Node 24+ `node:sqlite` with the `sqlite-vec` extension — extension load, vec0 BigInt rowids, why vitest fails, CLI shebang. |
| [pi-coding-agent](node/pi-coding-agent/) | `node/pi-coding-agent` | Embed `@mariozechner/pi-coding-agent` as a coding-agent runtime in Node scripts, write pi extensions (plugins) with `pi.registerTool` / `pi.on`, package and `pi install` from npm/git, SDK vs `pi --mode rpc`. |

### AWS

| Skill | Install path | Description |
| --- | --- | --- |
| [aws-ecs-codedeploy-blue-green](aws/ecs-codedeploy-blue-green/) | `aws/ecs-codedeploy-blue-green` | ECS blue/green — recommends ALB-native weighted routing; covers CodeDeploy for teams already using it. |
| [aws-ecs-service-connect-ipv6](aws/ecs-service-connect-ipv6/) | `aws/ecs-service-connect-ipv6` | Diagnose and work around ECS Service Connect DNS aliases returning IPv6 addresses to IPv4-only Fargate tasks. |
| [aws-github-oidc-scoped-role](aws/github-oidc-scoped-role/) | `aws/github-oidc-scoped-role` | GitHub Actions OIDC trust pattern — `job_workflow_ref` scoping vs `sub` alone, Bedrock cross-region inference ARNs, required `aws-marketplace` permissions, ReadOnlyAccess + explicit Deny for AI agent roles. |
| [aws-vault-mfa-iam](aws/vault-mfa-iam/) | `aws/vault-mfa-iam` | Configure aws-vault for IAM APIs blocked by MFA-required policies; FIDO2 passkey + virtual TOTP setup. |

### Cloudflare

| Skill | Install path | Description |
| --- | --- | --- |
| [cloudflare-deploy](cloudflare/deploy/) | `cloudflare/deploy` | Deploy applications to Cloudflare Workers / Pages and related platform services. |
| [cloudflare-access-app-setup](cloudflare/access-app-setup/) | `cloudflare/access-app-setup` | One-shot Cloudflare Access self-hosted application provisioning via the API — app + email allowlist policy + service token. |
| [cloudflare-workers-otel-utels](cloudflare/workers-otel-utels/) | `cloudflare/workers-otel-utels` | Cloudflare Worker telemetry — OTLP traces / metrics / logs + utels error tracking + D1 Proxy slow-query warnings. |
| [cloudflare-mbt-worker-bundle](cloudflare/mbt-worker-bundle/) | `cloudflare/mbt-worker-bundle` | Bundle a Cloudflare Worker that combines MoonBit core code with a TypeScript entry. |

### SQL

| Skill | Install path | Description |
| --- | --- | --- |
| [sql-lint](sql/lint/) | `sql/lint` | Static lint for sqlc-style SQL catalogs — duplicate query names, missing semicolons, SELECT *, double-wildcard LIKE. |
| [sql-plan-audit](sql/plan-audit/) | `sql/plan-audit` | Run EXPLAIN QUERY PLAN against every query in a sqlc catalog and diff plans against baseline. |
| [sql-schema-audit](sql/schema-audit/) | `sql/schema-audit` | Index coverage and N+1 review aids for SQLite/D1 schemas with a sqlc catalog. |
| [sql-security](sql/security/) | `sql/security` | SQL injection screening for host code (MoonBit / TS / Rust) plus secretlint setup notes. |
| [sqlc-gen-moonbit-safety](sql/sqlc-gen-moonbit-safety/) | `sql/sqlc-gen-moonbit-safety` | Post-generation safety checks for sqlc-gen-moonbit + Cloudflare D1 — BigInt-bind hangs (D1 1101) and SQL placeholder mix. |

### Languages

| Skill | Install path | Description |
| --- | --- | --- |
| [moonbit-practice](lang/moonbit-practice/) | `lang/moonbit-practice` | MoonBit code generation best practices — syntax, tests, benchmarks, FFI, Nix, mbtx. |
| [moonbit-js-binding](lang/moonbit-js-binding/) | `lang/moonbit-js-binding` | Write MoonBit bindings to JavaScript with `extern "js"` (Promises, opaque types, esm/cjs/iife). |
| [gleam-practice](lang/gleam-practice/) | `lang/gleam-practice` | Build and review Gleam projects on the Erlang target (Wisp + Mist, OTP, just, CI). |
| [translate-programming-language](lang/translate-programming-language/) | `lang/translate-programming-language` | Plan and execute language-to-language migrations with behavior parity — oracles, fixtures, parity tests, compatibility layers. |

### Testing / Browser

| Skill | Install path | Description |
| --- | --- | --- |
| [playwright-cli](testing/playwright-cli/) | `testing/playwright-cli` | Run Playwright via terminal CLI (test runner, codegen, screenshot, CI sharding). |
| [playwright-test](testing/playwright-test/) | `testing/playwright-test` | Playwright Test (E2E) best practices — no fixed waits, network triggers, DnD, CI sharding/retry. |

### AI / VLM

| Skill | Install path | Description |
| --- | --- | --- |
| [review-image](ai/review-image/) | `ai/review-image` | Review screenshots or generated images with OpenRouter vision models via Deno scripts; includes a strict CI `pass|fail` wrapper for VRT prechecks. |
| [vlmkit](ai/vlmkit/) | `ai/vlmkit` | Entry-point for `@mizchi/vlmkit` — VLM-driven frontend toolkit (visual regression, markup synthesis from screenshots, design-token / theme / a11y / i18n audits, 2-stage VLM+LLM CSS auto-repair). Routes to 5 detailed sub-skills shipped under the vlmkit repo's `.claude/skills/`. |

### Tooling / Infra

| Skill | Install path | Description |
| --- | --- | --- |
| [apm-usage](tooling/apm-usage/) | `tooling/apm-usage` | Use APM (Agent Package Manager) to manage agent skills and dependencies. |
| [ast-grep-practice](tooling/ast-grep-practice/) | `tooling/ast-grep-practice` | Run ast-grep as a project lint tool — `sgconfig.yml`, fix/rewrite rules, constraints, CI. |
| [chezmoi-management](tooling/chezmoi-management/) | `tooling/chezmoi-management` | mizchi's personal chezmoi dotfiles workflow (diff/apply, skill placement, APM vs chezmoi boundary). |
| [conventional-changelog](tooling/conventional-changelog/) | `tooling/conventional-changelog` | Conventional Commits + CHANGELOG generator comparison (release-please, changesets, git-cliff, towncrier). |
| [dotenvx](tooling/dotenvx/) | `tooling/dotenvx` | dotenvx env-var management reference (encryption, multi-env, CI). |
| [justfile](tooling/justfile/) | `tooling/justfile` | `just` command runner reference with GitHub Actions examples. |
| [nix-setup](tooling/nix-setup/) | `tooling/nix-setup` | Reproducible dev environments via devbox (Nix-backed) or pure Nix flakes — per-language templates, direnv, GitHub Actions. |
| [upstream-fix-and-pin](tooling/upstream-fix-and-pin/) | `tooling/upstream-fix-and-pin` | Upstream PR + temporary git-ref pin workflow — branch HEAD SHA → merge SHA, `link:` fallback, pnpm v10 build script gating. |
| [utels-project-bootstrap](tooling/utels-project-bootstrap/) | `tooling/utels-project-bootstrap` | One-shot helper for registering a utels.dev project and writing the returned ingest token into a wrangler secret. |

### Kubernetes

| Skill | Install path | Description |
| --- | --- | --- |
| [k8s-crd-from-typed-schema](k8s/crd-from-typed-schema/) | `k8s/crd-from-typed-schema` | Generate Kubernetes CRDs from a typed schema source (zod / TypeBox / Valibot / json-schema) — Structural Schema dialect, /status subresource trap, metadata-prohibition rule. |

### DevOps

| Skill | Install path | Description |
| --- | --- | --- |
| [opentelemetry](devops/opentelemetry/) | `devops/opentelemetry` | Platform-agnostic OTel reference — signal selection, span design, context propagation, sampling, OTLP exporter config. |
| [otel-node](devops/otel-node/) | `devops/otel-node` | Node.js OTel setup — SDK init, auto-instrumentation, and the esbuild ESM silent-failure gotcha. |
| [gh-fix-ci](devops/gh-fix-ci/) | `devops/gh-fix-ci` | Debug and fix failing GitHub Actions PR checks via `gh`. |
| [flaker-storage-cache-on-ci](devops/flaker-storage-cache-on-ci/) | `devops/flaker-storage-cache-on-ci` | Persist flaker's DuckDB storage across GitHub Actions via `actions/cache@v4` with sliding key. |
| [workers-cd-rollback](devops/workers-cd-rollback/) | `devops/workers-cd-rollback` | GitHub Actions CD for a Cloudflare Worker with auto-rollback on smoke failure. |

### Process / Meta

| Skill | Install path | Description |
| --- | --- | --- |
| [empirical-prompt-tuning](meta/empirical-prompt-tuning/) | `meta/empirical-prompt-tuning` | Iteratively evaluate and improve agent-facing text instructions using unbiased subagent executors. |
| [retrospective-codify](meta/retrospective-codify/) | `meta/retrospective-codify` | Convert trial-and-error lessons into ast-grep rules / skills / CLAUDE.md rules. |
| [skill-selector](meta/skill-selector/) | `meta/skill-selector` | Decide which skills to add to a project — Phase 1 picks from a curated catalog (Phase 2 escalates to `skill-finder`). |
| [skill-finder](meta/skill-finder/) | `meta/skill-finder` | Cross-source skill discovery (Anthropic official → claude-skill-registry → VoltAgent → ComposioHQ → Superpowers → GitHub topic) with a mandatory waxa eval gate before adoption. |
| [waxa-eval](meta/waxa-eval/) | `meta/waxa-eval` | Operating manual for the `waxa` CLI — scenario authoring, grader selection, ledger schema, the four-stage iteration pattern, convergence rules. |
| [extract-glossary](meta/extract-glossary/) | `meta/extract-glossary` | Extract domain-specific terms, repository implementation maps, and onboarding Mermaid diagrams from one or more repos / GitHub orgs. |
| [optimizing-descriptions](meta/optimizing-descriptions/) | `meta/optimizing-descriptions` | Audit and rewrite SKILL.md `description` fields per the agentskills.io optimizing-descriptions framework. |
| [mizchi-blog-style](meta/mizchi-blog-style/) | `meta/mizchi-blog-style` | Style guide and AI-smell detection for blog posts published as mizchi (zenn / dev.to). |
| [tech-article-reproducibility](meta/tech-article-reproducibility/) | `meta/tech-article-reproducibility` | Simulate a first-time reader reproducing a technical article and list missing information. |

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
npx @mizchi/waxa init [--skill <name>] [--force]                   # scaffold <skill>/evals/ (skill-local)
npx @mizchi/waxa <skill>/evals/eval.yaml                           # single run
npx @mizchi/waxa <skill>/evals/eval.yaml --baseline                # with_skill vs without_skill + delta
npx @mizchi/waxa iterate <skill>/evals/eval.yaml [--max N]         # iteration loop with ledger
npx @mizchi/waxa compare <skill>/evals/eval.yaml --models <m1>,<m2>            # multi-model comparison
npx @mizchi/waxa variant <skill>/evals/eval.yaml --base <skill-a> --candidate <skill-b>  # A/B
```

From 0.2.0 evals live at `<skill>/evals/` (skill-local layout, agentskills.io-aligned). Workspace outputs go to `<workspace-root>/results/<skill>/iteration-N/`. The npm package bundles `references/empirical-prompt-tuning.md` (the methodology document), so iter / convergence semantics ship with the CLI.

Full reference: [`tools/waxa/README.md`](tools/waxa/README.md).

## Recommended starter set

If you are setting up a new project that will produce or consume skills, this combination covers selection, discovery, and iteration:

```yaml
# apm.yml
targets:
  - claude
dependencies:
  apm:
    - mizchi/skills/tooling/apm-usage          # APM manifest reference
    - mizchi/skills/meta/skill-selector        # Phase 1: pick from curated catalog
    - mizchi/skills/meta/skill-finder          # Phase 2: cross-source discovery + waxa eval gate
    - mizchi/skills/meta/waxa-eval             # waxa CLI operating manual
    - mizchi/skills/meta/empirical-prompt-tuning  # methodology / Iter 0 / [critical]-tag checklist
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
