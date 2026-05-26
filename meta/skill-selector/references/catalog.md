# Curated skill catalog (Phase 1)

Reference list for `skill-selector` Phase 1. Skills here have been vetted by mizchi for fit and quality. Group by project signal so the matching step is mechanical: detect the signal, propose the matching rows.

If a skill belongs to multiple axes, list it under its primary one.

Install strings are written for global scope (`apm install -g <string>`). For project scope, drop the `-g` and add the same string under `dependencies.apm` in `apm.yml`.

The "Install" column may also be:

- `(out-of-band)` — not installable via public APM (chezmoi-local, internal-only, gated). Mention in prose when relevant; do NOT add to `apm.yml`.
- A row whose description names a specific platform (CI provider, runtime, cloud). When the project's platform differs, the core capability may still apply — read the underlying `SKILL.md` before deciding whether to adopt.
- A subpath that diverges from the `<owner>/<repo>/skills/<name>` convention (e.g., `moonbitlang/moonbit-agent-guide/moonbit-c-binding`). This reflects an upstream layout that does not put skills under `skills/`. Run `apm view <owner>/<repo>` (or open the upstream README) once before committing to confirm the subpath is correct.

---

## Languages / runtimes

### Node.js / TypeScript
**Signals**: `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `node_modules/`

| Skill | Install | Use when |
|---|---|---|
| node-sqlite-vec | `mizchi/skills/node/sqlite-vec` | Project uses Node 24+ `node:sqlite` with `sqlite-vec` extension for vectors / RAG |
| pi-coding-agent | `mizchi/skills/node/pi-coding-agent` | Embedding `@mariozechner/pi-coding-agent` as a coding-agent runtime in Node scripts |
| dotenvx | `mizchi/skills/tooling/dotenvx` | Repo uses or considers `dotenvx` for env-var encryption / multi-env |
| esbuild-otel-instrumentation | `mizchi/skills/node/esbuild-otel-instrumentation` | esbuild ESM bundle silently drops `@opentelemetry/instrumentation-*` auto-instrumentation; no spans sent |

### MoonBit
**Signals**: `moon.mod.json`, `moon.pkg.json`, `_build/`, `.mooncakes/`

| Skill | Install | Use when |
|---|---|---|
| moonbit-practice | `mizchi/skills/lang/moonbit-practice` | Writing or reviewing MoonBit code (general best practices) |
| moonbit-js-binding | `mizchi/skills/lang/moonbit-js-binding` | MoonBit project needs JS FFI (`extern "js"`) for browser / Node / npm packages |
| moonbit-agent-guide | `moonbitlang/moonbit-agent-guide/moonbit-agent-guide` | First-time MoonBit project setup — moon tooling, layout conventions |
| moonbit-refactoring | `moonbitlang/moonbit-agent-guide/moonbit-refactoring` | Refactoring an existing MoonBit package idiomatically |
| moonbit-c-binding | `moonbitlang/moonbit-agent-guide/moonbit-c-binding` | MoonBit project links a C library via native FFI |
| tuimbt-practice | `mizchi/tui.mbt/skills/tuimbt-practice` | Building terminal UI in MoonBit using `tui.mbt` |
| mooncheat | `mizchi/js.mbt/.claude/skills/mooncheat` | MoonBit cheatsheet for syntax / corelibrary lookups while writing `.mbt` |
| moon-component | `mizchi/moon-component/skill` | Using the `moon-component` CLI for MoonBit WIT / WebAssembly Component workflow |
| vibe-scratch-workflow | `mizchi/vibe-lang` | `vibe-lang` scratch-db workflow — `vibe new` → `vibe shell-stdin --restore` → `finalize` / `normalize` / `apply` (repo-root SKILL.md; verify with `apm view`) |

### Gleam
**Signals**: `gleam.toml`, `manifest.toml`, `.gleam_version`

| Skill | Install | Use when |
|---|---|---|
| gleam-practice | `mizchi/skills/lang/gleam-practice` | Building or reviewing Gleam projects on the Erlang target (Wisp + Mist, OTP) |

---

## Tooling / Infra

### Build / task running
**Signals**: `justfile`, `devbox.json`, `flake.nix`, `Taskfile.yml`, `Taskfile.pkl`

| Skill | Install | Use when |
|---|---|---|
| pkfire | `mizchi/pkfire/skills/pkfire` | Adding, editing, or troubleshooting tasks in a project that uses `pkf` / `Taskfile.pkl`; choosing pkfire over just / Taskfile.yml |
| justfile | `mizchi/skills/tooling/justfile` | Project uses or considers `just` as task runner |
| nix-setup | `mizchi/skills/tooling/nix-setup` | Reproducible dev environment via devbox (Nix-backed, default) or pure Nix flakes (cutting-edge customization). Includes per-language flake templates and a devbox.json template |

### Static analysis / lint
**Signals**: `sgconfig.yml`, ad-hoc lint requirements that ESLint/biome can't express

| Skill | Install | Use when |
|---|---|---|
| ast-grep-practice | `mizchi/skills/tooling/ast-grep-practice` | Operating ast-grep as a project lint tool (rules, fix, CI) |
| ast-grep | `ast-grep/agent-skill/ast-grep` | Writing ast-grep rules / structural search (general guide) |
| check-similarity | `mizchi/similarity/.claude/skills/check-similarity` | Detect duplicate code via AST-based similarity; auto-selects per-language tool |
| check-similarity-mbt | `mizchi/similarity/.claude/skills/check-similarity-mbt` | Same, MoonBit (`.mbt`) only |
| check-similarity-py | `mizchi/similarity/.claude/skills/check-similarity-py` | Same, Python (`.py`) only |
| check-similarity-rs | `mizchi/similarity/.claude/skills/check-similarity-rs` | Same, Rust (`.rs`) only |
| check-similarity-ts | `mizchi/similarity/.claude/skills/check-similarity-ts` | Same, TypeScript / JavaScript only |

### CI / GitHub Actions
**Signals**: `.github/workflows/`, failing PR checks

| Skill | Install | Use when |
|---|---|---|
| gh-fix-ci | `mizchi/skills/tooling/gh-fix-ci` | Debugging or fixing failing GitHub Actions PR checks via `gh` |

### Local CI runner
**Signals**: `actrun.toml`, running GitHub Actions workflows locally

| Skill | Install | Use when |
|---|---|---|
| actrun | `mizchi/actrun/.claude/skills/actrun` | Reference for the `actrun` CLI — local GitHub Actions runner; workflow proposal / parsing / execution support |
| actrun-init | `mizchi/actrun/.claude/skills/actrun-init` | Introducing actrun to a project — install, `actrun.toml`, workflow adjustments |
| actrun-debug | `mizchi/actrun/.claude/skills/actrun-debug` | Diagnosing actrun execution failures — log analysis, root-cause, fix suggestions |

### Cloudflare
**Signals**: `wrangler.toml`, Cloudflare account, Workers / Pages deploy

| Skill | Install | Use when |
|---|---|---|
| cloudflare-deploy | `mizchi/skills/cloudflare/deploy` | Deploying to Cloudflare Workers / Pages — wrangler commands, secrets, custom domains |
| cloudflare-access-app-setup | `mizchi/skills/cloudflare/access-app-setup` | Gating a Worker behind Cloudflare Access via API in one shot — app + email allowlist + service token |
| cloudflare-workers-cd-rollback | `mizchi/skills/cloudflare/workers-cd-rollback` | Adding push-to-deploy + automatic rollback on smoke failure to a Workers GitHub Actions pipeline |
| cloudflare-workers-otel-utels | `mizchi/skills/cloudflare/workers-otel-utels` | Adding OTLP tracing / metrics / logs and utels error tracking to a Worker without touching handler code |
| cloudflare-mbt-worker-bundle | `mizchi/skills/cloudflare/mbt-worker-bundle` | Bundling a Worker that combines a MoonBit moon-built JS module with a TypeScript entry via wrangler |
| utels-project-bootstrap | `mizchi/skills/tooling/utels-project-bootstrap` | Registering a new utels.dev project and writing the returned ingest token into a wrangler secret in one shot |

### AWS
**Signals**: ECS / Fargate service, GitHub Actions → AWS OIDC, aws-vault MFA error

| Skill | Install | Use when |
|---|---|---|
| aws-github-oidc-scoped-role | `mizchi/skills/aws/github-oidc-scoped-role` | Wiring GitHub Actions to AWS via OIDC — `job_workflow_ref` scoping, Bedrock cross-region ARNs, `aws-marketplace` permissions, ReadOnlyAccess + Deny for AI agent roles |
| aws-ecs-codedeploy-blue-green | `mizchi/skills/aws/ecs-codedeploy-blue-green` | ECS blue/green — choosing ALB-native weighted routing (recommended) or debugging existing CodeDeploy blue/green setup |
| aws-ecs-service-connect-ipv6 | `mizchi/skills/aws/ecs-service-connect-ipv6` | ECS Service Connect alias resolves to IPv6 in IPv4-only Fargate task; `network is unreachable` |
| aws-vault-mfa-iam | `mizchi/skills/aws/vault-mfa-iam` | aws-vault session blocked by IAM MFA-required policy; `iam:*` rejected with `InvalidClientTokenId` |

### Kubernetes
**Signals**: `k8s/`, CRD YAML, zod/TypeBox/Valibot schema to CRD conversion

| Skill | Install | Use when |
|---|---|---|
| k8s-crd-from-typed-schema | `mizchi/skills/k8s/crd-from-typed-schema` | Generating CRDs from a typed schema source (zod / TypeBox / Valibot) — Structural Schema dialect restrictions, `/status` subresource trap, metadata-prohibition rule |

### Release / changelog
**Signals**: `CHANGELOG.md`, release-please config, `.changeset/`, version-tag-driven release

| Skill | Install | Use when |
|---|---|---|
| conventional-changelog | `mizchi/skills/tooling/conventional-changelog` | Setting up or unifying a release flow with Conventional Commits + auto changelog |
| upstream-fix-and-pin | `mizchi/skills/tooling/upstream-fix-and-pin` | A dependency has a bug or missing feature; you need to pin a fork while waiting for upstream merge |
| npm-release | `(out-of-band)` | Setting up npm publishing via release-please + OIDC. chezmoi-local; ask mizchi |

### SQL / Database
**Signals**: `sqlc.yaml`, `*.sql` query catalog, SQLite / D1 schema, `sqlc-gen-moonbit`

| Skill | Install | Use when |
|---|---|---|
| sql-lint | `mizchi/skills/sql/lint` | Static lint pass on a sqlc-style SQL catalog — duplicate query names, missing semicolons, `SELECT *`, double-wildcard `LIKE` |
| sql-plan-audit | `mizchi/skills/sql/plan-audit` | `EXPLAIN QUERY PLAN` baseline diff on a sqlc catalog — detect new full-table SCANs or `TEMP B-TREE` sorts introduced by a PR |
| sql-schema-audit | `mizchi/skills/sql/schema-audit` | Index coverage + N+1 review for a SQLite/D1 schema — unused indexes, unindexed scans, `for`-loop query calls |
| sql-security | `mizchi/skills/sql/security` | SQL injection screening in MoonBit / TS / Rust host code — flags template-literal / string-concat SQL builders |
| sqlc-gen-moonbit-safety | `mizchi/skills/sql/sqlc-gen-moonbit-safety` | Post-generation safety gate for `sqlc-gen-moonbit` + Cloudflare D1 — BigInt-bind hang (D1 1101) and placeholder mix checks |
| codegen-apply-verify | `mizchi/mnemo/skills/codegen-apply-verify` | Adding a `--verify` CI gate to any code-generation step — exits non-zero if generated output has drifted from committed patches |
| d1-query-telemetry | `mizchi/mnemo/skills/d1-query-telemetry` | Adding per-D1-query OTEL child spans and slow-query `console.warn` to a Cloudflare Worker via a transparent `Proxy` wrapper |

---

## Testing / Browser

**Signals**: `playwright.config.*`, `e2e/`, image-diff requirements

| Skill | Install | Use when |
|---|---|---|
| playwright-test | `mizchi/skills/testing/playwright-test` | **Primary** for any Playwright project. Writing / reviewing E2E tests — no fixed waits, network triggers |
| playwright-cli | `mizchi/skills/testing/playwright-cli` | **Secondary** — add only when CI sharding, codegen, or one-off `screenshot/pdf` matters. Skip when test authoring is the only concern |
| review-image | `mizchi/skills/ai/review-image` | Reviewing screenshots / generated images via OpenRouter vision models, VRT prechecks |
| vrt | `mizchi/vrt` | Visual Regression Testing + a11y semantic verification CLI (`vrt-test`, `vrt`, `vrt-update`, `vrt compare`, `vrt snapshot`, fix-loop, VLM model selection). Repo-root SKILL.md; verify with `apm view` |

### Frontend review (suite)
**Signals**: a frontend project where someone wants a structured review pass (CI / hygiene / deps / testing / security / state / performance / weekly cadence)

| Skill | Install | Use when |
|---|---|---|
| frontend-review-weekly | `mizchi/skills/frontend/review-weekly` | **Orchestrator** for the weekly AI review — dispatches all 8 domain skills and the 5 perspective sub-skills |
| frontend-review-triage | `mizchi/skills/frontend/review-triage` | Initial frontend-review assessment ("triage", day-1) — scorecard, top-3 risks, app classification |
| frontend-review-ci | `mizchi/skills/frontend/review-ci` | CI is slow (>10 min), flaky, or you want to optimize GitHub Actions for a frontend project |
| frontend-review-hygiene | `mizchi/skills/frontend/review-hygiene` | Code-hygiene audit — TypeScript strictness, lint, dead code, duplication |
| frontend-review-deps | `mizchi/skills/frontend/review-deps` | Dependency health — freshness, CVE triage with attack-vector weighting, Tier 1/2/3 library detection |
| frontend-review-testing | `mizchi/skills/frontend/review-testing` | Test-infrastructure audit — vitest coverage, playwright config, Testing Library usage, VRT setup |
| frontend-review-security | `mizchi/skills/frontend/review-security` | Frontend security review — HTML sinks, auth/token storage, route guards, env var exposure, AI self-pentest |
| frontend-review-state | `mizchi/skills/frontend/review-state` | State management architecture review — server/URL/form/UI classification, Jotai/Zustand/Redux anti-patterns |
| frontend-review-performance | `mizchi/skills/frontend/review-performance` | Rendering performance review — profiler-first, memo correctness, virtual scroll, `useTransition` |
| frontend-expert | `mizchi/skills/frontend/review-perspectives/frontend-expert` | Frontend-architect perspective sub-skill (component design, state, DOM usage) |
| frontend-ops-expert | `mizchi/skills/frontend/review-perspectives/frontend-ops-expert` | Frontend-Ops perspective sub-skill (CI/CD, scheduler, KPI ratchet, release process) |
| performance-expert | `mizchi/skills/frontend/review-perspectives/performance-expert` | Performance perspective sub-skill (bundle size, LCP / CLS / INP, avoidable work) |
| react-expert | `mizchi/skills/frontend/review-perspectives/react-expert` | React-specialist perspective sub-skill (hooks, re-rendering, Suspense / RSC) |
| security-expert | `mizchi/skills/frontend/review-perspectives/security-expert` | Security-specialist perspective sub-skill (XSS / CSRF, authz boundaries, input validation) |

---

## Reliability / Flakiness

| Skill | Install | Use when |
|---|---|---|
| flaker-setup | `mizchi/flaker/skills/flaker-setup` | Introducing `@mizchi/flaker` to a repo for flaky-test detection / GitHub Actions integration |
| flaker-management | `mizchi/flaker/skills/flaker-management` | Operating `@mizchi/flaker` after setup — day-to-day runs, sampling / quarantine review, KPI ratchet |
| flaker-storage-cache-on-ci | `mizchi/skills/tooling/flaker-storage-cache-on-ci` | Persisting flaker's DuckDB storage across GitHub Actions runs via `actions/cache@v4`; debugging "history vanished every run"; adding a new ingest source |

---

## Process / Meta

### Skill / prompt authoring

| Skill | Install | Use when |
|---|---|---|
| apm-usage | `mizchi/skills/tooling/apm-usage` | Adding / removing / updating skills via APM (always pair with `skill-selector`) |
| skill-finder | `mizchi/skills/meta/skill-finder` | Cross-source survey + waxa eval gate when the catalog has no fit (Phase 2 of the selection flow) |
| waxa-eval | `mizchi/skills/meta/waxa-eval` | Iterating on a skill's prompt with the waxa CLI — scenarios, graders, ledger, convergence |
| optimizing-descriptions | `mizchi/skills/meta/optimizing-descriptions` | Audit + rewrite SKILL.md `description` fields per agentskills.io framework + mizchi's two-track (Meta / Project) trigger policy |
| empirical-prompt-tuning | `mizchi/skills/meta/empirical-prompt-tuning` | Iteratively improving an agent-facing instruction via subagent execution |
| retrospective-codify | `mizchi/skills/meta/retrospective-codify` | Converting trial-and-error lessons into ast-grep rules / skills / CLAUDE.md rules |
| extract-glossary | `mizchi/skills/meta/extract-glossary` | Extracting domain-specific terms / repo implementation maps / onboarding Mermaid diagrams from one or more repos / GitHub orgs |

### Personal / dotfiles

| Skill | Install | Use when |
|---|---|---|
| chezmoi-management | `mizchi/skills/tooling/chezmoi-management` | Touching mizchi's chezmoi-managed dotfiles (`~/.claude/`, `~/.config/`, `~/.zshrc`) |

### Writing / publishing

| Skill | Install | Use when |
|---|---|---|
| mizchi-blog-style | `mizchi/skills/meta/mizchi-blog-style` | Drafting a blog post to be published as mizchi (zenn / dev.to). Style + AI-smell detection |
| tech-article-reproducibility | `mizchi/skills/meta/tech-article-reproducibility` | Final reproducibility check on a tech article draft before publication |

### Migration / porting

| Skill | Install | Use when |
|---|---|---|
| translate-programming-language | `mizchi/skills/lang/translate-programming-language` | Porting modules / services / APIs between programming languages with behavior parity |

### Memory / session (mnemo)
**Signals**: agent needs persistent cross-session memory or session journaling; `mnemo` CLI on PATH

| Skill | Install | Use when |
|---|---|---|
| mnemo-cmd | `mizchi/mnemo/skills/mnemo-cmd` | Using the `mnemo` command entrypoint to inspect and mutate mnemo memory / sessions / skills / prompts |
| mnemo-retrospective | `mizchi/mnemo/skills/mnemo-retrospective` | Capturing a task-completion retrospective — at the end of a substantial coding / debug / research / deploy task when a reusable lesson was learned |
| mnemo-article-to-skill | `mizchi/mnemo/skills/mnemo-article-to-skill` | Turning an article, blog post, paper, or pasted long-form note into a hosted mnemo skill draft |
| mnemo-session-journal | `mizchi/mnemo/skills/session/mnemo-session-journal` | `mnemo` for creating / appending / inspecting / resolving / searching session records |
| mnemo-skill-select | `mizchi/mnemo/skills/mnemo-skill-select` | Selecting agent skills from hosted mnemo (list / search uploaded skills, then load matching local) |
| dotenvx-in-actions | `mizchi/mnemo/skills/dotenvx-in-actions` | Sourcing secrets in GitHub Actions from a dotenvx-encrypted `.env` committed to the repo — gated by a single repo secret (private key) |
| worker-deploy-auto-rollback | `mizchi/mnemo/skills/worker-deploy-auto-rollback` | GitHub Actions manual-trigger CD for a Cloudflare Worker with automatic rollback on smoke failure |

### Security review (suite)
**Signals**: user asks for a security review of a web application repository

| Skill | Install | Use when |
|---|---|---|
| security-review | `mizchi/security-review/skills/security-review` | **Orchestrator** — runs the three sub-skills in order |
| security-review-whitebox | `mizchi/security-review/skills/security-review-whitebox` | Static + source-code review with language-appropriate scanners |
| security-review-blackbox | `mizchi/security-review/skills/security-review-blackbox` | OWASP ZAP baseline + optional authenticated active scan against a localhost target |
| security-review-exploit | `mizchi/security-review/skills/security-review-exploit` | Confirming whitebox hypotheses via live HTTP probes or PoC |

---

## Deliberately not in catalog

Some axes have no catalog row by design. Do **not** escalate to Phase 2 for these — they are one-off setup tasks, not recurring skill-shaped needs. Solve inline with framework docs.

| Axis | Reason no skill |
|---|---|
| Vite / React / Next.js / Solid frontend scaffolding | One-off setup; framework docs are sufficient. Recurring patterns (E2E, build, CI) are covered by other catalog rows. |
| Single-shot config conversions (e.g., webpack → Vite, Jest → Vitest) | One-off migration; AI-aided porting handles this inline. |
| Ad-hoc data migrations / one-time backfills | One-off; doesn't recur. |
| ORMs / DB clients in general | Too project-specific; only listed when a concrete operational pain has been encoded (e.g., `node-sqlite-vec`). |

If you find yourself wanting a skill on one of these axes, that's a Phase 2 escalation candidate — but verify the need is recurring across multiple sessions before searching.

## When the catalog has no fit

If no row matches and the need is recurring, escalate via the `skill-finder` skill. It codifies the source priority (Anthropic official → claude-skill-registry → VoltAgent/awesome-agent-skills → ComposioHQ → obra/superpowers → GitHub topic) and gates adoption through a mandatory waxa eval. Do not run a GitHub topic search inline.

## Catalog hygiene

- A row here means: someone has actually used this skill on a real project and it pulled its weight.
- When a new skill enters `mizchi/skills` (or an upstream repo this catalog references), add a row only after the first real use in a project.
- When a skill is removed or deprecated, drop the row in the same edit.
- Skills sourced through `skill-finder` are promoted here only after a passing waxa eval AND use in 2+ projects.
- If you find yourself frequently citing a Phase-2 result, that's the trigger to promote it: open a PR adding it to this file with the project signal that triggered the match.
