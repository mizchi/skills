# Curated skill catalog (Phase 1)

Reference list for `skill-selector` Phase 1. Skills here have been vetted by mizchi for fit and quality. Group by project signal so the matching step is mechanical: detect the signal, propose the matching rows.

If a skill belongs to multiple axes, list it under its primary one.

Install strings are written for global scope (`apm install -g <string>`). For project scope, drop the `-g` and add the same string under `dependencies.apm` in `apm.yml`.

The "Install" column may also be:

- `(out-of-band)` — not installable via public APM (chezmoi-local, internal-only, gated). Mention in prose when relevant; do NOT add to `apm.yml`.
- A row whose description names a specific platform (CI provider, runtime, cloud). When the project's platform differs, the core capability may still apply — read the underlying `SKILL.md` before deciding whether to adopt.
- A subpath that diverges from the `<owner>/<repo>/skills/<name>` convention (e.g., `moonbitlang/moonbit-agent-guide/moonbit-c-binding`). This reflects an upstream layout that does not put skills under `skills/`. Run `apm view <owner>/<repo>` (or open the upstream README) once before committing to confirm the subpath is correct.

## Tier legend

| Tier | Policy |
|---|---|
| **T0** | Always want. Suggest proactively for every mizchi repo regardless of signals. |
| **T1** | Applicable. Suggest when the section's signals are present. |
| **T2** | Instructed. Only when mizchi explicitly asks ("do a security review", "run waxa", etc.). Never auto-suggest. |
| **T3** | Occasionally effective. Mention in prose if the situation closely matches; do not include in the default proposal. |
| **T4** | Superseded or not recommended. Effective only in specific legacy/edge cases; note the preferred alternative instead. |

---

## Languages / runtimes

### Node.js / TypeScript
**Signals**: `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `node_modules/`

| T | Skill | Install | Use when |
|---|---|---|---|
| T1 | node-sqlite-vec | `mizchi/skills/node/sqlite-vec` | Project uses Node 24+ `node:sqlite` with `sqlite-vec` extension for vectors / RAG |
| T1 | pi-coding-agent | `mizchi/skills/node/pi-coding-agent` | Embedding `@mariozechner/pi-coding-agent` as a coding-agent runtime in Node scripts |
| T1 | dotenvx | `mizchi/skills/tooling/dotenvx` | Repo uses or considers `dotenvx` for env-var encryption / multi-env |
| T1 | opentelemetry | `mizchi/skills/devops/opentelemetry` | Signal design (traces/metrics/logs), span naming, context propagation, sampling strategy, OTLP exporter config — read before writing any OTel code |
| T1 | otel-node | `mizchi/skills/devops/otel-node` | Node.js OTel SDK setup; esbuild ESM bundle silently drops `instrumentation-*` auto-instrumentation — use when spans don't arrive after bundling |

### MoonBit
**Signals**: `moon.mod.json`, `moon.pkg.json`, `_build/`, `.mooncakes/`

| T | Skill | Install | Use when |
|---|---|---|---|
| T1 | moonbit-practice | `mizchi/skills/lang/moonbit-practice` | Writing or reviewing MoonBit code (general best practices) |
| T1 | moonbit-js-binding | `mizchi/skills/lang/moonbit-js-binding` | MoonBit project needs JS FFI (`extern "js"`) for browser / Node / npm packages |
| T1 | moonbit-c-binding | `moonbitlang/moonbit-agent-guide/moonbit-c-binding` | MoonBit project links a C library via native FFI |
| T1 | tuimbt-practice | `mizchi/tui.mbt/skills/tuimbt-practice` | Building terminal UI in MoonBit using `tui.mbt` |
| T1 | mooncheat | `mizchi/js.mbt/.claude/skills/mooncheat` | MoonBit cheatsheet for syntax / corelibrary lookups while writing `.mbt` |
| T1 | moon-component | `mizchi/moon-component/skill` | Using the `moon-component` CLI for MoonBit WIT / WebAssembly Component workflow |
| T2 | moonbit-refactoring | `moonbitlang/moonbit-agent-guide/moonbit-refactoring` | Refactoring an existing MoonBit package idiomatically |
| T3 | moonbit-agent-guide | `moonbitlang/moonbit-agent-guide/moonbit-agent-guide` | First-time MoonBit project setup — moon tooling, layout conventions (one-time; skip once the project is bootstrapped) |
| T3 | vibe-scratch-workflow | `mizchi/vibe-lang` | `vibe-lang` scratch-db workflow — `vibe new` → `vibe shell-stdin --restore` → `finalize` / `normalize` / `apply` (repo-root SKILL.md; verify with `apm view`) |

### Gleam
**Signals**: `gleam.toml`, `manifest.toml`, `.gleam_version`

| T | Skill | Install | Use when |
|---|---|---|---|
| T1 | gleam-practice | `mizchi/skills/lang/gleam-practice` | Building or reviewing Gleam projects on the Erlang target (Wisp + Mist, OTP) |

---

## Tooling / Infra

### Build / task running
**Signals**: `justfile`, `devbox.json`, `flake.nix`, `Taskfile.yml`, `Taskfile.pkl`

| T | Skill | Install | Use when |
|---|---|---|---|
| T0 | pkfire | `mizchi/pkfire/skills/pkfire` | Adding, editing, or troubleshooting tasks in a project that uses `pkf` / `Taskfile.pkl`; choosing pkfire over just / Taskfile.yml |
| T1 | nix-setup | `mizchi/skills/tooling/nix-setup` | Reproducible dev environment via devbox (Nix-backed, default) or pure Nix flakes (cutting-edge customization). Includes per-language flake templates and a devbox.json template |
| T3 | justfile | `mizchi/skills/tooling/justfile` | Existing repo already uses `just` — respect as-is; for new repos prefer pkfire |

### Static analysis / lint
**Signals**: `sgconfig.yml`, ad-hoc lint requirements that ESLint/biome can't express

| T | Skill | Install | Use when |
|---|---|---|---|
| T1 | ast-grep-practice | `mizchi/skills/tooling/ast-grep-practice` | Operating ast-grep as a project lint tool (rules, fix, CI) |
| T1 | ast-grep | `ast-grep/agent-skill/ast-grep` | Writing ast-grep rules / structural search (general guide) |
| T2 | check-similarity | `mizchi/similarity/.claude/skills/check-similarity` | Detect duplicate code via AST-based similarity; auto-selects per-language tool |
| T2 | check-similarity-mbt | `mizchi/similarity/.claude/skills/check-similarity-mbt` | Same, MoonBit (`.mbt`) only |
| T2 | check-similarity-py | `mizchi/similarity/.claude/skills/check-similarity-py` | Same, Python (`.py`) only |
| T2 | check-similarity-rs | `mizchi/similarity/.claude/skills/check-similarity-rs` | Same, Rust (`.rs`) only |
| T2 | check-similarity-ts | `mizchi/similarity/.claude/skills/check-similarity-ts` | Same, TypeScript / JavaScript only |

### CI / GitHub Actions
**Signals**: `.github/workflows/`, failing PR checks

| T | Skill | Install | Use when |
|---|---|---|---|
| T1 | gh-fix-ci | `mizchi/skills/devops/gh-fix-ci` | Debugging or fixing failing GitHub Actions PR checks via `gh` |

### Local CI runner
**Signals**: `actrun.toml`, running GitHub Actions workflows locally

| T | Skill | Install | Use when |
|---|---|---|---|
| T2 | actrun | `mizchi/actrun/.claude/skills/actrun` | Reference for the `actrun` CLI — local GitHub Actions runner; workflow proposal / parsing / execution support |
| T2 | actrun-init | `mizchi/actrun/.claude/skills/actrun-init` | Introducing actrun to a project — install, `actrun.toml`, workflow adjustments |
| T2 | actrun-debug | `mizchi/actrun/.claude/skills/actrun-debug` | Diagnosing actrun execution failures — log analysis, root-cause, fix suggestions |

### Cloudflare
**Signals**: `wrangler.toml`, Cloudflare account, Workers / Pages deploy

| T | Skill | Install | Use when |
|---|---|---|---|
| T1 | cloudflare-deploy | `mizchi/skills/cloudflare/deploy` | Deploying to Cloudflare Workers / Pages — wrangler commands, secrets, custom domains |
| T1 | workers-cd-rollback | `mizchi/skills/devops/workers-cd-rollback` | Adding push-to-deploy + automatic rollback on smoke failure to a Workers GitHub Actions pipeline |
| T1 | cloudflare-workers-otel-utels | `mizchi/skills/cloudflare/workers-otel-utels` | Adding OTLP tracing / metrics / logs and utels error tracking to a Worker without touching handler code |
| T1 | cloudflare-mbt-worker-bundle | `mizchi/skills/cloudflare/mbt-worker-bundle` | Bundling a Worker that combines a MoonBit moon-built JS module with a TypeScript entry via wrangler |
| T3 | cloudflare-access-app-setup | `mizchi/skills/cloudflare/access-app-setup` | Gating a Worker behind Cloudflare Access via API in one shot — app + email allowlist + service token |
| T3 | utels-project-bootstrap | `mizchi/skills/tooling/utels-project-bootstrap` | Registering a new utels.dev project and writing the returned ingest token into a wrangler secret in one shot |

### AWS
**Signals**: ECS / Fargate service, GitHub Actions → AWS OIDC, aws-vault MFA error

| T | Skill | Install | Use when |
|---|---|---|---|
| T1 | aws-github-oidc-scoped-role | `mizchi/skills/aws/github-oidc-scoped-role` | Wiring GitHub Actions to AWS via OIDC — `job_workflow_ref` scoping, Bedrock cross-region ARNs, `aws-marketplace` permissions, ReadOnlyAccess + Deny for AI agent roles |
| T3 | aws-ecs-service-connect-ipv6 | `mizchi/skills/aws/ecs-service-connect-ipv6` | ECS Service Connect alias resolves to IPv6 in IPv4-only Fargate task; `network is unreachable` |
| T3 | aws-vault-mfa-iam | `mizchi/skills/aws/vault-mfa-iam` | aws-vault session blocked by IAM MFA-required policy; `iam:*` rejected with `InvalidClientTokenId` |
| T4 | aws-ecs-codedeploy-blue-green | `mizchi/skills/aws/ecs-codedeploy-blue-green` | Existing CodeDeploy blue/green setup that cannot be migrated — prefer ALB-native weighted routing for new setups |

### Kubernetes
**Signals**: `k8s/`, CRD YAML, zod/TypeBox/Valibot schema to CRD conversion

| T | Skill | Install | Use when |
|---|---|---|---|
| T3 | k8s-crd-from-typed-schema | `mizchi/skills/k8s/crd-from-typed-schema` | Generating CRDs from a typed schema source (zod / TypeBox / Valibot) — Structural Schema dialect restrictions, `/status` subresource trap, metadata-prohibition rule |

### Release / changelog
**Signals**: `CHANGELOG.md`, release-please config, `.changeset/`, version-tag-driven release

| T | Skill | Install | Use when |
|---|---|---|---|
| T1 | conventional-changelog | `mizchi/skills/tooling/conventional-changelog` | Setting up or unifying a release flow with Conventional Commits + auto changelog |
| T3 | upstream-fix-and-pin | `mizchi/skills/tooling/upstream-fix-and-pin` | A dependency has a bug or missing feature; you need to pin a fork while waiting for upstream merge |
| T2 | npm-release | `(out-of-band)` | Setting up npm publishing via release-please + OIDC. chezmoi-local; ask mizchi |

### Dependency management
**Signals**: `pnpm outdated` results, security alert, major ecosystem release, annual maintenance

| T | Skill | Install | Use when |
|---|---|---|---|
| T1 | dep-lib-review | `mizchi/skills/tooling/dep-lib-review` | Auditing and updating library dependencies — patch/minor/major batching, CVE attack-vector triage, deprecated package detection, validation checklist |
| T3 | tech-trend-watch | `mizchi/skills/tooling/tech-trend-watch` | Annual tech-stack review using State of JS/CSS + Thoughtworks Tech Radar — satisfaction×usage matrix, ADOPT/TRIAL/ASSESS/HOLD mapping, migration roadmap |

### SQL / Database
**Signals**: `sqlc.yaml`, `*.sql` query catalog, SQLite / D1 schema, `sqlc-gen-moonbit`

| T | Skill | Install | Use when |
|---|---|---|---|
| T1 | sql-lint | `mizchi/skills/sql/lint` | Static lint pass on a sqlc-style SQL catalog — duplicate query names, missing semicolons, `SELECT *`, double-wildcard `LIKE` |
| T1 | sql-plan-audit | `mizchi/skills/sql/plan-audit` | `EXPLAIN QUERY PLAN` baseline diff on a sqlc catalog — detect new full-table SCANs or `TEMP B-TREE` sorts introduced by a PR |
| T1 | sql-schema-audit | `mizchi/skills/sql/schema-audit` | Index coverage + N+1 review for a SQLite/D1 schema — unused indexes, unindexed scans, `for`-loop query calls |
| T1 | sql-security | `mizchi/skills/sql/security` | SQL injection screening in MoonBit / TS / Rust host code — flags template-literal / string-concat SQL builders |
| T1 | sqlc-gen-moonbit-safety | `mizchi/skills/sql/sqlc-gen-moonbit-safety` | Post-generation safety gate for `sqlc-gen-moonbit` + Cloudflare D1 — BigInt-bind hang (D1 1101) and placeholder mix checks |
| T3 | codegen-apply-verify | `mizchi/mnemo/skills/codegen-apply-verify` | Adding a `--verify` CI gate to any code-generation step — exits non-zero if generated output has drifted from committed patches |
| T3 | d1-query-telemetry | `mizchi/mnemo/skills/d1-query-telemetry` | Adding per-D1-query OTEL child spans and slow-query `console.warn` to a Cloudflare Worker via a transparent `Proxy` wrapper |

---

## Testing / Browser

**Signals**: `playwright.config.*`, `e2e/`, image-diff requirements

| T | Skill | Install | Use when |
|---|---|---|---|
| T1 | playwright-test | `mizchi/skills/testing/playwright-test` | **Primary** for any Playwright project. Writing / reviewing E2E tests — no fixed waits, network triggers |
| T1 | playwright-cli | `mizchi/skills/testing/playwright-cli` | **Secondary** — add only when CI sharding, codegen, or one-off `screenshot/pdf` matters. Skip when test authoring is the only concern |
| T2 | review-image | `mizchi/skills/ai/review-image` | Reviewing screenshots / generated images via OpenRouter vision models, VRT prechecks |
| T2 | vrt | `mizchi/vrt` | Visual Regression Testing + a11y semantic verification CLI (`vrt-test`, `vrt`, `vrt-update`, `vrt compare`, `vrt snapshot`, fix-loop, VLM model selection). Repo-root SKILL.md; verify with `apm view` |

### Frontend review (suite)
**Signals**: a frontend project where someone wants a structured review pass (CI / hygiene / deps / testing / security / state / performance / weekly cadence)

| T | Skill | Install | Use when |
|---|---|---|---|
| T1 | frontend-review-weekly | `mizchi/skills/frontend/review-weekly` | **Orchestrator** for the weekly AI review — dispatches all 8 domain skills and the 5 perspective sub-skills |
| T1 | frontend-review-triage | `mizchi/skills/frontend/review-triage` | Initial frontend-review assessment ("triage", day-1) — scorecard, top-3 risks, app classification |
| T1 | frontend-review-ci | `mizchi/skills/frontend/review-ci` | CI is slow (>10 min), flaky, or you want to optimize GitHub Actions for a frontend project |
| T1 | frontend-review-hygiene | `mizchi/skills/frontend/review-hygiene` | Code-hygiene audit — TypeScript strictness, lint, dead code, duplication |
| T1 | frontend-review-deps | `mizchi/skills/frontend/review-deps` | Dependency health — freshness, CVE triage with attack-vector weighting, Tier 1/2/3 library detection |
| T1 | frontend-review-testing | `mizchi/skills/frontend/review-testing` | Test-infrastructure audit — vitest coverage, playwright config, Testing Library usage, VRT setup |
| T1 | frontend-review-security | `mizchi/skills/frontend/review-security` | Frontend security review — HTML sinks, auth/token storage, route guards, env var exposure, AI self-pentest |
| T1 | frontend-review-state | `mizchi/skills/frontend/review-state` | State management architecture review — server/URL/form/UI classification, Jotai/Zustand/Redux anti-patterns |
| T1 | frontend-review-performance | `mizchi/skills/frontend/review-performance` | Rendering performance review — profiler-first, memo correctness, virtual scroll, `useTransition` |
| T2 | frontend-expert | `mizchi/skills/frontend/review-perspectives/frontend-expert` | Frontend-architect perspective sub-skill (component design, state, DOM usage) |
| T2 | frontend-ops-expert | `mizchi/skills/frontend/review-perspectives/frontend-ops-expert` | Frontend-Ops perspective sub-skill (CI/CD, scheduler, KPI ratchet, release process) |
| T2 | performance-expert | `mizchi/skills/frontend/review-perspectives/performance-expert` | Performance perspective sub-skill (bundle size, LCP / CLS / INP, avoidable work) |
| T2 | react-expert | `mizchi/skills/frontend/review-perspectives/react-expert` | React-specialist perspective sub-skill (hooks, re-rendering, Suspense / RSC) |
| T2 | security-expert | `mizchi/skills/frontend/review-perspectives/security-expert` | Security-specialist perspective sub-skill (XSS / CSRF, authz boundaries, input validation) |

---

## Reliability / Flakiness

| T | Skill | Install | Use when |
|---|---|---|---|
| T1 | flaker-setup | `mizchi/flaker/skills/flaker-setup` | Introducing `@mizchi/flaker` to a repo for flaky-test detection / GitHub Actions integration |
| T1 | flaker-management | `mizchi/flaker/skills/flaker-management` | Operating `@mizchi/flaker` after setup — day-to-day runs, sampling / quarantine review, KPI ratchet |
| T1 | flaker-storage-cache-on-ci | `mizchi/skills/devops/flaker-storage-cache-on-ci` | Persisting flaker's DuckDB storage across GitHub Actions runs via `actions/cache@v4`; debugging "history vanished every run"; adding a new ingest source |

---

## Formal Methods / Verification

**Signals**: user asks about formal methods, Z3, Alloy, TLA+, P, Dafny, MoonBit prove, Lean, Rocq, specs-vs-code reconciliation, config consistency, authz soundness, model checking, proof obligations, or turning counterexamples into domain-owner questions

| T | Skill | Install | Use when |
|---|---|---|---|
| T1 | formal-methods-reconciler | `mizchi/skills/formal-methods/reconciler` | Extract claims from docs/code/tests/config/logs, choose the smallest appropriate verifier/model checker/prover, and translate SAT/UNSAT/traces/proof failures into domain-language decisions and regression guards |

---

## Process / Meta

### Skill / prompt authoring

| T | Skill | Install | Use when |
|---|---|---|---|
| T0 | apm-usage | `mizchi/skills/tooling/apm-usage` | Adding / removing / updating skills via APM (always pair with `skill-selector`) |
| T2 | skill-finder | `mizchi/skills/meta/skill-finder` | Cross-source survey + waxa eval gate when the catalog has no fit (Phase 2 of the selection flow) |
| T2 | waxa-eval | `mizchi/skills/meta/waxa-eval` | Iterating on a skill's prompt with the waxa CLI — scenarios, graders, ledger, convergence |
| T2 | optimizing-descriptions | `mizchi/skills/meta/optimizing-descriptions` | Audit + rewrite SKILL.md `description` fields per agentskills.io framework + mizchi's two-track (Meta / Project) trigger policy |
| T2 | empirical-prompt-tuning | `mizchi/skills/meta/empirical-prompt-tuning` | Iteratively improving an agent-facing instruction via subagent execution |
| T2 | retrospective-codify | `mizchi/skills/meta/retrospective-codify` | Converting trial-and-error lessons into ast-grep rules / skills / CLAUDE.md rules |
| T2 | extract-glossary | `mizchi/skills/meta/extract-glossary` | Extracting domain-specific terms / repo implementation maps / onboarding Mermaid diagrams from one or more repos / GitHub orgs |

### Personal / dotfiles

| T | Skill | Install | Use when |
|---|---|---|---|
| T2 | chezmoi-management | `mizchi/skills/tooling/chezmoi-management` | Touching mizchi's chezmoi-managed dotfiles (`~/.claude/`, `~/.config/`, `~/.zshrc`) |

### Writing / publishing

| T | Skill | Install | Use when |
|---|---|---|---|
| T2 | mizchi-blog-style | `mizchi/skills/meta/mizchi-blog-style` | Drafting a blog post to be published as mizchi (zenn / dev.to). Style + AI-smell detection |
| T2 | tech-article-reproducibility | `mizchi/skills/meta/tech-article-reproducibility` | Final reproducibility check on a tech article draft before publication |

### Migration / porting

| T | Skill | Install | Use when |
|---|---|---|---|
| T3 | translate-programming-language | `mizchi/skills/lang/translate-programming-language` | Porting modules / services / APIs between programming languages with behavior parity |

### Memory / session (mnemo)
**Signals**: agent needs persistent cross-session memory or session journaling; `mnemo` CLI on PATH

| T | Skill | Install | Use when |
|---|---|---|---|
| T1 | mnemo-retrospective | `mizchi/mnemo/skills/mnemo-retrospective` | Capturing a task-completion retrospective — at the end of a substantial coding / debug / research / deploy task when a reusable lesson was learned |
| T2 | mnemo-cmd | `mizchi/mnemo/skills/mnemo-cmd` | Using the `mnemo` command entrypoint to inspect and mutate mnemo memory / sessions / skills / prompts |
| T2 | mnemo-article-to-skill | `mizchi/mnemo/skills/mnemo-article-to-skill` | Turning an article, blog post, paper, or pasted long-form note into a hosted mnemo skill draft |
| T2 | mnemo-session-journal | `mizchi/mnemo/skills/session/mnemo-session-journal` | `mnemo` for creating / appending / inspecting / resolving / searching session records |
| T2 | mnemo-skill-select | `mizchi/mnemo/skills/mnemo-skill-select` | Selecting agent skills from hosted mnemo (list / search uploaded skills, then load matching local) |
| T3 | dotenvx-in-actions | `mizchi/mnemo/skills/dotenvx-in-actions` | Sourcing secrets in GitHub Actions from a dotenvx-encrypted `.env` committed to the repo — gated by a single repo secret (private key) |
| T3 | worker-deploy-auto-rollback | `mizchi/mnemo/skills/worker-deploy-auto-rollback` | GitHub Actions manual-trigger CD for a Cloudflare Worker with automatic rollback on smoke failure |

### Security review (suite)
**Signals**: user asks for a security review of a web application repository

| T | Skill | Install | Use when |
|---|---|---|---|
| T2 | security-review | `mizchi/security-review/skills/security-review` | **Orchestrator** — runs the three sub-skills in order |
| T2 | security-review-whitebox | `mizchi/security-review/skills/security-review-whitebox` | Static + source-code review with language-appropriate scanners |
| T2 | security-review-blackbox | `mizchi/security-review/skills/security-review-blackbox` | OWASP ZAP baseline + optional authenticated active scan against a localhost target |
| T2 | security-review-exploit | `mizchi/security-review/skills/security-review-exploit` | Confirming whitebox hypotheses via live HTTP probes or PoC |

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
